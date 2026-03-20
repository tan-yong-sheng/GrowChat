import { describe, expect, it } from 'vitest';
import { createMessageSequenceTracker } from '../../public/js/chat-message-seq.js';

describe('chat message sequence tracker', () => {
  it('loads, updates, and persists sequence numbers monotonically', () => {
    const storage = new Map();
    const tracker = createMessageSequenceTracker({
      storage: {
        getItem: (key) => storage.get(key) ?? null,
        setItem: (key, value) => { storage.set(key, String(value)); },
      },
      storageKey: 'message_seqs',
      maxEntries: 2,
    });

    tracker.setMessageSeq('m1', 1);
    tracker.setMessageSeq('m1', 1);
    tracker.setMessageSeq('m1', 3);
    tracker.notePayloadSeq({ seq: 2 }, 'm1');
    tracker.notePayloadSeq({ seq: 5 }, 'm1');
    expect(tracker.getMessageSeq('m1')).toBe(5);
    tracker.setMessageSeq('m2', 2);
    tracker.setMessageSeq('m3', 3);

    expect(tracker.getMessageSeq('m1')).toBe(0);
    expect(JSON.parse(storage.get('message_seqs'))).toEqual({ m2: 2, m3: 3 });
  });

  it('ignores invalid stored values', () => {
    const storage = new Map([
      ['message_seqs', JSON.stringify({ a: 1, b: -1, c: 'x' })],
    ]);
    const tracker = createMessageSequenceTracker({
      storage: {
        getItem: (key) => storage.get(key) ?? null,
        setItem: (key, value) => { storage.set(key, String(value)); },
      },
    });

    expect(tracker.getMessageSeq('a')).toBe(1);
    expect(tracker.getMessageSeq('b')).toBe(0);
    expect(tracker.getMessageSeq('c')).toBe(0);
  });
});
