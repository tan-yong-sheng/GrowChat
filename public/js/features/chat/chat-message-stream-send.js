// fallow-ignore-file code-duplication
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

/**
 * Synchronous optimistic setup — runs before any async module imports so the
 * user sees their message immediately.  Returns the optimistic state that
 * startChatSendMessageWithOptimistic needs to continue the flow.
 */
export function prepareSendOptimisticUI({
  text,
  state,
  setState = () => {},
  buildTempChat = () => null,
  pruneTempChats = (list) => list,
  syncChatUrl = () => {},
  updateChatTitleLocal = () => {},
  isTempChatId = () => false,
  currentLeafByChatId = new Map(),
  registerPendingTempMessage = () => {},
  setBranchSelection = () => {},
  drawMessages = () => {},
  getDraftAttachments = () => [],
}) {
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

  const chatId = optimistic.chatId;
  const draftAttachments = getDraftAttachments(chatId);
  const branchParentId = currentLeafByChatId.get(chatId) || null;

  try {
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
    return {
      optimistic,
      chatId,
      tempUserId,
      tempAssistantId,
      localMessages,
      draftAttachments,
    };
  } catch (err) {
    // createOptimisticTempMessages throws can leave the temp conversation
    // orphaned in state — clean it up before re-throwing so the caller
    // can still call hooks.onFinished in its catch.
    if (optimistic?.tempChatId) {
      rollbackOptimisticConversation({ setState, tempChatId: optimistic.tempChatId });
    }
    throw err;
  }
}

/**
 * Continuation of startChatSendMessage AFTER the optimistic UI has already
 * been rendered and async module imports have resolved.  Receives the
 * optimistic state produced by prepareSendOptimisticUI so it can skip
 * re-running the synchronous setup.
 */

const MAX_TITLE_SNIPPET_LENGTH = 60;
const EMPTY_TITLE = 'New Chat';
const FAILED_CONNECT_MESSAGE = 'Failed to connect to the server.';
const TITLE_API_FAILURE_MESSAGE = 'Request failed.';

function applyAssistantContentUpdate(messagesByChat, text, tempAssistantId) {
  const currentMessages = [...(messagesByChat || [])];
  const idx = currentMessages.findIndex((m) => String(m?.id || '') === String(tempAssistantId));
  if (idx < 0) return currentMessages;
  currentMessages[idx] = { ...currentMessages[idx], content: text, done: true };
  return currentMessages;
}

function buildTitleSnippet(text) {
  return String(text || '')
    .trim()
    .replace(/\s+/g, ' ')
    .slice(0, MAX_TITLE_SNIPPET_LENGTH);
}

function resolveSelectedToolNames({ options, chatId, getDraftToolNames }) {
  if (Array.isArray(options?.selectedToolNames)) {
    return options.selectedToolNames.filter(Boolean);
  }
  const draft = getDraftToolNames(chatId);
  if (Array.isArray(draft)) return draft.filter(Boolean);
  return null;
}

function buildChatMessagePayload({ text, state, draftAttachments, selectedToolNames }) {
  const attachmentIds = (draftAttachments || []).map((item) => item?.id).filter(Boolean);
  const payload = {
    message: text,
    model: state.activeModelId || undefined,
  };
  if (attachmentIds.length) payload.attachments = attachmentIds;
  if (selectedToolNames !== null) payload.selected_tool_names = selectedToolNames;
  return payload;
}

