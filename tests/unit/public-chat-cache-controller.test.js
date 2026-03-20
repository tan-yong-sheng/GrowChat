// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createChatCacheController } from '../../public/js/chat-cache-controller.js';

describe('chat cache controller', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('prunes cached chats and updates state when needed', () => {
    const setStateFn = vi.fn();
    const controller = createChatCacheController({
      currentState: {
        messagesByChat: {
          a: [{ id: '1' }],
          b: [{ id: '2' }],
        },
        attachmentsByChat: {
          a: ['x'],
          b: ['y'],
        },
      },
      setStateFn,
      recentChatIds: ['b'],
      maxCachedChats: 1,
    });

    controller.pruneChatCaches();

    expect(setStateFn).toHaveBeenCalledWith({
      messagesByChat: { b: [{ id: '2' }] },
      attachmentsByChat: { b: ['y'] },
    });
  });

  it('schedules pruning only once per window', () => {
    vi.useFakeTimers();
    const setStateFn = vi.fn();
    const controller = createChatCacheController({
      currentState: {
        messagesByChat: {
          a: [{ id: '1' }],
          b: [{ id: '2' }],
        },
        attachmentsByChat: {},
      },
      setStateFn,
      recentChatIds: ['b'],
      maxCachedChats: 1,
    });

    controller.schedulePrune();
    controller.schedulePrune();
    vi.advanceTimersByTime(50);

    expect(setStateFn).toHaveBeenCalledTimes(1);
  });
});
