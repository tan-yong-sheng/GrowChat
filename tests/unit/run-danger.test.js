/**
 * Tests for scripts/run-danger.js — the retry wrapper around `danger ci`.
 *
 * The wrapper exists because Danger's internal retryableFetch only retries on
 * 401 and 5xx HTTP responses. Network-level failures (notably
 * `ERR_STREAM_PREMATURE_CLOSE` from node-fetch v2 when reading gzipped
 * responses for large PRs) happen after the response object is received but
 * during body consumption, so they bypass Danger's retry logic and fail the
 * whole `Local + CI guardrails` check.
 *
 * Observed in PR #173 (49 commits, 100 files): Danger failed three times in a
 * row with the same error. Re-running `danger ci` with a brief delay typically
 * succeeds because GitHub's load balancer hands out a fresh connection on the
 * next request.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock node:child_process so the wrapper doesn't actually shell out.
const spawnSync = vi.fn();
vi.mock('node:child_process', () => ({
  spawnSync: (...args) => spawnSync(...args),
}));

// Mock node:timers/promises setTimeout so the test runs instantly.
vi.mock('node:timers/promises', () => ({
  setTimeout: () => Promise.resolve(),
}));

const { runDangerWithRetry } = await import('../../scripts/run-danger.js');

beforeEach(() => {
  spawnSync.mockReset();
  // Default: success
  spawnSync.mockReturnValue({
    status: 0,
    signal: null,
    pid: 1,
    output: [],
    stdout: '',
    stderr: '',
  });
});

describe('runDangerWithRetry', () => {
  it('returns 0 on first success', async () => {
    const code = await runDangerWithRetry({ maxRetries: 3 });
    expect(code).toBe(0);
    expect(spawnSync).toHaveBeenCalledTimes(1);
  });

  it('retries on non-zero exit and eventually succeeds', async () => {
    spawnSync
      .mockReturnValueOnce({
        status: 1,
        signal: null,
        pid: 1,
        output: [],
        stdout: '',
        stderr: 'ERR_STREAM_PREMATURE_CLOSE',
      })
      .mockReturnValueOnce({
        status: 1,
        signal: null,
        pid: 1,
        output: [],
        stdout: '',
        stderr: 'ERR_STREAM_PREMATURE_CLOSE',
      })
      .mockReturnValueOnce({ status: 0, signal: null, pid: 1, output: [], stdout: '', stderr: '' });
    const code = await runDangerWithRetry({ maxRetries: 3, delayMs: 1 });
    expect(code).toBe(0);
    expect(spawnSync).toHaveBeenCalledTimes(3);
  });

  it('gives up after maxRetries and returns the last exit code', async () => {
    spawnSync.mockReturnValue({
      status: 7,
      signal: null,
      pid: 1,
      output: [],
      stdout: '',
      stderr: '',
    });
    const code = await runDangerWithRetry({ maxRetries: 3, delayMs: 1 });
    expect(code).toBe(7);
    // maxRetries=3 means up to 3 total attempts (not 1 + 3 retries).
    expect(spawnSync).toHaveBeenCalledTimes(3);
  });

  it('treats signal-killed exit as a retryable failure', async () => {
    spawnSync
      .mockReturnValueOnce({
        status: null,
        signal: 'SIGTERM',
        pid: 1,
        output: [],
        stdout: '',
        stderr: '',
      })
      .mockReturnValueOnce({ status: 0, signal: null, pid: 1, output: [], stdout: '', stderr: '' });
    const code = await runDangerWithRetry({ maxRetries: 3, delayMs: 1 });
    expect(code).toBe(0);
    expect(spawnSync).toHaveBeenCalledTimes(2);
  });

  it('invokes danger ci with stdio inherit', async () => {
    await runDangerWithRetry({ maxRetries: 1 });
    expect(spawnSync).toHaveBeenCalledWith(
      'pnpm',
      ['exec', 'danger', 'ci'],
      expect.objectContaining({ stdio: 'inherit' })
    );
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});
