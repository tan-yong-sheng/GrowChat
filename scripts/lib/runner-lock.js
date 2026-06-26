/**
 * Atomic PID-file lock helper for scripts/test-e2e.js.
 *
 * The previous implementation in scripts/test-e2e.js used `existsSync`
 * followed by `writeFileSync`, which is a classic time-of-check-to-time-of-use
 * (TOCTOU) pattern. CodeQL flagged it as a high-severity file-system race
 * condition: another runner could create or modify the file between the
 * check and the write, causing two runners to believe they both hold the lock.
 *
 * This module replaces that pattern with `openSync(path, 'wx')`, which is
 * `O_WRONLY | O_CREAT | O_EXCL` — an atomic create-or-fail at the kernel
 * level. There is no separate check step that can race; the create itself
 * fails if the file exists.
 *
 * Contract:
 *   tryWriteExclusive(pidFile, myPid):
 *     - Returns true and writes `${myPid}` if the file did not exist.
 *     - Returns false without modifying the file if it already exists.
 *     - Rethrows non-EEXIST errors (e.g. EISDIR, EACCES).
 *
 *   acquirePidLockAtomic(pidFile, myPid, isAlive, onRefuseLiveRunner, onDeadRunner):
 *     - Tries atomic create first.
 *     - On EEXIST, reads the existing pid to decide:
 *         - own pid       → idempotent acquire ({ acquired: true, fresh: false })
 *         - live other pid → calls onRefuseLiveRunner(pid), returns acquired=false
 *         - dead/missing  → calls onDeadRunner(pid), retries atomic create once
 *     - If the retry still hits EEXIST (concurrent winner during cleanup),
 *       returns acquired=false without overwriting.
 */
import { openSync, closeSync, writeSync, readFileSync, unlinkSync } from 'node:fs';

/**
 * Atomically create-and-write a PID file, refusing if it already exists.
 *
 * @param {string} pidFile  Absolute path to the lock file.
 * @param {number} myPid    PID to write if we win the race.
 * @returns {boolean}       true if we wrote our pid; false if the file already existed.
 */
export function tryWriteExclusive(pidFile, myPid) {
  let fd;
  try {
    // 'wx' === O_WRONLY | O_CREAT | O_EXCL. The create-and-fail is atomic at
    // the kernel level; no separate existence check is required.
    fd = openSync(pidFile, 'wx');
  } catch (err) {
    if (err.code === 'EEXIST') return false;
    throw err;
  }
  try {
    writeSync(fd, String(myPid));
  } finally {
    closeSync(fd);
  }
  return true;
}

/**
 * Acquire a PID-file lock atomically, with dead-runner recovery.
 *
 * @param {object} opts
 * @param {string} opts.pidFile              Path to the lock file.
 * @param {number} opts.myPid                PID of the calling process.
 * @param {(pid: number) => boolean} opts.isAlive  Predicate: is this PID still running?
 * @param {(pid: number) => void} opts.onRefuseLiveRunner  Called when a live other runner holds the lock.
 * @param {(pid: number) => void | Promise<void>} opts.onDeadRunner  Called to clean up a dead runner before retry.
 * @returns {{ acquired: boolean, fresh?: boolean }}   Result of the acquire attempt.
 */
export function acquirePidLockAtomic({
  pidFile,
  myPid,
  isAlive,
  onRefuseLiveRunner,
  onDeadRunner,
}) {
  // First attempt: atomic create-or-fail. Eliminates the TOCTOU that the
  // previous existsSync + writeFileSync pattern had.
  if (tryWriteExclusive(pidFile, myPid)) {
    return { acquired: true, fresh: true };
  }

  // EEXIST — the file is held by someone (us or another runner). Read to
  // determine who, then decide.
  let existingPid = NaN;
  try {
    existingPid = Number.parseInt(readFileSync(pidFile, 'utf8'), 10);
  } catch {
    // File vanished between EEXIST and read — treat as dead and recover.
  }

  if (existingPid === myPid) {
    return { acquired: true, fresh: false };
  }

  if (isAlive(existingPid)) {
    onRefuseLiveRunner(existingPid);
    return { acquired: false };
  }

  // Dead runner (or unparseable content). Let the caller clean up, then retry
  // the atomic create exactly once.
  onDeadRunner(existingPid);

  if (tryWriteExclusive(pidFile, myPid)) {
    return { acquired: true, fresh: true };
  }

  // A concurrent winner claimed the slot during cleanup. Refuse without
  // overwriting.
  return { acquired: false };
}

/**
 * Convenience: release a PID-file lock if and only if the file currently
 * holds our pid. Safe to call when we do not hold the lock.
 *
 * @param {string} pidFile  Path to the lock file.
 * @param {number} myPid    PID of the calling process.
 */
export function releasePidLock(pidFile, myPid) {
  try {
    const current = Number.parseInt(readFileSync(pidFile, 'utf8'), 10);
    if (current === myPid) unlinkSync(pidFile);
  } catch {
    // Lock file already gone or unreadable — nothing to do.
  }
}
