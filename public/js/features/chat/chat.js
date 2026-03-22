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
import { consumeToolServersInvalidation } from '../../shared/utils/tool-server-sync.js';
import { renderPlaceholder } from '../../shared/components/chat-placeholder.js';
import { renderMessageInput } from './message-input.js';
import { renderModelSelector } from './model-selector.js';
import { renderSidebar } from '../../shared/components/sidebar.js';
import {
  renderAttachmentPills,
  renderAssistantMessageBody,
} from './chat-message-rendering.js';
import { createChatMessageDom } from './chat-message-dom.js';
import {
  appendBlock,
  ensureThinkingBlock,
  syncMessageBlocksForMessage,
  syncToolCallsForMessage,
  updateToolCallState,
} from './chat-message-blocks.js';
import {
  getAllowedAttachmentKinds,
  getAllowedNonLocalKinds,
  getFileContentType,
  isAttachmentAllowedByModel,
  isSupportedAttachmentType,
} from '../../shared/utils/attachment-types.js';
import { groupChatsByTime } from '../../shared/utils/time-grouping.js';
import { projectConversation, resolveConversationLeafId } from '../../shared/utils/conversation.js';
import {
  clearAttachmentCache as clearAttachmentCacheHelper,
  isTempMessageId,
  normalizeCitations,
  touchAttachmentCache as touchAttachmentCacheHelper,
  touchRecentChat,
} from '../../shared/utils/chat-cache.js';
import {
  formatApiErrorMessage,
  extractThinkingBlocks,
  formatModelDisplayName,
} from './chat-message-utils.js';
import { buildChatRows } from './chat-render-helpers.js';
import { createChatCacheController } from './chat-cache-controller.js';
import { bindChatMessageActions } from './chat-message-actions.js';
import { createChatMessageIdentityTracker } from './chat-message-identity.js';
import { createChatMessageStream } from './chat-message-stream.js';
import { createChatStreamController } from './chat-stream-controller.js';
import { createChatStreamState } from './chat-stream-state.js';
import { consumeSseTextStream } from './chat-stream.js';
import { createChatListHandlers } from './chat-list-actions.js';
import { createChatModals } from './chat-modals.js';
import { bindChatFileEvents } from './chat-file-events.js';
import { createMessageSequenceTracker } from './chat-message-seq.js';
// Lazy-loaded components to reduce initial network requests.
let searchModalPromise = null;
let filesModalPromise = null;
let userProfileFooterPromise = null;
let toolServersInvalidationListenerBound = false;
let toolServersRefreshGeneration = 0;
let toolServersRefreshPromise = null;
let toolServersStorageListener = null;
let toolServersCustomListener = null;

const loadSearchModal = () => (searchModalPromise ??= import('../../shared/components/search-modal.js'));
const loadFilesModal = () => (filesModalPromise ??= import('../../shared/components/files-modal.js'));
const loadUserProfileFooter = () => (userProfileFooterPromise ??= import('../../shared/components/user-profile-footer.js'));

