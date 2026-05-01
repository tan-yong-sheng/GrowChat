export function createMessageSequenceTracker({
  storage = globalThis.localStorage,
  storageKey = 'message_seqs',
  maxEntries = 500,
} = {}) {
  const messageSeqById = new Map();

  const loadMessageSeqs = () => {
    let stored;
    try {
      stored = JSON.parse(storage?.getItem?.(storageKey) || '{}') || {};
    } catch {
      stored = {};
    }
    Object.entries(stored).forEach(([id, seq]) => {
      const num = Number(seq);
      if (Number.isFinite(num) && num > 0) {
        messageSeqById.set(String(id), num);
      }
    });
  };

  const persistMessageSeqs = () => {
    const entries = Array.from(messageSeqById.entries());
    if (entries.length > maxEntries) {
      const excess = entries.length - maxEntries;
      for (let i = 0; i < excess; i += 1) {
        messageSeqById.delete(entries[i][0]);
      }
    }
    try {
      storage?.setItem?.(storageKey, JSON.stringify(Object.fromEntries(messageSeqById.entries())));
    } catch {
      // Ignore storage quota / availability failures.
    }
  };

  const getMessageSeq = (messageId) => {
    if (!messageId) return 0;
    return messageSeqById.get(String(messageId)) || 0;
  };

  const setMessageSeq = (messageId, seq) => {
    if (!messageId) return;
    const num = Number(seq);
    if (!Number.isFinite(num) || num <= 0) return;
    const key = String(messageId);
    const existing = messageSeqById.get(key) || 0;
    if (num <= existing) return;
    messageSeqById.delete(key);
    messageSeqById.set(key, num);
    persistMessageSeqs();
  };

  const notePayloadSeq = (payload, messageId) => {
    if (!payload || !messageId) return;
    if (payload?.seq != null) {
      setMessageSeq(messageId, payload.seq);
    }
  };

  loadMessageSeqs();

  return {
    messageSeqById,
    loadMessageSeqs,
    persistMessageSeqs,
    getMessageSeq,
    setMessageSeq,
    notePayloadSeq,
  };
}
