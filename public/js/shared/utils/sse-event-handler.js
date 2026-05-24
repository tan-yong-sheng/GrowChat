/**
 * Shared SSE stream event handler for chat streaming
 *
 * Provides a factory for the onEvent/onDelta callbacks used by
 * consumeSseTextStream. Centralizes the duplicated logic across
 * chat-message-actions, chat-message-retry-actions, and
 * chat-message-stream-send.
 */

function handleStartEvent(payload, ctx, state) {
  const {
    chatId,
    tempAssistantId,
    tempUserId,
    replaceTempMessageId,
    applyAssistantText,
    thinkingActiveByMessageId,
    thinkingStartByMessageId,
    onUserMessageStart,
    onAssistantMessageStart,
  } = ctx;

  if (payload?.user_message_id && tempUserId) {
    const nextId = String(payload.user_message_id);
    replaceTempMessageId(chatId, tempUserId, nextId);
    if (onUserMessageStart) onUserMessageStart(chatId, nextId);
  }
  if (payload?.message_id) {
    state.assistantMessageId = String(payload.message_id);
    replaceTempMessageId(chatId, tempAssistantId, state.assistantMessageId);
    if (onAssistantMessageStart) onAssistantMessageStart(chatId, state.assistantMessageId);
    if (!thinkingActiveByMessageId.has(String(state.assistantMessageId))) {
      thinkingActiveByMessageId.set(String(state.assistantMessageId), true);
    }
    if (!thinkingStartByMessageId.has(String(state.assistantMessageId))) {
      thinkingStartByMessageId.set(String(state.assistantMessageId), Date.now());
    }
    applyAssistantText(true);
  }
}

function handleReasoningStart(payload, ctx, state) {
  const {
    thinkingStartByMessageId,
    thinkingActiveByMessageId,
    ensureThinkingBlock,
    messageBlocksById,
    applyAssistantText,
  } = ctx;
  if (!thinkingStartByMessageId.has(String(state.assistantMessageId))) {
    thinkingStartByMessageId.set(String(state.assistantMessageId), Date.now());
  }
  thinkingActiveByMessageId.set(String(state.assistantMessageId), true);
  ensureThinkingBlock(messageBlocksById, state.assistantMessageId);
  applyAssistantText(true);
}

function handleReasoningDelta(payload, ctx, state) {
  const { appendBlock, messageBlocksById, thinkingActiveByMessageId, applyAssistantText } = ctx;
  const delta = String(payload.delta || '');
  if (delta) {
    appendBlock(messageBlocksById, state.assistantMessageId, 'thinking', delta);
    thinkingActiveByMessageId.set(String(state.assistantMessageId), true);
    applyAssistantText(true);
  }
}

function handleReasoningEnd(payload, ctx, state) {
  const { thinkingDurationByMessageId, thinkingActiveByMessageId } = ctx;
  const duration = Number(payload.duration_ms);
  if (Number.isFinite(duration) && duration > 0) {
    thinkingDurationByMessageId.set(String(state.assistantMessageId), duration);
  }
  thinkingActiveByMessageId.delete(String(state.assistantMessageId));
}

function handleToolEvent(payload, ctx, state) {
  const {
    resolveTempMessageId,
    chatId,
    updateToolCallState,
    toolCallsByMessageId,
    messageBlocksById,
    applyAssistantText,
  } = ctx;
  const targetId = resolveTempMessageId(
    chatId,
    String(payload?.message_id || state.assistantMessageId)
  );
  updateToolCallState(toolCallsByMessageId, messageBlocksById, targetId, payload);
  applyAssistantText();
}

function handleError(payload, ctx, state) {
  const { applyAssistantText, errorStrategy } = ctx;
  state.errorMessage = payload.message || payload.error || 'LLM request failed';
  state.errorActive = true;
  if (errorStrategy === 'append') {
    const label = `Error: ${state.errorMessage}`;
    state.assistantText = state.assistantText ? `${state.assistantText}\n\n${label}` : label;
  } else {
    state.assistantText = '';
  }
  applyAssistantText();
}

/**
 * Create the onEvent and onDelta handlers for SSE streaming
 * @param {Object} ctx
 * @returns {{ onEvent: Function, onDelta: Function, getStreamState: Function, setStreamState: Function }}
 */
export function createSseStreamHandlers(ctx) {
  const { tempAssistantId, applyAssistantText, appendBlock, messageBlocksById, notePayloadSeq } =
    ctx;

  const state = {
    assistantMessageId: tempAssistantId,
    errorMessage: null,
    errorActive: false,
    assistantText: '',
  };

  function getStreamState() {
    return { ...state };
  }

  function setStreamState(updates) {
    if ('errorMessage' in updates) state.errorMessage = updates.errorMessage;
    if ('errorActive' in updates) state.errorActive = updates.errorActive;
    if ('assistantText' in updates) state.assistantText = updates.assistantText;
  }

  const onEvent = (payload) => {
    const event = payload?.event;
    if (event === 'start') handleStartEvent(payload, ctx, state);
    if (event === 'reasoning_start') handleReasoningStart(payload, ctx, state);
    if (event === 'reasoning_delta') handleReasoningDelta(payload, ctx, state);
    if (event === 'reasoning_end') handleReasoningEnd(payload, ctx, state);
    if (event === 'tool_status' || event === 'tool_result') handleToolEvent(payload, ctx, state);
    if (payload?.error) handleError(payload, ctx, state);
    notePayloadSeq(payload, state.assistantMessageId);
  };

  const onDelta = (delta) => {
    if (!delta) return;
    state.assistantText += delta;
    appendBlock(messageBlocksById, state.assistantMessageId, 'text', delta);
    applyAssistantText();
  };

  return { onEvent, onDelta, getStreamState, setStreamState };
}

/**
 * Finalize a completed stream — record thinking duration, clean up state
 * @param {Object} ctx
 */
export function finalizeStreamThinking({
  assistantMessageId,
  thinkingStartByMessageId,
  thinkingDurationByMessageId,
  thinkingActiveByMessageId,
}) {
  const startedAt = thinkingStartByMessageId.get(String(assistantMessageId));
  if (startedAt && !thinkingDurationByMessageId.has(String(assistantMessageId))) {
    thinkingDurationByMessageId.set(String(assistantMessageId), Date.now() - startedAt);
  }
  thinkingActiveByMessageId.delete(String(assistantMessageId));
}