const attachmentImageUrlCache = new Map();
const attachmentImagePromiseCache = new Map();
const MAX_ATTACHMENT_CACHE = 48;
  const MAX_CACHED_CHATS = 6;
  const recentChatIds = [];
  const { pruneChatCaches, schedulePrune } = createChatCacheController({
    currentState: state,
    setStateFn: setState,
  recentChatIds,
    maxCachedChats: MAX_CACHED_CHATS,
  });
  const streamSession = createChatStreamController({ apiFetch });
  let chatMessageFlow = null;
  let updateMessageContentDom = () => false;
  let applyAssistantErrorMessage = () => {};

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
            <button id="new-chat" class="flex items-center justify-between px-3 py-2 w-full hover:bg-white rounded-xl transition text-sm font-semibold text-gray-700 font-primary group/new-chat">
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

      <main class="flex-grow flex flex-col relative min-w-0 bg-white h-full">
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
  const pathForChat = (chatId) => (chatId ? `/c/${encodeURIComponent(chatId)}` : '/');
  const syncChatUrl = (chatId, { replace = false } = {}) => {
    const nextPath = pathForChat(chatId);
    if (window.location.pathname === nextPath) return;
    const method = replace ? 'replaceState' : 'pushState';
    window.history[method]({}, '', nextPath);
  };

  const scrollToMessage = (msgId) => {
    const el = messagesList.querySelector(`[data-message-id="${msgId}"]`);
    if (el) el.scrollIntoView({ behavior: 'auto', block: 'nearest' });
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

  const sharedByChatId = new Map();
  const processedRealtimeEvents = new Map();
  const {
    getMessageSeq,
    notePayloadSeq,
  } = createMessageSequenceTracker();
  const thinkingStartByMessageId = new Map();
  const thinkingDurationByMessageId = new Map();
  const thinkingCollapsedByKey = new Map();
  const thinkingActiveByMessageId = new Map();
  const errorExpandedByMessageId = new Map();
  const toolCallsByMessageId = new Map();
  const toolExpandedByKey = new Map();
  const messageBlocksById = new Map();
  ({ updateMessageContentDom, applyAssistantErrorMessage } = createChatMessageDom({
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
  }));
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
  const refreshAllowedToolServers = async ({ force = false } = {}) => {
    if (!force && (state.toolServersLoaded || state.toolServersLoading)) {
      return toolServersRefreshPromise;
    }

    const requestGeneration = ++toolServersRefreshGeneration;
    setState({ toolServersLoading: true });

    const requestPromise = fetchToolServers()
      .then((payload) => {
        if (requestGeneration !== toolServersRefreshGeneration) return payload;
        setState({
          toolServers: Array.isArray(payload?.servers) ? payload.servers : [],
          toolServersLoaded: true,
          toolServersLoading: false,
        });
        return payload;
      })
      .catch((err) => {
        if (requestGeneration !== toolServersRefreshGeneration) return null;
        console.warn('Failed to load tool servers:', err);
        setState({
          toolServers: [],
          toolServersLoaded: true,
          toolServersLoading: false,
        });
        return null;
      })
      .finally(() => {
        if (toolServersRefreshPromise === requestPromise) {
          toolServersRefreshPromise = null;
        }
      });

    toolServersRefreshPromise = requestPromise;
    return requestPromise;
  };
  const loadAllowedToolServers = async () => refreshAllowedToolServers();
  const checkToolServersInvalidation = () => {
    const token = consumeToolServersInvalidation();
    if (!token) return null;
    toolServersRefreshGeneration += 1;
    toolServersRefreshPromise = null;
    setState({ toolServersLoaded: false, toolServersLoading: false });
    refreshAllowedToolServers({ force: true });
    return token;
  };
  const bindToolServersInvalidationListener = () => {
    if (toolServersInvalidationListenerBound) return;
    toolServersStorageListener = (event) => {
      if (event.key !== 'growchat_tool_servers_invalidate') return;
      checkToolServersInvalidation();
    };
    toolServersCustomListener = () => {
      checkToolServersInvalidation();
    };
    window.addEventListener('storage', toolServersStorageListener);
    window.addEventListener('growchat:tool-servers-invalidated', toolServersCustomListener);
    toolServersInvalidationListenerBound = true;
  };
  const unbindToolServersInvalidationListener = () => {
    if (!toolServersInvalidationListenerBound) return;
    if (toolServersStorageListener) {
      window.removeEventListener('storage', toolServersStorageListener);
    }
    if (toolServersCustomListener) {
      window.removeEventListener('growchat:tool-servers-invalidated', toolServersCustomListener);
    }
    toolServersStorageListener = null;
    toolServersCustomListener = null;
    toolServersInvalidationListenerBound = false;
  };
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

  const {
    setStreamingState,
    requestCancelStream,
  } = createChatStreamState({
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
  window.__growchatRequestCancel = requestCancelStream;

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

  const isTempChatId = (id) => String(id || '').startsWith('temp-');

  const {
    renderShareModal,
    openCitation,
    openArchivedModal,
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

  const getChatHandlers = createChatListHandlers({
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

  function scheduleSidebarEnhancements() {
    const run = () => {
      loadUserProfileFooter()
        .then(({ createUserProfileFooter }) => createUserProfileFooter())
        .then((footer) => {
          if (!footer) return;
          const footerMount = root.querySelector('#sidebar-footer');
          if (footerMount) {
            footerMount.replaceChildren(footer);
          } else if (sidebar) {
            sidebar.appendChild(footer);
          }
        })
        .catch(() => {});
    };

    if (typeof window.requestIdleCallback === 'function') {
      window.requestIdleCallback(run, { timeout: 2000 });
    } else {
      setTimeout(run, 0);
    }
  }

  scheduleSidebarEnhancements();

  let destroySearchModal;
  let destroyFilesModal;

  async function ensureSearchModal() {
    if (destroySearchModal) return;
    const { renderSearchModal } = await loadSearchModal();
    destroySearchModal = renderSearchModal(searchModalContainer, startNewChat, loadMessages);
  }

  async function ensureFilesModal() {
    if (destroyFilesModal) return;
    const { renderFilesModal } = await loadFilesModal();
    destroyFilesModal = renderFilesModal(filesModalContainer);
  }

  const inputComponent = renderMessageInput(messageInputContainer, sendMessage, async () => {
    await ensureFilesModal();
    setState({ showFiles: true });
  });
  bindToolServersInvalidationListener();
  checkToolServersInvalidation();
  void loadAllowedToolServers();

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
    const mainListChats = chats;
    const pinnedChats = mainListChats.filter((c) => Number(c.pinned) === 1);
    const regularChats = mainListChats.filter((c) => Number(c.pinned) !== 1);
    const groups = groupChatsByTime(regularChats);
    const groupLabels = {
      today: 'Today',
      yesterday: 'Yesterday',
      lastWeek: 'Last 7 Days',
      older: 'Older'
    };

    const fragment = document.createDocumentFragment();

    if (mainListChats.length === 0 && !state.chatsPagination?.loading) {
      const emptyState = document.createElement('div');
      emptyState.className = 'px-3 py-4 text-sm text-gray-400 sidebar-full-only';
      emptyState.textContent = 'No chat sessions yet.';
      fragment.appendChild(emptyState);
    }

    if (pinnedChats.length > 0) {
      const pinnedHeader = document.createElement('button');
      pinnedHeader.type = 'button';
      pinnedHeader.className = 'chat-group-header sidebar-full-only pinned flex items-center gap-1.5 cursor-pointer select-none hover:text-gray-600 transition-colors';
      pinnedHeader.innerHTML = '<svg class="w-3.5 h-3.5 transition-transform ' + (pinnedSectionCollapsed ? '-rotate-90' : '') + '" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true"><path fill-rule="evenodd" d="M5.23 7.21a.75.75 0 0 1 1.06.02L10 11.17l3.71-3.94a.75.75 0 1 1 1.1 1.02l-4.25 4.5a.75.75 0 0 1-1.1 0l-4.25-4.5a.75.75 0 0 1 .02-1.04Z" clip-rule="evenodd" /></svg><span>Pinned</span>';
      pinnedHeader.addEventListener('click', () => {
        pinnedSectionCollapsed = !pinnedSectionCollapsed;
        try {
          localStorage.setItem(PINNED_COLLAPSED_KEY, pinnedSectionCollapsed ? '1' : '0');
        } catch {
          // Ignore storage failures; UI still toggles for current session.
        }
        drawChats(state.chats, state.activeChatId);
      });
      fragment.appendChild(pinnedHeader);

      if (!pinnedSectionCollapsed) {
        const pinnedContainer = document.createElement('div');
        pinnedContainer.className = 'chat-group-items';
        pinnedContainer.appendChild(buildChatRows(pinnedChats, activeId, state.models, getChatHandlers));
        fragment.appendChild(pinnedContainer);
      }
    }

    Object.entries(groups).forEach(([key, groupChats]) => {
      if (groupChats.length === 0) return;

      const header = document.createElement('div');
      header.className = 'chat-group-header sidebar-full-only ' + key;
      header.textContent = groupLabels[key];
      fragment.appendChild(header);

      const itemsContainer = document.createElement('div');
      itemsContainer.className = 'chat-group-items';
      itemsContainer.appendChild(buildChatRows(groupChats, activeId, state.models, getChatHandlers));
      fragment.appendChild(itemsContainer);
    });

    if (state.chatsPagination?.loading) {
      const loadingRow = document.createElement('div');
      loadingRow.className = 'px-3 py-3 text-xs text-gray-400';
      loadingRow.textContent = 'Loading more chats...';
      fragment.appendChild(loadingRow);
    } else if (state.chatsPagination?.hasMore) {
      const sentinel = document.createElement('div');
      sentinel.id = 'chat-list-load-more';
      sentinel.className = 'h-6';
      fragment.appendChild(sentinel);
    }

    chatList.innerHTML = '';
    chatList.appendChild(fragment);
  }

  let loadMoreChatsPromise = null;

  async function loadMoreChats() {
    if (loadMoreChatsPromise || !state.chatsPagination?.hasMore || state.chatsPagination?.loading) {
      return loadMoreChatsPromise;
    }

    setState({ chatsPagination: { loading: true } });
    const { limit, offset } = state.chatsPagination;
    loadMoreChatsPromise = fetchChats({ limit, offset })
      .then((data) => {
        const nextChats = data.chats || [];
        const existingIds = new Set(state.chats.map((chat) => chat.id));
        const mergedChats = state.chats.concat(nextChats.filter((chat) => !existingIds.has(chat.id)));
        setState({
          chats: mergedChats,
          chatsPagination: {
            limit: data.limit || limit,
            offset: (data.offset || offset) + nextChats.length,
            hasMore: data.has_more === true,
            loading: false,
          },
        });
      })
      .catch((err) => {
        console.error('Failed to load more chats:', err);
        setState({ chatsPagination: { loading: false } });
      })
      .finally(() => {
        loadMoreChatsPromise = null;
      });

    return loadMoreChatsPromise;
  }

  let chatListLoadObserver = null;
  function refreshChatListObserver() {
    if (chatListLoadObserver) {
      chatListLoadObserver.disconnect();
      chatListLoadObserver = null;
    }

    if (!state.chatsPagination?.hasMore || !chatListContainerEl) return;
    const sentinel = root.querySelector('#chat-list-load-more');
    if (!sentinel) return;

    chatListLoadObserver = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          loadMoreChats();
        }
      });
    }, {
      root: chatListContainerEl,
      rootMargin: '120px 0px',
      threshold: 0.1,
    });

    chatListLoadObserver.observe(sentinel);
  }

  async function getAttachmentImageUrl(fileId) {
    const key = String(fileId || '');
    if (!key) return null;
    if (attachmentImageUrlCache.has(key)) {
      const cached = attachmentImageUrlCache.get(key);
      touchAttachmentCacheHelper(attachmentImageUrlCache, key, cached, MAX_ATTACHMENT_CACHE);
      return cached;
    }
    if (attachmentImagePromiseCache.has(key)) return attachmentImagePromiseCache.get(key);

    const promise = (async () => {
      const blob = await getFileBlob(key);
      const url = URL.createObjectURL(blob);
      touchAttachmentCacheHelper(attachmentImageUrlCache, key, url, MAX_ATTACHMENT_CACHE);
      attachmentImagePromiseCache.delete(key);
      return url;
    })().catch((err) => {
      attachmentImagePromiseCache.delete(key);
      throw err;
    });

    attachmentImagePromiseCache.set(key, promise);
    return promise;
  }

  function hydrateAttachmentImages(containerEl) {
    if (!containerEl) return;
    const nodes = containerEl.querySelectorAll('[data-attachment-image]');
    nodes.forEach((img) => {
      const id = img.getAttribute('data-attachment-image');
      if (!id || img.dataset.attachmentLoaded === '1') return;
      img.dataset.attachmentLoaded = '1';
      img.classList.add('opacity-0');
      getAttachmentImageUrl(id)
        .then((url) => {
          if (!url) return;
          img.src = url;
          img.classList.remove('opacity-0');
        })
        .catch(() => {
          img.classList.add('hidden');
        });
    });
  }

  function drawMessages(messages) {
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

    const editingMessages = state.ui.editingMessages || {};
    const pendingDeleteMessageKeys = state.ui.pendingDeleteMessageKeys || {};
    const firstUserMsg = projectedMessages.find((m) => m.role === 'user');
    const isDeletePending = (messageId) => Boolean(pendingDeleteMessageKeys[`${chatId}:${String(messageId)}`]);

    const isAtBottom = messagesContainer.scrollHeight - messagesContainer.scrollTop <= messagesContainer.clientHeight + 40;
    const streamingOverride = chatId ? streamingOverrideByChat.get(chatId) : null;

    // Generate HTML for each message
    const messagesHtml = projectedMessages.map((m, i) => {
      const msgId = m.id || `idx-${i}`;
      const hasOverride = Boolean(
        streamingOverride &&
        streamingOverride.targetMsgId &&
        String(streamingOverride.targetMsgId) === String(msgId)
      );
      const displayContent = hasOverride ? (streamingOverride.content || '') : m.content;
      const isStreaming = hasOverride || (m.role === 'assistant' && i === projectedMessages.length - 1 && !m.done);
      syncMessageBlocksForMessage(messageBlocksById, msgId, m.message_blocks, { isStreaming });
      syncToolCallsForMessage(toolCallsByMessageId, msgId, m.tool_calls, { isStreaming });
      const isEditing = msgId in editingMessages;
      const editingContent = editingMessages[msgId];
      const model = (state.models || []).find(mod => mod.id === m.model);
      const modelName = model?.name || formatModelDisplayName(m.model) || 'Assistant';
      const rounds = roundsByMessageId.get(String(msgId));
      const roundsHtml = rounds && rounds.total > 1 ? `
        <div class="flex items-center gap-1 text-gray-400 ml-1">
          <button type="button" data-round-prev="${msgId}" class="px-1 rounded hover:bg-gray-100 ${rounds.prevId ? '' : 'opacity-30 pointer-events-none'}">‹</button>
          <span class="text-[11px] min-w-[42px] text-center">${rounds.index} / ${rounds.total}</span>
          <button type="button" data-round-next="${msgId}" class="px-1 rounded hover:bg-gray-100 ${rounds.nextId ? '' : 'opacity-30 pointer-events-none'}">›</button>
        </div>
      ` : '';
      const showDelete = m.role === 'user' && (
        !firstUserMsg ||
        String(firstUserMsg.id || '') !== String(msgId) ||
        ((rounds?.total || 0) > 1)
      );
      const showDeleteAssistant = m.role === 'assistant' && ((rounds?.total || 0) > 1);
      const deletePending = isDeletePending(msgId);

      if (isEditing) {
        if (m.role === 'user') {
          return `
            <div class="flex justify-end w-full group py-2" data-message-id="${msgId}">
              <div class="flex flex-col items-end w-full max-w-[85%] gap-2">
                <textarea class="edit-message-textarea w-full bg-[#f4f4f4] rounded-2xl px-4 py-2 text-[15px] text-gray-800 outline-none focus:ring-2 focus:ring-black/5 resize-none font-sans border-none" data-message-id="${msgId}">${escapeHtml(editingContent)}</textarea>
                <div class="flex items-center gap-2 justify-end">
                  <button class="cancel-edit-btn px-3 py-1 text-xs font-medium rounded-lg border border-gray-200 hover:bg-gray-50" data-message-id="${msgId}">Cancel</button>
                  <button class="save-edit-btn px-3 py-1 text-xs font-medium rounded-lg bg-black text-white hover:bg-gray-800" data-message-id="${msgId}" data-index="${i}">Send</button>
                </div>
              </div>
            </div>
          `;
        }

        return `
          <div class="flex gap-4 w-full group py-4 first:pt-0 border-b border-gray-50 last:border-0" data-message-id="${msgId}">
            <div class="flex-shrink-0 w-7 h-7 rounded-lg bg-white border border-gray-100 flex items-center justify-center mt-1 overflow-hidden shadow-sm">
               <img src="/logo.png" alt="${escapeHtml(modelName)}" class="w-5 h-5 object-contain" />
            </div>
            <div class="flex-grow min-w-0 flex flex-col gap-2">
               <div class="font-bold text-sm text-gray-800 font-primary">${escapeHtml(modelName)}</div>
               <textarea class="edit-message-textarea w-full p-0 bg-transparent text-[15px] leading-[1.6] text-gray-800 outline-none resize-none font-sans border-none focus:ring-0" data-message-id="${msgId}">${escapeHtml(editingContent)}</textarea>
               <div class="flex items-center gap-2 justify-start mt-1">
                  <button class="cancel-edit-btn px-3 py-1 text-xs font-medium rounded-lg border border-gray-200 hover:bg-gray-50" data-message-id="${msgId}">Cancel</button>
                  <button class="save-copy-btn px-3 py-1 text-xs font-medium rounded-lg border border-gray-200 hover:bg-gray-50" data-message-id="${msgId}">Save as Copy</button>
                  <button class="save-edit-btn px-3 py-1 text-xs font-medium rounded-lg bg-black text-white hover:bg-gray-800" data-message-id="${msgId}" data-index="${i}">Save</button>
               </div>
            </div>
          </div>
        `;
      }

      if (m.role === 'user') {
        const attachmentHtml = renderAttachmentPills(m.attachments, 'end');
        return `
          <div class="flex justify-end w-full group py-2" data-message-id="${msgId}">
            <div class="flex flex-col items-end max-w-[85%] gap-1">
              ${attachmentHtml}
              <div class="bg-[#f4f4f4] rounded-2xl px-4 py-2 text-[15px] text-gray-800 transition-colors relative">
                ${escapeHtml(displayContent).replace(/\n/g, '<br/>')}
              </div>
              <div class="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                ${roundsHtml}
                <button data-edit-message="${msgId}" data-index="${i}" class="p-1 hover:text-gray-600 hover:bg-gray-50 rounded transition text-gray-400" title="Edit">
                  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/><path d="m15 5 4 4"/></svg>
                </button>
                <button data-copy-message="${i}" class="p-1 hover:text-gray-600 hover:bg-gray-50 rounded transition text-gray-400" title="Copy">
                  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>
                </button>
                ${showDelete ? `
                <button data-delete-message="${msgId}" data-index="${i}" class="p-1 hover:text-red-600 hover:bg-red-50 rounded transition text-gray-400 ${deletePending ? 'opacity-50 cursor-not-allowed pointer-events-none' : ''}" title="Delete" ${deletePending ? 'disabled aria-disabled="true"' : ''}>
                  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>
                </button>
                ` : ''}
              </div>
            </div>
          </div>
        `;
      }

      const citations = normalizeCitations(m.citations);
      const isError = m.status === 'error' || Boolean(m.error_message);
      const citationHtml = citations.length
        ? `<div class="mt-3 flex flex-wrap gap-2">${citations.map((id) => `<button data-citation-id="${escapeHtml(id)}" class="text-xs px-2 py-1 rounded-lg bg-gray-50 hover:bg-gray-100 text-gray-600 border border-gray-100">Source: ${escapeHtml(id.slice(0, 8))}</button>`).join('')}</div>`
        : '';

      const showRoundNav = (rounds?.total || 0) > 1;
      return `
        <div class="flex gap-4 w-full group py-4 first:pt-0 border-b border-gray-50 last:border-0" data-message-id="${msgId}">
          <div class="flex-shrink-0 w-7 h-7 rounded-lg bg-white border border-gray-100 flex items-center justify-center mt-1 overflow-hidden shadow-sm">
             <img src="/logo.png" alt="${escapeHtml(modelName)}" class="w-5 h-5 object-contain" />
          </div>
          <div class="flex-grow min-w-0 flex flex-col">
             <div class="font-bold text-sm mb-1 text-gray-800 font-primary">${escapeHtml(modelName)}</div>
              <div class="text-[15px] leading-[1.6] text-gray-800 prose prose-p:my-1 prose-pre:my-2 prose-headings:font-semibold max-w-none break-words font-sans" data-message-content="${msgId}" ${isError ? 'data-message-error="1"' : ''}>
                ${renderAssistantMessageBody({
                  messageId: msgId,
                  content: displayContent,
                  isError,
                  isStreaming,
                  stateMaps: {
                    errorExpandedByMessageId,
                    thinkingActiveByMessageId,
                    thinkingDurationByMessageId,
                    toolCallsByMessageId,
                    thinkingCollapsedByKey,
                    toolExpandedByKey,
                    messageBlocksById,
                  },
                })}
             </div>
             ${citationHtml}
             <div class="flex items-center gap-1 mt-3 -ml-2 text-gray-400">
                <div class="${showRoundNav ? 'opacity-100' : 'opacity-0'} transition-opacity">
                  ${roundsHtml}
                </div>
                <div class="flex items-center gap-1 ${isStreaming ? 'opacity-0 pointer-events-none' : 'opacity-0 group-hover:opacity-100'} transition-opacity">
                  <button data-edit-message="${msgId}" data-index="${i}" class="p-1.5 hover:text-gray-600 hover:bg-gray-50 rounded-md transition" title="Edit">
                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/><path d="m15 5 4 4"/></svg>
                  </button>
                  <button data-copy-message="${i}" class="p-1.5 hover:text-gray-600 hover:bg-gray-50 rounded-md transition" title="Copy">
                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>
                  </button>
                  <button data-retry-message="${msgId}" data-index="${i}" class="p-1.5 hover:text-gray-600 hover:bg-gray-50 rounded-md transition" title="Regenerate">
                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 0 1 15-6.7L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-15 6.7L3 16"/><path d="M3 21v-5h5"/></svg>
                  </button>
                  ${showDeleteAssistant ? `
                  <button data-delete-message="${msgId}" data-index="${i}" class="p-1.5 hover:text-red-600 hover:bg-red-50 rounded-md transition ${deletePending ? 'opacity-50 cursor-not-allowed pointer-events-none' : ''}" title="Delete" ${deletePending ? 'disabled aria-disabled="true"' : ''}>
                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>
                  </button>
                  ` : ''}
                </div>
             </div>
          </div>
        </div>
      `;
    }).join('');

    // Update innerHTML only once to minimize layout shifts
    messagesList.innerHTML = messagesHtml;
    hydrateAttachmentImages(messagesList);

    // Auto-resize and focus edit textareas
    messagesList.querySelectorAll('.edit-message-textarea').forEach(ta => {
      const resize = () => {
        ta.style.height = 'auto';
        ta.style.height = ta.scrollHeight + 'px';
      };
      ta.addEventListener('input', resize);
      resize();
      ta.focus();
      // Move cursor to end
      const val = ta.value;
      ta.value = '';
      ta.value = val;
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

  async function refreshShareState() {
    try {
      const data = await fetchSharedChats();
      sharedByChatId.clear();
      (data.chats || []).forEach((chat) => {
        if (chat?.id && chat?.share_id) {
          sharedByChatId.set(chat.id, {
            share_id: chat.share_id,
            share_url: `/s/${chat.share_id}`,
            chat_id: chat.id,
          });
        }
      });
    } catch {
      sharedByChatId.clear();
    }
  }

  async function loadChats() {
    const limit = state.chatsPagination?.offset || state.chatsPagination?.limit || 30;
    const data = await fetchChats({ limit, offset: 0 });
    const serverChats = data.chats || [];
    const tempChats = state.chats.filter((chat) => isTempChatId(chat?.id));
    const tempIds = new Set(tempChats.map((chat) => String(chat.id)));
    const chats = [...tempChats, ...serverChats.filter((chat) => !tempIds.has(String(chat.id)))];

    let nextActiveChatId = state.activeChatId;
    if (nextActiveChatId && !chats.some((chat) => chat.id === nextActiveChatId)) {
      nextActiveChatId = chats[0]?.id || null;
    }

    setState({
      chats,
      chatsPagination: {
        limit: data.limit || limit,
        offset: (data.offset || 0) + chats.length,
        hasMore: data.has_more === true,
        loading: false,
      },
      activeChatId: nextActiveChatId,
    });
  }

  const STREAM_STALE_MS = 5 * 60 * 1000;

  async function loadMessages(chatId, options = {}) {
    const { draw = true, updateActiveModel = draw, modelMode = 'keep', fallbackMessage = null } = options;
    if (!chatId) {
      if (draw) drawMessages([]);
      return;
    }
    if (isTempChatId(chatId)) {
      if (draw) {
        setState({ ui: { loadingChatId: null, streaming: false, streamingChatId: null } });
        const existing = state.messagesByChat[chatId] || [];
        drawMessages(existing);
      }
      return;
    }
    touchRecentChat(recentChatIds, chatId);
    schedulePrune();

    if (draw) {
      setState({ ui: { loadingChatId: chatId } });
      const existing = state.messagesByChat[chatId] || [];
      drawMessages(existing);
    }

    const res = await apiFetch(`/api/chats/${chatId}`, { cache: 'no-store' });
    if (!res.ok) {
      setState({ ui: { loadingChatId: null } });
      return;
    }
    const data = await res.json();

    const now = Date.now();
    const isMessageLive = (message) => {
      const status = String(message?.status || '');
      const isRunning = message?.role === 'assistant' && (status === 'streaming' || status === 'tool_running');
      if (!isRunning) return false;
      const createdAtMs = Number(message?.created_at || 0) * 1000;
      if (!createdAtMs) return false;
      return now - createdAtMs <= STREAM_STALE_MS;
    };

    let messages = (data.messages || []).map((m) => ({
      ...m,
      done: !isMessageLive(m),
    }));
    let appliedFallbackId = null;
    if (fallbackMessage?.id) {
      let resolvedFallback = fallbackMessage;
      const fallbackId = String(resolvedFallback.id);
      const hasExact = messages.some((msg) => String(msg.id) === fallbackId);
      const fallbackParent = resolvedFallback.parent_id ? String(resolvedFallback.parent_id) : '';
      const hasSibling = fallbackParent
        ? messages.some((msg) => msg.role === 'assistant' && String(msg.parent_id || '') === fallbackParent)
        : false;
      if (!hasExact && !hasSibling) {
        const parentExists = fallbackParent && messages.some((msg) => String(msg.id) === fallbackParent);
        if (!parentExists) {
          const lastUser = [...messages].reverse().find((msg) => msg.role === 'user');
          resolvedFallback = { ...resolvedFallback, parent_id: lastUser ? lastUser.id : null };
        }
        messages = [...messages, { ...resolvedFallback, done: true }];
        messages.sort((a, b) => Number(a?.created_at || 0) - Number(b?.created_at || 0));
        appliedFallbackId = String(resolvedFallback.id);
      }
    }

    const priorLeafId = currentLeafByChatId.get(chatId) || null;
    const resolvedLeafId = resolveConversationLeafId(messages, {
      currentMessageId: data.chat?.current_message_id || null,
      fallbackMessageId: appliedFallbackId,
      previousLeafId: priorLeafId,
    });
    if (resolvedLeafId) {
      currentLeafByChatId.set(chatId, String(resolvedLeafId));
    }

    const hasRunning = messages.some((m) => isMessageLive(m));

    const nextState = {
      messagesByChat: { ...state.messagesByChat, [chatId]: messages },
    };
    if (updateActiveModel) {
      let preferredModelId = state.activeModelId;
      if (modelMode === 'default') {
        preferredModelId =
          state.defaultModelId ||
          state.globalDefaultModelId ||
          data?.chat?.model ||
          state.activeModelId;
      } else if (modelMode === 'chat') {
        preferredModelId =
          data?.chat?.model ||
          state.activeModelId ||
          state.defaultModelId ||
          state.globalDefaultModelId;
      }
      nextState.activeModelId = preferredModelId;
    }
    nextState.ui = {
      loadingChatId: null,
      streaming: hasRunning,
      streamingChatId: hasRunning ? String(chatId) : null,
    };
    setState(nextState);

    if (draw) drawMessages(messages);
    if (hasRunning && state.activeChatId === chatId) {
      const runningId = streamSession.getRunningMessageId(messages);
      if (runningId) startResumeStream(chatId, runningId);
    }
  }

  function upsertChatFromEvent(chat) {
    if (!chat?.id) return;
    const nextChats = [...state.chats];
    const index = nextChats.findIndex((item) => String(item?.id) === String(chat.id));
    if (index >= 0) {
      const existing = nextChats[index];
      const merged = { ...existing, ...chat };
      if (existing?.title && existing.title !== 'New Chat' && chat.title === 'New Chat') {
        merged.title = existing.title;
      }
      nextChats[index] = merged;
    } else {
      nextChats.unshift(chat);
    }
    nextChats.sort((a, b) => {
      const updatedDelta = Number(b?.updated_at || 0) - Number(a?.updated_at || 0);
      if (updatedDelta !== 0) return updatedDelta;
      return Number(b?.created_at || 0) - Number(a?.created_at || 0);
    });
    setState({ chats: nextChats });
  }

  function updateChatTitleLocal(chatId, title) {
    setState((prev) => ({
      chats: prev.chats.map((chat) => (
        String(chat.id) === String(chatId)
          ? { ...chat, title, updated_at: Math.floor(Date.now() / 1000) }
          : chat
      )),
    }));
  }

  function upsertMessageFromEvent(chatId, message, { draw = true } = {}) {
    if (!chatId || !message?.id) return;
    const existingMessages = [...(state.messagesByChat[chatId] || [])];
    const index = existingMessages.findIndex((item) => String(item?.id) === String(message.id));
    const normalized = { ...message, done: true };
    if (index >= 0) {
      existingMessages[index] = { ...existingMessages[index], ...normalized };
    } else {
      existingMessages.push(normalized);
      existingMessages.sort((a, b) => Number(a?.created_at || 0) - Number(b?.created_at || 0));
    }
    currentLeafByChatId.set(chatId, String(message.id));
    setState({ messagesByChat: { ...state.messagesByChat, [chatId]: existingMessages } });
    if (draw && state.activeChatId === chatId) drawMessages(existingMessages);
  }

  const onRealtimeEvent = async (evt) => {
    const event = evt?.detail || {};
    const type = String(event.type || '');
    if (!type) return;
    const eventKey = [
      type,
      String(event.chat_id || ''),
      String(event.message_id || ''),
      String(event.user_id || ''),
      String(event.ts || ''),
      String(event?.data?.seq || ''),
    ].join('|');
    const now = Date.now();
    const seenAt = processedRealtimeEvents.get(eventKey);
    if (seenAt && now - seenAt < 120000) return;
    processedRealtimeEvents.set(eventKey, now);
    if (processedRealtimeEvents.size > 1000) {
      for (const [key, ts] of processedRealtimeEvents.entries()) {
        if (now - ts >= 120000) processedRealtimeEvents.delete(key);
      }
    }

    const isSameSession = !!event.origin_session_id && event.origin_session_id === clientSessionId;
    const eventChat = event?.data?.chat || null;
    const eventMessage = event?.data?.message || null;

    if (type.startsWith('chat.')) {
      if (type === 'chat.deleted') {
        const nextChats = state.chats.filter((chat) => String(chat?.id) !== String(event.chat_id || ''));
        const nextActiveChatId = state.activeChatId === event.chat_id ? (nextChats[0]?.id || null) : state.activeChatId;
        setState({ chats: nextChats, activeChatId: nextActiveChatId });
        if (!nextActiveChatId) drawMessages([]);
        return;
      }

      if (eventChat) {
        upsertChatFromEvent(eventChat);
        return;
      }

      const previousActiveChatId = state.activeChatId;
      await loadChats();
      if (isSameSession && activeStreamAbort && event.chat_id === previousActiveChatId) {
        return;
      }
      if (state.activeChatId && (event.chat_id === state.activeChatId || state.activeChatId !== previousActiveChatId)) {
        await loadMessages(state.activeChatId);
      }
      if (!state.activeChatId) {
        drawMessages([]);
      }
      return;
    }

    if (type === 'tool.status' || type === 'tool.result') {
      const chatId = event.chat_id;
      if (!chatId) return;
      const messageId = String(event.message_id || '');
      if (!messageId) return;
      const payload = event?.data || {};
      updateToolCallState(toolCallsByMessageId, messageBlocksById, messageId, payload);
      if (state.activeChatId === chatId) {
        updateMessageContentDom(messageId, state.messagesByChat[chatId]?.find((m) => String(m.id) === messageId)?.content || '', {
          isError: false,
          isStreaming: true,
        });
      }
      return;
    }

    if (type === 'message.cancelled') {
      if (eventChat) {
        upsertChatFromEvent(eventChat);
      } else {
        await loadChats();
      }

      if (eventMessage) {
        upsertMessageFromEvent(event.chat_id, eventMessage, { draw: event.chat_id === state.activeChatId });
      } else if (event.chat_id && event.chat_id === state.activeChatId) {
        await loadMessages(event.chat_id);
      }

      if (event.chat_id && event.chat_id === state.activeChatId) {
        streamingOverrideByChat.delete(event.chat_id);
        setStreamingState(event.chat_id, false);
        if (activeStreamAbort) {
          clearGlobalStreamAbort(activeStreamAbort);
          activeStreamAbort = null;
        }
      }
      return;
    }

    if ((type === 'message.created' || type === 'message.delta' || type === 'message.completed') && isSameSession && activeStreamAbort) {
      return;
    }

    if (type === 'message.delta') {
      if (!event.chat_id || event.chat_id !== state.activeChatId) return;
      // Avoid double-rendering deltas produced by this same browser session.
      if (activeStreamAbort && (!event.origin_session_id || event.origin_session_id === clientSessionId)) return;
      const delta = String(event?.data?.delta || '');
      if (!delta) return;

      const chatId = event.chat_id;
      const messageId = String(event.message_id || '');
      const model = event?.data?.model || state.activeModelId;
      const messages = [...(state.messagesByChat[chatId] || [])];
      const existingIdx = messageId
        ? messages.findIndex((m) => String(m?.id || '') === messageId)
        : -1;

      if (existingIdx >= 0) {
        const existing = messages[existingIdx] || {};
        messages[existingIdx] = {
          ...existing,
          id: messageId,
          role: 'assistant',
          model: existing.model || model,
          content: `${existing.content || ''}${delta}`,
          done: false,
        };
      } else {
        messages.push({
          id: messageId || `remote-${Date.now()}`,
          role: 'assistant',
          model,
          content: delta,
          done: false,
        });
      }

      setState({ messagesByChat: { ...state.messagesByChat, [chatId]: messages } });
      drawMessages(messages);
      return;
    }

    if (type === 'message.created' || type === 'message.completed') {
      if (eventChat) {
        upsertChatFromEvent(eventChat);
      } else {
        await loadChats();
      }

      if (eventMessage) {
        if (isSameSession && eventMessage?.role === 'user') {
          matchPendingTempMessage(event.chat_id, eventMessage);
        }
        upsertMessageFromEvent(event.chat_id, eventMessage, { draw: event.chat_id === state.activeChatId });
        return;
      }

      if (event.chat_id && event.chat_id === state.activeChatId) {
        await loadMessages(event.chat_id);
      }
    }
  };
  window.addEventListener('growchat:realtime', onRealtimeEvent);

  function startNewChat() {
    const activeTempId = state.activeChatId && isTempChatId(state.activeChatId) ? state.activeChatId : null;
    if (activeTempId && (state.messagesByChat[activeTempId] || []).length === 0) {
      setState({ activeChatId: activeTempId, newChatDraft: '' });
      if (state.newChatToolSelection !== null) {
        setDraftToolNames(activeTempId, state.newChatToolSelection);
        setDraftToolNames(null, null);
      }
      syncChatUrl(activeTempId);
      drawMessages([]);
      return;
    }

    const tempChat = buildTempChat();
    if (state.newChatToolSelection !== null) {
      setDraftToolNames(tempChat.id, state.newChatToolSelection);
      setDraftToolNames(null, null);
    }
    setState((prev) => ({
      chats: [tempChat, ...pruneTempChats(prev.chats)],
      activeChatId: tempChat.id,
      activeModelId: prev.activeModelId || prev.defaultModelId || prev.globalDefaultModelId || tempChat.model,
      newChatDraft: '',
    }));
    syncChatUrl(tempChat.id);
    drawMessages([]);
  }

  async function sendSingleMessage(text, hooks = {}, options = {}) {
    return chatMessageFlow?.sendSingleMessage?.(text, hooks, options);
    let chatId = state.activeChatId;
    let tempChatId = null;
    let autoTitle = null;
    const isTempChat = chatId && isTempChatId(chatId);
    const hadMessagesBefore = chatId ? (state.messagesByChat[chatId] || []).length > 0 : false;

    if (!chatId) {
      const tempChat = buildTempChat();
      tempChatId = tempChat.id;
      if (state.newChatToolSelection !== null) {
        setDraftToolNames(tempChatId, state.newChatToolSelection);
        setDraftToolNames(null, null);
      }

      setState((prev) => ({
        chats: [tempChat, ...pruneTempChats(prev.chats)],
        activeChatId: tempChatId,
        activeModelId: prev.activeModelId || prev.defaultModelId || prev.globalDefaultModelId || tempChat.model,
      }));

      chatId = tempChatId;
      syncChatUrl(tempChatId);
    } else if (isTempChat) {
      tempChatId = chatId;
      const exists = state.chats.some((chat) => String(chat.id) === String(chatId));
      if (!exists) {
        const tempChat = buildTempChat(chatId);
        setState((prev) => ({
          chats: [tempChat, ...pruneTempChats(prev.chats)],
          activeChatId: chatId,
          activeModelId: prev.activeModelId || prev.defaultModelId || prev.globalDefaultModelId || tempChat.model,
        }));
      }
      syncChatUrl(chatId);
    }

    if (!state.attachmentsByChat?.[chatId] && (state.newChatAttachments || []).length > 0) {
      setState({
        attachmentsByChat: {
          ...(state.attachmentsByChat || {}),
          [chatId]: state.newChatAttachments,
        },
        newChatAttachments: [],
      });
    }

    if (tempChatId) {
      const existingChat = state.chats.find((chat) => String(chat.id) === String(chatId));
      if (!hadMessagesBefore && (!existingChat?.title || existingChat.title === 'New Chat')) {
        const snippet = String(text).trim().replace(/\s+/g, ' ').slice(0, 60);
        if (snippet) {
          autoTitle = snippet;
          updateChatTitleLocal(chatId, snippet);
        }
      }
    }

    const branchParentId = currentLeafByChatId.get(chatId) || null;
    const tempUserId = `temp-user-${Date.now()}`;
    const tempAssistantId = `temp-assistant-${Date.now()}`;
    const nowTs = Math.floor(Date.now() / 1000);
    let localMessages = [...(state.messagesByChat[chatId] || [])];
    const draftAttachments = getDraftAttachments(chatId);
    const tempUserMessage = {
      id: tempUserId,
      role: 'user',
      content: text,
      model: state.activeModelId,
      attachments: draftAttachments,
      parent_id: branchParentId,
      created_at: nowTs,
      done: true,
    };
    localMessages.push(tempUserMessage);
    registerPendingTempMessage(chatId, tempUserMessage);
    setBranchSelection(chatId, branchParentId, tempUserId);
    localMessages.push({
      id: tempAssistantId,
      role: 'assistant',
      content: '',
      model: state.activeModelId,
      parent_id: tempUserId,
      created_at: nowTs + 1,
      done: false,
    });
    registerPendingTempMessage(chatId, {
      id: tempAssistantId,
      role: 'assistant',
      content: '',
      parent_id: tempUserId,
      created_at: nowTs + 1,
    });

    // Ensure branch projection follows the optimistic in-flight path.
    currentLeafByChatId.set(chatId, tempAssistantId);

    setState((prev) => ({ messagesByChat: { ...prev.messagesByChat, [chatId]: localMessages } }));
    if (state.activeChatId === chatId) drawMessages(localMessages);

    if (tempChatId) {
    const modelToUse = state.activeModelId || state.defaultModelId || state.globalDefaultModelId;
      const payload = modelToUse ? { model: modelToUse } : {};
      const res = await apiFetch('/api/chats', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        // Roll back optimistic chat on failure.
        setState((prev) => {
          const nextChats = prev.chats.filter((c) => String(c.id) !== String(tempChatId));
          const nextActiveChatId = prev.activeChatId === tempChatId ? (nextChats[0]?.id || null) : prev.activeChatId;
          const nextMessagesByChat = { ...prev.messagesByChat };
          delete nextMessagesByChat[tempChatId];
          return { chats: nextChats, activeChatId: nextActiveChatId, messagesByChat: nextMessagesByChat };
        });
        hooks.onFinished?.();
        return;
      }
      const data = await res.json();
      const realChatId = data.chat.id;

      setState((prev) => {
        let replaced = false;
        let nextChats = prev.chats.map((c) => {
          if (String(c.id) === String(tempChatId)) {
            replaced = true;
            const nextChat = { ...data.chat };
            if (c.title && c.title !== 'New Chat' && data.chat.title === 'New Chat') {
              nextChat.title = c.title;
            }
            return nextChat;
          }
          return c;
        });
        if (!replaced) {
          nextChats = [data.chat, ...nextChats];
        }
        // De-dupe by id (realtime chat.created can arrive before this response).
        const seen = new Set();
        const deduped = [];
        for (const chat of nextChats) {
          const key = String(chat.id);
          if (seen.has(key)) continue;
          seen.add(key);
          deduped.push(chat);
        }

        const nextMessagesByChat = { ...prev.messagesByChat };
        if (nextMessagesByChat[tempChatId]) {
          nextMessagesByChat[realChatId] = nextMessagesByChat[tempChatId];
          delete nextMessagesByChat[tempChatId];
        }
        const nextAttachmentsByChat = { ...(prev.attachmentsByChat || {}) };
        if (nextAttachmentsByChat[tempChatId]) {
          nextAttachmentsByChat[realChatId] = nextAttachmentsByChat[tempChatId];
          delete nextAttachmentsByChat[tempChatId];
        }
        const nextToolSelectionsByChat = { ...(prev.toolSelectionsByChat || {}) };
        if (nextToolSelectionsByChat[tempChatId] !== undefined) {
          nextToolSelectionsByChat[realChatId] = nextToolSelectionsByChat[tempChatId];
          delete nextToolSelectionsByChat[tempChatId];
        }
        return {
          chats: deduped,
          activeChatId: realChatId,
          activeModelId: prev.activeModelId || data.chat.model || prev.defaultModelId || prev.globalDefaultModelId,
          messagesByChat: nextMessagesByChat,
          attachmentsByChat: nextAttachmentsByChat,
          toolSelectionsByChat: nextToolSelectionsByChat,
        };
      });

      if (currentLeafByChatId.has(tempChatId)) {
        const leafId = currentLeafByChatId.get(tempChatId);
        currentLeafByChatId.delete(tempChatId);
        currentLeafByChatId.set(realChatId, leafId);
      }
      if (streamingOverrideByChat.has(tempChatId)) {
        const override = streamingOverrideByChat.get(tempChatId);
        streamingOverrideByChat.delete(tempChatId);
        streamingOverrideByChat.set(realChatId, override);
      }

      chatId = realChatId;
      syncChatUrl(realChatId);

      if (autoTitle) {
        apiFetch(`/api/chats/${realChatId}`, {
          method: 'PUT',
          body: JSON.stringify({ title: autoTitle })
        }).catch(() => {});
      }
    }

    if (!autoTitle) {
      const existingChat = state.chats.find((chat) => String(chat.id) === String(chatId));
      if (!hadMessagesBefore && (!existingChat?.title || existingChat.title === 'New Chat')) {
        const snippet = String(text).trim().replace(/\s+/g, ' ').slice(0, 60);
        if (snippet) {
          autoTitle = snippet;
          updateChatTitleLocal(chatId, snippet);
          if (!String(chatId).startsWith('temp-')) {
            apiFetch(`/api/chats/${chatId}`, {
              method: 'PUT',
              body: JSON.stringify({ title: snippet })
            }).catch(() => {});
          }
        }
      }
    }

    const controller = new AbortController();
    activeStreamAbort = () => controller.abort();
    setGlobalStreamAbort(activeStreamAbort);
    hooks.onAbortable?.(activeStreamAbort);

    let res;
    setStreamingState(chatId, true);
    try {
      const attachmentIds = (draftAttachments || [])
        .map((item) => item?.id)
        .filter(Boolean);
      const payload = {
        message: text,
        model: state.activeModelId || undefined,
        ...(attachmentIds.length ? { attachments: attachmentIds } : {}),
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
          setState((prev) => ({ messagesByChat: { ...prev.messagesByChat, [chatId]: localMessages } }));
          if (state.activeChatId === chatId) drawMessages(localMessages);
        }
      } else {
        applyAssistantErrorMessage(chatId, tempAssistantId, 'Failed to connect to the server.');
      }
      return;
    }

    if (!res.ok || !res.body) {
      setStreamingState(chatId, false);
      let errorText = 'Failed to connect to the server.';
      try {
        const errPayload = await res.json();
        errorText = formatApiErrorMessage(errPayload, errorText);
      } catch {}
      applyAssistantErrorMessage(chatId, tempAssistantId, errorText);
      return;
    }

    if (draftAttachments.length > 0) {
      setDraftAttachments(chatId, []);
    }

    let assistantMessageId = tempAssistantId;
    let errorMessage = null;
    let errorActive = false;
    let assistantText = '';
    await consumeSseTextStream(res.body, {
      onEvent: (payload) => {
      if (payload?.event === 'start' && payload?.user_message_id) {
        replaceTempMessageId(chatId, tempUserId, String(payload.user_message_id));
      }
      if (payload?.event === 'start' && payload?.message_id) {
        assistantMessageId = String(payload.message_id);
        replaceTempMessageId(chatId, tempAssistantId, assistantMessageId);
        if (!thinkingActiveByMessageId.has(String(assistantMessageId))) {
          thinkingActiveByMessageId.set(String(assistantMessageId), true);
        }
        if (!thinkingStartByMessageId.has(String(assistantMessageId))) {
          thinkingStartByMessageId.set(String(assistantMessageId), Date.now());
        }
        applyAssistantText(true);
      }
      if (payload?.event === 'reasoning_start') {
        if (!thinkingStartByMessageId.has(String(assistantMessageId))) {
          thinkingStartByMessageId.set(String(assistantMessageId), Date.now());
        }
        thinkingActiveByMessageId.set(String(assistantMessageId), true);
        ensureThinkingBlock(messageBlocksById, assistantMessageId);
        applyAssistantText(true);
      }
      if (payload?.event === 'reasoning_delta') {
        const delta = String(payload.delta || '');
        if (delta) {
          appendBlock(messageBlocksById, assistantMessageId, 'thinking', delta);
          thinkingActiveByMessageId.set(String(assistantMessageId), true);
          applyAssistantText(true);
        }
      }
      if (payload?.event === 'reasoning_end') {
        const duration = Number(payload.duration_ms);
        if (Number.isFinite(duration) && duration > 0) {
          thinkingDurationByMessageId.set(String(assistantMessageId), duration);
        }
        thinkingActiveByMessageId.delete(String(assistantMessageId));
      }
      if (payload?.event === 'tool_status' || payload?.event === 'tool_result') {
        const targetId = resolveTempMessageId(chatId, payload?.message_id || assistantMessageId);
        updateToolCallState(toolCallsByMessageId, messageBlocksById, targetId, payload);
        applyAssistantText();
      }
      if (payload?.error) {
        errorMessage = payload.message || payload.error || 'LLM request failed';
        errorActive = true;
        const label = `Error: ${errorMessage}`;
        assistantText = assistantText ? `${assistantText}\n\n${label}` : label;
        applyAssistantText();
      }
      notePayloadSeq(payload, assistantMessageId);
      },
      onDelta: (delta) => {
        if (!delta) return;
        assistantText += delta;
        appendBlock(messageBlocksById, assistantMessageId, 'text', delta);
        applyAssistantText();
      },
    });

    function applyAssistantText(streaming = true) {
      // 1. Update streaming override for immediate projection rendering
      streamingOverrideByChat.set(chatId, {
        targetMsgId: assistantMessageId,
        content: assistantText,
      });

      // 2. ALSO update global state so drawMessages(messagesByChat[chatId]) sees the new content
      // and keeps other messages visible.
      const currentMessages = [...(state.messagesByChat[chatId] || [])];
      const targetIdx = currentMessages.findIndex(m => String(m.id) === String(assistantMessageId));
      if (targetIdx >= 0) {
        currentMessages[targetIdx] = { 
          ...currentMessages[targetIdx], 
          content: assistantText,
          status: errorActive ? 'error' : currentMessages[targetIdx].status,
          error_message: errorActive ? errorMessage : currentMessages[targetIdx].error_message,
        };
        setState((prev) => ({ 
          messagesByChat: { ...prev.messagesByChat, [chatId]: currentMessages } 
        }));
      }

      if (state.activeChatId === chatId) {
        updateMessageContentDom(assistantMessageId, assistantText, { isError: errorActive, isStreaming: streaming });
      }
    }

    try {
      const startedAt = thinkingStartByMessageId.get(String(assistantMessageId));
      if (startedAt && !thinkingDurationByMessageId.has(String(assistantMessageId))) {
        thinkingDurationByMessageId.set(String(assistantMessageId), Date.now() - startedAt);
      }
      thinkingActiveByMessageId.delete(String(assistantMessageId));
      applyAssistantText(false);
      streamingOverrideByChat.delete(chatId);
      const fallback = buildFallbackAssistantMessage(chatId, assistantMessageId, {
        content: assistantText,
        errorActive,
        errorMessage,
        model: state.activeModelId,
        parentId: resolveTempMessageId(chatId, tempUserId),
      });
      await loadMessages(chatId, {
        draw: state.activeChatId === chatId,
        updateActiveModel: state.activeChatId === chatId,
        fallbackMessage: fallback,
      });
    } catch (err) {
      if (err?.name !== 'AbortError') {
        console.error('Stream error:', err);
              if (!errorActive) {
                errorMessage = String(err?.message || 'LLM request failed');
                errorActive = true;
                assistantText = '';
                applyAssistantText(false);
              }
        const fallback = buildFallbackAssistantMessage(chatId, assistantMessageId, {
          content: assistantText,
          errorActive,
          errorMessage,
          model: state.activeModelId,
          parentId: resolveTempMessageId(chatId, tempUserId),
        });
        await loadMessages(chatId, {
          draw: state.activeChatId === chatId,
          updateActiveModel: state.activeChatId === chatId,
          fallbackMessage: fallback,
        });
      }
    } finally {
      streamingOverrideByChat.delete(chatId);
      clearGlobalStreamAbort(activeStreamAbort);
      activeStreamAbort = null;
      setStreamingState(chatId, false);
      hooks.onFinished?.();
    }
  }

  async function sendMessage(text, hooks = {}, options = {}) {
    const prompt = String(text || '').trim();
    if (!prompt) {
      hooks.onFinished?.();
      return;
    }
    return chatMessageFlow?.sendMessage?.(prompt, hooks, options);
  }

  const onToggleSidebar = () => {
    if (state.isMobile) {
      setState({ showSidebar: !state.showSidebar });
    } else {
      // On desktop, toggle between expanded and slim
      // If it's hidden, show it first
      if (!state.showSidebar) {
        setState({ showSidebar: true });
      } else {
        setState({ sidebarCollapsed: !state.sidebarCollapsed });
      }
    }
  };
  const onOpenSearch = async () => {
    await ensureSearchModal();
    setState({ showSearch: true });
  };
  const onNewChat = () => startNewChat();
  const onHome = () => {
    window.history.pushState({}, '', '/');
    setState({ activeChatId: null });
    syncChatUrl(null);
    drawMessages([]);
  };
  const onOpenArchivedEvent = () => openArchivedModal();
  const onPopState = async () => {
    const match = window.location.pathname.match(/^\/c\/([^/]+)$/);
    const routeChatId = match ? decodeURIComponent(match[1]) : null;

    if (!routeChatId) {
      setState({ activeChatId: null });
      drawMessages([]);
      return;
    }

    const exists = state.chats.some((chat) => chat.id === routeChatId);
    if (!exists) {
      syncChatUrl(state.activeChatId, { replace: true });
      return;
    }

    setState({ activeChatId: routeChatId });
    await loadMessages(routeChatId, { modelMode: 'default' });
  };

  sidebarHomeBtn?.addEventListener('click', onHome);
  toggleSidebarMobile.addEventListener('click', onToggleSidebar);
  toggleSidebarDesktop.addEventListener('click', onToggleSidebar);
  openSearchBtn.addEventListener('click', onOpenSearch);
  newChatBtn.addEventListener('click', onNewChat);

  messagesList.addEventListener('click', (event) => {
    const thinkingTarget = event.target?.closest?.('[data-thinking-toggle]');
    if (thinkingTarget) {
      const key = thinkingTarget.getAttribute('data-thinking-toggle');
      if (!key) return;
      const isCollapsed = thinkingCollapsedByKey.get(key) ?? false;
      const next = !isCollapsed;
      thinkingCollapsedByKey.set(key, next);
      const body = messagesList.querySelector(`[data-thinking-body="${key}"]`);
      const chevron = messagesList.querySelector(`[data-thinking-chevron="${key}"]`);
      if (body) body.classList.toggle('hidden', next);
      if (chevron) {
        chevron.classList.toggle('-rotate-90', next);
        chevron.classList.toggle('rotate-0', !next);
      }
      return;
    }
    const target = event.target?.closest?.('[data-tool-toggle]');
    if (!target) return;
    const key = target.getAttribute('data-tool-toggle');
    if (!key) return;
    const expanded = toolExpandedByKey.get(key) === true;
    const next = !expanded;
    toolExpandedByKey.set(key, next);
    const body = messagesList.querySelector(`[data-tool-body="${key}"]`);
    const chevron = messagesList.querySelector(`[data-tool-chevron="${key}"]`);
    if (body) body.classList.toggle('hidden', !next);
    if (chevron) {
      chevron.classList.toggle('-rotate-90', !next);
      chevron.classList.toggle('rotate-0', next);
    }
  });
  window.addEventListener('growchat:open-archived', onOpenArchivedEvent);
  window.addEventListener('popstate', onPopState);

  const destroyChatFileEvents = bindChatFileEvents({
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

  let isChatsCollapsed = false;
  toggleChatsBtn.addEventListener('click', () => {
    isChatsCollapsed = !isChatsCollapsed;
    if (isChatsCollapsed) {
      chatListContainer.classList.add('hidden');
      toggleChatsIcon.classList.add('rotate-180');
    } else {
      chatListContainer.classList.remove('hidden');
      toggleChatsIcon.classList.remove('rotate-180');
    }
  });

  headerMenuBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    headerMenuDropdown.classList.toggle('hidden');
  });

  headerMenuDropdown.addEventListener('click', async (e) => {
    const actionBtn = e.target.closest('button[data-action]');
    if (!actionBtn || !state.activeChatId) return;
    
    const action = actionBtn.dataset.action;
    const chatId = state.activeChatId;
    const chat = state.chats.find(c => c.id === chatId);
    const handlers = getChatHandlers(chat);

    if (action === 'share') handlers.share(chatId);
    else if (action === 'rename') handlers.rename(chatId);
    else if (action === 'archive') handlers.archive(chatId);
    else if (action === 'delete') handlers.delete(chatId);

    headerMenuDropdown.classList.add('hidden');
  });

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
      touchRecentChat(recentChatIds, currentState.activeChatId);
      schedulePrune();
    }
    lastActiveChatId = currentState.activeChatId;

    headerMenuBtn.disabled = !currentState.activeChatId || isTempChatId(currentState.activeChatId);
    drawChats(currentState.chats, currentState.activeChatId);
    refreshChatListObserver();
  });

  sidebarBackdrop.addEventListener('click', () => setState({ showSidebar: false }));

  const onDocumentClickForHeaderMenu = (e) => {
    if (!headerMenuBtn.contains(e.target) && !headerMenuDropdown.contains(e.target)) {
      headerMenuDropdown.classList.add('hidden');
    }
  };
  document.addEventListener('click', onDocumentClickForHeaderMenu);

  drawChats(state.chats, state.activeChatId);
  refreshChatListObserver();

  requestAnimationFrame(() => {
    drawChats(state.chats, state.activeChatId);
    refreshChatListObserver();
  });

  if (state.activeChatId) {
    loadMessages(state.activeChatId, { modelMode: 'default' }).finally(() => {
      drawChats(state.chats, state.activeChatId);
      refreshChatListObserver();
    });
  }

  const getRunningMessageId = (messages = []) => streamSession.getRunningMessageId(messages);

  function stopStreamPolling(chatId) {
    streamSession.stopStreamPolling(chatId);
  }

  function startStreamPolling(chatId, messageId) {
    if (!chatId || !messageId) return;
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
    return chatMessageFlow?.startResumeStream?.(chatId, messageId);
  }

  return () => {
    if (activeStreamAbort) activeStreamAbort();
    streamSession.dispose();
    if (chatListLoadObserver) chatListLoadObserver.disconnect();
    unsubscribe();
    clearAttachmentCacheHelper(attachmentImageUrlCache, attachmentImagePromiseCache);
    destroySearchModal?.();
    destroyFilesModal?.();
    destroyModelSelector?.();
    destroySidebar?.();
    inputComponent?.destroy?.();
    destroyPlaceholder?.();
    sidebarHomeBtn?.removeEventListener('click', onHome);
    toggleSidebarMobile.removeEventListener('click', onToggleSidebar);
    toggleSidebarDesktop.removeEventListener('click', onToggleSidebar);
    openSearchBtn.removeEventListener('click', onOpenSearch);
    newChatBtn.removeEventListener('click', onNewChat);
    window.removeEventListener('growchat:open-archived', onOpenArchivedEvent);
    destroyChatFileEvents?.();
    window.removeEventListener('growchat:realtime', onRealtimeEvent);
    window.removeEventListener('popstate', onPopState);
    unbindToolServersInvalidationListener();
    root.__cleanup = null;
  };
}



