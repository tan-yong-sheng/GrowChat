#!/usr/bin/env node
/**
 * Wrapper script that:
 * 1. Loads .dev.vars so TEST_EMAIL / TEST_PASSWORD / TEST_URL are available
 * 2. Initializes local D1 DB
 * 3. Starts wrangler dev in the background (reads .dev.vars automatically)
 * 4. Waits for it to be ready
 * 5. Enables public registration (so test users can be active)
 * 6. Seeds a test user for E2E auth
 * 7. Runs the Playwright E2E suite
 * 8. Tears down the dev server
 *
 * Usage:
 *   node scripts/test-e2e.js          # reads TEST_EMAIL / TEST_PASSWORD from .dev.vars
 *   TEST_EMAIL=... TEST_PASSWORD=... node scripts/test-e2e.js   # env vars override .dev.vars
 */

import { spawn, execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { setTimeout as sleep } from 'node:timers/promises';

// Test server port: defaults to 8788 to avoid conflicting with a running
// dev server on the default 8787. Set TEST_PORT env var to override.
const PORT = process.env.TEST_PORT || '8788';
const BASE_URL = process.env.TEST_URL || `http://localhost:${PORT}`;
const DEV_TIMEOUT = 90_000;
const POLL_INTERVAL = 500;

let wranglerProc = null;

// Use a separate state directory for E2E tests so the test seed
// (which claims the first-admin role) does not pollute the user's
// development database at .wrangler/state.
const TEST_STATE_DIR = '.wrangler/state-e2e';

function log(...args) {
  console.error('[test-e2e]', ...args);
}

// ── Load .dev.vars into process.env ───────────────────────────────────────────

/**
 * Parse .dev.vars and merge into process.env.
 * .dev.vars format: KEY="value"  (one per line, # for comments)
 * This mirrors what wrangler dev does for its child process.
 */
function stripQuotes(value) {
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1);
  }
  return value;
}

function loadDevVars() {
  let content;
  try {
    content = readFileSync('.dev.vars', 'utf8');
  } catch {
    return;
  }
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const match = trimmed.match(/^([A-Z_][A-Z0-9_]*)=(.+)$/);
    // Always load TEST_EMAIL/TEST_PASSWORD from .dev.vars (user deleted .env, uses .dev.vars only)
    const alwaysLoad = ['TEST_EMAIL', 'TEST_PASSWORD'].includes(match[1]);
    if (!match || (process.env[match[1]] && !alwaysLoad)) continue;
    process.env[match[1]] = stripQuotes(match[2].trim());
  }
}

loadDevVars();

// ── Dev server ────────────────────────────────────────────────────────────────

async function initDatabase() {
  log('Initializing local D1 database (test state)...');
  try {
    // Clean previous test state to ensure a fresh DB each run
    execSync(`rm -rf ${TEST_STATE_DIR}`, { stdio: 'ignore' });
    execSync('node scripts/init-local-db.js', {
      stdio: 'inherit',
      env: { ...process.env, NODE_ENV: 'development', WRANGLER_PERSIST_TO: TEST_STATE_DIR },
    });
  } catch (err) {
    log('Warning: DB init failed (may already exist):', err.message);
  }
}

async function startDevServer() {
  log(`Starting wrangler dev on port ${PORT}...`);

  // wrangler dev reads .dev.vars automatically from CWD
  wranglerProc = spawn(
    'npx',
    ['wrangler', 'dev', '--ip', '0.0.0.0', '--port', PORT, '--persist-to', TEST_STATE_DIR],
    {
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, NODE_ENV: 'development' },
      detached: false,
    }
  );

  wranglerProc.stdout.on('data', (chunk) => process.stderr.write(chunk));
  wranglerProc.stderr.on('data', (chunk) => process.stderr.write(chunk));
  wranglerProc.on('error', (err) => {
    log('Wrangler process error:', err.message);
    process.exit(1);
  });

  // Poll until server is ready
  const start = Date.now();
  while (Date.now() - start < DEV_TIMEOUT) {
    try {
      const res = await fetch(`${BASE_URL}/`);
      if (res.ok) {
        log(`Server ready at ${BASE_URL} (took ${Date.now() - start}ms)`);
        return;
      }
    } catch {
      // not ready yet
    }
    await sleep(POLL_INTERVAL);
  }

  log(`ERROR: Server did not start within ${DEV_TIMEOUT / 1000}s`);
  wranglerProc.kill('SIGTERM');
  process.exit(1);
}

