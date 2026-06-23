#!/usr/bin/env node
/**
 * E2E test orchestration:
 * 1. Clean state dir + kill stale workerd processes
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

const PORT        = process.env.TEST_PORT || '8788';
const BASE_URL    = process.env.TEST_URL  || `http://localhost:${PORT}`;
const DEV_TIMEOUT = 90_000;
const POLL_MS     = 500;
const STATE_DIR   = '.wrangler/state-e2e';

let wranglerProc = null;

function log(...a) { console.error('[test-e2e]', ...a); }

// ── .dev.vars loader ──────────────────────────────────────────────────────────

function stripQuotes(v) {
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) return v.slice(1, -1);
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
  } catch { /* no .dev.vars */ }
}

loadDevVars();

// ── D1 probe ─────────────────────────────────────────────────────────────────

/** Find the actual D1 sqlite file. Miniflare stores it as a direct child of
 * miniflare-D1DatabaseObject/ (not inside a hash sub-dir). Uses lstat to avoid
 * FUSE open-delay false negatives. */
function findD1Sqlite(pd) {
  const dir = path.join(pd, 'v3', 'd1', 'miniflare-D1DatabaseObject');
  try {
    for (const name of readdirSync(dir)) {
      if (name === 'metadata.sqlite') continue;
      if (name.endsWith('.sqlite')) {
        const p = path.join(dir, name);
        try { lstatSync(p); return p; } catch { /* */ }
      }
      // Also check one level deeper (older miniflare layout: hash/hash.sqlite)
      try {
        for (const f of readdirSync(path.join(dir, name))) {
          if (f.endsWith('.sqlite') && f !== 'metadata.sqlite') {
            const p = path.join(dir, name, f);
            try { lstatSync(p); return p; } catch { /* */ }
          }
        }
      } catch { /* */ }
    }
  } catch { /* */ }
  return null;
}

// ── DB init ───────────────────────────────────────────────────────────────────

async function initDatabase() {
  log('Initializing local D1 database...');
  try {
    execSync(`rm -rf ${STATE_DIR}`, { stdio: 'ignore' });
  } catch {
    // rm -rf can fail on stale FUSE mounts (miniflare leftover).
    // Rename to a timestamped junk dir instead so mkdir succeeds.
    try {
      execSync(`mv ${STATE_DIR} ${STATE_DIR}-junk-${Date.now()}`, { stdio: 'ignore' });
    } catch { /* dir already gone */ }
  }
  mkdirSync(STATE_DIR, { recursive: true });

  // Boot wrangler dev briefly on a dedicated port so it doesn't conflict with
  // the real server we start afterward on PORT.
  log('Creating D1 file via wrangler dev...');
  const TMP_PORT = String(parseInt(PORT) + 1);
  const tmp = spawn('npx', ['wrangler', 'dev',
    '--ip', '0.0.0.0', '--port', TMP_PORT, '--persist-to', STATE_DIR,
  ], { stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, NODE_ENV: 'development' }, detached: false });

  // Wait for tmp server to be HTTP-ready, then fire a DB-touched request
  // so miniflare creates the sqlite file (lazy init on first query).
  let httpReady = false;
  let dbPath = null;
  for (let i = 0; i < 60; i++) {          // up to 30 s
    try {
      const r = await fetch(`http://127.0.0.1:${TMP_PORT}/`);
      if (r.ok && !httpReady) {
        httpReady = true;
        log('  tmp server HTTP-ready, triggering D1 init...');
        // Fire request that definitely touches D1 (counts users → triggers DB open)
        await fetch(`http://127.0.0.1:${TMP_PORT}/api/health`);
        await sleep(1000);  // give miniflare time to create the sqlite file
      }
      if (httpReady) {
        const found = findD1Sqlite(STATE_DIR);
        if (found) { dbPath = found; break; }
        // Debug: check what dirs exist
        const d1Dir = path.join(STATE_DIR, 'v3', 'd1', 'miniflare-D1DatabaseObject');
        let subs = 'N/A';
        try { subs = readdirSync(d1Dir).join(', '); } catch { /* */ }
      }
    } catch { /* not ready */ }
    await sleep(500);
  }
  tmp.kill('SIGTERM');
  await sleep(1200);                      // let port release

  if (!dbPath) { log('FATAL: D1 sqlite never created'); process.exit(1); }
  const dbHash = path.basename(path.dirname(dbPath));
  log(`D1 database: ${dbHash}/${path.basename(dbPath)}`);

  // Apply all migrations via sqlite3 stdin (handles multi-line / trailing stmts)
  log('Applying migrations...');
  for (const file of [
    '001_initial.sql', '002_settings_permissions.sql',
    '003_password_reset_tokens.sql', '004_email_verification.sql',
    '005_message_editing.sql', '006_audit_logging.sql',
  ]) {
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
    } catch (err) { log(`  ✗ ${file}: ${err.message}`); }
  }

  // Enable public_registration config
  log('Enabling public registration...');
  try {
    const child = spawn('sqlite3', [dbPath], { stdio: ['pipe', 'ignore', 'pipe'] });
    child.stdin.write(
      'INSERT OR REPLACE INTO app_config (key, value, updated_at) VALUES ' +
      '("public_registration_status", "active", unixepoch()), ' +
      '("public_registration", "true", unixepoch());\n'
    );
    child.stdin.end();
    const err = child.stderr.read();
    if (err) log('  sqlite3 warning:', err.toString().trim());
    log('Public registration enabled.');
  } catch (err) { log('Warning: could not enable public_registration:', err.message); }

  // Verify tables exist
  const tables = execSync(`sqlite3 "${dbPath}" ".tables"`, { encoding: 'utf8' }).trim();
  log(`DB ready — ${tables.split(' ').length} tables`);
}

