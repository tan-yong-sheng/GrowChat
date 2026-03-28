import { extractThinkingBlocks } from './chat-message-utils.js';
import { startChatResumeStream } from './chat-message-stream-resume.js';
import { startChatSendMessage } from './chat-message-stream-send.js';

export function createChatMessageStream({
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
  getActiveStreamAbort = () => null,
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
  getMessageById = () => null,
  loadMessages = async () => {},
  getMessageSeq = () => 0,
  extractThinkingBlocksFn = extractThinkingBlocks,
  thinkingStartByMessageId = new Map(),
  thinkingDurationByMessageId = new Map(),
  thinkingActiveByMessageId = new Map(),
  messageBlocksById = new Map(),
  toolCallsByMessageId = new Map(),
  streamSession = null,
  isTempChatId = () => false,
  replaceTempMessageId = () => {},
  resolveTempMessageId = (_, id) => id,
} = {}) {
  const stopResumeStream = (chatId) => streamSession?.stopResumeStream?.(chatId);

  async function startResumeStream(chatId, messageId) {
    return startChatResumeStream({
      chatId,
      messageId,
      state,
      setState,
      apiFetch,
      consumeSseTextStream,
      streamSession,
      setStreamingState,
      getActiveStreamAbort,
      updateMessageContentDom,
      notePayloadSeq,
      appendBlock,
      ensureThinkingBlock,
      updateToolCallState,
      loadMessages,
      getMessageById,
      getMessageSeq,
      extractThinkingBlocksFn,
      thinkingStartByMessageId,
      thinkingDurationByMessageId,
      thinkingActiveByMessageId,
      messageBlocksById,
      toolCallsByMessageId,
      streamingOverrideByChat,
    });
  }

  async function sendSingleMessage(text, hooks = {}, options = {}) {
    return startChatSendMessage({
      text,
      hooks,
      options,
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
      consumeSseTextStream,
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
    });
  }

  async function sendMessage(text, hooks = {}, options = {}) {
    const prompt = String(text || '').trim();
    if (!prompt) {
      hooks.onFinished?.();
      return;
    }
    return sendSingleMessage(prompt, hooks, options);
  }

  return {
    sendSingleMessage,
    sendMessage,
    startResumeStream,
    stopResumeStream,
  };
}

