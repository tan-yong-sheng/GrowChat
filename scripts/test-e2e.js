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
 *   - We never kill processes we don't own (no blind port-based kills).
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
  existsSync,
} from 'node:fs';
import { setTimeout as sleep } from 'node:timers/promises';
import path from 'node:path';

const PORT = process.env.TEST_PORT || '8788';
const BASE_URL = process.env.TEST_URL || `http://localhost:${PORT}`;
const DEV_TIMEOUT = 90_000;
const POLL_MS = 500;
const STATE_DIR = '.wrangler/state-e2e';
const RUNNER_PID_FILE = path.join(STATE_DIR, '.runner-pid');
const WRANGLER_PIDS_FILE = path.join(STATE_DIR, '.wrangler-pids');
const SIGNAL_EXIT_CODES = { SIGINT: 130, SIGTERM: 143 };

let wranglerProc = null;
let runnerLockAcquired = false;

function log(...a) {
  console.error('[test-e2e]', ...a);
}

// ── .dev.vars loader ──────────────────────────────────────────────────────────

function stripQuotes(v) {
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'")))
    return v.slice(1, -1);
  return v;
}

function loadDevVars() {
  try {
    for (const line of readFileSync('.dev.vars', 'utf8').split('\n')) {
      const t = line.trim();
      if (!t || t.startsWith('#')) continue;
      const m = t.match(/^([A-Z_][A-Z0-9_]*)=(.+)$/);
      const always = ['TEST_EMAIL', 'TEST_PASSWORD'].includes(m?.[1]);
      if (!m || (process.env[m[1]] && !always)) continue;
      process.env[m[1]] = stripQuotes(m[2].trim());
    }
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
 * children even if they were reparented after our parent died. */
function killProcessTree(pid) {
  if (!pid) return;
  // First signal the whole process group — catches descendants, reparented
  // orphans, and grandchildren we can't see via pgrep -P.
  try {
    process.kill(-pid, 'SIGKILL');
  } catch {
    /* not a group leader or already dead */
  }
  // Then belt-and-suspenders: kill by PID and any visible descendants.
  try {
    process.kill(pid, 'SIGKILL');
  } catch {
    /* */
  }
  for (const d of collectDescendants(pid)) {
    if (!isPidAlive(d)) continue;
    try {
      process.kill(d, 'SIGKILL');
    } catch {
      /* */
    }
  }
}

/** Kill all PIDs recorded in WRANGLER_PIDS_FILE (and their descendants).
 * This is the ONLY mechanism for killing wrangler — never blind port-based kills. */
function killRecordedWranglerPids() {
  let raw;
  try {
    raw = readFileSync(WRANGLER_PIDS_FILE, 'utf8');
  } catch {
    return;
  }
  const pids = raw.trim().split('\n').filter(Boolean).map(Number).filter(Boolean);
  if (!pids.length) return;

  const toKill = new Set();
  for (const pid of pids) {
    toKill.add(pid);
    for (const d of collectDescendants(pid)) toKill.add(d);
  }
  log(`  Killing ${toKill.size} recorded wrangler process(es)...`);
  for (const pid of toKill) killProcessTree(pid);
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
function cleanupDeadRunner(existingPid) {
  log(`Cleaning up after dead previous runner (PID ${existingPid})...`);
  killRecordedWranglerPids();
  try {
    unlinkSync(WRANGLER_PIDS_FILE);
  } catch {
    /* */
  }
  try {
    unlinkSync(RUNNER_PID_FILE);
  } catch {
    /* */
  }
}

/** Release the runner lock (called on exit / SIGINT / SIGTERM). */
function releaseRunnerLock() {
  if (!runnerLockAcquired) return;
  runnerLockAcquired = false;
  try {
    const current = readFileSync(RUNNER_PID_FILE, 'utf8').trim();
    if (parseInt(current) === process.pid) {
      unlinkSync(RUNNER_PID_FILE);
    }
  } catch {
    /* lock file already removed — fine */
  }
  // Always try to clean up the wrangler-pids file we own, regardless of lock state.
  try {
    unlinkSync(WRANGLER_PIDS_FILE);
  } catch {
    /* already gone — fine */
  }
}

/** Acquire exclusive runner lock via PID file. Exits if another runner is alive. */
function acquireRunnerLock() {
  mkdirSync(STATE_DIR, { recursive: true });

  if (existsSync(RUNNER_PID_FILE)) {
    let existingPid = NaN;
    try {
      existingPid = parseInt(readFileSync(RUNNER_PID_FILE, 'utf8'));
    } catch {
      /* */
    }

    if (existingPid === process.pid) {
      runnerLockAcquired = true;
      return;
    }

    if (isPidAlive(existingPid)) refuseConcurrentRun(existingPid);

    cleanupDeadRunner(existingPid);
  }

  writeFileSync(RUNNER_PID_FILE, String(process.pid));
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

// eslint-disable-next-line complexity
function findD1Sqlite(pd) {
  const dir = path.join(pd, 'v3', 'd1', 'miniflare-D1DatabaseObject');
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return null;
  }

  for (const name of entries) {
    if (name === 'metadata.sqlite') continue;
    if (!name.endsWith('.sqlite')) continue;
    const direct = path.join(dir, name);
    if (isD1File(direct)) return direct;
    let files;
    try {
      files = readdirSync(path.join(dir, name));
    } catch {
      continue;
    }
    for (const f of files) {
      if (f === 'metadata.sqlite' || !f.endsWith('.sqlite')) continue;
      const nested = path.join(dir, name, f);
      if (isD1File(nested)) return nested;
    }
  }
  return null;
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
  for (let i = 0; i < 60; i++) {
    try {
      const r = await fetch(`http://127.0.0.1:${PORT}/`);
      if (r.ok && !httpReady) {
        httpReady = true;
        log('  wrangler HTTP-ready, triggering D1 init...');
        await fetch(`http://127.0.0.1:${PORT}/api/health`);
        await sleep(1000);
      }
      if (httpReady) {
        dbPath = findD1Sqlite(STATE_DIR);
        if (dbPath) break;
      }
    } catch {
      /* not ready */
    }
    await sleep(500);
  }
  // Stop tmp wrangler BEFORE applying migrations so it doesn't hold the file lock
  // or cache an empty schema. Record the dbPath while wrangler is still alive so
  // we know the exact file wrangler opened.
  killProcessTree(tmp.pid);
  // eslint-disable-next-line no-magic-numbers
  await sleep(1500);
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
    try {
      await new Promise((resolve, reject) => {
        const child = spawn('sqlite3', [dbPath], { stdio: ['pipe', 'pipe', 'pipe'] });
        let stderr = '';
        child.stderr.on('data', (d) => {
          stderr += d.toString();
        });
        child.on('error', reject);
        child.on('close', (code) => {
          const msg = stderr.trim();
          // Filter known benign messages
          if (msg && !msg.includes('already exists') && !msg.includes('no such table')) {
            log(`    sqlite3: ${msg}`);
          }
          if (code !== 0 && code !== null) {
            log(`    exit code: ${code}`);
          }
          resolve();
        });
        child.stdin.write(readFileSync(sqlPath));
        child.stdin.end();
      });
      log(`  ✓ ${file}`);
    } catch (err) {
      log(`  ✗ ${file}: ${err.message}`);
    }
  }
}

async function enablePublicRegistration(dbPath) {
  log('Enabling public registration...');
  try {
    await new Promise((resolve, reject) => {
      const child = spawn('sqlite3', [dbPath], { stdio: ['pipe', 'pipe', 'pipe'] });
      let stderr = '';
      child.stderr.on('data', (d) => {
        stderr += d.toString();
      });
      child.on('error', reject);
      child.on('close', () => {
        if (stderr.trim()) log(`    sqlite3: ${stderr.trim()}`);
        resolve();
      });
      child.stdin.write(
        'INSERT OR REPLACE INTO app_config (key, value, updated_at) VALUES ' +
          "('public_registration_status', 'active', unixepoch()), " +
          "('public_registration', 'true', unixepoch());\n"
      );
      child.stdin.end();
    });
    log('Public registration enabled.');
  } catch (err) {
    log('Warning: could not enable public_registration:', err.message);
  }
}

function verifyTables(dbPath) {
  const count = execSync(
    `sqlite3 "${dbPath}" "SELECT count(*) FROM sqlite_master WHERE type='table';"`,
    { encoding: 'utf8' }
  ).trim();
  log(`DB ready — ${count} tables`);
  // Sanity check: migrations must have created enough tables (GrowChat has 20+ core tables)
  if (Number(count) < 10) {
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
  killProcessTree(wranglerProc.pid);
  process.exit(1);
}

// ── Teardown ──────────────────────────────────────────────────────────────────

function killDevServer() {
  if (!wranglerProc) return;
  const pid = wranglerProc.pid;
  log(`Stopping wrangler dev (PID ${pid})...`);
  if (pid) killProcessTree(pid);
  wranglerProc = null;
}

// ── Seed ─────────────────────────────────────────────────────────────────────

async function seedUser() {
  const { TEST_EMAIL: email, TEST_PASSWORD: password } = process.env;
  if (!email || !password) {
    log('TEST_EMAIL/TEST_PASSWORD not set');
    return;
  }
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
  if (res.status === 409) {
    log('Test user already exists.');
    return;
  }
  log(`Warning: seed failed (${res.status}): ${await res.text().catch(() => '')}`);
}

// ── Tests ─────────────────────────────────────────────────────────────────────

async function runTests() {
  return new Promise((resolve) => {
    const proc = spawn('pnpm', ['exec', 'playwright', 'test'], {
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
  acquireRunnerLock(); // PID lock — refuses on concurrent runner

  const cleanup = () => killDevServer();
  process.on('SIGINT', cleanup);
  process.on('SIGTERM', cleanup);

  try {
    await initDatabase();
    await startDevServer();
    await seedUser();
    const code = await runTests();
    killDevServer();
    process.exit(code);
  } catch (err) {
    log('Unexpected error:', err);
    killDevServer();
    process.exit(1);
  }
}

main();
