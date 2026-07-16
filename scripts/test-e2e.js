#!/usr/bin/env node
/* eslint-disable max-lines -- single-file orchestrator with many distinct phases */
/**
 * E2E test orchestration with ownership-based cleanup.
 *
 * Flow:
 *   1. Acquire runner lock via PID file (refuses if another runner is alive).
 *   2. On startup, kill only PIDs we (or a dead previous runner) recorded.
 *   3. Spin up wrangler dev briefly on PORT → miniflare creates the D1 sqlite file.
 *   4. Kill tmp wrangler, apply migrations + config via sqlite3 stdin.
 *   5. Start wrangler dev for real (DB already has schema).
 *   6. Record every wrangler PID we spawn, for cleanup.
 *   7. Seed test user + run Playwright.
 *   8. On exit: release the runner lock (wrangler PIDs are auto-cleaned on next run).
 *
 * Key invariants:
 *   - Port 8788 is the ONLY port used.
 *   - We never kill processes we don't own; port-based kills are limited to
 *     processes that look like our own (wrangler / workerd / node).
 *   - Concurrent runners safely refuse instead of trampling each other.
 */

import { spawn, execSync } from 'node:child_process';
import {
  readFileSync,
  readdirSync,
  mkdirSync,
  writeFileSync,
  unlinkSync,
  lstatSync,
} from 'node:fs';
import { setTimeout as sleep } from 'node:timers/promises';
import path from 'node:path';
import { acquirePidLockAtomic, releasePidLock } from './lib/runner-lock.js';
import { ensurePortAvailable } from './lib/port-check.js';

const RAW_PORT = process.env.TEST_PORT || '8788';
// Validate PORT is a numeric string to prevent shell-injection from env vars.
if (!/^\d+$/.test(RAW_PORT)) {
  console.error(`[test-e2e] FATAL: TEST_PORT must be numeric, got ${JSON.stringify(RAW_PORT)}`);
  process.exit(2);
}
const PORT = RAW_PORT;
const BASE_URL = process.env.TEST_URL || `http://localhost:${PORT}`;
const DEV_TIMEOUT = 90_000;
const POLL_MS = 500;
const STATE_DIR = '.wrangler/state-e2e';
const RUNNER_PID_FILE = path.join(STATE_DIR, '.runner-pid');
const WRANGLER_PIDS_FILE = path.join(STATE_DIR, '.wrangler-pids');
const SIGNAL_EXIT_CODES = { SIGINT: 130, SIGTERM: 143 };
const CONFLICT_STATUS = 409;
const KILL_TREE_TIMEOUT_MS = 3000;
const PID_EXIT_POLL_MS = 50;
const HTTP_READY_MAX_ATTEMPTS = 60;

let wranglerProc = null;
let runnerLockAcquired = false;

function log(...a) {
  console.error('[test-e2e]', ...a);
}

// ── .dev.vars loader ──────────────────────────────────────────────────────────

function stripQuotes(v) {
  const q = v[0];
  if ((q === '"' || q === "'") && v.endsWith(q)) return v.slice(1, -1);
  return v;
}

function isAlwaysOverride(name) {
  return ['TEST_EMAIL', 'TEST_PASSWORD'].includes(name);
}

function isCommentOrBlank(t) {
  return !t || t.startsWith('#');
}

function parseEnvLine(t) {
  return t.match(/^([A-Z_][A-Z0-9_]*)=(.+)$/) || null;
}

function shouldSetVar(m, always) {
  return !process.env[m[1]] || always;
}

function loadDevVars() {
  try {
    const content = readFileSync('.dev.vars', 'utf8');
    const lines = content.split('\n');
    lines.forEach((line) => {
      const t = line.trim();
      if (isCommentOrBlank(t)) return;
      const m = parseEnvLine(t);
      if (!m) return;
      const always = isAlwaysOverride(m[1]);
      if (shouldSetVar(m, always)) {
        process.env[m[1]] = stripQuotes(m[2].trim());
      }
    });
  } catch {
    /* no .dev.vars */
  }
}

loadDevVars();

// ── Runner lock + ownership-based cleanup ─────────────────────────────────────

