#!/usr/bin/env node
/**
 * E2E test orchestration:
 * 1. Clean state dir + kill stale workerd processes on 8788/8789
 * 2. Spin up wrangler dev briefly → miniflare creates the D1 sqlite file
 * 3. Kill tmp server, detect which hash wrangler used
 * 4. Apply all migrations + public_registration config directly via sqlite3 stdin
 * 5. Start wrangler dev for real (DB already has schema — no lazy init)
 * 6. Seed test user + run Playwright
 */

import { spawn, execSync } from 'node:child_process';
import { readFileSync, readdirSync, mkdirSync, lstatSync } from 'node:fs';
import { setTimeout as sleep } from 'node:timers/promises';
import path from 'node:path';

const PORT = process.env.TEST_PORT || '8788';
const MIN_D1_FILE_SIZE = 4096;
const BASE_URL = process.env.TEST_URL || `http://localhost:${PORT}`;
const DEV_TIMEOUT = 90_000;
const POLL_MS = 500;
const STATE_DIR = '.wrangler/state-e2e';

let wranglerProc = null;

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

// ── Stale process cleanup ─────────────────────────────────────────────────────

/** Kill processes listening on a specific port using ss + kill. */
function killOnPort(port) {
  try {
    const out = execSync(`ss -tlnp sport = :${port} 2>/dev/null`, { encoding: 'utf8' });
    const pids = [...new Set([...out.matchAll(/pid=(\d+)/g)].map((m) => m[1]))];
    if (!pids.length) return;
    log(`  Port ${port}: killing PIDs ${pids.join(',')}`);
    for (const pid of pids) {
      try {
        execSync(`pkill -9 -P ${pid}`, { stdio: 'ignore' });
      } catch {
        /* */
      }
      try {
        execSync(`kill -9 ${pid}`, { stdio: 'ignore' });
      } catch {
        /* */
      }
    }
  } catch {
    /* no listeners on this port */
  }
}

function cleanupStaleProcesses() {
  log('Cleaning up stale processes...');
  killOnPort(PORT);
  killOnPort(String(parseInt(PORT) + 1));
}

// ── D1 probe ─────────────────────────────────────────────────────────────────

/** Probe a single file for D1 sqlite suitability (size > 4096 bytes). */
function isD1File(filePath) {
  try {
    return lstatSync(filePath).size > MIN_D1_FILE_SIZE;
  } catch {
    return false;
  }
}

/** Find the actual D1 sqlite file.
 * Tries two layouts: direct child of miniflare-D1DatabaseObject/,
 * and older nested layout (hash/hash.sqlite). Uses lstat to avoid FUSE
 * open-delay false negatives. */
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
    // Layout A: direct child
    const direct = path.join(dir, name);
    if (isD1File(direct)) return direct;
    // Layout B: nested (hash/hash.sqlite)
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
async function bootTmpWrangler() {
  const tmpPort = String(parseInt(PORT) + 1);
  log(`Creating D1 file via wrangler dev (tmp port ${tmpPort})...`);
  const tmp = spawn(
    'npx',
    ['wrangler', 'dev', '--ip', '0.0.0.0', '--port', tmpPort, '--persist-to', STATE_DIR],
    {
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, NODE_ENV: 'development' },
      detached: false,
    }
  );

  let httpReady = false;
  let dbPath = null;
  for (let i = 0; i < 60; i++) {
    try {
      const r = await fetch(`http://127.0.0.1:${tmpPort}/`);
      if (r.ok && !httpReady) {
        httpReady = true;
        log('  tmp server HTTP-ready, triggering D1 init...');
        await fetch(`http://127.0.0.1:${tmpPort}/api/health`);
        await sleep(1000);
      }
      if (httpReady) {
        dbPath = findD1Sqlite(STATE_DIR);
        if (dbPath) break;
      }
    } catch {
      /* not ready yet */
    }
    await sleep(500);
  }
  tmp.kill('SIGTERM');
  // eslint-disable-next-line no-magic-numbers
  await sleep(1200);
  if (!dbPath) {
    log('FATAL: D1 sqlite never created');
    process.exit(1);
  }
  const dir = path.basename(path.dirname(dbPath));
  const file = path.basename(dbPath);
  log(`D1 database: ${dir}/${file}`);
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
      const child = spawn('sqlite3', [dbPath], { stdio: ['pipe', 'ignore', 'pipe'] });
      child.stdin.write(readFileSync(sqlPath));
      child.stdin.end();
      const err = child.stderr.read();
      if (err) {
        const msg = err.toString().trim();
        if (!msg.includes('already exists') && !msg.includes('no such table')) {
          log(`    sqlite3: ${msg}`);
        }
      }
      log(`  ✓ ${file}`);
    } catch (err) {
      log(`  ✗ ${file}: ${err.message}`);
    }
  }
}

async function enablePublicRegistration(dbPath) {
  log('Enabling public registration...');
  try {
    const child = spawn('sqlite3', [dbPath], { stdio: ['pipe', 'ignore', 'pipe'] });
    child.stdin.write(
      'INSERT OR REPLACE INTO app_config (key, value, updated_at) VALUES ' +
        '("public_registration_status", "active", unixepoch()), ' +
        '("public_registration", "true", unixepoch());\n'
    );
    child.stdin.end();
    child.stderr.read();
    log('Public registration enabled.');
  } catch (err) {
    log('Warning: could not enable public_registration:', err.message);
  }
}

function verifyTables(dbPath) {
  const tables = execSync(`sqlite3 "${dbPath}" ".tables"`, { encoding: 'utf8' }).trim();
  log(`DB ready — ${tables.split(' ').length} tables`);
}

// ── DB init ───────────────────────────────────────────────────────────────────

async function initDatabase() {
  log('Initializing local D1 database...');
  cleanupStateDir();
  const dbPath = await bootTmpWrangler();
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
      detached: false,
    }
  );

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
  wranglerProc.kill('SIGTERM');
  process.exit(1);
}

// ── Teardown ──────────────────────────────────────────────────────────────────

function killDevServer() {
  if (!wranglerProc) return;
  log('Stopping wrangler dev...');
  const pid = wranglerProc.pid;
  if (pid) {
    try {
      execSync(`pkill -TERM -P ${pid}`, { stdio: 'ignore' });
    } catch {
      /* */
    }
    try {
      execSync(`kill -TERM ${pid}`, { stdio: 'ignore' });
    } catch {
      /* */
    }
    sleep(500).then(() => {
      try {
        execSync(`kill -9 ${pid}`, { stdio: 'ignore' });
      } catch {
        /* */
      }
    });
  }
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

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  cleanupStaleProcesses();
  // eslint-disable-next-line no-magic-numbers
  await sleep(1500);

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
