import {
  apiFetch,
  fetchArchivedChats,
  fetchChats,
  fetchSharedChats,
  fetchToolServers,
  getFileBlob,
  getFileContent,
  getFileMetadata,
  getClientSessionId,
  shareChat,
  toggleArchiveChat,
  unshareChat,
  uploadFile,
} from '../../shared/api.js';
import { escapeHtml, showToast, showToastProgress } from '../../shared/utils.js';
import { state, setState, subscribe } from '../../shared/store.js';
import { renderPlaceholder } from '../../shared/components/chat-placeholder.js';
import { renderMessageInput } from './message-input.js';
import { renderModelSelector } from './model-selector.js';
import { renderSidebar } from '../../shared/components/sidebar.js';
import { renderAssistantMessageBody } from './chat-message-rendering.js';
import { createChatMessageDom } from './chat-message-dom.js';
import {
  appendBlock,
  ensureThinkingBlock,
  updateToolCallState,
} from './chat-message-blocks.js';
import {
  getAllowedAttachmentKinds,
  getAllowedNonLocalKinds,
  getFileContentType,
  isAttachmentAllowedByModel,
  isSupportedAttachmentType,
} from '../../shared/utils/attachment-types.js';
import { isTempMessageId, touchRecentChat } from '../../shared/utils/chat-cache.js';
import { consumeToolServersInvalidation } from '../../shared/utils/tool-server-sync.js';
import {
  formatApiErrorMessage,
  extractThinkingBlocks,
} from './chat-message-utils.js';
import { createChatCacheController } from './chat-cache-controller.js';
import { createChatMessageIdentityTracker } from './chat-message-identity.js';
import { createChatMessageStream } from './chat-message-stream.js';
import { createChatDataController } from './chat-data-controller.js';
import { createChatRenderController } from './chat-render-controller.js';
import { createChatShellController } from './chat-shell-controller.js';
import { createChatUiResources } from './chat-ui-resources.js';

const loadChatStreamModule = () => import('./chat-stream.js');
const loadChatModalsModule = () => import('./chat-modals.js');
const loadChatFileEventsModule = () => import('./chat-file-events.js');
const loadChatMessageSeqModule = () => import('./chat-message-seq.js');
const loadChatSidebarListModule = () => import('./chat-sidebar-list.js');
const loadChatStreamControllerModule = () => import('./chat-stream-controller.js');
const loadChatStreamStateModule = () => import('./chat-stream-state.js');
const loadChatListActionsModule = () => import('./chat-list-actions.js');
const loadChatMessageListControllerModule = () => import('./chat-message-list-controller.js');
const loadChatRealtimeControllerModule = () => import('./chat-realtime-controller.js');

