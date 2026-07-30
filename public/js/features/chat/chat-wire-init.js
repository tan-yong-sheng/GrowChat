// WireChat init: impl adapters, cache, streams, modals, DOM, sidebar, maps.
// Phase 1 of wireChat extraction from chat.js.

import { findStreamingMessageId } from './message-input-helpers.js';

export function initWireChat(root, deps, ctx) {
  // prettier-ignore
  const {
    apiFetch, shareChat, unshareChat, fetchArchivedChats, toggleArchiveChat, getFileMetadata, getFileContent, uploadFile, fetchToolServers, consumeToolServersInvalidation,
    getFileBlob, getClientSessionId, showToast, showToastProgress, escapeHtml, state, setState, renderAssistantMessageBody, getAllowedAttachmentKinds, getAllowedNonLocalKinds,
    getFileContentType, isAttachmentAllowedByModel, isSupportedAttachmentType, createChatMessageDom, createChatCacheController, createChatUiResources, loadChatStreamModule, loadChatModalsModule, loadChatFileEventsModule, loadChatMessageSeqModule,
    loadChatSidebarListModule, loadChatStreamControllerModule
  } = deps;

  let syncChatUrlImpl = () => {};
  const syncChatUrl = (...args) => ctx.syncChatUrlImpl(...args);
  let startNewChatImpl = () => {};
  const startNewChat = (...args) => ctx.startNewChatImpl(...args);
  let refreshChatListObserverImpl = () => {};
  const refreshChatListObserver = (...args) => ctx.refreshChatListObserverImpl(...args);
  let refreshShareStateImpl = async () => {};
  const refreshShareState = (...args) => ctx.refreshShareStateImpl(...args);
  let loadChatsImpl = async () => {};
  const loadChats = (...args) => ctx.loadChatsImpl(...args);
  let loadMessagesImpl = async () => {};
  const loadMessages = (...args) => ctx.loadMessagesImpl(...args);
  let drawMessagesImpl = () => {};
  const drawMessages = (...args) => ctx.drawMessagesImpl(...args);
  let openCitationImpl;
  const openCitation = (...args) => ctx.openCitationImpl(...args);

  // Sync local impls to ctx so proxy functions have valid targets
  // before setupWireChatControllers replaces them with real implementations.
  ctx.syncChatUrlImpl = syncChatUrlImpl;
  ctx.startNewChatImpl = startNewChatImpl;
  ctx.refreshChatListObserverImpl = refreshChatListObserverImpl;
  ctx.refreshShareStateImpl = refreshShareStateImpl;
  ctx.loadChatsImpl = loadChatsImpl;
  ctx.loadMessagesImpl = loadMessagesImpl;
  ctx.drawMessagesImpl = drawMessagesImpl;
  ctx.openCitationImpl = openCitationImpl;

  const MAX_CACHED_CHATS = 6;
  const recentChatIds = [];
  const cacheController =
    typeof createChatCacheController === 'function'
      ? createChatCacheController({
          currentState: state,
          setStateFn: setState,
          recentChatIds,
          maxCachedChats: MAX_CACHED_CHATS,
        })
      : { schedulePrune: () => {} };
  const { schedulePrune } = cacheController;
  let streamSessionImpl = null;
  let streamSessionReadyPromise = null;
  const ensureStreamSession = () => {
    if (streamSessionImpl) return Promise.resolve(streamSessionImpl);
    if (streamSessionReadyPromise) return streamSessionReadyPromise;
    streamSessionReadyPromise = loadChatStreamControllerModule()
      .then(({ createChatStreamController }) => {
        streamSessionImpl = createChatStreamController({ apiFetch });
        return streamSessionImpl;
      })
      .catch((err) => {
        console.warn('Failed to load stream session controller:', err);
        streamSessionReadyPromise = null;
        return null;
      });
    return streamSessionReadyPromise;
  };
  const streamSession = {
    getRunningMessageId(messages = []) {
      if (streamSessionImpl?.getRunningMessageId)
        return streamSessionImpl.getRunningMessageId(messages);
      return findStreamingMessageId(messages);
    },
    stopStreamPolling(chatId) {
      streamSessionImpl?.stopStreamPolling?.(chatId);
    },
    getStreamPolling(chatId) {
      return streamSessionImpl?.getStreamPolling?.(chatId) || null;
    },
    startStreamPolling(chatId, messageId, options) {
      if (streamSessionImpl?.startStreamPolling) {
        streamSessionImpl.startStreamPolling(chatId, messageId, options);
        return;
      }
      void ensureStreamSession().then((session) => {
        session?.startStreamPolling?.(chatId, messageId, options);
      });
    },
    getResumeStream(chatId) {
      return streamSessionImpl?.getResumeStream?.(chatId) || null;
    },
    setResumeStream(chatId, entry) {
      streamSessionImpl?.setResumeStream?.(chatId, entry);
    },
    clearResumeStream(chatId, controller) {
      streamSessionImpl?.clearResumeStream?.(chatId, controller);
    },
    stopResumeStream(chatId) {
      streamSessionImpl?.stopResumeStream?.(chatId);
    },
    dispose() {
      streamSessionImpl?.dispose?.();
    },
  };
  let chatMessageFlow = null;
  const uiResources = createChatUiResources({
    state,
    setState,
    fetchToolServers,
    consumeToolServersInvalidation,
    getFileBlob,
  });
  let consumeSseTextStreamImpl = null;
  const consumeSseTextStream = async (...args) => {
    if (!consumeSseTextStreamImpl) {
      const streamModule = await loadChatStreamModule();
      consumeSseTextStreamImpl = streamModule.consumeSseTextStream;
    }
    return consumeSseTextStreamImpl(...args);
  };
  let chatModalsReadyPromise = null;
  let renderShareModalImpl = null;
  let openArchivedModalImpl = null;
  let openCitationModalImpl = null;
  const renderShareModal = (...args) => {
    if (typeof renderShareModalImpl === 'function') {
      return renderShareModalImpl(...args);
    }
    void ensureChatModals().then(() => renderShareModalImpl?.(...args));
    return undefined;
  };
  const openArchivedModal = (...args) => {
    if (typeof openArchivedModalImpl === 'function') {
      return openArchivedModalImpl(...args);
    }
    void ensureChatModals().then(() => openArchivedModalImpl?.(...args));
    return undefined;
  };
  let destroyChatFileEvents = null;
  function ensureChatModals() {
    if (chatModalsReadyPromise) return chatModalsReadyPromise;
    chatModalsReadyPromise = loadChatModalsModule()
      .then(({ createChatModals }) => {
        const {
          renderShareModal: renderShareModalLoaded,
          openCitation: openCitationLoaded,
          openArchivedModal: openArchivedModalLoaded,
        } = createChatModals({
          state,
          shareChat,
          unshareChat,
          fetchArchivedChats,
          toggleArchiveChat,
          getFileMetadata,
          getFileContent,
          drawChats: (...a) => ctx.drawChats?.(...a),
          loadChats,
          sharedByChatId,
          escapeHtml,
          shareModalContainer,
          archivedModalContainer,
          citationModalContainer,
        });
        renderShareModalImpl = renderShareModalLoaded;
        openArchivedModalImpl = openArchivedModalLoaded;
        openCitationModalImpl = openCitationLoaded;
      })
      .catch((err) => {
        console.warn('Failed to load chat modals:', err);
      });
    return chatModalsReadyPromise;
  }
  const ensureChatFileEvents = async () => {
    if (destroyChatFileEvents) return;
    const { bindChatFileEvents } = await loadChatFileEventsModule();
    destroyChatFileEvents = bindChatFileEvents({
      state,
      uploadFile,
      showToast,
      showToastProgress,
      getDraftAttachments: (...a) => ctx.getDraftAttachments?.(...a),
      setDraftAttachments: (...a) => ctx.setDraftAttachments?.(...a),
      getAllowedAttachmentKinds,
      getAllowedNonLocalKinds,
      getFileContentType,
      isAttachmentAllowedByModel,
      isSupportedAttachmentType,
    });
  };
  openCitationImpl = (...args) => {
    if (typeof openCitationModalImpl === 'function') {
      return openCitationModalImpl(...args);
    }
    void ensureChatModals().then(() => openCitationModalImpl?.(...args));
    return undefined;
  };
  ctx.openCitationImpl = openCitationImpl;
  const toggleChatsBtn = root.querySelector('#toggle-chats-btn');
  const toggleChatsIcon = root.querySelector('#toggle-chats-icon');
  const chatList = root.querySelector('#chat-list');
  const chatListContainerEl = root.querySelector('#chat-list-container');
  const messagesList = root.querySelector('#messages-list');
  const welcomeScreenContainer = root.querySelector('#welcome-screen-container');
  const messageInputContainer = root.querySelector('#message-input-container');
  const sidebarHomeBtn = root.querySelector('#sidebar-home-btn');
  const newChatBtn = root.querySelector('#new-chat');
  const toggleSidebarMobile = root.querySelector('#toggle-sidebar-mobile');
  const toggleSidebarDesktop = root.querySelector('#toggle-sidebar-desktop');
  const headerMenuBtn = root.querySelector('#header-menu-btn');
  const headerMenuDropdown = root.querySelector('#header-menu-dropdown');
  const sidebar = root.querySelector('#sidebar');
  const sidebarBackdrop = root.querySelector('#sidebar-backdrop');
  const messagesContainer = root.querySelector('#messages-container');
  const openSearchBtn = root.querySelector('#open-search');
  const searchModalContainer = root.querySelector('#search-modal-container');
  const filesModalContainer = root.querySelector('#files-modal-container');
  const shareModalContainer = root.querySelector('#share-modal-container');
  const archivedModalContainer = root.querySelector('#archived-modal-container');
  const citationModalContainer = root.querySelector('#citation-modal-container');
  let chatListObserverArmed = false;
  let buildChatSidebarListFragmentImpl = null;
  let sidebarHydrationWarmupTimer = null;
  let chatSidebarListReadyPromise = null;
  const ensureChatSidebarListBuilder = () => {
    if (buildChatSidebarListFragmentImpl) return Promise.resolve(buildChatSidebarListFragmentImpl);
    if (chatSidebarListReadyPromise) return chatSidebarListReadyPromise;
    chatSidebarListReadyPromise = loadChatSidebarListModule()
      .then(({ buildChatSidebarListFragment }) => {
        buildChatSidebarListFragmentImpl = buildChatSidebarListFragment;
        ctx.buildChatSidebarListFragmentImpl = buildChatSidebarListFragmentImpl;
        ctx.drawChats?.(state.chats, state.activeChatId);
        return buildChatSidebarListFragmentImpl;
      })
      .catch((err) => {
        console.warn('Failed to load chat sidebar list module:', err);
        return null;
      });
    return chatSidebarListReadyPromise;
  };
  const armChatListObserver = () => {
    if (chatListObserverArmed) return;
    chatListObserverArmed = true;
    refreshChatListObserver();
  };
  const maybeRefreshChatListObserver = () => {
    if (!chatListObserverArmed) return;
    refreshChatListObserver();
  };
  const onChatListInteraction = () => {
    void ensureChatSidebarListBuilder();
    void ctx.ensureChatListHandlers?.();
    ctx.warmupToolServers?.();
    armChatListObserver();
  };
  const scheduleSidebarHydrationWarmup = () => {
    if (buildChatSidebarListFragmentImpl) return;
    if (sidebarHydrationWarmupTimer) return;
    sidebarHydrationWarmupTimer = setTimeout(() => {
      sidebarHydrationWarmupTimer = null;
      void ensureChatSidebarListBuilder();
      void ctx.ensureChatListHandlers?.();
    }, 300);
  };
  const sharedByChatId = new Map();
  const processedRealtimeEvents = new Map();
  let getMessageSeqImpl = () => 0;
  let notePayloadSeqImpl = () => {};
  const getMessageSeq = (...args) => getMessageSeqImpl(...args);
  const notePayloadSeq = (...args) => notePayloadSeqImpl(...args);
  let messageSequenceReadyPromise = null;
  const ensureMessageSequenceTracker = () => {
    if (messageSequenceReadyPromise) return messageSequenceReadyPromise;
    messageSequenceReadyPromise = loadChatMessageSeqModule()
      .then(({ createMessageSequenceTracker }) => {
        const tracker = createMessageSequenceTracker();
        getMessageSeqImpl = tracker.getMessageSeq;
        notePayloadSeqImpl = tracker.notePayloadSeq;
      })
      .catch((err) => {
        console.warn('Failed to load message sequence tracker:', err);
      });
    return messageSequenceReadyPromise;
  };
  const thinkingStartByMessageId = new Map();
  const thinkingDurationByMessageId = new Map();
  const thinkingCollapsedByKey = new Map();
  const thinkingActiveByMessageId = new Map();
  const errorExpandedByMessageId = new Map();
  const toolCallsByMessageId = new Map();
  const toolExpandedByKey = new Map();
  const messageBlocksById = new Map();
  const { updateMessageContentDom, applyAssistantErrorMessage } = createChatMessageDom({
    messagesList,
    state,
    setState,
    renderAssistantMessageBody,
    getAllowedAttachmentKinds,
    getAllowedNonLocalKinds,
    getFileContentType,
    isAttachmentAllowedByModel,
    isSupportedAttachmentType,
    errorExpandedByMessageId,
    thinkingActiveByMessageId,
    thinkingDurationByMessageId,
    toolCallsByMessageId,
    thinkingCollapsedByKey,
    toolExpandedByKey,
    messageBlocksById,
  });
  const clientSessionId = getClientSessionId();

  // prettier-ignore
  Object.assign(ctx, {
    activeStreamAbort: null,
    syncChatUrlImpl, startNewChatImpl, refreshChatListObserverImpl, refreshShareStateImpl, loadChatsImpl, loadMessagesImpl, drawMessagesImpl, openCitationImpl, syncChatUrl, startNewChat,
    refreshChatListObserver, refreshShareState, loadChats, loadMessages, drawMessages, openCitation, schedulePrune, ensureStreamSession, streamSession, chatMessageFlow, uiResources,
    consumeSseTextStream, renderShareModal, openArchivedModal, destroyChatFileEvents, ensureChatFileEvents, ensureChatModals, toggleChatsBtn, toggleChatsIcon, chatList, chatListContainerEl,
    messagesList, welcomeScreenContainer, messageInputContainer, sidebarHomeBtn, newChatBtn, toggleSidebarMobile, toggleSidebarDesktop, headerMenuBtn, headerMenuDropdown, sidebar,
    sidebarBackdrop, messagesContainer, openSearchBtn, searchModalContainer, filesModalContainer, shareModalContainer, archivedModalContainer, citationModalContainer, chatListObserverArmed, buildChatSidebarListFragmentImpl,
    sidebarHydrationWarmupTimer, chatSidebarListReadyPromise, ensureChatSidebarListBuilder, armChatListObserver, maybeRefreshChatListObserver, onChatListInteraction, scheduleSidebarHydrationWarmup, sharedByChatId, processedRealtimeEvents, getMessageSeq,
    notePayloadSeq, ensureMessageSequenceTracker, thinkingStartByMessageId, thinkingDurationByMessageId, thinkingCollapsedByKey, thinkingActiveByMessageId, errorExpandedByMessageId, toolCallsByMessageId, toolExpandedByKey, messageBlocksById,
    updateMessageContentDom, applyAssistantErrorMessage, clientSessionId, recentChatIds, MAX_CACHED_CHATS
  });
}