function killDevServer() {
  if (!wranglerProc) return;
  log('Stopping wrangler dev...');
  const pid = wranglerProc.pid;
  if (pid) {
    try {
      execSync(`pkill -TERM -P ${pid}`, { stdio: 'ignore' });
    } catch {
      /* no children */
    }
    try {
      execSync(`kill -TERM ${pid}`, { stdio: 'ignore' });
    } catch {
      /* already dead */
    }
    sleep(500).then(() => {
      try {
        execSync(`kill -9 ${pid}`, { stdio: 'ignore' });
      } catch {
        /* ok */
      }
    });
  }
  wranglerProc.kill('SIGTERM');
  wranglerProc = null;
}

// ── DB config ─────────────────────────────────────────────────────────────────

async function enablePublicRegistration() {
  log('Enabling public registration for E2E...');
  try {
    execSync(
      `npx wrangler d1 execute growchat --local --persist-to ${TEST_STATE_DIR} ` +
        '--command "INSERT OR REPLACE INTO app_config (key, value, updated_at) VALUES ' +
        "('public_registration_status', 'active', unixepoch()), " +
        "('public_registration', 'true', unixepoch())\"",
      { stdio: 'inherit' }
    );
    log('Public registration enabled.');
  } catch (err) {
    log('Warning: Could not set public_registration_status:', err.message);
  }
}

// ── Seed user ─────────────────────────────────────────────────────────────────

async function seedUser() {
  const email = process.env.TEST_EMAIL;
  const password = process.env.TEST_PASSWORD;

  if (!email || !password) {
    log('TEST_EMAIL / TEST_PASSWORD not set — skipping seed');
    return;
  }

  log(`Seeding test user: ${email}`);

  const res = await fetch(`${BASE_URL}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, name: 'E2E Test User' }),
  });

  if (!res.ok) {
    if (res.status === 409) {
      log('Test user already exists — OK');
    } else {
      const text = await res.text().catch(() => '');
      log(`Warning: seed failed (${res.status}): ${text}`);
    }
  } else {
    log('Test user seeded successfully.');
  }
}

// ── Run tests ─────────────────────────────────────────────────────────────────

async function runTests() {
  return new Promise((resolve) => {
    const testEnv = {
      ...process.env,
      TEST_URL: BASE_URL,
      PLAYWRIGHT_TEST_BASE_URL: BASE_URL,
    };

    const testProc = spawn('pnpm', ['exec', 'playwright', 'test'], {
      stdio: 'inherit',
      env: testEnv,
    });

    testProc.on('close', (code) => resolve(code ?? 1));
    testProc.on('error', (err) => {
      log('Playwright spawn error:', err.message);
      resolve(1);
    });
  });
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  // Kill any stale wrangler/workerd processes on the test port
  log('Cleaning up stale processes...');
  try {
    execSync('pkill -9 -f "workerd.*--socket-addr=entry=0\\.0\\.0\\.0:' + PORT + '"', {
      stdio: 'ignore',
    });
  } catch {
    /* none */
  }
  try {
    execSync(`lsof -ti :${PORT} | xargs kill -9 2>/dev/null`, { stdio: 'ignore' });
  } catch {
    /* none */
  }
  await sleep(1000);

  const cleanup = () => {
    killDevServer();
    process.exit(1);
  };
  process.on('SIGINT', cleanup);
  process.on('SIGTERM', cleanup);

  try {
    // Phase 1: Initialize DB and configure BEFORE starting the dev server.
    // wrangler d1 execute spawns its own workerd which conflicts with a
    // running dev server on the same port (Address already in use / kj::Exception).
    await initDatabase();
    await enablePublicRegistration();

    // Phase 2: Start the dev server (no more wrangler d1 commands after this).
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
