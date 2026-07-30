/**
 * Port occupancy pre-check for the E2E test runner.
 *
 * Before scripts/test-e2e.js attempts to bind wrangler dev on TEST_PORT, it
 * verifies the port is free. If the port is occupied, we try to identify the
 * listener and only kill it when it looks like one of our own processes
 * (wrangler / workerd / node). Anything else is treated as foreign and causes
 * a fast, clear failure so we never kill unrelated user processes.
 */
import { createServer } from 'node:net';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { setTimeout as sleep } from 'node:timers/promises';

const DEFAULT_KILL_TIMEOUT_MS = 3000;
const SIGKILL_TIMEOUT_MS = 2000;
const PORT_POLL_MS = 100;

/** Names that identify a process we (the E2E runner) are allowed to kill. */
const OUR_PROCESS_NAMES = ['wrangler', 'workerd', 'node'];

/**
 * Coerce a value to a positive integer suitable for use as a TCP port or POSIX
 * PID. Throws TypeError on anything else so callers fail fast instead of
 * reaching the shell with a tainted value (CodeQL: shell-command-injection).
 *
 * Accepts integer-valued strings ("8787") but rejects strings with extra
 * characters (`"8787; rm -rf /"`) — `Number.parseInt` alone would silently
 * truncate the latter to `8787`.
 *
 * @param {unknown} value
 * @param {string} label  Used in the error message.
 * @returns {number}
 */
function toPositiveInteger(value, label) {
  // Reject anything that isn't a finite integer or a numeric-only string.
  if (typeof value === 'string' && !/^\d+$/.test(value)) {
    throw new TypeError(`${label} must be a positive integer, got string "${value}"`);
  }
  const n = Number(value);
  if (!Number.isInteger(n) || n <= 0) {
    throw new TypeError(`${label} must be a positive integer, got ${value}`);
  }
  return n;
}

/**
 * Test whether a TCP port is currently occupied by attempting to bind it.
 *
 * @param {number} port  Port number to test.
 * @returns {Promise<boolean>}  true if the port is occupied, false if free.
 */
export function checkPortOccupied(port) {
  return new Promise((resolve) => {
    const server = createServer();

    server.once('listening', () => {
      server.close(() => resolve(false));
    });

    server.once('error', (_err) => {
      server.close(() => {});
      // Any bind failure means the port is unavailable (in use or blocked).
      resolve(true);
    });

    server.listen(port, '0.0.0.0');
  });
}

/**
 * Find the PID listening on a given TCP port.
 *
 * Prefers `lsof` (common on Linux/macOS) and falls back to `ss` on Linux.
 *
 * @param {number} port
 * @returns {number|null}
 */
export function findPortPid(port) {
  const safePort = toPositiveInteger(port, 'port');

  try {
    const out = execFileSync('lsof', ['-t', '-i', `:${safePort}`], { encoding: 'utf8' }).trim();
    const pids = out
      .split('\n')
      .filter(Boolean)
      .map((s) => Number.parseInt(s, 10))
      .filter((n) => n > 0);
    if (pids.length) return pids[0];
  } catch {
    // lsof unavailable or no results.
  }

  try {
    const out = execFileSync('ss', ['-tlnp', `sport = :${safePort}`], { encoding: 'utf8' }).trim();
    const match = out.match(/pid=(\d+)/);
    if (match) return Number.parseInt(match[1], 10);
  } catch {
    // ss unavailable.
  }

  return null;
}

/**
 * Read the short command name for a PID.
 *
 * Uses /proc/PID/comm on Linux and falls back to `ps` elsewhere.
 *
 * @param {number} pid
 * @returns {string|null}
 */
export function getProcessName(pid) {
  const safePid = toPositiveInteger(pid, 'pid');

  try {
    return readFileSync(`/proc/${safePid}/comm`, 'utf8').trim();
  } catch {
    // Not Linux or PID vanished.
  }

  try {
    return execFileSync('ps', ['-o', 'comm=', '-p', String(safePid)], { encoding: 'utf8' }).trim();
  } catch {
    return null;
  }
}

