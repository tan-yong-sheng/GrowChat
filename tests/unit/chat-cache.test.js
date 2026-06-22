import { describe, expect, it, vi } from 'vitest';
import {
  clearAttachmentCache,
  isTempMessageId,
  normalizeCitations,
  pruneCachedChats,
  touchAttachmentCache,
  touchRecentChat,
} from '../../public/js/shared/utils/chat-cache.js';

describe('chat cache helpers', () => {
  it('updates attachment cache recency and evicts the oldest entry', () => {
    const cache = new Map([
      ['a', 'url-a'],
      ['b', 'url-b'],
    ]);
    const revokeFn = vi.fn();

    touchAttachmentCache({ cache, key: 'a', url: 'url-a-next', maxEntries: 2, revokeFn });

    expect([...cache.entries()]).toEqual([
      ['b', 'url-b'],
      ['a', 'url-a-next'],
    ]);
    expect(revokeFn).not.toHaveBeenCalled();

    touchAttachmentCache({ cache, key: 'c', url: 'url-c', maxEntries: 2, revokeFn });

    expect([...cache.entries()]).toEqual([
      ['a', 'url-a-next'],
      ['c', 'url-c'],
    ]);
    expect(revokeFn).toHaveBeenCalledTimes(1);
    expect(revokeFn).toHaveBeenCalledWith('url-b');
  });

  it('clears attachment caches and revokes urls', () => {
    const cache = new Map([
      ['a', 'url-a'],
      ['b', null],
    ]);
    const promiseCache = new Map([['pa', Promise.resolve('one')]]);
    const revokeFn = vi.fn();

    clearAttachmentCache(cache, promiseCache, revokeFn);

    expect(cache.size).toBe(0);
    expect(promiseCache.size).toBe(0);
    expect(revokeFn).toHaveBeenCalledTimes(1);
    expect(revokeFn).toHaveBeenCalledWith('url-a');
  });

  it('moves recent chats to the front', () => {
    const recentChatIds = ['c', 'b', 'a'];

    touchRecentChat(recentChatIds, 'b');
    touchRecentChat(recentChatIds, 4);

    expect(recentChatIds).toEqual(['4', 'b', 'c', 'a']);
  });

  it('prunes cached chats outside the active window without mutating the input state', () => {
    const state = {
      messagesByChat: {
        a: [{ id: 'm1' }],
        b: [{ id: 'm2' }],
        c: [{ id: 'm3' }],
      },
      attachmentsByChat: {
        a: ['x'],
        c: ['y'],
        d: ['z'],
      },
    };
    const recentChatIds = ['c', 'b'];

    const result = pruneCachedChats({ state, recentChatIds, maxCachedChats: 1 });

    expect(result.changed).toBe(true);
    expect(result.messagesByChat).toEqual({
      c: [{ id: 'm3' }],
    });
    expect(result.attachmentsByChat).toEqual({
      c: ['y'],
    });
    expect(state.messagesByChat).toEqual({
      a: [{ id: 'm1' }],
      b: [{ id: 'm2' }],
      c: [{ id: 'm3' }],
    });
  });

  it('normalizes citations from arrays and JSON strings', () => {
    expect(normalizeCitations(['a', 2, null, ''])).toEqual(['a', '2', 'null']);
    expect(normalizeCitations('["x", 3, ""]')).toEqual(['x', '3']);
    expect(normalizeCitations('not-json')).toEqual([]);
    expect(normalizeCitations({})).toEqual([]);
  });

  it('detects temporary message ids', () => {
    expect(isTempMessageId('temp-123')).toBe(true);
    expect(isTempMessageId('123')).toBe(false);
  });
});