function isPidAlive(pid) {
  if (!pid || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

/** Recursively collect descendant PIDs of a given parent PID. */
function collectDescendants(parentPid) {
  const pids = [];
  try {
    const out = execSync(`pgrep -P ${parentPid} 2>/dev/null`, { encoding: 'utf8' });
    const children = out.trim().split('\n').filter(Boolean).map(Number).filter(Boolean);
    for (const c of children) {
      pids.push(c);
      pids.push(...collectDescendants(c));
    }
  } catch {
    /* no children */
  }
  return pids;
}

/** Kill a PID and its entire process tree (children, grandchildren, ...).
 * Sends SIGKILL to the process group (negative PID = group) which catches all
 * children even if they were reparented after our parent died. Then awaits
 * until the PID is actually dead (with a short poll) so callers don't race
 * against zombie ports. */
function signalProcessGroup(pid) {
  try {
    process.kill(-pid, 'SIGKILL');
  } catch {
    /* not a group leader or already dead */
  }
}

function signalProcess(pid) {
  try {
    process.kill(pid, 'SIGKILL');
  } catch {
    /* */
  }
}

async function waitForProcessExit(pid) {
  const deadline = Date.now() + KILL_TREE_TIMEOUT_MS;
  while (isPidAlive(pid) && Date.now() < deadline) {
    await sleep(PID_EXIT_POLL_MS);
  }
}

async function killProcessTree(pid) {
  if (!pid) return;
  // First signal the whole process group — catches descendants, reparented
  // orphans, and grandchildren we can't see via pgrep -P.
  signalProcessGroup(pid);
  // Then belt-and-suspenders: kill by PID and any visible descendants.
  signalProcess(pid);
  for (const d of collectDescendants(pid)) {
    if (!isPidAlive(d)) continue;
    signalProcess(d);
  }
  // Wait for the PID to actually exit (signal-flush race on slow runners).
  await waitForProcessExit(pid);
}

/** Kill all PIDs recorded in WRANGLER_PIDS_FILE (and their descendants).
 * This is the ONLY mechanism for killing wrangler — never blind port-based kills. */
function readRecordedPids() {
  let raw;
  try {
    raw = readFileSync(WRANGLER_PIDS_FILE, 'utf8');
  } catch {
    return [];
  }
  return raw.trim().split('\n').filter(Boolean).map(Number).filter(Boolean);
}

function collectAllPidsToKill(pids) {
  const toKill = new Set();
  for (const pid of pids) {
    toKill.add(pid);
    for (const d of collectDescendants(pid)) toKill.add(d);
  }
  return toKill;
}

async function killRecordedWranglerPids() {
  const pids = readRecordedPids();
  if (!pids.length) return;

  const toKill = collectAllPidsToKill(pids);
  log(`  Killing ${toKill.size} recorded wrangler process(es)...`);
  for (const pid of toKill) await killProcessTree(pid);
}

/** Record a wrangler PID for later cleanup. */
function recordWranglerPid(pid) {
  if (!pid) return;
  let raw;
  try {
    raw = readFileSync(WRANGLER_PIDS_FILE, 'utf8');
  } catch {
    raw = '';
  }
  const pids = raw.trim().split('\n').filter(Boolean).map(Number).filter(Boolean);
  pids.push(pid);
  writeFileSync(WRANGLER_PIDS_FILE, pids.join('\n') + '\n');
}

/** Refuse to start because another runner is alive. Logs a clear message and exits. */
function refuseConcurrentRun(existingPid) {
  log('');
  log('════════════════════════════════════════════════════════════════════');
  log(`  Another test-e2e.js instance is running (PID ${existingPid}).`);
  log("  Refusing to start to avoid killing another runner's wrangler.");
  log('');
  log(`  If this is stale, kill it manually: kill -9 ${existingPid}`);
  log(`  Then delete ${RUNNER_PID_FILE} and retry.`);
  log('════════════════════════════════════════════════════════════════════');
  process.exit(1);
}

/** Clean up after a dead previous runner. */
async function cleanupDeadRunner(existingPid) {
  log(`Cleaning up after dead previous runner (PID ${existingPid})...`);
  await killRecordedWranglerPids();
  try {
    unlinkSync(WRANGLER_PIDS_FILE);
  } catch {
    /* */
  }
  // Only remove RUNNER_PID_FILE if it still holds the stale PID. A fresh
  // runner may have overwritten it during this cleanup window; removing it
  // unconditionally would clobber their lock and reintroduce the concurrency
  // race that the lock is meant to prevent.
  releasePidLock(RUNNER_PID_FILE, existingPid);
}

/** Release the runner lock (called on exit / SIGINT / SIGTERM). */
function releaseRunnerLock() {
  if (!runnerLockAcquired) return;
  runnerLockAcquired = false;
  // releasePidLock is a no-op when the file does not hold our pid, so it
  // safely tolerates the file being held by a different runner that won a
  // race during cleanup.
  releasePidLock(RUNNER_PID_FILE, process.pid);
  // Always try to clean up the wrangler-pids file we own, regardless of lock state.
  try {
    unlinkSync(WRANGLER_PIDS_FILE);
  } catch {
    /* already gone — fine */
  }
}

/** Acquire exclusive runner lock via PID file. Exits if another runner is alive.
 *
 * Uses an atomic create-or-fail (O_EXCL) to eliminate the TOCTOU race that
 * exists between an existsSync() pre-check and a subsequent writeFileSync().
 * The atomic open either succeeds (we hold the lock) or fails with EEXIST
 * (someone else does); there is no intermediate state in which two runners
 * can both believe they hold the lock. */
async function acquireRunnerLock() {
  mkdirSync(STATE_DIR, { recursive: true });

  const result = await acquirePidLockAtomic({
    pidFile: RUNNER_PID_FILE,
    myPid: process.pid,
    isAlive: isPidAlive,
    onRefuseLiveRunner: refuseConcurrentRun,
    onDeadRunner: cleanupDeadRunner,
  });

  if (!result.acquired) {
    // refuseConcurrentRun already logged and called process.exit; this is a
    // defensive return in case the caller passes a non-exiting refuse.
    return;
  }

  runnerLockAcquired = true;

  process.on('exit', releaseRunnerLock);
  process.on('SIGINT', () => {
    releaseRunnerLock();
    process.exit(SIGNAL_EXIT_CODES.SIGINT);
  });
  process.on('SIGTERM', () => {
    releaseRunnerLock();
    process.exit(SIGNAL_EXIT_CODES.SIGTERM);
  });
}

// ── D1 probe ──────────────────────────────────────────────────────────────────

/** Any sqlite file (even empty) is acceptable — we apply migrations via sqlite3 after. */
function isD1File(filePath) {
  try {
    lstatSync(filePath);
    return true;
  } catch {
    return false;
  }
}

function isSqliteFile(name) {
  return name !== 'metadata.sqlite' && name.endsWith('.sqlite');
}

function scanSqliteFiles(parentDir) {
  let files;
  try {
    files = readdirSync(parentDir);
  } catch {
    return null;
  }

  const found = files?.find((f) => {
    const nested = path.join(parentDir, f);
    return isSqliteFile(f) && isD1File(nested) ? nested : false;
  });
  return found || null;
}

function findD1Sqlite(pd) {
  const dir = path.join(pd, 'v3', 'd1', 'miniflare-D1DatabaseObject');
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return null;
  }

  const sqlitePaths = entries?.filter((n) => isSqliteFile(n));
  const candidate = sqlitePaths?.find((name) => {
    const direct = path.join(dir, name);
    return isD1File(direct) ? direct : scanSqliteFiles(direct) || null;
  });
  return candidate || null;
}

/** Run a sqlite3 command by piping stdin to it. Returns when the child exits.
 *
 * The `action` param is used only in error messages for context.
 */
async function runSqlite3Stdin(dbPath, stdinContent, action) {
  return new Promise((resolve, reject) => {
    const child = spawn('sqlite3', [dbPath], { stdio: ['pipe', 'pipe', 'pipe'] });
    let stderr = '';
    child.stderr.on('data', (d) => {
      stderr += d.toString();
    });
    child.on('error', reject);
    child.on('close', (code) => {
      const msg = stderr.trim();
      if (msg) log(`    sqlite3: ${msg}`);
      if (code !== 0 && code !== null) {
        reject(new Error(`sqlite3 exited with code ${code} ${action}: ${msg}`));
        return;
      }
      resolve();
    });
    child.stdin.write(stdinContent);
    child.stdin.end();
  });
}

// ── D1 init helpers ───────────────────────────────────────────────────────────

function cleanupStateDir() {
  try {
    execSync(`rm -rf ${STATE_DIR}`, { stdio: 'ignore' });
  } catch {
    try {
      execSync(`mv ${STATE_DIR} ${STATE_DIR}-junk-${Date.now()}`, { stdio: 'ignore' });
    } catch {
      /* already gone */
    }
  }
  mkdirSync(STATE_DIR, { recursive: true });
}

async function tryFetchRoot(port) {
  try {
    return await fetch(`http://127.0.0.1:${port}/`);
  } catch {
    return null;
  }
}

async function tryFetchHealth(port) {
  try {
    await fetch(`http://127.0.0.1:${port}/api/health`);
  } catch {
    /* ignore */
  }
}

// eslint-disable-next-line max-statements
async function bootWranglerForD1Init() {
  log(`Creating D1 file via wrangler dev (port ${PORT})...`);
  const tmp = spawn(
    'npx',
    ['wrangler', 'dev', '--ip', '0.0.0.0', '--port', PORT, '--persist-to', STATE_DIR],
    {
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, NODE_ENV: 'development' },
      detached: true, // new process group → killProcessTree can signal the whole group
    }
  );
  recordWranglerPid(tmp.pid);

  let httpReady = false;
  let dbPath = null;
  for (let i = 0; i < HTTP_READY_MAX_ATTEMPTS; i++) {
    const r = await tryFetchRoot(PORT);
    if (r?.ok && !httpReady) {
      httpReady = true;
      log('  wrangler HTTP-ready, triggering D1 init...');
      await tryFetchHealth(PORT);
      await sleep(1000);
    }
    if (httpReady) {
      dbPath = findD1Sqlite(STATE_DIR);
      if (dbPath) break;
    }
    await sleep(500);
  }
  // Stop tmp wrangler BEFORE applying migrations so it doesn't hold the file lock
  // or cache an empty schema. Record the dbPath while wrangler is still alive so
  // we know the exact file wrangler opened. killProcessTree polls for actual
  // exit so we don't race a port-rebind.
  await killProcessTree(tmp.pid);
  if (!dbPath) {
    log('FATAL: D1 sqlite never created');
    process.exit(1);
  }
  log(`D1 database: ${path.basename(path.dirname(dbPath))}/${path.basename(dbPath)}`);
  return dbPath;
}

