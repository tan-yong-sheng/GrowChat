/**
 * Tests for scripts/lib/runner-lock.js — the atomic PID-file lock used by
 * scripts/test-e2e.js to refuse concurrent wrangler dev runners.
 *
 * The original implementation used `existsSync` then `writeFileSync` to take
 * the lock, which is a classic TOCTOU pattern and was flagged by CodeQL as a
 * high-severity file-system race condition. The fix replaces it with
 * `openSync(..., 'wx')` (O_CREAT | O_EXCL) so the check-and-create is atomic
 * at the kernel level.
 *
 * These tests exercise the contract:
 *   - Fresh lock → acquire (fresh=true).
 *   - Self PID in existing file → idempotent acquire (fresh=false).
 *   - Live other PID → refuse (call onRefuseLiveRunner, acquired=false).
 *   - Dead other PID → cleanup then acquire (call onDeadRunner, acquired=true).
 *   - File content is malformed → treat as dead, cleanup, acquire.
 *   - EEXIST on retry after cleanup → refuse as concurrent winner.
 *   - O_EXCL semantics: cannot overwrite an existing file.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, writeFileSync, readFileSync, rmSync, openSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { acquirePidLockAtomic, tryWriteExclusive } from '../../scripts/lib/runner-lock.js';

let tmpDir;
let lockFile;

beforeEach(() => {
  tmpDir = mkdtempSync(path.join(tmpdir(), 'runner-lock-'));
  lockFile = path.join(tmpDir, 'runner.pid');
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

/** A PID that is almost certainly not alive in any test environment. */
const DEAD_PID = 2_000_000_000;

function readPid(p) {
  return Number.parseInt(readFileSync(p, 'utf8').trim(), 10);
}

describe('tryWriteExclusive', () => {
  it('returns true and writes pid when file does not exist', () => {
    expect(tryWriteExclusive(lockFile, 1234)).toBe(true);
    expect(readPid(lockFile)).toBe(1234);
  });

  it('returns false (does not overwrite) when file already exists', () => {
    writeFileSync(lockFile, '9999');
    expect(tryWriteExclusive(lockFile, 1234)).toBe(false);
    expect(readPid(lockFile)).toBe(9999);
  });

  it('rethrows non-EEXIST errors (e.g., ENOENT for missing parent)', () => {
    const badPath = path.join(tmpDir, 'no-such-subdir', 'runner.pid');
    expect(() => tryWriteExclusive(badPath, 1234)).toThrow(
      expect.objectContaining({ code: 'ENOENT' })
    );
  });
});

