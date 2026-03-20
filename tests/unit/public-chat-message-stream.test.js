import { describe, expect, it, vi } from 'vitest';
import { createChatMessageStream } from '../../public/js/chat-message-stream.js';

describe('chat message stream helper', () => {
  it('finishes immediately when asked to send a blank prompt', async () => {
    const onFinished = vi.fn();
    const helper = createChatMessageStream();

    await helper.sendMessage('   ', { onFinished });

    expect(onFinished).toHaveBeenCalledTimes(1);
  });

  it('resumes a stream and updates message state from SSE events', async () => {
    const messageBlocksById = new Map();
    const toolCallsByMessageId = new Map();
    const streamingOverrideByChat = new Map();
    const state = {
      activeChatId: 'chat-1',
      activeModelId: 'model-1',
      messagesByChat: {
        'chat-1': [{ id: 'msg-1', role: 'assistant', content: 'seed content', status: 'streaming' }],
      },
      attachmentsByChat: {},
    };
    const setState = vi.fn((updater) => {
      const next = typeof updater === 'function' ? updater(state) : updater;
      Object.assign(state, next);
    });
    const streamSession = {
      getResumeStream: vi.fn(() => null),
      setResumeStream: vi.fn(),
      clearResumeStream: vi.fn(),
      startStreamPolling: vi.fn(),
      stopStreamPolling: vi.fn(),
      stopResumeStream: vi.fn(),
    };
    const apiFetch = vi.fn(async () => ({ ok: true, body: {} }));
    const consumeSseTextStream = vi.fn(async (_, { onEvent, onDelta }) => {
      onEvent({ event: 'reasoning_start' });
      onDelta('Hello');
      onEvent({ event: 'tool_result', message_id: 'msg-1', id: 'tool-1', name: 'Search', status: 'completed', output: 'done' });
      onEvent({ event: 'reasoning_end', duration_ms: 1500 });
    });
    const updateMessageContentDom = vi.fn();
    const loadMessages = vi.fn().mockResolvedValue(undefined);
    const appendBlock = vi.fn((blocksMap, messageId, type, delta) => {
      const blocks = blocksMap.get(messageId) || [];
      const last = blocks[blocks.length - 1];
      if (last && last.type === type) {
        last.content = `${last.content || ''}${delta}`;
      } else {
        blocks.push({ id: `${type}-${blocks.length + 1}`, type, content: delta });
      }
      blocksMap.set(messageId, blocks);
    });
    const ensureThinkingBlock = vi.fn((blocksMap, messageId) => {
      const blocks = blocksMap.get(messageId) || [];
      if (!blocks.some((block) => block.type === 'thinking')) {
        blocks.push({ id: 'thinking-1', type: 'thinking', content: '' });
      }
      blocksMap.set(messageId, blocks);
    });
    const updateToolCallState = vi.fn((toolCallsMap, blocksMap, messageId, payload) => {
      const list = toolCallsMap.get(messageId) || [];
      list.push({ id: payload.id, name: payload.name, status: payload.status, input: '', output: payload.output || '' });
      toolCallsMap.set(messageId, list);
      const blocks = blocksMap.get(messageId) || [];
      blocks.push({ id: `tool:${payload.id}`, type: 'tool', toolCallId: payload.id });
      blocksMap.set(messageId, blocks);
    });

    const helper = createChatMessageStream({
      state,
      setState,
      apiFetch,
      drawMessages: vi.fn(),
      buildTempChat: vi.fn(),
      pruneTempChats: (list) => list,
      getDraftAttachments: vi.fn(() => []),
      setDraftAttachments: vi.fn(),
      updateChatTitleLocal: vi.fn(),
      currentLeafByChatId: new Map(),
      registerPendingTempMessage: vi.fn(),
      setBranchSelection: vi.fn(),
      streamingOverrideByChat,
      setGlobalStreamAbort: vi.fn(),
      clearGlobalStreamAbort: vi.fn(),
      setStreamingState: vi.fn(),
      getActiveStreamAbort: vi.fn(() => null),
      setActiveStreamAbort: vi.fn(),
      consumeSseTextStream,
      appendBlock,
      ensureThinkingBlock,
      updateToolCallState,
      notePayloadSeq: vi.fn(),
      buildFallbackAssistantMessage: vi.fn(),
      formatApiErrorMessage: vi.fn(),
      updateMessageContentDom,
      applyAssistantErrorMessage: vi.fn(),
      getMessageById: vi.fn(() => ({ id: 'msg-1', content: 'seed content' })),
      loadMessages,
      getMessageSeq: vi.fn(() => 7),
      thinkingStartByMessageId: new Map(),
      thinkingDurationByMessageId: new Map(),
      thinkingActiveByMessageId: new Map(),
      messageBlocksById,
      toolCallsByMessageId,
      streamSession,
      replaceTempMessageId: vi.fn(),
      resolveTempMessageId: vi.fn((_, id) => id),
    });

    await helper.startResumeStream('chat-1', 'msg-1');

    expect(apiFetch).toHaveBeenCalledWith('/api/chats/chat-1/messages/msg-1/resume?after_seq=7', expect.any(Object));
    expect(consumeSseTextStream).toHaveBeenCalled();
    expect(loadMessages).toHaveBeenCalled();
    expect(updateMessageContentDom).toHaveBeenCalled();
    expect(messageBlocksById.get('msg-1')).toEqual([
      { id: 'thinking-1', type: 'thinking', content: '' },
      { id: 'text-2', type: 'text', content: 'Hello' },
      { id: 'tool:tool-1', type: 'tool', toolCallId: 'tool-1' },
    ]);
    expect(toolCallsByMessageId.get('msg-1')[0].status).toBe('completed');
  });
});