async function promoteTempChat({ ctx }) {
  const {
    optimisticState,
    state,
    setState,
    apiFetch,
    currentLeafByChatId,
    streamingOverrideByChat,
    syncChatUrl,
  } = ctx;
  const { optimistic } = optimisticState;
  if (!optimistic?.tempChatId) return optimisticState.chatId;
  const modelToUse = state.activeModelId || state.defaultModelId || state.globalDefaultModelId;
  const payload = modelToUse ? { model: modelToUse } : {};
  try {
    const res = await apiFetch('/api/chats', { method: 'POST', body: JSON.stringify(payload) });
    if (!res.ok) {
      rollbackOptimisticConversation({
        state,
        setState,
        tempChatId: optimistic.tempChatId,
        isTempChatId: ctx.isTempChatId,
      });
      return null;
    }
    const data = await res.json();
    return promoteOptimisticConversation({
      state,
      setState,
      tempChatId: optimistic.tempChatId,
      realChat: data.chat,
      currentLeafByChatId,
      streamingOverrideByChat,
      syncChatUrl,
    });
  } catch {
    rollbackOptimisticConversation({
      state,
      setState,
      tempChatId: optimistic.tempChatId,
      isTempChatId: ctx.isTempChatId,
    });
    return null;
  }
}

function shouldAutoTitleChat({ state, chatId, hadMessagesBefore, optimisticAutoTitle }) {
  if (optimisticAutoTitle) return false;
  if (hadMessagesBefore) return false;
  const existingChat = state.chats.find((chat) => String(chat.id) === String(chatId));
  if (!existingChat) return true;
  return !existingChat.title || existingChat.title === EMPTY_TITLE;
}

async function applyAutoTitleIfNeeded({ ctx, text, chatId }) {
  const { optimisticState, state, apiFetch, updateChatTitleLocal } = ctx;
  if (
    !shouldAutoTitleChat({
      state,
      chatId,
      hadMessagesBefore: optimisticState.hadMessagesBefore,
      optimisticAutoTitle: optimisticState.optimistic?.autoTitle,
    })
  ) {
    return;
  }
  const snippet = buildTitleSnippet(text);
  if (!snippet) return;
  updateChatTitleLocal(chatId, snippet);
  if (!String(chatId).startsWith('temp-')) {
    apiFetch(`/api/chats/${chatId}`, {
      method: 'PUT',
      body: JSON.stringify({ title: snippet }),
    }).catch(() => {});
  }
}

function createAbortControllerWithHandlers({ ctx, hooks }) {
  const controller = new AbortController();
  const abortHandler = () => controller.abort();
  ctx.setActiveStreamAbort(abortHandler);
  ctx.setGlobalStreamAbort(abortHandler);
  hooks.onAbortable?.(abortHandler);
  return { controller, abortHandler };
}

function buildFinishEarly({ ctx, chatId, hooks, abortHandler }) {
  return () => {
    ctx.clearGlobalStreamAbort(abortHandler);
    ctx.setActiveStreamAbort(null);
    ctx.setStreamingState(chatId, false);
    hooks.onFinished?.();
  };
}

function buildCommitPartialStreamText({ ctx, chatId, tempAssistantId, getStreamState }) {
  return () => {
    const st = getStreamState();
    const text = String(st.assistantText || '').trim();
    if (!text || !tempAssistantId) return;
    const currentMessages = applyAssistantContentUpdate(
      ctx.state.messagesByChat[chatId],
      text,
      tempAssistantId
    );
    ctx.setState((prev) => ({
      messagesByChat: { ...prev.messagesByChat, [chatId]: currentMessages },
    }));
    ctx.streamingOverrideByChat.delete(chatId);
  };
}

