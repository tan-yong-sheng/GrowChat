import { applyStreamingAssistantText } from './chat-message-stream-assistant.js';

function shouldSkipResume(chatId, messageId, state, getActiveStreamAbort, streamSession) {
  if (!chatId || !messageId) return true;
  if (getActiveStreamAbort() && state.activeChatId === chatId) return true;
  const existing = streamSession?.getResumeStream?.(chatId);
  if (existing && String(existing.messageId) === String(messageId)) return true;
  return false;
}

function stopPriorStreams(chatId, streamSession) {
  const existing = streamSession?.getResumeStream?.(chatId);
  if (existing) streamSession?.stopResumeStream?.(chatId);
  streamSession?.stopStreamPolling?.(chatId);
}

function initResumeAssistantText(
  chatId,
  messageId,
  lastSeq,
  getMessageById,
  extractThinkingBlocksFn,
  messageBlocksById,
  toolCallsByMessageId
) {
  const existingMsg = getMessageById(chatId, messageId);
  if (lastSeq > 0 && existingMsg?.content) {
    return extractThinkingBlocksFn(existingMsg.content).cleaned || '';
  }
  messageBlocksById.delete(String(messageId));
  toolCallsByMessageId.delete(String(messageId));
  return '';
}

export async function startChatResumeStream({
  chatId,
  messageId,
  state,
  setState = () => {},
  apiFetch,
  consumeSseTextStream,
  streamSession = null,
  setStreamingState = () => {},
  getActiveStreamAbort = () => null,
  updateMessageContentDom = () => {},
  notePayloadSeq = () => {},
  appendBlock = () => {},
  ensureThinkingBlock = () => {},
  updateToolCallState = () => {},
  loadMessages = async () => {},
  getMessageById = () => null,
  getMessageSeq = () => 0,
  extractThinkingBlocksFn = (raw) => ({ cleaned: String(raw || '') }),
  thinkingStartByMessageId = new Map(),
  thinkingDurationByMessageId = new Map(),
  thinkingActiveByMessageId = new Map(),
  messageBlocksById = new Map(),
  toolCallsByMessageId = new Map(),
  streamingOverrideByChat = new Map(),
}) {
  if (shouldSkipResume(chatId, messageId, state, getActiveStreamAbort, streamSession)) return;
  stopPriorStreams(chatId, streamSession);

  const lastSeq = getMessageSeq(messageId);
  const controller = new AbortController();
  streamSession?.setResumeStream?.(chatId, { controller, messageId });
  setStreamingState(chatId, true);

  let assistantText = initResumeAssistantText(
    chatId,
    messageId,
    lastSeq,
    getMessageById,
    extractThinkingBlocksFn,
    messageBlocksById,
    toolCallsByMessageId
  );

  let errorMessage = null;
  let errorActive = false;

  const applyAssistantText = (streaming = true) =>
    applyStreamingAssistantText({
      state,
      setState,
      streamingOverrideByChat,
      updateMessageContentDom,
      chatId,
      messageId,
      assistantText,
      errorActive,
      errorMessage,
      streaming,
    });

  function handleReasoningStart(payload) {
    if (!thinkingStartByMessageId.has(String(messageId))) {
      thinkingStartByMessageId.set(String(messageId), Date.now());
    }
    thinkingActiveByMessageId.set(String(messageId), true);
    ensureThinkingBlock(messageBlocksById, messageId);
    applyAssistantText(true);
  }

  function handleReasoningDelta(payload) {
    const delta = String(payload.delta || '');
    if (!delta) return;
    appendBlock(messageBlocksById, messageId, 'thinking', delta);
    thinkingActiveByMessageId.set(String(messageId), true);
    applyAssistantText(true);
  }

  function handleReasoningEnd(payload) {
    const duration = Number(payload.duration_ms);
    if (Number.isFinite(duration) && duration > 0) {
      thinkingDurationByMessageId.set(String(messageId), duration);
    }
    thinkingActiveByMessageId.delete(String(messageId));
  }

  function handleToolEvent(payload) {
    updateToolCallState(toolCallsByMessageId, messageBlocksById, messageId, payload);
    applyAssistantText(true);
  }

  function handleStreamError(payload) {
    errorMessage = payload.message || payload.error || 'LLM request failed';
    errorActive = true;
    assistantText = '';
    applyAssistantText(false);
  }

  function handleTextDelta(delta) {
    if (!delta) return;
    assistantText += delta;
    appendBlock(messageBlocksById, messageId, 'text', delta);
    applyAssistantText(true);
  }

  const eventHandlers = {
    reasoning_start: handleReasoningStart,
    reasoning_delta: handleReasoningDelta,
    reasoning_end: handleReasoningEnd,
    tool_status: handleToolEvent,
    tool_result: handleToolEvent,
  };

  try {
    const res = await apiFetch(
      `/api/chats/${chatId}/messages/${messageId}/resume?after_seq=${lastSeq}`,
      {
        signal: controller.signal,
      }
    );
    if (!res.ok || !res.body) {
      streamSession?.stopResumeStream?.(chatId);
      streamSession?.startStreamPolling?.(chatId, messageId);
      return;
    }

    await consumeSseTextStream(res.body, {
      onEvent: (payload) => {
        notePayloadSeq(payload, messageId);
        const handler = eventHandlers[payload?.event];
        if (handler) handler(payload);
        if (payload?.error) handleStreamError(payload);
      },
      onDelta: handleTextDelta,
    });
    const startedAt = thinkingStartByMessageId.get(String(messageId));
    if (startedAt && !thinkingDurationByMessageId.has(String(messageId))) {
      thinkingDurationByMessageId.set(String(messageId), Date.now() - startedAt);
    }
    thinkingActiveByMessageId.delete(String(messageId));
    applyAssistantText(false);
    streamingOverrideByChat.delete(chatId);
    await loadMessages(chatId, {
      draw: state.activeChatId === chatId,
      updateActiveModel: state.activeChatId === chatId,
    });
  } catch (err) {
    if (err?.name !== 'AbortError') {
      console.error('Resume stream error:', err);
      streamSession?.startStreamPolling?.(chatId, messageId);
    }
  } finally {
    streamSession?.clearResumeStream?.(chatId, controller);
    if (state.activeChatId === chatId && !streamingOverrideByChat.has(chatId)) {
      setStreamingState(chatId, false);
    }
  }
}
