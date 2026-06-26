#!/usr/bin/env node
/**
 * Retry wrapper around `pnpm exec danger ci`.
 *
 * Danger's internal retryableFetch (in node_modules/danger/distribution/api/fetch.js)
 * only retries on HTTP 401 and 5xx responses. Network-level failures — most
 * commonly `ERR_STREAM_PREMATURE_CLOSE` from node-fetch v2 when reading a
 * gzipped response body — happen *after* the response object is received but
 * during body consumption. They therefore bypass Danger's retry logic and
 * fail the whole `Local + CI guardrails` check.
 *
 * Empirically (PR #173), re-running `danger ci` with a short delay almost
 * always succeeds because GitHub's load balancer hands out a fresh connection
 * on the next request. This wrapper retries up to N times before giving up.
 *
 * Usage: `node scripts/run-danger.js` (or import runDangerWithRetry for tests).
 */
import { spawnSync } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';

const DEFAULT_MAX_RETRIES = 3;
const DEFAULT_DELAY_MS = 5000;
// POSIX convention: when a process is killed by a signal, the parent sees
// 128 + signum as the implicit exit code.
const SIGNAL_EXIT_BASE = 128;

/**
 * Run `pnpm exec danger ci` and retry on non-zero exit.
 *
 * @param {object} [opts]
 * @param {number} [opts.maxRetries=3]   Total attempts (not retries on top of the first).
 * @param {number} [opts.delayMs=5000]   Delay between attempts in milliseconds.
 * @returns {Promise<number>}            Process exit code.
 */
export async function runDangerWithRetry({
  maxRetries = DEFAULT_MAX_RETRIES,
  delayMs = DEFAULT_DELAY_MS,
} = {}) {
  let lastCode = 0;
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    console.error(`[danger-retry] Attempt ${attempt}/${maxRetries}`);
    const result = spawnSync('pnpm', ['exec', 'danger', 'ci'], { stdio: 'inherit' });
    // Exit code: prefer explicit status; fall back to 128 + signal number when
    // killed by a signal (e.g. SIGTERM=128+15).
    lastCode =
      result.status ?? (result.signal ? SIGNAL_EXIT_BASE + (signals[result.signal] ?? 0) : 1);
    if (lastCode === 0) return 0;
    if (attempt < maxRetries) {
      console.error(
        `[danger-retry] Danger exited with code ${lastCode}; retrying in ${delayMs}ms (${attempt}/${maxRetries})`
      );
      await sleep(delayMs);
    }
  }
  console.error(`[danger-retry] All ${maxRetries} attempt(s) failed; last exit code ${lastCode}`);
  return lastCode;
}

// CLI entry — only run when invoked directly, not when imported by tests.
const isDirectInvocation =
  import.meta.url === `file://${process.argv[1]}` || import.meta.url.endsWith(process.argv[1]);
if (isDirectInvocation) {
  const code = await runDangerWithRetry();
  process.exit(code);
}

const signals = { SIGHUP: 1, SIGINT: 2, SIGQUIT: 3, SIGKILL: 9, SIGTERM: 15 };