async function applyMigrations(dbPath) {
  log('Applying migrations...');
  const files = [
    '001_initial.sql',
    '002_settings_permissions.sql',
    '003_password_reset_tokens.sql',
    '004_email_verification.sql',
    '005_message_editing.sql',
    '006_audit_logging.sql',
  ];
  for (const file of files) {
    const sqlPath = path.join(process.cwd(), 'migrations', file);
    log(`  Applying ${file}...`);
    await runSqlite3Stdin(dbPath, readFileSync(sqlPath), `applying ${file}`);
    log(`  ✓ ${file}`);
  }
}

async function enablePublicRegistration(dbPath) {
  log('Enabling public registration...');
  await runSqlite3Stdin(
    dbPath,
    'INSERT OR REPLACE INTO app_config (key, value, updated_at) VALUES ' +
      "('public_registration_status', 'active', unixepoch()), " +
      "('public_registration', 'true', unixepoch());\n",
    'enabling registration'
  );
  log('Public registration enabled.');
}

function verifyTables(dbPath) {
  const count = execSync(
    `sqlite3 "${dbPath}" "SELECT count(*) FROM sqlite_master WHERE type='table';"`,
    { encoding: 'utf8' }
  ).trim();
  log(`DB ready — ${count} tables`);
  // Hard assertion: required core tables must exist after migrations.
  // Weak `.tables` smoke checks can pass on partial schemas and hide broken DBs.
  const REQUIRED_TABLES = ['users', 'chats', 'messages', 'app_config', 'roles'];
  const present = execSync(
    `sqlite3 "${dbPath}" "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name;"`,
    { encoding: 'utf8' }
  ).trim();
  const presentSet = new Set(present.split('\n').filter(Boolean));
  const missing = REQUIRED_TABLES.filter((t) => !presentSet.has(t));
  if (missing.length > 0) {
    log(`FATAL: required tables missing after migrations: ${missing.join(', ')}`);
    process.exit(1);
  }
  if (Number(count) < REQUIRED_TABLES.length) {
    log(`FATAL: too few tables after migrations (got ${count})`);
    process.exit(1);
  }
}

