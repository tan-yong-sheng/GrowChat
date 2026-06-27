import { describe, expect, it, vi } from 'vitest';
import { createChatRealtimeController } from '../../public/js/features/chat/chat-realtime-controller.js';

/**
 * Creates a replaceTempMessageId mock that faithfully simulates the real
 * implementation: swaps temp→real IDs in message id fields AND updates
 * parent_id references, then calls setState synchronously.
 */
function createReplaceTempMessageIdMock(state, setState) {
  return vi.fn((chatId, tempId, realId) => {
    if (!chatId || !tempId || !realId || tempId === realId) return;
    const chatKey = String(chatId);
    const existing = state.messagesByChat[chatKey] || [];
    const nextMessages = existing.map((msg) => {
      const next = { ...msg };
      if (String(next.id) === String(tempId)) next.id = String(realId);
      if (String(next.parent_id || '') === String(tempId)) next.parent_id = String(realId);
      return next;
    });
    setState({ messagesByChat: { ...state.messagesByChat, [chatKey]: nextMessages } });
  });
}

describe('chat realtime controller', () => {
  describe('upsertMessageFromEvent', () => {
    it('replaces temp message in-place when real message arrives before SSE start event', () => {
      // Scenario: User sends a message. The optimistic UI creates a temp message.
      // The realtime message.created event arrives BEFORE the SSE start event,
      // so the temp ID hasn't been replaced yet. We should detect and replace
      // the temp message instead of pushing a duplicate (which would cause "2 / 2").

      const state = {
        activeChatId: 'chat-1',
        messagesByChat: {
          'chat-1': [
            {
              id: 'temp-user-123',
              role: 'user',
              content: 'hello',
              parent_id: null,
              created_at: 100,
            },
          ],
        },
      };
      const setState = vi.fn((updater) => {
        const next = typeof updater === 'function' ? updater(state) : updater;
        Object.assign(state, next);
      });

      const replaceTempMessageId = createReplaceTempMessageIdMock(state, setState);
      const drawMessages = vi.fn();
      const currentLeafByChatId = new Map();

      const controller = createChatRealtimeController({
        state,
        setState,
        drawMessages,
        currentLeafByChatId,
        replaceTempMessageId,
      });

      // Real message.created event arrives (real ID, same content/role/parent as temp)
      controller.upsertMessageFromEvent('chat-1', {
        id: 'real-user-456',
        role: 'user',
        content: 'hello',
        parent_id: null,
        created_at: 100,
      });

      // Should call replaceTempMessageId to swap temp → real
      expect(replaceTempMessageId).toHaveBeenCalledWith('chat-1', 'temp-user-123', 'real-user-456');

      // Should update the message in-place (not push a duplicate)
      const messages = state.messagesByChat['chat-1'];
      expect(messages).toHaveLength(1);
      expect(messages[0].id).toBe('real-user-456');
      expect(messages[0].content).toBe('hello');

      // Should set the current leaf to the real ID
      expect(currentLeafByChatId.get('chat-1')).toBe('real-user-456');
    });

    it('preserves temp assistant parent_id when temp user is replaced via upsert', () => {
      // Regression test: the stale-state bug caused the temp assistant message
      // to become orphaned (parent_id reverted to the old temp user ID after
      // replaceTempMessageId updated it). This made the assistant invisible
      // during streaming — "no model icon and no model name when waiting LLM reply".

      const state = {
        activeChatId: 'chat-1',
        messagesByChat: {
          'chat-1': [
            {
              id: 'temp-user-100',
              role: 'user',
              content: 'test',
              parent_id: null,
              created_at: 100,
            },
            {
              id: 'temp-assistant-101',
              role: 'assistant',
              content: '',
              model: 'model-x',
              parent_id: 'temp-user-100',
              created_at: 101,
              done: false,
            },
          ],
        },
      };
      const setState = vi.fn((updater) => {
        const next = typeof updater === 'function' ? updater(state) : updater;
        Object.assign(state, next);
      });

      const replaceTempMessageId = createReplaceTempMessageIdMock(state, setState);
      const drawMessages = vi.fn();
      const currentLeafByChatId = new Map();

      const controller = createChatRealtimeController({
        state,
        setState,
        drawMessages,
        currentLeafByChatId,
        replaceTempMessageId,
      });

      // Realtime message.created for user arrives before SSE start
      controller.upsertMessageFromEvent('chat-1', {
        id: 'real-user-200',
        role: 'user',
        content: 'test',
        parent_id: null,
        created_at: 100,
      });

      const messages = state.messagesByChat['chat-1'];

      // Should have exactly 2 messages (user + assistant), no duplicates
      expect(messages).toHaveLength(2);

      // The user message should have the real ID
      const userMsg = messages.find((m) => m.role === 'user');
      expect(userMsg.id).toBe('real-user-200');

      // CRITICAL: the assistant's parent_id must point to the real user ID,
      // NOT the old temp user ID (which no longer exists)
      const assistantMsg = messages.find((m) => m.role === 'assistant');
      expect(assistantMsg).toBeDefined();
      expect(assistantMsg.parent_id).toBe('real-user-200');
      expect(assistantMsg.model).toBe('model-x');
    });

    it('updates existing message when real ID already exists (normal case)', () => {
      const state = {
        activeChatId: 'chat-1',
        messagesByChat: {
          'chat-1': [
            { id: 'msg-1', role: 'user', content: 'hello', parent_id: null, created_at: 100 },
          ],
        },
      };
      const setState = vi.fn((updater) => {
        const next = typeof updater === 'function' ? updater(state) : updater;
        Object.assign(state, next);
      });

      const replaceTempMessageId = vi.fn();
      const controller = createChatRealtimeController({
        state,
        setState,
        replaceTempMessageId,
        currentLeafByChatId: new Map(),
      });

      // Update the existing message
      controller.upsertMessageFromEvent('chat-1', {
        id: 'msg-1',
        role: 'user',
        content: 'hello updated',
        parent_id: null,
        created_at: 100,
      });

      // Should NOT call replaceTempMessageId (no temp message to replace)
      expect(replaceTempMessageId).not.toHaveBeenCalled();

      // Should update in-place
      const messages = state.messagesByChat['chat-1'];
      expect(messages).toHaveLength(1);
      expect(messages[0].content).toBe('hello updated');
    });

    it('pushes new message when no temp or real match exists', () => {
      const state = {
        activeChatId: 'chat-1',
        messagesByChat: {
          'chat-1': [
            { id: 'msg-1', role: 'user', content: 'first', parent_id: null, created_at: 100 },
          ],
        },
      };
      const setState = vi.fn((updater) => {
        const next = typeof updater === 'function' ? updater(state) : updater;
        Object.assign(state, next);
      });

      const replaceTempMessageId = vi.fn();
      const controller = createChatRealtimeController({
        state,
        setState,
        replaceTempMessageId,
        currentLeafByChatId: new Map(),
      });

      // New message with different parent_id (not a temp match)
      controller.upsertMessageFromEvent('chat-1', {
        id: 'msg-2',
        role: 'assistant',
        content: 'reply',
        parent_id: 'msg-1',
        created_at: 101,
      });

      // Should NOT call replaceTempMessageId (no temp message with matching role/parent)
      expect(replaceTempMessageId).not.toHaveBeenCalled();

      // Should push as new message
      const messages = state.messagesByChat['chat-1'];
      expect(messages).toHaveLength(2);
      expect(messages[1].id).toBe('msg-2');
    });

    it('does not produce a spurious "2 / 2" branch indicator during temp-to-real race', async () => {
      // Integration test: upsertMessageFromEvent + projectConversation
      // Simulates the exact race condition that caused "2 / 2" on first message.

      const { projectConversation } = await import('../../public/js/shared/utils/conversation.js');

      const state = {
        activeChatId: 'chat-1',
        messagesByChat: {
          'chat-1': [
            {
              id: 'temp-user-999',
              role: 'user',
              content: 'hi this is a test',
              parent_id: null,
              created_at: 100,
            },
            {
              id: 'temp-assistant-999',
              role: 'assistant',
              content: '',
              parent_id: 'temp-user-999',
              created_at: 101,
            },
          ],
        },
      };
      const setState = vi.fn((updater) => {
        const next = typeof updater === 'function' ? updater(state) : updater;
        Object.assign(state, next);
      });

      const replaceTempMessageId = createReplaceTempMessageIdMock(state, setState);
      const controller = createChatRealtimeController({
        state,
        setState,
        replaceTempMessageId,
        currentLeafByChatId: new Map(),
      });

      // Real message.created for user arrives before SSE start
      controller.upsertMessageFromEvent('chat-1', {
        id: 'real-user-aaa',
        role: 'user',
        content: 'hi this is a test',
        parent_id: null,
        created_at: 100,
      });

      // Verify: only 1 message with parent_id: null (no duplicate ROOT siblings)
      const messages = state.messagesByChat['chat-1'];
      const rootSiblings = messages.filter((m) => !m.parent_id);
      expect(rootSiblings).toHaveLength(1);

      // Verify: projectConversation shows "1 / 1" (not "2 / 2")
      const projection = projectConversation(
        messages,
        messages[messages.length - 1]?.id,
        new Map()
      );
      const userRounds = projection.roundsByMessageId.get('real-user-aaa');
      expect(userRounds).toBeDefined();
      expect(userRounds.total).toBe(1);
      expect(userRounds.index).toBe(1);

      // Verify: assistant message is in the visible path (not orphaned)
      expect(projection.visible.map((m) => m.id)).toContain('temp-assistant-999');
    });
  });
});
