// WireChat section builders: assemble the render controller, message list interactions,
// chat list handlers, and shell controller from a flat options bag.
// @ts-nocheck

import {
  buildFallbackAssistantMessage,
  getMessageById,
  hydrateAttachmentImages,
  makeAbortBridge,
} from './chat-wire-controller-helpers.js';

function extractRenderControllerInputs(ctx, deps) {
  const ctxFields = [
    'messagesList',
    'welcomeScreenContainer',
    'messagesContainer',
    'branchSelectionByChat',
    'currentLeafByChatId',
    'streamingOverrideByChat',
    'errorExpandedByMessageId',
    'thinkingCollapsedByKey',
    'toolExpandedByKey',
    'thinkingActiveByMessageId',
    'thinkingDurationByMessageId',
    'thinkingStartByMessageId',
    'toolCallsByMessageId',
    'messageBlocksById',
    'loadMessages',
    'openCitation',
    'setStreamingState',
    'clearGlobalStreamAbort',
    'setGlobalStreamAbort',
    'consumeSseTextStream',
    'notePayloadSeq',
    'updateMessageContentDom',
    'applyAssistantErrorMessage',
    'resolveTempMessageId',
    'replaceTempMessageId',
    'registerPendingTempMessage',
    'waitForResolvedMessageId',
    'setBranchSelection',
  ];
  const depsFields = [
    'state',
    'setState',
    'apiFetch',
    'appendBlock',
    'ensureThinkingBlock',
    'updateToolCallState',
    'createChatRenderController',
    'formatApiErrorMessage',
    'showToast',
  ];
  return {
    ...Object.fromEntries(ctxFields.map((k) => [k, ctx[k]])),
    ...Object.fromEntries(depsFields.map((k) => [k, deps[k]])),
  };
}

function buildRenderControllerBindings({ ctx, deps }) {
  const abortBridge = makeAbortBridge(ctx);
  const boundGetMessageById = (chatId, messageId) => getMessageById(deps.state, chatId, messageId);
  const boundHydrate = (el) => hydrateAttachmentImages(ctx.uiResources, el);
  const boundBuildFallback = (chatId, messageId, options) =>
    buildFallbackAssistantMessage(deps.state, chatId, messageId, options);
  return { abortBridge, boundGetMessageById, boundHydrate, boundBuildFallback };
}

export function buildRenderControllerSection({ ctx, deps }) {
  const inputs = extractRenderControllerInputs(ctx, deps);
  const { abortBridge, boundGetMessageById, boundHydrate, boundBuildFallback } =
    buildRenderControllerBindings({ ctx, deps });
  return deps.createChatRenderController({
    ...inputs,
    hydrateAttachmentImages: boundHydrate,
    getMessageById: boundGetMessageById,
    getActiveStreamAbort: abortBridge.getActiveStreamAbort,
    setActiveStreamAbort: abortBridge.setActiveStreamAbort,
    buildFallbackAssistantMessage: boundBuildFallback,
  });
}

export function createMessageListInteractionsSection({ ctx, deps }) {
  const { messagesList, thinkingCollapsedByKey, toolExpandedByKey, openCitation } = ctx;
  const { loadChatMessageListControllerModule } = deps;
  let destroyMessageListInteractions = null;
  let messageListInteractionsReadyPromise = null;
  const ensureMessageListInteractions = () => {
    if (destroyMessageListInteractions) return Promise.resolve(true);
    if (messageListInteractionsReadyPromise) return messageListInteractionsReadyPromise;
    messageListInteractionsReadyPromise = loadChatMessageListControllerModule()
      .then(({ createChatMessageListController }) => {
        destroyMessageListInteractions = createChatMessageListController({
          messagesList,
          thinkingCollapsedByKey,
          toolExpandedByKey,
          openCitation,
        });
        return true;
      })
      .catch((err) => {
        console.warn('Failed to load chat message list interactions:', err);
        messageListInteractionsReadyPromise = null;
        return null;
      });
    return messageListInteractionsReadyPromise;
  };
  return {
    ensureMessageListInteractions,
    get destroyMessageListInteractions() {
      return destroyMessageListInteractions;
    },
    get messageListInteractionsReadyPromise() {
      return messageListInteractionsReadyPromise;
    },
  };
}