// ── DB init ───────────────────────────────────────────────────────────────────

async function initDatabase() {
  log('Initializing local D1 database...');
  cleanupStateDir();
  const dbPath = await bootWranglerForD1Init();
  await applyMigrations(dbPath);
  await enablePublicRegistration(dbPath);
  verifyTables(dbPath);
}

// ── Dev server ────────────────────────────────────────────────────────────────

async function startDevServer() {
  log(`Starting wrangler dev on port ${PORT}...`);
  wranglerProc = spawn(
    'npx',
    ['wrangler', 'dev', '--ip', '0.0.0.0', '--port', PORT, '--persist-to', STATE_DIR],
    {
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, NODE_ENV: 'development' },
      detached: true, // new process group → killProcessTree can signal the whole group
    }
  );
  recordWranglerPid(wranglerProc.pid);

  wranglerProc.stdout.on('data', (c) => process.stderr.write(c));
  wranglerProc.stderr.on('data', (c) => process.stderr.write(c));
  wranglerProc.on('error', (err) => {
    log('Wrangler error:', err.message);
    process.exit(1);
  });

  const t0 = Date.now();
  while (Date.now() - t0 < DEV_TIMEOUT) {
    try {
      const res = await fetch(`${BASE_URL}/`);
      if (res.ok) {
        log(`Server ready (${Date.now() - t0}ms)`);
        return;
      }
    } catch {
      /* */
    }
    await sleep(POLL_MS);
  }
  log(`ERROR: Server did not start within ${DEV_TIMEOUT / 1000}s`);
  await killProcessTree(wranglerProc.pid);
  process.exit(1);
}