function buildStreamHandlerDeps({ ctx, chatId, tempAssistantId, tempUserId, getStreamState }) {
  return {
    chatId,
    tempAssistantId,
    tempUserId,
    replaceTempMessageId: ctx.replaceTempMessageId,
    applyAssistantText: (streaming = true) => {
      const s = getStreamState();
      applyStreamingAssistantText({
        state: ctx.state,
        setState: ctx.setState,
        streamingOverrideByChat: ctx.streamingOverrideByChat,
        updateMessageContentDom: ctx.updateMessageContentDom,
        chatId,
        messageId: s.assistantMessageId,
        assistantText: s.assistantText,
        errorActive: s.errorActive,
        errorMessage: s.errorMessage,
        streaming,
      });
    },
    ensureThinkingBlock: ctx.ensureThinkingBlock,
    appendBlock: ctx.appendBlock,
    updateToolCallState: ctx.updateToolCallState,
    notePayloadSeq: ctx.notePayloadSeq,
    thinkingStartByMessageId: ctx.thinkingStartByMessageId,
    thinkingDurationByMessageId: ctx.thinkingDurationByMessageId,
    thinkingActiveByMessageId: ctx.thinkingActiveByMessageId,
    toolCallsByMessageId: ctx.toolCallsByMessageId,
    messageBlocksById: ctx.messageBlocksById,
    resolveTempMessageId: ctx.resolveTempMessageId,
    onUserMessageStart: (cId, nextId) => {
      ctx.currentLeafByChatId.set(cId, nextId);
    },
    onAssistantMessageStart: (cId, msgId) => {
      ctx.currentLeafByChatId.set(cId, msgId);
    },
    errorStrategy: 'append',
  };
}

function buildFinalizeDeps({ ctx, chatId, tempUserId, getStreamState }) {
  return {
    getStreamState,
    thinkingStartByMessageId: ctx.thinkingStartByMessageId,
    thinkingDurationByMessageId: ctx.thinkingDurationByMessageId,
    thinkingActiveByMessageId: ctx.thinkingActiveByMessageId,
    applyStreamingAssistantText,
    state: ctx.state,
    setState: ctx.setState,
    streamingOverrideByChat: ctx.streamingOverrideByChat,
    updateMessageContentDom: ctx.updateMessageContentDom,
    chatId,
    buildFallbackAssistantMessage: ctx.buildFallbackAssistantMessage,
    resolveTempMessageId: ctx.resolveTempMessageId,
    tempUserId,
    loadMessages: ctx.loadMessages,
    activeModelId: ctx.state.activeModelId,
    activeChatId: ctx.state.activeChatId,
  };
}

function buildHandleCatchDeps({ ctx, chatId, tempUserId, getStreamState }) {
  return {
    getStreamState,
    applyStreamingAssistantText,
    state: ctx.state,
    setState: ctx.setState,
    streamingOverrideByChat: ctx.streamingOverrideByChat,
    updateMessageContentDom: ctx.updateMessageContentDom,
    chatId,
    buildFallbackAssistantMessage: ctx.buildFallbackAssistantMessage,
    resolveTempMessageId: ctx.resolveTempMessageId,
    tempUserId,
    loadMessages: ctx.loadMessages,
    activeModelId: ctx.state.activeModelId,
    activeChatId: ctx.state.activeChatId,
  };
}

async function postChatMessageRequest({ ctx, chatId, text, signal }) {
  const { state, apiFetch, draftAttachments, getDraftToolNames, options } = ctx;
  const selectedToolNames = resolveSelectedToolNames({ options, chatId, getDraftToolNames });
  const payload = buildChatMessagePayload({ text, state, draftAttachments, selectedToolNames });
  return apiFetch(`/api/chats/${chatId}/messages`, {
    method: 'POST',
    body: JSON.stringify(payload),
    signal,
  });
}

async function parseErrorResponse(res, formatApiErrorMessage) {
  try {
    const errPayload = await res.json();
    return formatApiErrorMessage(errPayload, FAILED_CONNECT_MESSAGE) || FAILED_CONNECT_MESSAGE;
  } catch {
    return FAILED_CONNECT_MESSAGE;
  }
}

