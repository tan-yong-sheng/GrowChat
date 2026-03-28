import { projectConversation } from '../../shared/utils/conversation.js';
import { buildChatMessageListHtml } from './chat-message-list-html.js';
import { bindChatMessageActions } from './chat-message-actions.js';
import { renderAttachmentPills, renderAssistantMessageBody } from './chat-message-rendering.js';
import {
  syncMessageBlocksForMessage,
  syncToolCallsForMessage,
} from './chat-message-blocks.js';
import { setupEditTextarea } from './edit-textarea.js';

export function createChatRenderController({
  state,
  setState = () => {},
  messagesList = null,
  welcomeScreenContainer = null,
  messagesContainer = null,
  hydrateAttachmentImages = () => {},
  branchSelectionByChat = new Map(),
  currentLeafByChatId = new Map(),
  streamingOverrideByChat = new Map(),
  errorExpandedByMessageId = new Map(),
  thinkingCollapsedByKey = new Map(),
  toolExpandedByKey = new Map(),
  thinkingActiveByMessageId = new Map(),
  thinkingDurationByMessageId = new Map(),
  thinkingStartByMessageId = new Map(),
  toolCallsByMessageId = new Map(),
  messageBlocksById = new Map(),
  showToast = () => {},
  apiFetch,
  loadMessages = async () => {},
  waitForResolvedMessageId = async () => null,
  getMessageById = () => null,
  resolveTempMessageId = (_, id) => id,
  replaceTempMessageId = () => {},
  registerPendingTempMessage = () => {},
  setBranchSelection = () => {},
  setStreamingState = () => {},
  getActiveStreamAbort = () => null,
  setActiveStreamAbort = () => {},
  clearGlobalStreamAbort = () => {},
  setGlobalStreamAbort = () => {},
  consumeSseTextStream,
  appendBlock = () => {},
  ensureThinkingBlock = () => {},
  updateToolCallState = () => {},
  notePayloadSeq = () => {},
  buildFallbackAssistantMessage = () => null,
  formatApiErrorMessage = (_, fallback) => fallback || 'Request failed.',
  updateMessageContentDom = () => {},
  applyAssistantErrorMessage = () => {},
  openCitation = () => {},
} = {}) {
  function drawMessages(messages) {
    if (!messagesList || !welcomeScreenContainer || !messagesContainer) return;

    const welcomeScreen = welcomeScreenContainer.firstElementChild;
    const chatId = state.activeChatId;
    const rawMessages = Array.isArray(messages) ? messages : [];
    const branchSelectionMap = chatId ? (branchSelectionByChat.get(chatId) || new Map()) : new Map();
    const preferredLeafId = chatId ? currentLeafByChatId.get(chatId) : null;
    const isLoading = !!chatId && state.ui?.loadingChatId === chatId;

    const { visible: projectedMessages, roundsByMessageId } = projectConversation(
      rawMessages,
      preferredLeafId,
      branchSelectionMap
    );

    if (projectedMessages.length === 0) {
      if (isLoading) {
        if (welcomeScreen) welcomeScreen.classList.add('hidden');
        messagesList.classList.remove('hidden');
        messagesList.innerHTML = `
          <div class="flex flex-col gap-5 py-6">
            <div class="flex justify-end">
              <div class="h-8 w-2/3 rounded-2xl bg-gray-100 animate-pulse"></div>
            </div>
            <div class="flex gap-4">
              <div class="w-7 h-7 rounded-lg bg-gray-100 animate-pulse"></div>
              <div class="flex-1 space-y-2">
                <div class="h-3 w-32 bg-gray-100 rounded animate-pulse"></div>
                <div class="h-4 w-3/4 bg-gray-100 rounded animate-pulse"></div>
                <div class="h-4 w-2/3 bg-gray-100 rounded animate-pulse"></div>
              </div>
            </div>
            <div class="flex justify-end">
              <div class="h-8 w-1/2 rounded-2xl bg-gray-100 animate-pulse"></div>
            </div>
            <div class="flex gap-4">
              <div class="w-7 h-7 rounded-lg bg-gray-100 animate-pulse"></div>
              <div class="flex-1 space-y-2">
                <div class="h-3 w-40 bg-gray-100 rounded animate-pulse"></div>
                <div class="h-4 w-5/6 bg-gray-100 rounded animate-pulse"></div>
                <div class="h-4 w-2/3 bg-gray-100 rounded animate-pulse"></div>
              </div>
            </div>
          </div>
        `;
      } else {
        if (welcomeScreen) welcomeScreen.classList.remove('hidden');
        messagesList.classList.add('hidden');
      }
      return;
    }

    if (welcomeScreen) welcomeScreen.classList.add('hidden');
    messagesList.classList.remove('hidden');

    const isAtBottom = messagesContainer.scrollHeight - messagesContainer.scrollTop <= messagesContainer.clientHeight + 40;

    const messagesHtml = buildChatMessageListHtml({
      projectedMessages,
      roundsByMessageId,
      state,
      branchSelectionByChat,
      currentLeafByChatId,
      streamingOverrideByChat,
      messageBlocksById,
      toolCallsByMessageId,
      thinkingActiveByMessageId,
      thinkingDurationByMessageId,
      errorExpandedByMessageId,
      thinkingCollapsedByKey,
      toolExpandedByKey,
      renderAttachmentPills,
      renderAssistantMessageBody,
      syncMessageBlocksForMessage,
      syncToolCallsForMessage,
    });

    messagesList.innerHTML = messagesHtml;
    hydrateAttachmentImages(messagesList);

    messagesList.querySelectorAll('.edit-message-textarea').forEach((ta) => {
      setupEditTextarea(ta);
    });

    bindChatMessageActions({
      messagesList,
      messages,
      projectedMessages,
      roundsByMessageId,
      state,
      setState,
      drawMessages,
      chatId,
      errorExpandedByMessageId,
      showToast,
      apiFetch,
      loadMessages,
      waitForResolvedMessageId,
      getMessageById,
      resolveTempMessageId,
      replaceTempMessageId,
      registerPendingTempMessage,
      setBranchSelection,
      currentLeafByChatId,
      branchSelectionByChat,
      streamingOverrideByChat,
      setStreamingState,
      getActiveStreamAbort,
      setActiveStreamAbort,
      clearGlobalStreamAbort,
      setGlobalStreamAbort,
      consumeSseTextStream,
      appendBlock,
      ensureThinkingBlock,
      updateToolCallState,
      notePayloadSeq,
      buildFallbackAssistantMessage,
      formatApiErrorMessage,
      updateMessageContentDom,
      applyAssistantErrorMessage,
      openCitation,
      thinkingStartByMessageId,
      thinkingDurationByMessageId,
      thinkingActiveByMessageId,
      toolCallsByMessageId,
      toolExpandedByKey,
      thinkingCollapsedByKey,
      messageBlocksById,
    });

    if (isAtBottom) {
      setTimeout(() => {
        messagesContainer.scrollTop = messagesContainer.scrollHeight;
      }, 10);
    }
  }

  return {
    drawMessages,
  };
}