function createFallbackChatHandlers({
  isTempChatId,
  setState,
  syncChatUrl,
  drawMessages,
  state,
  loadMessages,
  handleClickChat: handler,
}) {
  return () => ({
    onClick: (id) => {
      handler({ isTempChatId, setState, syncChatUrl, drawMessages, state, loadMessages }, id);
    },
    rename: async () => {},
    pin: async () => {},
    duplicate: async () => {},
    share: async () => {},
    archive: async () => {},
    delete: async () => {},
  });
}

export function createChatListHandlersSection({ ctx, deps, handleClickChat: handler }) {
  const {
    syncChatUrl,
    drawMessages,
    sharedByChatId,
    isTempChatId,
    loadChats,
    refreshShareState,
    renderShareModal,
    currentLeafByChatId,
    streamingOverrideByChat,
  } = ctx;
  const { state, setState, apiFetch, loadMessages, loadChatListActionsModule } = deps;
  const fallback = createFallbackChatHandlers({
    isTempChatId,
    setState,
    syncChatUrl,
    drawMessages,
    state,
    loadMessages,
    handleClickChat: handler,
  });
  let getChatHandlersImpl = fallback;
  const getChatHandlers = (...args) => getChatHandlersImpl(...args);
  let chatListHandlersReadyPromise = null;
  const ensureChatListHandlers = () => {
    if (chatListHandlersReadyPromise) return chatListHandlersReadyPromise;
    chatListHandlersReadyPromise = loadChatListActionsModule()
      .then(({ createChatListHandlers }) => {
        getChatHandlersImpl = createChatListHandlers({
          state,
          apiFetch,
          loadChats,
          loadMessages,
          syncChatUrl,
          setState,
          isTempChatId,
          refreshShareState,
          renderShareModal,
          sharedByChatId,
          toggleArchiveChat: deps.toggleArchiveChat,
          drawMessages,
          currentLeafByChatId,
          streamingOverrideByChatId: streamingOverrideByChat,
        });
        ctx.drawChats?.(state.chats, state.activeChatId);
        return true;
      })
      .catch((err) => {
        console.warn('Failed to load chat list handlers:', err);
        chatListHandlersReadyPromise = null;
        return null;
      });
    return chatListHandlersReadyPromise;
  };
  return {
    getChatHandlers,
    ensureChatListHandlers,
    get getChatHandlersImpl() {
      return getChatHandlersImpl;
    },
    get chatListHandlersReadyPromise() {
      return chatListHandlersReadyPromise;
    },
  };
}

export function buildShellControllerSection({ ctx, deps, getChatHandlers }) {
  const {
    chatListContainerEl,
    sidebarHomeBtn,
    toggleSidebarMobile,
    toggleSidebarDesktop,
    openSearchBtn,
    newChatBtn,
    sidebarBackdrop,
    toggleChatsBtn,
    toggleChatsIcon,
    setDraftToolNames,
    isTempChatId,
    openArchivedModal,
  } = ctx;
  const {
    state,
    setState,
    fetchChats,
    drawMessages,
    loadMessages,
    createChatShellController,
    buildTempChatImpl,
    pruneTempChatsImpl,
  } = deps;
  return createChatShellController({
    state,
    setState,
    fetchChats,
    drawMessages,
    loadMessages,
    buildTempChat: buildTempChatImpl,
    pruneTempChats: pruneTempChatsImpl,
    setDraftToolNames,
    isTempChatId,
    openArchivedModal,
    ensureSearchModal: ctx.ensureSearchModal,
    chatListContainerEl,
    root: ctx.root,
    sidebarHomeBtn,
    toggleSidebarMobile,
    toggleSidebarDesktop,
    openSearchBtn,
    newChatBtn,
    sidebarBackdrop,
    toggleChatsBtn,
    toggleChatsIcon,
    getChatHandlers,
  });
}