export async function startChatSendMessageWithOptimistic({
  text,
  hooks = {},
  options = {},
  optimisticState,
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
  formatApiErrorMessage = (_, fallback) => fallback || TITLE_API_FAILURE_MESSAGE,
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
  const { tempUserId, tempAssistantId, draftAttachments = [] } = optimisticState || {};
  const ctx = {
    state,
    setState,
    apiFetch,
    syncChatUrl,
    drawMessages,
    buildTempChat,
    pruneTempChats,
    getDraftAttachments,
    getDraftToolNames,
    setDraftAttachments,
    updateChatTitleLocal,
    currentLeafByChatId,
    registerPendingTempMessage,
    setBranchSelection,
    streamingOverrideByChat,
    setGlobalStreamAbort,
    clearGlobalStreamAbort,
    setStreamingState,
    setActiveStreamAbort,
    appendBlock,
    ensureThinkingBlock,
    updateToolCallState,
    notePayloadSeq,
    buildFallbackAssistantMessage,
    formatApiErrorMessage,
    updateMessageContentDom,
    applyAssistantErrorMessage,
    loadMessages,
    thinkingStartByMessageId,
    thinkingDurationByMessageId,
    thinkingActiveByMessageId,
    messageBlocksById,
    toolCallsByMessageId,
    isTempChatId,
    replaceTempMessageId,
    resolveTempMessageId,
    options,
    optimisticState,
  };

  let chatId = optimisticState?.chatId;
  const promotedChatId = await promoteTempChat({ ctx });
  if (promotedChatId === null) {
    hooks.onFinished?.();
    return;
  }
  if (optimisticState?.optimistic?.tempChatId) {
    chatId = promotedChatId;
    if (optimisticState.optimistic.autoTitle) {
      apiFetch(`/api/chats/${promotedChatId}`, {
        method: 'PUT',
        body: JSON.stringify({ title: optimisticState.optimistic.autoTitle }),
      }).catch(() => {});
    }
  }

  await applyAutoTitleIfNeeded({ ctx, text, chatId });

  const { controller, abortHandler } = createAbortControllerWithHandlers({ ctx, hooks });
  const finishEarly = buildFinishEarly({ ctx, chatId, hooks, abortHandler });
  const { onEvent, onDelta, getStreamState } = createSseStreamHandlers(
    buildStreamHandlerDeps({ ctx, chatId, tempAssistantId, tempUserId, getStreamState: () => ({}) })
  );
  const commitPartialStreamText = buildCommitPartialStreamText({
    ctx,
    chatId,
    tempAssistantId,
    getStreamState,
  });

  setStreamingState(chatId, true);

  let res;
  try {
    res = await postChatMessageRequest({ ctx, chatId, text, signal: controller.signal });
  } catch (err) {
    if (err?.name !== 'AbortError') {
      ctx.applyAssistantErrorMessage(chatId, tempAssistantId, FAILED_CONNECT_MESSAGE);
    }
    finishEarly();
    return;
  }

  if (!res.ok || !res.body) {
    const errorText = await parseErrorResponse(res, ctx.formatApiErrorMessage);
    ctx.applyAssistantErrorMessage(chatId, tempAssistantId, errorText);
    finishEarly();
    return;
  }

  if (draftAttachments.length > 0) {
    setDraftAttachments(chatId, []);
  }

  try {
    await consumeSseTextStream(res.body, { onEvent, onDelta });
    await finalizeStreamAndLoadMessages(
      buildFinalizeDeps({ ctx, chatId, tempUserId, getStreamState })
    );
  } catch (err) {
    if (err?.name === 'AbortError') {
      commitPartialStreamText();
    } else {
      console.error('Stream error:', err);
      await handleStreamCatchError(
        buildHandleCatchDeps({ ctx, chatId, tempUserId, getStreamState })
      );
    }
  } finally {
    streamingOverrideByChat.delete(chatId);
    clearGlobalStreamAbort(abortHandler);
    setActiveStreamAbort(null);
    setStreamingState(chatId, false);
    hooks.onFinished?.();
  }
}

/**
 * Legacy entry point — creates optimistic UI inline then continues.
 * Kept for backward compatibility with existing tests.
 */

export async function startChatSendMessage(params) {
  const optimisticState = prepareSendOptimisticUI(params);
  return startChatSendMessageWithOptimistic({ ...params, optimisticState });
}