describe('acquirePidLockAtomic', () => {
  const refuse = vi.fn();
  const dead = vi.fn();

  beforeEach(() => {
    refuse.mockReset();
    dead.mockReset();
  });

  it('fresh acquire when no lock file exists', () => {
    const result = acquirePidLockAtomic({
      pidFile: lockFile,
      myPid: 1234,
      isAlive: () => false,
      onRefuseLiveRunner: refuse,
      onDeadRunner: dead,
    });
    expect(result).toEqual({ acquired: true, fresh: true });
    expect(readPid(lockFile)).toBe(1234);
  });

  it('idempotent acquire when lock file already holds our own pid', () => {
    writeFileSync(lockFile, '1234');
    const result = acquirePidLockAtomic({
      pidFile: lockFile,
      myPid: 1234,
      isAlive: () => false,
      onRefuseLiveRunner: refuse,
      onDeadRunner: dead,
    });
    expect(result).toEqual({ acquired: true, fresh: false });
    expect(readPid(lockFile)).toBe(1234);
  });

  it('refuses and calls onRefuseLiveRunner when a live other pid holds the lock', () => {
    writeFileSync(lockFile, String(DEAD_PID)); // will appear alive via the isAlive mock
    const result = acquirePidLockAtomic({
      pidFile: lockFile,
      myPid: 1234,
      isAlive: () => true, // everything is alive in this test
      onRefuseLiveRunner: refuse,
      onDeadRunner: dead,
    });
    expect(refuse).toHaveBeenCalledWith(DEAD_PID);
    expect(dead).not.toHaveBeenCalled();
    expect(result.acquired).toBe(false);
    expect(readPid(lockFile)).toBe(DEAD_PID); // we did not overwrite
  });

  it('cleans up dead runner and acquires when pid file holds a dead pid', () => {
    writeFileSync(lockFile, String(DEAD_PID));
    // Real callers' cleanup callback deletes the stale file. Mirror that.
    const onDead = vi.fn(() => rmSync(lockFile, { force: true }));
    const result = acquirePidLockAtomic({
      pidFile: lockFile,
      myPid: 1234,
      isAlive: () => false, // nothing alive
      onRefuseLiveRunner: refuse,
      onDeadRunner: onDead,
    });
    expect(onDead).toHaveBeenCalledWith(DEAD_PID);
    expect(result).toEqual({ acquired: true, fresh: true });
    expect(readPid(lockFile)).toBe(1234);
  });

  it('treats malformed lock file content as a dead runner and acquires', () => {
    writeFileSync(lockFile, 'not-a-pid\n');
    const onDead = vi.fn(() => rmSync(lockFile, { force: true }));
    const result = acquirePidLockAtomic({
      pidFile: lockFile,
      myPid: 1234,
      isAlive: () => false,
      onRefuseLiveRunner: refuse,
      onDeadRunner: onDead,
    });
    expect(onDead).toHaveBeenCalled();
    expect(Number.isNaN(onDead.mock.calls[0][0])).toBe(true);
    expect(result).toEqual({ acquired: true, fresh: true });
    expect(readPid(lockFile)).toBe(1234);
  });

  it('refuses (acquired=false, no overwrite) when EEXIST persists after cleanup', () => {
    // Simulate: lock file exists with dead pid, but cleanup callback re-creates
    // the file with another live pid before our retry. The atomic retry must
    // NOT clobber the new owner.
    writeFileSync(lockFile, String(DEAD_PID));
    const onDead = vi.fn(() => {
      // Simulate a concurrent winner grabbing the slot during cleanup.
      writeFileSync(lockFile, '4321');
    });
    const result = acquirePidLockAtomic({
      pidFile: lockFile,
      myPid: 1234,
      isAlive: (pid) => pid === 4321, // the new owner is "alive"
      onRefuseLiveRunner: refuse,
      onDeadRunner: onDead,
    });
    expect(onDead).toHaveBeenCalled();
    expect(result.acquired).toBe(false);
    expect(readPid(lockFile)).toBe(4321); // not overwritten
  });
});

describe('atomic guarantee — O_EXCL prevents overwrite', () => {
  it('openSync with wx flag fails atomically when file exists', () => {
    writeFileSync(lockFile, '9999');
    expect(() => openSync(lockFile, 'wx')).toThrow(expect.objectContaining({ code: 'EEXIST' }));
    expect(readPid(lockFile)).toBe(9999);
    rmSync(lockFile, { force: true });
  });

  it('concurrent tryWriteExclusive — exactly one writer wins, the other observes the existing pid', () => {
    // Sequential simulation of the kernel guarantee: the first writer wins,
    // any subsequent attempt must see the file and refuse.
    expect(tryWriteExclusive(lockFile, 1)).toBe(true);
    expect(readPid(lockFile)).toBe(1);

    expect(tryWriteExclusive(lockFile, 2)).toBe(false);
    expect(readPid(lockFile)).toBe(1); // not overwritten

    expect(tryWriteExclusive(lockFile, 3)).toBe(false);
    expect(readPid(lockFile)).toBe(1);
  });

  it('closes the fd even when the caller ignores the return value', () => {
    // Smoke test: write then read in tight loop should not leak fds.
    for (let i = 0; i < 50; i++) {
      rmSync(lockFile, { force: true });
      expect(tryWriteExclusive(lockFile, i)).toBe(true);
    }
    expect(readPid(lockFile)).toBe(49);
  });
});
