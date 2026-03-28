import { describe, expect, it, vi } from 'vitest';
import { applyStreamingAssistantText } from '../../public/js/features/chat/chat-message-stream-assistant.js';

describe('chat message stream assistant helper', () => {
  it('mirrors assistant text into state, streaming overrides, and the active DOM', () => {
    const state = {
      activeChatId: 'chat-1',
      messagesByChat: {
        'chat-1': [{ id: 'msg-1', content: '', status: 'pending', error_message: null }],
      },
    };
    const setState = vi.fn((updater) => {
      const next = typeof updater === 'function' ? updater(state) : updater;
      Object.assign(state, next);
    });
    const streamingOverrideByChat = new Map();
    const updateMessageContentDom = vi.fn();

    applyStreamingAssistantText({
      state,
      setState,
      streamingOverrideByChat,
      updateMessageContentDom,
      chatId: 'chat-1',
      messageId: 'msg-1',
      assistantText: 'hello world',
      errorActive: false,
      errorMessage: null,
      streaming: true,
    });

    expect(streamingOverrideByChat.get('chat-1')).toEqual({
      targetMsgId: 'msg-1',
      content: 'hello world',
    });
    expect(state.messagesByChat['chat-1'][0]).toMatchObject({
      id: 'msg-1',
      content: 'hello world',
      status: 'pending',
      error_message: null,
    });
    expect(updateMessageContentDom).toHaveBeenCalledWith('msg-1', 'hello world', {
      isError: false,
      isStreaming: true,
    });
  });

  it('does not update the DOM for inactive chats', () => {
    const state = {
      activeChatId: 'chat-2',
      messagesByChat: {
        'chat-1': [{ id: 'msg-1', content: '' }],
      },
    };
    const setState = vi.fn();
    const updateMessageContentDom = vi.fn();
    const streamingOverrideByChat = new Map();

    applyStreamingAssistantText({
      state,
      setState,
      streamingOverrideByChat,
      updateMessageContentDom,
      chatId: 'chat-1',
      messageId: 'msg-1',
      assistantText: 'pending text',
      errorActive: true,
      errorMessage: 'boom',
      streaming: false,
    });

    expect(updateMessageContentDom).not.toHaveBeenCalled();
    expect(streamingOverrideByChat.get('chat-1')).toEqual({
      targetMsgId: 'msg-1',
      content: 'pending text',
    });
    expect(setState).toHaveBeenCalled();
  });
});
