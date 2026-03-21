import { describe, expect, it, vi } from 'vitest';
import { createChatStreamState } from '../../public/js/features/chat/chat-stream-state.js';

describe('chat stream state helper', () => {
  it('updates streaming state and cancels messages locally', async () => {
    const streamSession = {
      stopStreamPolling: vi.fn(),
      stopResumeStream: vi.fn(),
    };
    const states = [];
    const state = {
      activeChatId: 'chat-1',
      messagesByChat: {
        'chat-1': [{ id: 'm1', role: 'assistant', content: 'hi' }],
      },
    };
    const helper = createChatStreamState({
      state,
      setState: (updater) => {
        const next = typeof updater === 'function' ? updater({ ui: {}, messagesByChat: state.messagesByChat }) : updater;
        if (next.ui) {
          state.ui = { ...(state.ui || {}), ...next.ui };
        }
        if (next.messagesByChat) {
          state.messagesByChat = next.messagesByChat;
        }
        states.push(next);
      },
      apiFetch: vi.fn().mockResolvedValue(new Response('{}', { status: 200 })),
      streamSession,
      streamingOverrideByChat: new Map([['chat-1', { targetMsgId: 'm1', content: 'streaming' }]]),
      drawMessages: vi.fn(),
      getActiveStreamAbort: () => ({ abort: vi.fn() }),
      setActiveStreamAbort: vi.fn(),
      clearGlobalStreamAbort: vi.fn(),
    });

    helper.setStreamingState('chat-1', true);
    expect(state.ui.streaming).toBe(true);
    expect(state.ui.streamingChatId).toBe('chat-1');

    await helper.requestCancelStream('chat-1', 'm1');
    expect(streamSession.stopStreamPolling).toHaveBeenCalledWith('chat-1');
    expect(streamSession.stopResumeStream).toHaveBeenCalledWith('chat-1');
    expect(state.messagesByChat['chat-1'][0]).toMatchObject({
      id: 'm1',
      status: 'cancelled',
      error_code: 'cancelled',
      error_message: 'Cancelled by user',
      done: true,
    });
    expect(states.length).toBeGreaterThan(0);
  });
});


