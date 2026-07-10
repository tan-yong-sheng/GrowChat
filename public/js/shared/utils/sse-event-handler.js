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

/**
 * Finalize a completed stream and load messages.
 * @param {Object} ctx
 */

/**
 * Build a fallback assistant message and load messages.
 * Shared between finalizeStreamAndLoadMessages and handleStreamCatchError.
 */
async function buildFallbackAndLoadMessages({
  getStreamState,
  chatId,
  buildFallbackAssistantMessage,
  resolveTempMessageId,
  tempUserId,
  loadMessages,
  activeModelId,
  activeChatId,
  preferredLeafId,
}) {
  const st = getStreamState();
  const fallback = buildFallbackAssistantMessage(chatId, st.assistantMessageId, {
    content: st.assistantText,
    errorActive: st.errorActive,
    errorMessage: st.errorMessage,
    model: activeModelId,
    parentId: resolveTempMessageId(chatId, tempUserId),
  });
  await loadMessages(chatId, {
    draw: activeChatId === chatId,
    updateActiveModel: activeChatId === chatId,
    ...(preferredLeafId ? { preferredLeafId } : {}),
    fallbackMessage: fallback,
  });
}
export async function finalizeStreamAndLoadMessages({
  getStreamState,
  thinkingStartByMessageId,
  thinkingDurationByMessageId,
  thinkingActiveByMessageId,
  applyStreamingAssistantText,
  state,
  setState,
  streamingOverrideByChat,
  updateMessageContentDom,
  chatId,
  buildFallbackAssistantMessage,
  resolveTempMessageId,
  tempUserId,
  loadMessages,
  activeModelId,
  activeChatId,
  preferredLeafId,
  streaming = false,
}) {
  finalizeStreamThinking({
    assistantMessageId: getStreamState().assistantMessageId,
    thinkingStartByMessageId,
    thinkingDurationByMessageId,
    thinkingActiveByMessageId,
  });
  applyStreamingAssistantText({
    state,
    setState,
    streamingOverrideByChat,
    updateMessageContentDom,
    chatId,
    messageId: getStreamState().assistantMessageId,
    assistantText: getStreamState().assistantText,
    errorActive: getStreamState().errorActive,
    errorMessage: getStreamState().errorMessage,
    streaming,
  });
  streamingOverrideByChat.delete(chatId);
  await buildFallbackAndLoadMessages({
    getStreamState,
    chatId,
    buildFallbackAssistantMessage,
    resolveTempMessageId,
    tempUserId,
    loadMessages,
    activeModelId,
    activeChatId,
    preferredLeafId,
  });
}

/**
 * Handle a catch-block error during streaming.
 * @param {Object} ctx
 */
export async function handleStreamCatchError({
  error,
  getStreamState,
  applyStreamingAssistantText,
  state,
  setState,
  streamingOverrideByChat,
  updateMessageContentDom,
  chatId,
  buildFallbackAssistantMessage,
  resolveTempMessageId,
  tempUserId,
  loadMessages,
  activeModelId,
  activeChatId,
  preferredLeafId,
}) {
  const st = getStreamState();
  if (!st.errorActive) {
    applyStreamingAssistantText({
      state,
      setState,
      streamingOverrideByChat,
      updateMessageContentDom,
      chatId,
      messageId: st.assistantMessageId,
      assistantText: '',
      errorActive: true,
      errorMessage: String(error?.message || 'LLM request failed'),
      streaming: false,
    });
  }
  await buildFallbackAndLoadMessages({
    getStreamState,
    chatId,
    buildFallbackAssistantMessage,
    resolveTempMessageId,
    tempUserId,
    loadMessages,
    activeModelId,
    activeChatId,
    preferredLeafId,
  });
}

/**
 * Create a reusable applyAssistantText callback for createSseStreamHandlers.
 *
 * Replaces the inline `applyAssistantText: (streaming) => { ... }` pattern
 * that was duplicated across chat-message-actions and chat-message-retry-actions.
 *
 * @param {Function} getStreamState - The getStreamState() closure from createSseStreamHandlers
 * @param {Object} opts - Options including applyStreamingAssistantText and streaming context
 * @returns {Function} - Callback suitable for applyAssistantText in createSseStreamHandlers
 */
export function makeApplyStreamingCallback(
  getStreamState,
  {
    state,
    setState,
    streamingOverrideByChat,
    updateMessageContentDom,
    chatId,
    applyStreamingAssistantText,
  } = {}
) {
  return (streaming = true) => {
    const { assistantMessageId, assistantText, errorActive, errorMessage } = getStreamState();
    applyStreamingAssistantText({
      state,
      setState,
      streamingOverrideByChat,
      updateMessageContentDom,
      chatId,
      messageId: assistantMessageId,
      assistantText,
      errorActive,
      errorMessage,
      streaming,
    });
  };
}