// ── Dev server ────────────────────────────────────────────────────────────────

async function startDevServer() {
  log(`Starting wrangler dev on port ${PORT}...`);
  wranglerProc = spawn('npx', ['wrangler', 'dev',
    '--ip', '0.0.0.0', '--port', PORT, '--persist-to', STATE_DIR,
  ], { stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, NODE_ENV: 'development' }, detached: false });

  wranglerProc.stdout.on('data', c => process.stderr.write(c));
  wranglerProc.stderr.on('data', c => process.stderr.write(c));
  wranglerProc.on('error', err => { log('Wrangler error:', err.message); process.exit(1); });

  const t0 = Date.now();
  while (Date.now() - t0 < DEV_TIMEOUT) {
    try {
      const res = await fetch(`${BASE_URL}/`);
      if (res.ok) { log(`Server ready (${Date.now()-t0}ms)`); return; }
    } catch { /* */ }
    await sleep(POLL_MS);
  }
  log(`ERROR: Server did not start within ${DEV_TIMEOUT/1000}s`);
  wranglerProc.kill('SIGTERM');
  process.exit(1);
}

// ── Teardown ──────────────────────────────────────────────────────────────────

function killDevServer() {
  if (!wranglerProc) return;
  log('Stopping wrangler dev...');
  const pid = wranglerProc.pid;
  if (pid) {
    try { execSync(`pkill -TERM -P ${pid}`, { stdio: 'ignore' }); } catch { /* */ }
    try { execSync(`kill -TERM ${pid}`,      { stdio: 'ignore' }); } catch { /* */ }
    sleep(500).then(() => { try { execSync(`kill -9 ${pid}`, { stdio: 'ignore' }); } catch { /* */ } });
  }
  wranglerProc = null;
}

// ── Seed ─────────────────────────────────────────────────────────────────────

async function seedUser() {
  const { TEST_EMAIL: email, TEST_PASSWORD: password } = process.env;
  if (!email || !password) { log('TEST_EMAIL/TEST_PASSWORD not set'); return; }
  log(`Seeding test user: ${email}`);
  const res = await fetch(`${BASE_URL}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, name: 'E2E Test User' }),
  });
  if (res.ok) { log('Test user seeded.'); return; }
  if (res.status === 409) { log('Test user already exists.'); return; }
  log(`Warning: seed failed (${res.status}): ${await res.text().catch(()=>'')}`);
}

// ── Tests ─────────────────────────────────────────────────────────────────────

async function runTests() {
  return new Promise(resolve => {
    const proc = spawn('pnpm', ['exec', 'playwright', 'test'], {
      stdio: 'inherit',
      env: { ...process.env, TEST_URL: BASE_URL, PLAYWRIGHT_TEST_BASE_URL: BASE_URL },
    });
    proc.on('close',  code => resolve(code ?? 1));
    proc.on('error',  err  => { log('Playwright error:', err.message); resolve(1); });
  });
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  log('Cleaning up stale processes...');
  // Use pgrep to find PIDs first, then kill — avoids pkill -f matching itself
  try {
    const pids1 = execSync('pgrep -f "workerd.*8788" 2>/dev/null', { encoding: 'utf8' });
    const pids2 = execSync('pgrep -f "wrangler.*dev.*8788" 2>/dev/null', { encoding: 'utf8' });
    const pids  = [...(pids1||'').matchAll(/\d+/g), ...(pids2||'').matchAll(/\d+/g)];
    if (pids.length) execSync(`kill -9 ${[...pids].join(' ')}`, { stdio: 'ignore' });
  } catch { /* */ }
  await sleep(2000);

  const cleanup = () => killDevServer();
  process.on('SIGINT',  cleanup);
  process.on('SIGTERM', cleanup);

  try {
    await initDatabase();    // migrations + public_registration
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