export function renderChat(container) {
  if (typeof container.__cleanup === 'function') {
    container.__cleanup();
  }

  container.innerHTML = `
    <div class="flex h-full w-full bg-white overflow-hidden text-[#171717] font-sans">
      <div id="sidebar-backdrop" class="fixed inset-0 bg-black/20 backdrop-blur-sm z-30 transition-opacity duration-300 hidden md:hidden"></div>

      <aside id="sidebar" class="fixed md:relative h-[100dvh] md:h-[100dvh] flex-shrink-0 bg-[#f9f9f9] border-r border-gray-100 flex flex-col transition-all duration-500 ease-in-out z-40 -ml-[260px] md:ml-0 overflow-visible group/sidebar">
        <div class="p-3">
          <div id="sidebar-header" class="flex items-center justify-between mb-4 px-2 mt-1 transition-all duration-300">
            <button type="button" id="sidebar-home-btn" class="flex items-center gap-3 sidebar-full-only hover:opacity-90 transition-opacity" title="Home">
              <div class="w-7 h-7 bg-white rounded-full flex items-center justify-center border border-gray-100 shadow-sm overflow-hidden">
                <img src="/logo.png" alt="GrowChat" class="w-5 h-5 object-contain" />
              </div>
              <span class="font-bold text-lg text-gray-800 font-primary">GrowChat</span>
            </button>
            <button id="toggle-sidebar-desktop" class="sidebar-full-only hidden md:block p-1 text-gray-500 hover:bg-gray-200 rounded-lg transition-colors ml-auto" title="Close Sidebar">
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="3" y1="12" x2="21" y2="12"></line><line x1="3" y1="6" x2="21" y2="6"></line><line x1="3" y1="18" x2="21" y2="18"></line></svg>
            </button>
          </div>

          <div class="space-y-1">
            <button id="new-chat" class="flex items-center justify-between px-3 py-2 w-full hover:bg-white rounded-xl transition text-sm font-semibold text-[#0066cc] font-primary group/new-chat">
               <div class="flex items-center gap-3">
                 <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="sidebar-collapsed-scale transition-transform duration-300"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>
                 <span class="sidebar-full-only">New Chat</span>
               </div>
               <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="sidebar-full-only"><path d="M12 5v14M5 12h14"/></svg>
            </button>

            <button id="open-search" class="flex items-center gap-3 px-3 py-2 w-full hover:bg-white rounded-xl transition text-sm font-semibold text-gray-700 font-primary group/search">
               <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="sidebar-collapsed-scale transition-transform duration-300"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
               <span class="sidebar-full-only">Search</span>
            </button>
          </div>
        </div>

        <div class="flex-grow flex flex-col min-h-0 overflow-hidden px-3 pb-4 sidebar-full-only">
          <button id="toggle-chats-btn" class="flex items-center justify-between w-full text-[11px] font-semibold text-gray-400 px-3 py-2 mt-2 uppercase tracking-wider sidebar-full-only hover:text-gray-600 transition-colors group">
            <span>Chats</span>
            <svg id="toggle-chats-icon" xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="transition-transform duration-200"><polyline points="18 15 12 9 6 15"></polyline></svg>
          </button>
          <div class="flex-grow overflow-y-auto no-scrollbar sidebar-full-only" id="chat-list-container">
            <ul id="chat-list" class="space-y-0.5"></ul>
          </div>
        </div>

        <div id="sidebar-footer" class="mt-auto w-full bg-[#f9f9f9]" style="padding-bottom: calc(1rem + env(safe-area-inset-bottom));"></div>
      </aside>

      <main id="main" class="flex-grow flex flex-col relative min-w-0 bg-white h-full">
        <header class="h-[58px] flex items-center px-4 justify-between sticky top-0 z-10 bg-white/95 backdrop-blur-sm border-b border-gray-100">
           <div class="flex items-center">
             <button id="toggle-sidebar-mobile" class="p-2 mr-2 hover:bg-gray-100 rounded-lg transition text-gray-500 md:hidden" title="Open Sidebar">
               <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="3" y1="12" x2="21" y2="12"></line><line x1="3" y1="6" x2="21" y2="6"></line><line x1="3" y1="18" x2="21" y2="18"></line></svg>
             </button>
             <div id="model-selector-container"></div>
           </div>

           <div class="flex items-center gap-1 text-gray-500">
             <div class="relative" id="header-menu-wrapper">
               <button id="header-menu-btn" class="p-2 hover:bg-gray-100 rounded-xl transition disabled:opacity-40" title="More" aria-label="More" disabled>
                 <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/><circle cx="5" cy="12" r="1"/></svg>
               </button>
               
               <div id="header-menu-dropdown" class="absolute top-full right-0 mt-1 bg-white border border-gray-100 rounded-2xl shadow-xl z-50 min-w-[140px] w-fit p-1 hidden font-primary">
                 <button data-action="share" class="menu-item flex items-center gap-2 w-full text-left px-3 py-1.5 text-sm hover:bg-gray-50 rounded-xl transition-colors text-gray-700">
                   <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/><polyline points="16 6 12 2 8 6"/><line x1="12" y1="2" x2="12" y2="15"/></svg>
                   Share
                 </button>
                 <button data-action="rename" class="menu-item flex items-center gap-2 w-full text-left px-3 py-1.5 text-sm hover:bg-gray-50 rounded-xl transition-colors text-gray-700">
                   <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/><path d="m15 5 4 4"/></svg>
                   Rename
                 </button>
                 <button data-action="archive" class="menu-item flex items-center gap-2 w-full text-left px-3 py-1.5 text-sm hover:bg-gray-50 rounded-xl transition-colors text-gray-700">
                   <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="21 8 21 21 3 21 3 8"/><rect width="22" height="5" x="1" y="3"/><line x1="10" y1="12" x2="14" y2="12"/></svg>
                   Archive
                 </button>
                 <hr class="border-gray-50 my-1">
                 <button data-action="delete" class="menu-item flex items-center gap-2 w-full text-left px-3 py-1.5 text-sm text-red-600 hover:bg-red-50 rounded-xl transition-colors">
                   <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>
                   Delete
                 </button>
               </div>
             </div>
           </div>
        </header>

        <div id="messages-container" class="flex-grow overflow-y-auto no-scrollbar pb-[148px] pt-[58px]">
          <div id="messages-inner" class="max-w-4xl mx-auto w-full px-4 flex flex-col gap-6 pb-4">
             <div id="welcome-screen-container"></div>
             <div id="messages-list" class="hidden flex flex-col gap-6"></div>
          </div>
        </div>

        <div class="absolute bottom-0 left-0 w-full pt-4 pb-6 bg-gradient-to-t from-white via-white to-transparent">
          <div id="message-input-container" class="max-w-4xl mx-auto w-full px-4 relative"></div>
        </div>
      </main>
    </div>

    <div id="search-modal-container"></div>
    <div id="files-modal-container"></div>
    <div id="share-modal-container"></div>
    <div id="archived-modal-container"></div>
    <div id="citation-modal-container"></div>
  `;

  container.__cleanup = wireChat(container);
}

