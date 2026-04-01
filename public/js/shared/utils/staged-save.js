export function createStagedSaveQueue({
  getSnapshot,
  saveSnapshot,
  onCommit,
  onError,
  onStatusChange,
} = {}) {
  let inFlight = false;
  let dirty = false;
  let queued = false;
  let currentVersion = 0;
  let committedVersion = 0;
  let queue;

  const flush = async () => {
    if (inFlight) {
      queued = true;
      return;
    }
    if (!dirty && currentVersion === committedVersion) {
      return;
    }

    const snapshotVersion = currentVersion;
    const snapshot = typeof getSnapshot === 'function' ? getSnapshot() : null;
    if (!snapshot) {
      dirty = false;
      committedVersion = currentVersion;
      return;
    }

    inFlight = true;
    onStatusChange?.(true);
    let saveFailed = false;

    try {
      const result = await saveSnapshot(snapshot);
      if (currentVersion === snapshotVersion) {
        committedVersion = snapshotVersion;
        dirty = false;
        onCommit?.(snapshot, snapshotVersion, result);
      } else {
        queued = true;
      }
    } catch (error) {
      saveFailed = true;
      queued = false;
      dirty = true;
      onError?.(error, snapshot, snapshotVersion);
    } finally {
      inFlight = false;
      onStatusChange?.(false);
      if (queued || (!saveFailed && currentVersion !== committedVersion)) {
        queued = false;
        void flush();
      }
    }
  };

  queue = {
    stage() {
      currentVersion += 1;
      dirty = true;
      onStatusChange?.(false);
    },
    request() {
      queue.stage();
      void flush();
    },
    flush,
    markClean() {
      dirty = false;
      committedVersion = currentVersion;
    },
    get pending() {
      return dirty || inFlight || queued || currentVersion !== committedVersion;
    },
    get saving() {
      return inFlight;
    },
  };

  return queue;
}