/**
 * Decide whether a process name identifies a process the E2E runner owns.
 *
 * @param {string|null} name
 * @returns {boolean}
 */
export function isOurProcess(name) {
  if (!name) return false;
  const lower = name.toLowerCase();
  return OUR_PROCESS_NAMES.some((ours) => lower.includes(ours));
}

/**
 * Send a signal to a single PID.
 *
 * @param {number} pid
 * @param {NodeJS.Signals} signal
 * @returns {boolean}  true if the signal was delivered.
 */
export function signalProcess(pid, signal) {
  try {
    process.kill(pid, signal);
    return true;
  } catch {
    return false;
  }
}

/**
 * Wait until a port becomes bindable.
 *
 * @param {number} port
 * @param {number} timeoutMs
 * @param {number} pollMs
 * @returns {Promise<boolean>}  true if the port became free in time.
 */
export async function waitForPortFree(
  port,
  { timeoutMs, pollMs = PORT_POLL_MS } = { timeoutMs: DEFAULT_KILL_TIMEOUT_MS }
) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (!(await checkPortOccupied(port))) return true;
    await sleep(pollMs);
  }
  return false;
}

/**
 * Attempt to kill the process occupying a port and wait for it to release.
 *
 * Only processes that {@link isOurProcess} identifies as ours are killed.
 *
 * @param {number} port
 * @param {object} [opts]
 * @param {number} [opts.timeoutMs=3000]
 * @param {number} [opts.pollMs=100]
 * @returns {Promise<{killed: boolean, pid: number|null, name: string|null, reason?: string}>}
 */
export async function killPortProcess(
  port,
  { timeoutMs = DEFAULT_KILL_TIMEOUT_MS, pollMs = PORT_POLL_MS } = {}
) {
  const pid = findPortPid(port);
  if (!pid) {
    return { killed: false, pid: null, name: null, reason: 'no-pid' };
  }

  const name = getProcessName(pid);
  if (!isOurProcess(name)) {
    return { killed: false, pid, name, reason: 'not-ours' };
  }

  signalProcess(pid, 'SIGTERM');
  const freed = await waitForPortFree(port, { timeoutMs, pollMs });
  if (freed) {
    return { killed: true, pid, name };
  }

  signalProcess(pid, 'SIGKILL');
  const freedAfterKill = await waitForPortFree(port, { timeoutMs: SIGKILL_TIMEOUT_MS, pollMs });
  return { killed: freedAfterKill, pid, name };
}

/**
 * Ensure the target port is available for wrangler dev.
 *
 * If the port is occupied by one of our processes, kill it and wait. If the
 * port is occupied by anything else, or killing fails, fail fast with a clear
 * message.
 *
 * @param {number} port
 * @param {object} [deps]  Injected dependencies for testing.
 * @param {typeof console.error} [deps.log]
 * @param {() => void} [deps.exit]
 * @param {typeof checkPortOccupied} [deps.checkPortOccupied]
 * @param {typeof killPortProcess} [deps.killPortProcess]
 */
function logPortOccupiedFatal(port, { result, log }) {
  const pidText = result.pid ?? '?';
  const nameText = result.name ?? 'unknown';

  log('');
  log('════════════════════════════════════════════════════════════════════');
  log(
    `[test-e2e] FATAL: Port ${port} is occupied by PID ${pidText} (process: ${nameText}). Cannot start E2E tests.`
  );
  log('');
  if (result.pid) {
    log(`[test-e2e] Kill it manually: kill -9 ${result.pid}`);
  }
  log('════════════════════════════════════════════════════════════════════');
}

export async function ensurePortAvailable(
  port,
  {
    log = console.error,
    exit = () => process.exit(1),
    checkPortOccupied: check = checkPortOccupied,
    killPortProcess: kill = killPortProcess,
  } = {}
) {
  if (!(await check(port))) return;

  const result = await kill(port);
  if (result.killed) {
    log(`[test-e2e] Killed lingering ${result.name} (PID ${result.pid}) on port ${port}`);
    return;
  }

  logPortOccupiedFatal(port, { result, log });
  exit();
}