function wireChat(root) {
  let syncChatUrlImpl = () => {};
  const syncChatUrl = (...args) => syncChatUrlImpl(...args);
  let startNewChatImpl = () => {};
  const startNewChat = (...args) => startNewChatImpl(...args);
  let loadMoreChatsImpl = async () => null;
  const loadMoreChats = (...args) => loadMoreChatsImpl(...args);
  let refreshChatListObserverImpl = () => {};
  const refreshChatListObserver = (...args) => refreshChatListObserverImpl(...args);
  let refreshShareStateImpl = async () => {};
  const refreshShareState = (...args) => refreshShareStateImpl(...args);
  let loadChatsImpl = async () => {};
  const loadChats = (...args) => loadChatsImpl(...args);
  let loadMessagesImpl = async () => {};
  const loadMessages = (...args) => loadMessagesImpl(...args);
  let drawMessagesImpl = () => {};
  const drawMessages = (...args) => drawMessagesImpl(...args);
  let openCitationImpl = () => {};
  const openCitation = (...args) => openCitationImpl(...args);

  const MAX_CACHED_CHATS = 6;
  const recentChatIds = [];
  const { pruneChatCaches, schedulePrune } = createChatCacheController({
    currentState: state,
    setStateFn: setState,
    recentChatIds,
    maxCachedChats: MAX_CACHED_CHATS,
  });
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
      if (streamSessionImpl?.getRunningMessageId) return streamSessionImpl.getRunningMessageId(messages);
      for (let i = messages.length - 1; i >= 0; i -= 1) {
        const msg = messages[i];
        const status = String(msg?.status || '');
        if (msg?.role === 'assistant' && (status === 'streaming' || status === 'tool_running')) {
          return msg.id;
        }
      }
      return null;
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
          drawChats,
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
      getDraftAttachments,
      setDraftAttachments,
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

  const toggleChatsBtn = root.querySelector('#toggle-chats-btn');
  const toggleChatsIcon = root.querySelector('#toggle-chats-icon');
  const chatListContainer = root.querySelector('#chat-list-container');
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
  const modelSelectorContainer = root.querySelector('#model-selector-container');
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
        drawChats(state.chats, state.activeChatId);
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
    void ensureChatListHandlers();
    warmupToolServers();
    armChatListObserver();
  };
  const scheduleSidebarHydrationWarmup = () => {
    if (buildChatSidebarListFragmentImpl) return;
    if (sidebarHydrationWarmupTimer) return;
    sidebarHydrationWarmupTimer = setTimeout(() => {
      sidebarHydrationWarmupTimer = null;
      void ensureChatSidebarListBuilder();
      void ensureChatListHandlers();
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
  let updateMessageContentDom = () => false;
  let applyAssistantErrorMessage = () => {};
  const chatMessageDom = createChatMessageDom({
    messagesList,
    state,
    setState,
    renderAssistantMessageBody,
    errorExpandedByMessageId,
    thinkingActiveByMessageId,
    thinkingDurationByMessageId,
    toolCallsByMessageId,
    thinkingCollapsedByKey,
    toolExpandedByKey,
    messageBlocksById,
  });
  updateMessageContentDom = chatMessageDom.updateMessageContentDom;
  applyAssistantErrorMessage = chatMessageDom.applyAssistantErrorMessage;
  const clientSessionId = getClientSessionId();
  let activeStreamAbort = null;
  const setGlobalStreamAbort = (fn) => {
    window.__growchatAbortStream = fn;
  };
  const clearGlobalStreamAbort = (fn) => {
    if (window.__growchatAbortStream === fn) {
      window.__growchatAbortStream = null;
    }
  };
  const getDraftAttachments = (chatId = state.activeChatId) => {
    if (chatId) {
      return state.attachmentsByChat?.[chatId] || [];
    }
    return state.newChatAttachments || [];
  };
  const setDraftAttachments = (chatId, attachments) => {
    if (chatId) {
      setState({
        attachmentsByChat: {
          ...(state.attachmentsByChat || {}),
          [chatId]: attachments,
        },
      });
      return;
    }
    setState({ newChatAttachments: attachments });
  };
  const normalizeToolNames = (names) => {
    if (!Array.isArray(names)) return null;
    const seen = new Set();
    const next = [];
    for (const value of names) {
      const name = String(value || '').trim();
      if (!name || seen.has(name)) continue;
      seen.add(name);
      next.push(name);
    }
    return next;
  };
  const getDraftToolNames = (chatId = state.activeChatId) => {
    if (chatId) {
      const stored = state.toolSelectionsByChat?.[chatId];
      return stored === undefined ? null : stored;
    }
    return state.newChatToolSelection;
  };
  const setDraftToolNames = (chatId, names) => {
    const next = names === null ? null : normalizeToolNames(names);
    if (chatId) {
      setState((prev) => {
        const nextMap = { ...(prev.toolSelectionsByChat || {}) };
        if (next === null) {
          delete nextMap[chatId];
        } else {
          nextMap[chatId] = next;
        }
        return { toolSelectionsByChat: nextMap };
      });
      return;
    }
    setState({ newChatToolSelection: next });
  };
  const refreshAllowedToolServers = (options) => uiResources.refreshAllowedToolServers(options);
  const loadAllowedToolServers = () => uiResources.loadAllowedToolServers();
  const checkToolServersInvalidation = () => uiResources.checkToolServersInvalidation();
  const bindToolServersInvalidationListener = () => uiResources.bindToolServersInvalidationListener();
  const unbindToolServersInvalidationListener = () => uiResources.unbindToolServersInvalidationListener();
  const PINNED_COLLAPSED_KEY = 'growchat_pinned_section_collapsed';
  let pinnedSectionCollapsed = false;
  try {
    pinnedSectionCollapsed = localStorage.getItem(PINNED_COLLAPSED_KEY) === '1';
  } catch {
    pinnedSectionCollapsed = false;
  }

  const destroyModelSelector = renderModelSelector(modelSelectorContainer);
  const destroySidebar = renderSidebar(sidebar, root);
  const messageIdentityTracker = createChatMessageIdentityTracker({
    setState,
    messagesList,
    activeChatIdGetter: () => state.activeChatId,
  });
  const {
    currentLeafByChatId,
    branchSelectionByChat,
    streamingOverrideByChat,
    resolveTempMessageId,
    replaceTempMessageId,
    registerPendingTempMessage,
    matchPendingTempMessage,
    waitForResolvedMessageId,
    setBranchSelection,
  } = messageIdentityTracker;
  const isTempChatId = (id) => String(id || '').startsWith('temp-');

  let setStreamingStateImpl = () => {};
  let requestCancelStreamImpl = async () => false;
  const setStreamingState = (...args) => setStreamingStateImpl(...args);
  let streamRuntimeReadyPromise = null;
  const ensureStreamRuntime = () => {
    if (streamRuntimeReadyPromise) return streamRuntimeReadyPromise;
    streamRuntimeReadyPromise = Promise.all([
      ensureStreamSession(),
      loadChatStreamStateModule(),
    ])
      .then(([session, streamStateModule]) => {
        if (!session || !streamStateModule?.createChatStreamState) return null;
        const streamState = streamStateModule.createChatStreamState({
          state,
          setState,
          apiFetch,
          streamSession,
          streamingOverrideByChat,
          drawMessages,
          getActiveStreamAbort: () => activeStreamAbort,
          setActiveStreamAbort: (value) => { activeStreamAbort = value; },
          clearGlobalStreamAbort,
        });
        setStreamingStateImpl = streamState?.setStreamingState || (() => {});
        requestCancelStreamImpl = streamState?.requestCancelStream || (async () => false);
        return true;
      })
      .catch((err) => {
        console.warn('Failed to initialize stream runtime:', err);
        streamRuntimeReadyPromise = null;
        return null;
      });
    return streamRuntimeReadyPromise;
  };
  const requestCancelStream = async (...args) => {
    await ensureStreamRuntime();
    return requestCancelStreamImpl(...args);
  };
  window.__growchatRequestCancel = (...args) => requestCancelStream(...args);

  const createFallbackTitleUpdater = () => (chatId, nextTitle) => {
    const targetId = String(chatId || '');
    const title = String(nextTitle || '').trim();
    if (!targetId || !title) return;
    setState((prev) => {
      const chats = Array.isArray(prev.chats) ? prev.chats : [];
      let changed = false;
      const nextChats = chats.map((chat) => {
        if (String(chat?.id || '') !== targetId) return chat;
        if (String(chat?.title || '') === title) return chat;
        changed = true;
        return { ...chat, title };
      });
      return changed ? { chats: nextChats } : {};
    });
  };

  const fallbackUpdateChatTitleLocal = createFallbackTitleUpdater();
  let updateChatTitleLocalImpl = fallbackUpdateChatTitleLocal;
  let onRealtimeEventImpl = null;
  let realtimeControllerReadyPromise = null;
  const updateChatTitleLocal = (...args) => updateChatTitleLocalImpl(...args);
  const ensureRealtimeController = () => {
    if (realtimeControllerReadyPromise) return realtimeControllerReadyPromise;
    realtimeControllerReadyPromise = loadChatRealtimeControllerModule()
      .then(({ createChatRealtimeController }) => {
        const realtimeController = createChatRealtimeController({
          state,
          setState,
          drawMessages,
          loadChats,
          loadMessages,
          touchRecentChat,
          schedulePrune,
          currentLeafByChatId,
          streamingOverrideByChat,
          setStreamingState,
          updateToolCallState,
          updateMessageContentDom,
          matchPendingTempMessage,
          getActiveStreamAbort: () => activeStreamAbort,
          setActiveStreamAbort: (value) => { activeStreamAbort = value; },
          clearGlobalStreamAbort,
          clientSessionId,
          processedRealtimeEvents,
          toolCallsByMessageId,
          messageBlocksById,
          isTempChatId,
        });
        onRealtimeEventImpl = realtimeController?.onRealtimeEvent || null;
        updateChatTitleLocalImpl = realtimeController?.updateChatTitleLocal || fallbackUpdateChatTitleLocal;
        return realtimeController;
      })
      .catch((err) => {
        console.warn('Failed to initialize realtime controller:', err);
        realtimeControllerReadyPromise = null;
        return null;
      });
    return realtimeControllerReadyPromise;
  };
  const onRealtimeEvent = (event) => {
    if (onRealtimeEventImpl) {
      onRealtimeEventImpl(event);
      return;
    }
    void ensureRealtimeController().then((controller) => {
      controller?.onRealtimeEvent?.(event);
    });
  };

  const buildFallbackAssistantMessage = (chatId, messageId, options = {}) => {
    if (!chatId || !messageId) return null;
    const { content, errorActive, errorMessage, model, parentId } = options;
    const messages = state.messagesByChat[chatId] || [];
    const existing = messages.find((msg) => String(msg.id) === String(messageId));
    const safeError = String(errorMessage || 'LLM request failed');
    let nextContent = content ?? existing?.content ?? '';
    if (errorActive && !nextContent) {
      nextContent = `Error: ${safeError}`;
    }
    if (existing) {
      return {
        ...existing,
        content: nextContent,
        status: errorActive ? 'error' : existing.status,
        error_message: errorActive ? safeError : existing.error_message,
        done: true,
      };
    }
    return {
      id: messageId,
      role: 'assistant',
      content: nextContent,
      model: model || state.activeModelId,
      parent_id: parentId || null,
      status: errorActive ? 'error' : undefined,
      error_message: errorActive ? safeError : undefined,
      created_at: Math.floor(Date.now() / 1000),
      done: true,
    };
  };

  const getMessageById = (chatId, messageId) => {
    if (!chatId || !messageId) return null;
    const list = state.messagesByChat[chatId] || [];
    return list.find((msg) => String(msg.id) === String(messageId)) || null;
  };

  const hydrateAttachmentImages = (containerEl) => uiResources.hydrateAttachmentImages(containerEl);

  const renderController = createChatRenderController({
    state,
    setState,
    messagesList,
    welcomeScreenContainer,
    messagesContainer,
    hydrateAttachmentImages,
    branchSelectionByChat,
    currentLeafByChatId,
    streamingOverrideByChat,
    errorExpandedByMessageId,
    thinkingCollapsedByKey,
    toolExpandedByKey,
    thinkingActiveByMessageId,
    thinkingDurationByMessageId,
    thinkingStartByMessageId,
    toolCallsByMessageId,
    messageBlocksById,
    showToast,
    apiFetch,
    loadMessages,
    waitForResolvedMessageId,
    getMessageById,
    resolveTempMessageId,
    replaceTempMessageId,
    registerPendingTempMessage,
    setBranchSelection,
    setStreamingState,
    getActiveStreamAbort: () => activeStreamAbort,
    setActiveStreamAbort: (value) => { activeStreamAbort = value; },
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
  });
  drawMessagesImpl = renderController.drawMessages;


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

  const createFallbackChatHandlers = (chat = {}) => ({
    onClick: (id) => {
      if (isTempChatId(id)) {
        setState({ activeChatId: id });
        syncChatUrl(null);
        drawMessages([]);
        if (state.isMobile) setState({ showSidebar: false });
        return;
      }
      syncChatUrl(id);
      setState({ activeChatId: id });
      void loadMessages(id, { modelMode: 'default' });
      if (state.isMobile) setState({ showSidebar: false });
    },
    rename: async () => {},
    pin: async () => {},
    duplicate: async () => {},
    share: async () => {},
    archive: async () => {},
    delete: async () => {},
  });
  let getChatHandlersImpl = createFallbackChatHandlers;
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
          toggleArchiveChat,
          drawMessages,
          currentLeafByChatId,
          streamingOverrideByChatId: streamingOverrideByChat,
        });
        drawChats(state.chats, state.activeChatId);
        return true;
      })
      .catch((err) => {
        console.warn('Failed to load chat list handlers:', err);
        chatListHandlersReadyPromise = null;
        return null;
      });
    return chatListHandlersReadyPromise;
  };
  const pruneTempChats = (list) => (Array.isArray(list) ? list.filter((c) => !isTempChatId(c?.id)) : []);
  const buildTempChat = (id = null) => {
    const nowTs = Math.floor(Date.now() / 1000);
    const modelToUse = state.activeModelId || state.defaultModelId || state.globalDefaultModelId;
    const tempChatId = id || `temp-${nowTs}-${Math.random().toString(36).slice(2, 8)}`;
    return {
      id: tempChatId,
      title: 'New Chat',
      model: modelToUse || null,
      pinned: 0,
      created_at: nowTs,
      updated_at: nowTs,
    };
  };

  const shellController = createChatShellController({
    state,
    setState,
    fetchChats,
    drawMessages,
    loadMessages,
    buildTempChat,
    pruneTempChats,
    setDraftToolNames,
    isTempChatId,
    openArchivedModal,
    ensureSearchModal,
    chatListContainerEl,
    root,
    sidebarHomeBtn,
    toggleSidebarMobile,
    toggleSidebarDesktop,
    openSearchBtn,
    newChatBtn,
    sidebarBackdrop,
    toggleChatsBtn,
    toggleChatsIcon,
    headerMenuBtn,
    headerMenuDropdown,
    getChatHandlers,
  });
  syncChatUrlImpl = shellController.syncChatUrl;
  startNewChatImpl = shellController.startNewChat;
  loadMoreChatsImpl = shellController.loadMoreChats;
  refreshChatListObserverImpl = shellController.refreshChatListObserver;
  const destroyShellEvents = shellController.bindShellEvents();

  const dataController = createChatDataController({
    state,
    setState,
    apiFetch,
    fetchChats,
    fetchSharedChats,
    sharedByChatId,
    recentChatIds,
    currentLeafByChatId,
    streamSession,
    drawMessages,
    startResumeStream,
    touchRecentChat,
    schedulePrune,
    isTempChatId,
  });
  refreshShareStateImpl = dataController.refreshShareState;
  loadChatsImpl = dataController.loadChats;
  loadMessagesImpl = dataController.loadMessages;

  chatMessageFlow = createChatMessageStream({
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
    getActiveStreamAbort: () => activeStreamAbort,
    setActiveStreamAbort: (value) => { activeStreamAbort = value; },
    consumeSseTextStream,
    appendBlock,
    ensureThinkingBlock,
    updateToolCallState,
    notePayloadSeq,
    buildFallbackAssistantMessage,
    formatApiErrorMessage,
    updateMessageContentDom,
    applyAssistantErrorMessage,
    getMessageById,
    loadMessages,
    getMessageSeq,
    extractThinkingBlocksFn: extractThinkingBlocks,
    thinkingStartByMessageId,
    thinkingDurationByMessageId,
    thinkingActiveByMessageId,
    messageBlocksById,
    toolCallsByMessageId,
    streamSession,
    isTempChatId,
    replaceTempMessageId,
    resolveTempMessageId,
  });

  uiResources.scheduleSidebarEnhancements(root);

  let destroySearchModal;
  let destroyFilesModal;

  async function ensureSearchModal() {
    if (destroySearchModal) return;
    const { renderSearchModal } = await uiResources.loadSearchModalModule();
    destroySearchModal = renderSearchModal(searchModalContainer, startNewChat, loadMessages);
  }

  async function ensureFilesModal() {
    if (destroyFilesModal) return;
    const { renderFilesModal } = await uiResources.loadFilesModalModule();
    destroyFilesModal = renderFilesModal(filesModalContainer);
  }

  const inputComponent = renderMessageInput(messageInputContainer, sendMessage, async () => {
    await ensureFilesModal();
    setState({ showFiles: true });
  });
  bindToolServersInvalidationListener();
  checkToolServersInvalidation();
  let toolServersWarmupTriggered = false;
  const warmupToolServers = () => {
    if (toolServersWarmupTriggered) return;
    toolServersWarmupTriggered = true;
    void loadAllowedToolServers();
  };

  function getActiveModel() {
    return state.models.find((m) => m.id === state.activeModelId) || null;
  }

  let destroyPlaceholder;
  function drawPlaceholder() {
    destroyPlaceholder = renderPlaceholder(welcomeScreenContainer, {
      model: getActiveModel(),
      onSuggestionClick: (text) => {
        inputComponent.setValue(text);
      },
    });
  }

  drawPlaceholder();

  function drawChats(chats, activeId) {
    if (!buildChatSidebarListFragmentImpl) {
      scheduleSidebarHydrationWarmup();
      const fallbackFragment = document.createDocumentFragment();
      const chatItems = Array.isArray(chats) ? chats : [];
      if (chatItems.length === 0 && !state?.chatsPagination?.loading) {
        const emptyState = document.createElement('div');
        emptyState.className = 'px-3 py-4 text-sm text-gray-400 sidebar-full-only';
        emptyState.textContent = 'No chat sessions yet.';
        fallbackFragment.appendChild(emptyState);
      } else {
        chatItems.slice(0, 24).forEach((chat) => {
          const handlers = getChatHandlers(chat);
          const item = document.createElement('li');
          const button = document.createElement('button');
          button.type = 'button';
          button.className = `w-full text-left px-3 py-2 rounded-lg text-sm transition ${String(chat?.id) === String(activeId) ? 'bg-white text-gray-900 font-medium' : 'text-gray-600 hover:bg-white'}`;
          button.textContent = chat?.title || 'Untitled Chat';
          button.addEventListener('click', () => handlers.onClick?.(chat?.id));
          item.appendChild(button);
          fallbackFragment.appendChild(item);
        });
      }
      if (state?.chatsPagination?.loading) {
        const loadingRow = document.createElement('div');
        loadingRow.className = 'px-3 py-3 text-xs text-gray-400';
        loadingRow.textContent = 'Loading more chats...';
        fallbackFragment.appendChild(loadingRow);
      } else if (state?.chatsPagination?.hasMore) {
        const sentinel = document.createElement('div');
        sentinel.id = 'chat-list-load-more';
        sentinel.className = 'h-6';
        fallbackFragment.appendChild(sentinel);
      }
      chatList.innerHTML = '';
      chatList.appendChild(fallbackFragment);
      return;
    }

    const fragment = buildChatSidebarListFragmentImpl({
      chats,
      activeId,
      models: state.models,
      state,
      isPinnedSectionCollapsed: pinnedSectionCollapsed,
      onPinnedToggle: () => {
        pinnedSectionCollapsed = !pinnedSectionCollapsed;
        try {
          localStorage.setItem(PINNED_COLLAPSED_KEY, pinnedSectionCollapsed ? '1' : '0');
        } catch {
          // Ignore storage failures; UI still toggles for current session.
        }
        drawChats(state.chats, state.activeChatId);
      },
      getChatHandlers,
    });

    chatList.innerHTML = '';
    chatList.appendChild(fragment);
  }

  window.addEventListener('growchat:realtime', onRealtimeEvent);

  async function sendSingleMessage(text, hooks = {}, options = {}) {
    await ensureStreamRuntime();
    await ensureMessageSequenceTracker();
    return chatMessageFlow?.sendSingleMessage?.(text, hooks, options);
  }

  async function sendMessage(text, hooks = {}, options = {}) {
    const prompt = String(text || '').trim();
    if (!prompt) {
      hooks.onFinished?.();
      return;
    }
    await ensureStreamRuntime();
    await ensureMessageSequenceTracker();
    return chatMessageFlow?.sendMessage?.(prompt, hooks, options);
  }

  messageInputContainer.addEventListener('focusin', () => {
    void ensureChatFileEvents();
    warmupToolServers();
    void ensureMessageSequenceTracker();
  }, { once: true });
  const onHeaderMenuInteraction = () => {
    void ensureChatListHandlers();
    warmupToolServers();
  };
  const handleMessageListInteractionFallback = (event) => {
    if (!event?.target) return;

    const thinkingTarget = event.target.closest?.('[data-thinking-toggle]');
    if (thinkingTarget) {
      const key = thinkingTarget.getAttribute('data-thinking-toggle');
      if (!key) return;
      const isCollapsed = thinkingCollapsedByKey.get(key) ?? false;
      const next = !isCollapsed;
      thinkingCollapsedByKey.set(key, next);
      const body = messagesList?.querySelector(`[data-thinking-body="${key}"]`);
      const chevron = messagesList?.querySelector(`[data-thinking-chevron="${key}"]`);
      if (body) body.classList.toggle('hidden', next);
      if (chevron) {
        chevron.classList.toggle('-rotate-90', next);
        chevron.classList.toggle('rotate-0', !next);
      }
      return;
    }

    const toolTarget = event.target.closest?.('[data-tool-toggle]');
    if (toolTarget) {
      const key = toolTarget.getAttribute('data-tool-toggle');
      if (!key) return;
      const expanded = toolExpandedByKey.get(key) === true;
      const next = !expanded;
      toolExpandedByKey.set(key, next);
      const body = messagesList?.querySelector(`[data-tool-body="${key}"]`);
      const chevron = messagesList?.querySelector(`[data-tool-chevron="${key}"]`);
      if (body) body.classList.toggle('hidden', !next);
      if (chevron) {
        chevron.classList.toggle('-rotate-90', !next);
        chevron.classList.toggle('rotate-0', next);
      }
      return;
    }

    const citationTarget = event.target.closest?.('[data-citation-id]');
    if (citationTarget) {
      const id = citationTarget.getAttribute('data-citation-id');
      if (!id) return;
      openCitation(id);
    }
  };
  const onMessageListInteraction = (event) => {
    handleMessageListInteractionFallback(event);
    void ensureMessageListInteractions();
    void ensureStreamRuntime();
    void ensureMessageSequenceTracker();
  };

  let lastActiveChatId = state.activeChatId;
  const unsubscribe = subscribe((currentState) => {
    if (currentState.showSearch) {
      ensureSearchModal();
    }
    if (currentState.showFiles) {
      ensureFilesModal();
    }
    if (currentState.showSidebar && currentState.isMobile) {
      sidebarBackdrop.classList.remove('hidden');
      document.body.style.overflow = 'hidden';
    } else {
      sidebarBackdrop.classList.add('hidden');
      if (!currentState.showSearch && !shareModalContainer.innerHTML && !archivedModalContainer.innerHTML) {
        document.body.style.overflow = '';
      }
    }

    if (currentState.activeChatId && currentState.activeChatId !== lastActiveChatId) {
      if (lastActiveChatId) streamSession.stopStreamPolling(lastActiveChatId);
      void ensureRealtimeController();
      touchRecentChat(recentChatIds, currentState.activeChatId);
      schedulePrune();
    }
    lastActiveChatId = currentState.activeChatId;

    headerMenuBtn.disabled = !currentState.activeChatId || isTempChatId(currentState.activeChatId);
    drawChats(currentState.chats, currentState.activeChatId);
    maybeRefreshChatListObserver();
  });

  chatListContainerEl?.addEventListener('wheel', onChatListInteraction, { once: true, passive: true });
  chatListContainerEl?.addEventListener('touchstart', onChatListInteraction, { once: true, passive: true });
  chatListContainerEl?.addEventListener('scroll', onChatListInteraction, { once: true, passive: true });
  chatListContainerEl?.addEventListener('pointerenter', onChatListInteraction, { once: true, passive: true });
  chatListContainerEl?.addEventListener('focusin', onChatListInteraction, { once: true });
  chatListContainerEl?.addEventListener('click', onChatListInteraction, { once: true, capture: true });
  headerMenuBtn?.addEventListener('click', onHeaderMenuInteraction, { once: true });
  headerMenuDropdown?.addEventListener('click', onHeaderMenuInteraction, { once: true });
  messagesList?.addEventListener('click', onMessageListInteraction, { once: true, capture: true });

  drawChats(state.chats, state.activeChatId);
  maybeRefreshChatListObserver();

  requestAnimationFrame(() => {
    drawChats(state.chats, state.activeChatId);
    maybeRefreshChatListObserver();
  });

  if (state.activeChatId) {
    void ensureRealtimeController();
    loadMessages(state.activeChatId, { modelMode: 'default' }).finally(() => {
      drawChats(state.chats, state.activeChatId);
      maybeRefreshChatListObserver();
    });
  }

  const getRunningMessageId = (messages = []) => streamSession.getRunningMessageId(messages);

  function stopStreamPolling(chatId) {
    streamSession.stopStreamPolling(chatId);
  }

  function startStreamPolling(chatId, messageId) {
    if (!chatId || !messageId) return;
    void ensureStreamRuntime();
    streamSession.startStreamPolling(chatId, messageId, {
      onMessage: (msg, { isRunning } = {}) => {
        const messages = [...(state.messagesByChat[chatId] || [])];
        const idx = messages.findIndex((m) => String(m?.id || '') === String(msg.id));
        if (idx >= 0) {
          messages[idx] = {
            ...messages[idx],
            ...msg,
            done: !isRunning,
          };
        } else {
          messages.push({ ...msg, done: !isRunning });
        }
        setState((prev) => ({ messagesByChat: { ...prev.messagesByChat, [chatId]: messages } }));
        if (state.activeChatId === chatId) drawMessages(messages);

        const hasRunning = messages.some((m) => {
          const s = String(m?.status || '');
          return m?.role === 'assistant' && (s === 'streaming' || s === 'tool_running');
        });
        setStreamingState(chatId, hasRunning);
      },
      onStop: () => {
        setStreamingState(chatId, false);
      },
      onTimeout: () => {
        setStreamingState(chatId, false);
      },
    });
  }

  function stopResumeStream(chatId) {
    chatMessageFlow?.stopResumeStream?.(chatId);
  }

  async function startResumeStream(chatId, messageId) {
    await ensureStreamRuntime();
    await ensureMessageSequenceTracker();
    return chatMessageFlow?.startResumeStream?.(chatId, messageId);
  }

  return () => {
    if (sidebarHydrationWarmupTimer) {
      clearTimeout(sidebarHydrationWarmupTimer);
      sidebarHydrationWarmupTimer = null;
    }
    if (activeStreamAbort) activeStreamAbort();
    streamSession.dispose();
    unsubscribe();
    uiResources.clearAttachmentCaches();
    destroySearchModal?.();
    destroyFilesModal?.();
    destroyModelSelector?.();
    destroySidebar?.();
    inputComponent?.destroy?.();
    destroyPlaceholder?.();
    destroyChatFileEvents?.();
    destroyMessageListInteractions?.();
    window.removeEventListener('growchat:realtime', onRealtimeEvent);
    unbindToolServersInvalidationListener();
    chatListContainerEl?.removeEventListener('wheel', onChatListInteraction);
    chatListContainerEl?.removeEventListener('touchstart', onChatListInteraction);
    chatListContainerEl?.removeEventListener('scroll', onChatListInteraction);
    headerMenuBtn?.removeEventListener('click', onHeaderMenuInteraction);
    headerMenuDropdown?.removeEventListener('click', onHeaderMenuInteraction);
    messagesList?.removeEventListener('click', onMessageListInteraction, true);
    destroyShellEvents?.();
    shellController.dispose?.();
    root.__cleanup = null;
  };
}



