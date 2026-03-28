import { describe, expect, it, vi } from 'vitest';
import {
  prepareOptimisticConversation,
  promoteOptimisticConversation,
  rollbackOptimisticConversation,
} from '../../public/js/features/chat/chat-message-stream-temp-chat.js';

describe('chat message stream temp chat helpers', () => {
  it('prepares an optimistic temp chat and moves draft state into it', () => {
    const state = {
      activeChatId: null,
      activeModelId: 'model-1',
      defaultModelId: 'model-2',
      globalDefaultModelId: 'model-3',
      chats: [],
      messagesByChat: {},
      attachmentsByChat: {},
      newChatAttachments: [{ id: 'file-1' }],
      newChatToolSelection: ['tool-a'],
      newChatDraft: 'hello there world',
      toolSelectionsByChat: {},
    };
    const setState = vi.fn((updater) => {
      const next = typeof updater === 'function' ? updater(state) : updater;
      Object.assign(state, next);
    });

    const result = prepareOptimisticConversation({
      state,
      setState,
      text: 'hello there world',
      buildTempChat: vi.fn(() => ({ id: 'temp-1', title: 'New Chat', model: 'model-x' })),
      pruneTempChats: (list) => list,
      syncChatUrl: vi.fn(),
      updateChatTitleLocal: vi.fn(),
    });

    expect(result).toMatchObject({
      chatId: 'temp-1',
      tempChatId: 'temp-1',
      autoTitle: 'hello there world',
      hadMessagesBefore: false,
    });
    expect(state.attachmentsByChat['temp-1']).toEqual([{ id: 'file-1' }]);
    expect(state.newChatAttachments).toEqual([]);
    expect(state.toolSelectionsByChat['temp-1']).toEqual(['tool-a']);
    expect(state.newChatToolSelection).toBeNull();
  });

  it('promotes temp chat state to the real chat id and rolls back temp chats cleanly', () => {
    const state = {
      activeChatId: 'temp-1',
      activeModelId: 'model-1',
      defaultModelId: 'model-2',
      globalDefaultModelId: 'model-3',
      chats: [{ id: 'temp-1', title: 'New Chat', model: 'model-x' }],
      messagesByChat: { 'temp-1': [{ id: 'm1' }] },
      attachmentsByChat: { 'temp-1': [{ id: 'file-1' }] },
      toolSelectionsByChat: { 'temp-1': ['tool-a'] },
      newChatDraft: '',
    };
    const setState = vi.fn((updater) => {
      const next = typeof updater === 'function' ? updater(state) : updater;
      Object.assign(state, next);
    });
    const currentLeafByChatId = new Map([['temp-1', 'leaf-1']]);
    const streamingOverrideByChat = new Map([['temp-1', { targetMsgId: 'm1', content: 'hello' }]]);

    const realChatId = promoteOptimisticConversation({
      state,
      setState,
      tempChatId: 'temp-1',
      realChat: { id: 'chat-1', title: 'New Chat', model: 'model-real' },
      currentLeafByChatId,
      streamingOverrideByChat,
      syncChatUrl: vi.fn(),
    });

    expect(realChatId).toBe('chat-1');
    expect(state.activeChatId).toBe('chat-1');
    expect(state.messagesByChat['chat-1']).toEqual([{ id: 'm1' }]);
    expect(state.attachmentsByChat['chat-1']).toEqual([{ id: 'file-1' }]);
    expect(state.toolSelectionsByChat['chat-1']).toEqual(['tool-a']);
    expect(currentLeafByChatId.get('chat-1')).toBe('leaf-1');
    expect(streamingOverrideByChat.get('chat-1')).toEqual({ targetMsgId: 'm1', content: 'hello' });

    rollbackOptimisticConversation({
      state,
      setState,
      tempChatId: 'temp-2',
    });

    expect(state.chats.some((chat) => chat.id === 'temp-1')).toBe(false);
    expect(state.chats.some((chat) => chat.id === 'chat-1')).toBe(true);
  });
});
