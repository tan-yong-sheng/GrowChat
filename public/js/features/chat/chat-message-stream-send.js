import { applyStreamingAssistantText } from './chat-message-stream-assistant.js';
import { createOptimisticTempMessages } from '../../shared/utils/optimistic-messages.js';
import {
  createSseStreamHandlers,
  finalizeStreamAndLoadMessages,
  handleStreamCatchError,
} from '../../shared/utils/sse-event-handler.js';
import {
  prepareOptimisticConversation,
  promoteOptimisticConversation,
  rollbackOptimisticConversation,
} from './chat-message-stream-temp-chat.js';

export async function startChatSendMessage({
  text,
  hooks = {},
  options = {},
  state,
  setState = () => {},
  apiFetch,
  syncChatUrl = () => {},
  drawMessages = () => {},
  buildTempChat = () => null,
  pruneTempChats = (list) => list,
  getDraftAttachments = () => [],
  getDraftToolNames = () => null,
  setDraftAttachments = () => {},
  updateChatTitleLocal = () => {},
  currentLeafByChatId = new Map(),
  registerPendingTempMessage = () => {},
  setBranchSelection = () => {},
  streamingOverrideByChat = new Map(),
  setGlobalStreamAbort = () => {},
  clearGlobalStreamAbort = () => {},
  setStreamingState = () => {},
  setActiveStreamAbort = () => {},
  consumeSseTextStream,
  appendBlock = () => {},
  ensureThinkingBlock = () => {},
  updateToolCallState = () => {},
  notePayloadSeq = () => {},
  buildFallbackAssistantMessage = () => null,
  formatApiErrorMessage = (_, fallback) => fallback || 'Request failed.',
  updateMessageContentDom = () => {},
  applyAssistantErrorMessage = () => {},
  loadMessages = async () => {},
  thinkingStartByMessageId = new Map(),
  thinkingDurationByMessageId = new Map(),
  thinkingActiveByMessageId = new Map(),
  messageBlocksById = new Map(),
  toolCallsByMessageId = new Map(),
  isTempChatId = () => false,
  replaceTempMessageId = () => {},
  resolveTempMessageId = (_, id) => id,
} = {}) {
  const optimistic = prepareOptimisticConversation({
    state,
    setState,
    text,
    buildTempChat,
    pruneTempChats,
    syncChatUrl,
    updateChatTitleLocal,
    isTempChatId,
  });
  let chatId = optimistic.chatId;
  let tempChatId = optimistic.tempChatId;
  const hadMessagesBefore = optimistic.hadMessagesBefore;
  const optimisticAutoTitle = optimistic.autoTitle || null;

  const branchParentId = currentLeafByChatId.get(chatId) || null;
  const draftAttachments = getDraftAttachments(chatId);
  const { tempUserId, tempAssistantId, localMessages } = createOptimisticTempMessages({
    chatId,
    branchParentId,
    userContent: text,
    userAttachments: draftAttachments,
    activeModelId: state.activeModelId,
    state,
    setState,
    registerPendingTempMessage,
    setBranchSelection,
    currentLeafByChatId,
    drawMessages,
  });

  if (tempChatId) {
    const modelToUse = state.activeModelId || state.defaultModelId || state.globalDefaultModelId;
    const payload = modelToUse ? { model: modelToUse } : {};
    const res = await apiFetch('/api/chats', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      rollbackOptimisticConversation({
        state,
        setState,
        tempChatId,
        isTempChatId,
      });
      hooks.onFinished?.();
      return;
    }
    const data = await res.json();
    const realChatId = promoteOptimisticConversation({
      state,
      setState,
      tempChatId,
      realChat: data.chat,
      currentLeafByChatId,
      streamingOverrideByChat,
      syncChatUrl,
    });
    chatId = realChatId;

    if (optimisticAutoTitle) {
      apiFetch(`/api/chats/${realChatId}`, {
        method: 'PUT',
        body: JSON.stringify({ title: optimisticAutoTitle }),
      }).catch(() => {});
    }
  }

  if (!optimisticAutoTitle) {
    const existingChat = state.chats.find((chat) => String(chat.id) === String(chatId));
    if (!hadMessagesBefore && (!existingChat?.title || existingChat.title === 'New Chat')) {
      const snippet = String(text).trim().replace(/\s+/g, ' ').slice(0, 60);
      if (snippet) {
        updateChatTitleLocal(chatId, snippet);
        if (!String(chatId).startsWith('temp-')) {
          apiFetch(`/api/chats/${chatId}`, {
            method: 'PUT',
            body: JSON.stringify({ title: snippet }),
          }).catch(() => {});
        }
      }
    }
  }

  const controller = new AbortController();
  const abortHandler = () => controller.abort();
  setActiveStreamAbort(abortHandler);
  setGlobalStreamAbort(abortHandler);
  hooks.onAbortable?.(abortHandler);

  let res;
  setStreamingState(chatId, true);
  try {
    const attachmentIds = (draftAttachments || []).map((item) => item?.id).filter(Boolean);
    const selectedToolNames = Array.isArray(options.selectedToolNames)
      ? options.selectedToolNames.filter(Boolean)
      : Array.isArray(getDraftToolNames(chatId))
        ? getDraftToolNames(chatId).filter(Boolean)
        : null;
    const payload = {
      message: text,
      model: state.activeModelId || undefined,
      ...(attachmentIds.length ? { attachments: attachmentIds } : {}),
      ...(selectedToolNames !== null ? { selected_tool_names: selectedToolNames } : {}),
    };
    res = await apiFetch(`/api/chats/${chatId}/messages`, {
      method: 'POST',
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
  } catch (err) {
    setStreamingState(chatId, false);
    const isAbort = err?.name === 'AbortError';
    if (isAbort) {
      if (localMessages.length > 0) {
        localMessages[localMessages.length - 1].done = true;
        localMessages[localMessages.length - 1].content = 'Stopped.';
        setState((prev) => ({
          messagesByChat: { ...prev.messagesByChat, [chatId]: localMessages },
        }));
        if (state.activeChatId === chatId) drawMessages(localMessages);
      }
    } else {
      applyAssistantErrorMessage(chatId, tempAssistantId, 'Failed to connect to the server.');
    }
    hooks.onFinished?.();
    return;
  }

  if (!res.ok || !res.body) {
    setStreamingState(chatId, false);
    let errorText = 'Failed to connect to the server.';
    try {
      const errPayload = await res.json();
      errorText = formatApiErrorMessage(errPayload, errorText);
    } catch {
      // ignore response parse failure
    }
    applyAssistantErrorMessage(chatId, tempAssistantId, errorText);
    hooks.onFinished?.();
    return;
  }

  if (draftAttachments.length > 0) {
    setDraftAttachments(chatId, []);
  }

  const { onEvent, onDelta, getStreamState } = createSseStreamHandlers({
    chatId,
    tempAssistantId,
    tempUserId,
    replaceTempMessageId,
    applyAssistantText: (streaming = true) => {
      const s = getStreamState();
      applyStreamingAssistantText({
        state,
        setState,
        streamingOverrideByChat,
        updateMessageContentDom,
        chatId,
        messageId: s.assistantMessageId,
        assistantText: s.assistantText,
        errorActive: s.errorActive,
        errorMessage: s.errorMessage,
        streaming,
      });
    },
    ensureThinkingBlock,
    appendBlock,
    updateToolCallState,
    notePayloadSeq,
    thinkingStartByMessageId,
    thinkingDurationByMessageId,
    thinkingActiveByMessageId,
    toolCallsByMessageId,
    messageBlocksById,
    resolveTempMessageId,
    onUserMessageStart: (cId, nextId) => {
      currentLeafByChatId.set(cId, nextId);
    },
    onAssistantMessageStart: (cId, msgId) => {
      currentLeafByChatId.set(cId, msgId);
    },
    errorStrategy: 'append',
  });

  try {
    await consumeSseTextStream(res.body, { onEvent, onDelta });
    await finalizeStreamAndLoadMessages({
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
      activeModelId: state.activeModelId,
      activeChatId: state.activeChatId,
    });
  } catch (err) {
    if (err?.name !== 'AbortError') {
      console.error('Stream error:', err);
      await handleStreamCatchError({
        error: err,
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
        activeModelId: state.activeModelId,
        activeChatId: state.activeChatId,
      });
    }
  } finally {
    streamingOverrideByChat.delete(chatId);
    clearGlobalStreamAbort(abortHandler);
    setActiveStreamAbort(null);
    setStreamingState(chatId, false);
    hooks.onFinished?.();
  }
}
