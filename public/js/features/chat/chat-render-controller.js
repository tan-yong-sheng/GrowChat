import { projectConversation } from '../../shared/utils/conversation.js';
import { buildChatMessageListHtml } from './chat-message-list-html.js';
import { CHAT_MESSAGE_PARAM_NAMES } from './chat-message-params.js';
import { bindChatMessageActions } from './chat-message-actions.js';
import { renderAttachmentPills, renderAssistantMessageBody } from './chat-message-rendering.js';
import { syncMessageBlocksForMessage, syncToolCallsForMessage } from './chat-message-blocks.js';
import { setupEditTextarea } from './edit-textarea.js';
import { STREAM_CALLBACK_DEFAULTS } from './chat-stream-callbacks.js';

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
  consumeSseTextStream = STREAM_CALLBACK_DEFAULTS.consumeSseTextStream,
  appendBlock = STREAM_CALLBACK_DEFAULTS.appendBlock,
  ensureThinkingBlock = STREAM_CALLBACK_DEFAULTS.ensureThinkingBlock,
  updateToolCallState = STREAM_CALLBACK_DEFAULTS.updateToolCallState,
  notePayloadSeq = STREAM_CALLBACK_DEFAULTS.notePayloadSeq,
  buildFallbackAssistantMessage = STREAM_CALLBACK_DEFAULTS.buildFallbackAssistantMessage,
  formatApiErrorMessage = STREAM_CALLBACK_DEFAULTS.formatApiErrorMessage,
  updateMessageContentDom = STREAM_CALLBACK_DEFAULTS.updateMessageContentDom,
  applyAssistantErrorMessage = STREAM_CALLBACK_DEFAULTS.applyAssistantErrorMessage,
  openCitation = () => {},
} = {}) {
  function renderLoadingSkeleton() {
    return `
      <div class="flex flex-col gap-5 py-6">
        <div class="flex justify-end">
          <div class="h-8 w-2/3 rounded-lg bg-gray-100 animate-pulse"></div>
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
          <div class="h-8 w-1/2 rounded-lg bg-gray-100 animate-pulse"></div>
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
  }

  function renderEmptyState(welcomeScreen, isLoading) {
    if (isLoading) {
      if (welcomeScreen) welcomeScreen.classList.add('hidden');
      messagesList.classList.remove('hidden');
      messagesList.innerHTML = renderLoadingSkeleton();
      return true;
    }
    if (welcomeScreen) welcomeScreen.classList.remove('hidden');
    messagesList.classList.add('hidden');
    return true;
  }

  function bindAfterRender(messages, projectedMessages, roundsByMessageId, chatId) {
    messagesList.querySelectorAll('.edit-message-textarea').forEach((ta) => {
      setupEditTextarea(ta);
    });

    // Maintained via CHAT_MESSAGE_PARAM_NAMES in chat-message-params.js
    // fallow-ignore-next-line code-duplication
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
      messageBlocksById,
    });
  }

  function scrollToBottomIfNeeded() {
    const isAtBottom =
      messagesContainer.scrollHeight - messagesContainer.scrollTop <=
      messagesContainer.clientHeight + 40;
    if (!isAtBottom) return;
    setTimeout(() => {
      messagesContainer.scrollTop = messagesContainer.scrollHeight;
    }, 10);
  }

  function areContainersReady() {
    return messagesList && welcomeScreenContainer && messagesContainer;
  }

  function computeRenderContext(messages, chatId) {
    const rawMessages = Array.isArray(messages) ? messages : [];
    const branchSelectionMap = chatId ? branchSelectionByChat.get(chatId) || new Map() : new Map();
    const preferredLeafId = chatId ? currentLeafByChatId.get(chatId) : null;
    const isLoading = !!chatId && state.ui?.loadingChatId === chatId;
    const { visible: projectedMessages, roundsByMessageId } = projectConversation(
      rawMessages,
      preferredLeafId,
      branchSelectionMap
    );
    const welcomeScreen = welcomeScreenContainer.firstElementChild;
    return { projectedMessages, roundsByMessageId, isLoading, welcomeScreen };
  }

  function renderMessageList(messages, projectedMessages, roundsByMessageId, chatId) {
    const welcomeScreen = welcomeScreenContainer.firstElementChild;
    if (welcomeScreen) welcomeScreen.classList.add('hidden');
    messagesList.classList.remove('hidden');

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

    bindAfterRender(messages, projectedMessages, roundsByMessageId, chatId);
    scrollToBottomIfNeeded();
  }

  function drawMessages(messages) {
    if (!areContainersReady()) return;

    const chatId = state.activeChatId;
    const { projectedMessages, roundsByMessageId, isLoading, welcomeScreen } = computeRenderContext(
      messages,
      chatId
    );

    if (projectedMessages.length === 0) {
      renderEmptyState(welcomeScreen, isLoading);
      return;
    }

    renderMessageList(messages, projectedMessages, roundsByMessageId, chatId);
  }

  return {
    drawMessages,
  };
}