// ── Teardown ──────────────────────────────────────────────────────────────────

async function killDevServer() {
  if (!wranglerProc) return;
  const pid = wranglerProc.pid;
  log(`Stopping wrangler dev (PID ${pid})...`);
  if (pid) await killProcessTree(pid);
  wranglerProc = null;
}

// ── Seed ─────────────────────────────────────────────────────────────────────

function readSeedCredentials() {
  const { TEST_EMAIL: email, TEST_PASSWORD: password } = process.env;
  if (!email || !password) {
    log('TEST_EMAIL/TEST_PASSWORD not set');
    return null;
  }
  return { email, password };
}

async function seedUser() {
  const credentials = readSeedCredentials();
  if (!credentials) return;
  const { email, password } = credentials;
  log(`Seeding test user: ${email}`);
  const res = await fetch(`${BASE_URL}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, name: 'E2E Test User' }),
  });
  if (res.ok) {
    log('Test user seeded.');
    return;
  }
  if (res.status === CONFLICT_STATUS) {
    log('Test user already exists.');
    return;
  }
  // Fail fast: if seeding failed for any reason other than "already exists",
  // Playwright would proceed against an unauthenticated server and produce
  // misleading downstream failures far from the root cause.
  throw new Error(`Seed failed (${res.status}): ${await res.text().catch(() => '')}`);
}

// ── Tests ─────────────────────────────────────────────────────────────────────

async function runTests() {
  return new Promise((resolve) => {
    const proc = spawn('pnpm', ['exec', 'playwright', 'test', ...process.argv.slice(2)], {
      stdio: 'inherit',
      env: { ...process.env, TEST_URL: BASE_URL, PLAYWRIGHT_TEST_BASE_URL: BASE_URL },
    });
    proc.on('close', (code) => resolve(code ?? 1));
    proc.on('error', (err) => {
      log('Playwright error:', err.message);
      resolve(1);
    });
  });
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  await ensurePortAvailable(PORT, { log }); // port pre-check — kill our zombies or fail fast
  await acquireRunnerLock(); // PID lock — refuses on concurrent runner

  const cleanup = () => killDevServer();
  process.on('SIGINT', cleanup);
  process.on('SIGTERM', cleanup);

  try {
    await initDatabase();
    await startDevServer();
    await seedUser();
    const code = await runTests();
    await killDevServer();
    process.exit(code);
  } catch (err) {
    log('Unexpected error:', err);
    await killDevServer();
    process.exit(1);
  }
}

main();
