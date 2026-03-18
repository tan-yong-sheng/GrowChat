import {
  apiFetch,
  fetchArchivedChats,
  fetchChats,
  fetchSharedChats,
  getFileBlob,
  getFileContent,
  getFileMetadata,
  getClientSessionId,
  shareChat,
  toggleArchiveChat,
  unshareChat,
  uploadFile,
} from './api.js';
import { escapeHtml, renderMessageContent, SseLineParser, showToast, showToastProgress } from './utils.js';
import { state, setState, subscribe } from './store.js';
import { renderPlaceholder } from './components/chat-placeholder.js';
import { renderMessageInput } from './components/message-input.js';
import { renderModelSelector } from './components/model-selector.js';
import { renderSidebar } from './components/sidebar.js';
import { createChatRow } from './components/chat-row.js';
import { groupChatsByTime } from './utils/time-grouping.js';
// Lazy-loaded components to reduce initial network requests.
let searchModalPromise = null;
let filesModalPromise = null;
let iconPickerPromise = null;
let tagModalPromise = null;
let userProfileFooterPromise = null;
let folderSidebarPromise = null;

const loadSearchModal = () => (searchModalPromise ??= import('./components/search-modal.js'));
const loadFilesModal = () => (filesModalPromise ??= import('./components/files-modal.js'));
const loadIconPickerModal = () => (iconPickerPromise ??= import('./components/icon-picker-modal.js'));
const loadTagModal = () => (tagModalPromise ??= import('./components/tag-modal.js'));
const loadUserProfileFooter = () => (userProfileFooterPromise ??= import('./components/user-profile-footer.js'));
const loadFolderSidebar = () => (folderSidebarPromise ??= import('./components/folder-sidebar.js'));

const attachmentImageUrlCache = new Map();
const attachmentImagePromiseCache = new Map();

function normalizeCitations(raw) {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw.map(String).filter(Boolean);
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed.map(String).filter(Boolean);
    } catch {
      return [];
    }
  }
  return [];
}

const isTempMessageId = (id) => String(id || '').startsWith('temp-');

function safeTime(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function buildChatRows(list, activeId, models, getChatHandlers) {
  const fragment = document.createDocumentFragment();
  list.forEach((chat) => {
    const handlers = getChatHandlers(chat);
    const model = (models || []).find((m) => m.id === chat.model);
    const chatWithModelName = { ...chat, modelName: model?.name || chat.model || 'Default' };
    const row = createChatRow(chatWithModelName, handlers);
    if (chat.id === activeId) {
      row.classList.add('active');
    }
    fragment.appendChild(row);
  });
  return fragment;
}

function projectConversation(messages, preferredLeafId, branchSelectionMap) {
  const all = Array.isArray(messages) ? messages.map((m) => ({ ...m })) : [];
  if (all.length === 0) return { visible: [], roundsByMessageId: new Map() };

  all.sort((a, b) => safeTime(a.created_at) - safeTime(b.created_at));

  // Legacy compatibility: only backfill parent links when the entire chat
  // has no parent_id data (old linear schema). Do not rewrite valid branch roots.
  const hasAnyParent = all.some((m) => Boolean(m.parent_id));
  if (!hasAnyParent) {
    for (let i = 1; i < all.length; i += 1) {
      all[i].parent_id = all[i - 1].id || null;
    }
  }
  const byId = new Map(all.map((m) => [String(m.id || ''), m]));
  const ROOT = '__root__';
  const childrenByParent = new Map();
  for (const msg of all) {
    const parentKey = msg.parent_id ? String(msg.parent_id) : ROOT;
    if (!childrenByParent.has(parentKey)) childrenByParent.set(parentKey, []);
    childrenByParent.get(parentKey).push(msg);
  }
  for (const siblings of childrenByParent.values()) {
    siblings.sort((a, b) => safeTime(a.created_at) - safeTime(b.created_at));
  }

  const fallbackLeaf = all[all.length - 1];
  const leaf = preferredLeafId && byId.has(String(preferredLeafId))
    ? byId.get(String(preferredLeafId))
    : fallbackLeaf;
  const preferredAncestry = new Set();
  let cursor = leaf;
  let guard = 0;
  while (cursor && guard < all.length + 2) {
    guard += 1;
    preferredAncestry.add(String(cursor.id));
    cursor = cursor.parent_id ? byId.get(String(cursor.parent_id)) : null;
  }

  const visible = [];
  let parentKey = ROOT;
  guard = 0;
  while (guard < all.length + 2) {
    guard += 1;
    const siblings = childrenByParent.get(parentKey) || [];
    if (!siblings.length) break;

    const selected = branchSelectionMap.get(parentKey);
    let chosen = selected ? siblings.find((s) => String(s.id) === String(selected)) : null;
    if (!chosen) {
      chosen = siblings.find((s) => preferredAncestry.has(String(s.id))) || siblings[siblings.length - 1];
    }
    visible.push(chosen);
    parentKey = String(chosen.id);
  }

  const roundsByMessageId = new Map();
  for (const msg of visible) {
    const parent = msg.parent_id ? String(msg.parent_id) : ROOT;
    const siblings = childrenByParent.get(parent) || [msg];
    const index = siblings.findIndex((s) => String(s.id) === String(msg.id));
    roundsByMessageId.set(String(msg.id), {
      total: siblings.length,
      index: index >= 0 ? index + 1 : 1,
      prevId: index > 0 ? String(siblings[index - 1].id) : null,
      nextId: index >= 0 && index < siblings.length - 1 ? String(siblings[index + 1].id) : null,
      parentKey: parent,
    });
  }

  return { visible, roundsByMessageId };
}

export function renderChat(container) {
  if (typeof container.__cleanup === 'function') {
    container.__cleanup();
  }

  container.innerHTML = `
    <div class="flex h-full w-full bg-white overflow-hidden text-[#171717] font-sans">
      <div id="sidebar-backdrop" class="fixed inset-0 bg-black/20 backdrop-blur-sm z-30 transition-opacity duration-300 hidden md:hidden"></div>

      <aside id="sidebar" class="fixed md:relative h-screen md:h-[100dvh] flex-shrink-0 bg-[#f9f9f9] border-r border-gray-100 flex flex-col transition-all duration-500 ease-in-out z-40 -ml-[260px] md:ml-0 overflow-visible group/sidebar">
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

        <div id="sidebar-footer" class="mt-auto w-full bg-[#f9f9f9]"></div>
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
  const currentLeafByChatId = new Map();
  const branchSelectionByChat = new Map();
  const setStreamingState = (chatId, streaming) => {
    if (!chatId) return;
    setState((prev) => ({
      ui: {
        ...prev.ui,
        streaming,
        streamingChatId: streaming
          ? String(chatId)
          : (prev.ui.streamingChatId === String(chatId) ? null : prev.ui.streamingChatId),
      }
    }));
  };
  const streamingOverrideByChat = new Map();
  const tempMessageIdMapByChat = new Map();
  const pendingTempMessagesByChat = new Map();
  const pendingTempResolversByChat = new Map();
  const thinkingStartByMessageId = new Map();
  const thinkingDurationByMessageId = new Map();
  const thinkingCollapsedByKey = new Map();
  const thinkingActiveByMessageId = new Map();
  const errorExpandedByMessageId = new Map();
  const toolCallsByMessageId = new Map();
  const toolExpandedByKey = new Map();
  const messageBlocksById = new Map();
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
  const PINNED_COLLAPSED_KEY = 'growchat_pinned_section_collapsed';
  let pinnedSectionCollapsed = false;
  try {
    pinnedSectionCollapsed = localStorage.getItem(PINNED_COLLAPSED_KEY) === '1';
  } catch {
    pinnedSectionCollapsed = false;
  }

  const destroyModelSelector = renderModelSelector(modelSelectorContainer);
  const destroySidebar = renderSidebar(sidebar, root);

  const mapTempMessageId = (chatId, tempId, realId) => {
    if (!chatId || !tempId || !realId || tempId === realId) return;
    const key = String(chatId);
    const map = tempMessageIdMapByChat.get(key) || new Map();
    map.set(String(tempId), String(realId));
    tempMessageIdMapByChat.set(key, map);
  };

  const remapThinkingTiming = (tempId, realId) => {
    if (!tempId || !realId || tempId === realId) return;
    if (thinkingStartByMessageId.has(String(tempId))) {
      thinkingStartByMessageId.set(String(realId), thinkingStartByMessageId.get(String(tempId)));
      thinkingStartByMessageId.delete(String(tempId));
    }
    if (thinkingDurationByMessageId.has(String(tempId))) {
      thinkingDurationByMessageId.set(String(realId), thinkingDurationByMessageId.get(String(tempId)));
      thinkingDurationByMessageId.delete(String(tempId));
    }
    if (thinkingActiveByMessageId.has(String(tempId))) {
      thinkingActiveByMessageId.set(String(realId), thinkingActiveByMessageId.get(String(tempId)));
      thinkingActiveByMessageId.delete(String(tempId));
    }
  };

  const remapToolCalls = (tempId, realId) => {
    if (!tempId || !realId || tempId === realId) return;
    const tempKey = String(tempId);
    const realKey = String(realId);
    if (toolCallsByMessageId.has(tempKey)) {
      toolCallsByMessageId.set(realKey, toolCallsByMessageId.get(tempKey));
      toolCallsByMessageId.delete(tempKey);
    }
    if (toolExpandedByKey.size) {
      const entries = Array.from(toolExpandedByKey.entries());
      entries.forEach(([key, value]) => {
        if (key.startsWith(`${tempKey}:`)) {
          toolExpandedByKey.delete(key);
          const suffix = key.slice(tempKey.length);
          toolExpandedByKey.set(`${realKey}${suffix}`, value);
        }
      });
    }
  };

  const remapThinkingCollapsed = (tempId, realId) => {
    if (!tempId || !realId || tempId === realId) return;
    const tempKey = String(tempId);
    const realKey = String(realId);
    if (thinkingCollapsedByKey.size) {
      const entries = Array.from(thinkingCollapsedByKey.entries());
      entries.forEach(([key, value]) => {
        if (key.startsWith(`${tempKey}:`)) {
          thinkingCollapsedByKey.delete(key);
          const suffix = key.slice(tempKey.length);
          thinkingCollapsedByKey.set(`${realKey}${suffix}`, value);
        }
      });
    }
  };

  const remapBlocks = (tempId, realId) => {
    if (!tempId || !realId || tempId === realId) return;
    const tempKey = String(tempId);
    const realKey = String(realId);
    if (messageBlocksById.has(tempKey)) {
      messageBlocksById.set(realKey, messageBlocksById.get(tempKey));
      messageBlocksById.delete(tempKey);
    }
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

  const resolveTempMessageId = (chatId, id) => {
    if (!chatId || !id) return id;
    const map = tempMessageIdMapByChat.get(String(chatId));
    if (!map) return id;
    return map.get(String(id)) || id;
  };

  const replaceTempMessageId = (chatId, tempId, realId) => {
    if (!chatId || !tempId || !realId || tempId === realId) return;
    mapTempMessageId(chatId, tempId, realId);
    remapThinkingTiming(tempId, realId);
    remapToolCalls(tempId, realId);
    remapThinkingCollapsed(tempId, realId);
    remapBlocks(tempId, realId);
    const chatKey = String(chatId);
    setState((prev) => {
      const existing = prev.messagesByChat[chatKey] || [];
      if (!existing.length) return {};

      let replaced = false;
      const nextMessages = existing.map((msg) => {
        const next = { ...msg };
        if (String(next.id) === String(tempId)) {
          next.id = realId;
          replaced = true;
        }
        if (String(next.parent_id || '') === String(tempId)) {
          next.parent_id = realId;
          replaced = true;
        }
        return next;
      });

      const nextEditing = { ...(prev.ui?.editingMessages || {}) };
      if (nextEditing[tempId]) {
        nextEditing[realId] = nextEditing[tempId];
        delete nextEditing[tempId];
      }

      if (currentLeafByChatId.get(chatKey) === String(tempId)) {
        currentLeafByChatId.set(chatKey, String(realId));
      }
      if (streamingOverrideByChat.has(chatKey)) {
        const override = streamingOverrideByChat.get(chatKey);
        if (override?.targetMsgId && String(override.targetMsgId) === String(tempId)) {
          streamingOverrideByChat.set(chatKey, { ...override, targetMsgId: realId });
        }
      }
      const branchMap = branchSelectionByChat.get(chatKey);
      if (branchMap && branchMap.size) {
        const nextMap = new Map();
        for (const [k, v] of branchMap.entries()) {
          const nextKey = String(k) === String(tempId) ? String(realId) : k;
          const nextVal = String(v) === String(tempId) ? String(realId) : v;
          nextMap.set(nextKey, nextVal);
        }
        branchSelectionByChat.set(chatKey, nextMap);
      }

      return replaced
        ? { messagesByChat: { ...prev.messagesByChat, [chatKey]: nextMessages }, ui: { ...prev.ui, editingMessages: nextEditing } }
        : {};
    });

    if (state.activeChatId === chatId && messagesList) {
      const updateAttr = (selector, attr) => {
        messagesList.querySelectorAll(selector).forEach((el) => {
          if (el.getAttribute(attr) === String(tempId)) {
            el.setAttribute(attr, String(realId));
          }
        });
      };
      updateAttr(`[data-message-id="${tempId}"]`, 'data-message-id');
      updateAttr(`[data-message-content="${tempId}"]`, 'data-message-content');
      updateAttr(`[data-edit-message="${tempId}"]`, 'data-edit-message');
      updateAttr(`[data-delete-message="${tempId}"]`, 'data-delete-message');
      updateAttr(`[data-retry-message="${tempId}"]`, 'data-retry-message');
      updateAttr(`[data-round-prev="${tempId}"]`, 'data-round-prev');
      updateAttr(`[data-round-next="${tempId}"]`, 'data-round-next');
      updateAttr(`.edit-message-textarea[data-message-id="${tempId}"]`, 'data-message-id');
    }

    const resolverMap = pendingTempResolversByChat.get(chatKey);
    if (resolverMap && resolverMap.has(String(tempId))) {
      const resolvers = resolverMap.get(String(tempId)) || [];
      resolverMap.delete(String(tempId));
      if (resolverMap.size === 0) pendingTempResolversByChat.delete(chatKey);
      resolvers.forEach((fn) => {
        try {
          fn(String(realId));
        } catch {
          // ignore resolver errors
        }
      });
    }
  };

  const registerPendingTempMessage = (chatId, message) => {
    if (!chatId || !message?.id) return;
    const key = String(chatId);
    const list = pendingTempMessagesByChat.get(key) || [];
    list.push({
      id: String(message.id),
      role: String(message.role || ''),
      content: String(message.content || ''),
      parent_id: message.parent_id ? String(message.parent_id) : null,
      created_at: Number(message.created_at || 0),
    });
    pendingTempMessagesByChat.set(key, list);
  };

  const matchPendingTempMessage = (chatId, message) => {
    if (!chatId || !message?.id) return;
    const key = String(chatId);
    const list = pendingTempMessagesByChat.get(key) || [];
    if (!list.length) return;
    const msgContent = String(message.content || '');
    const msgRole = String(message.role || '');
    const msgParent = message.parent_id ? String(message.parent_id) : null;
    const msgCreated = Number(message.created_at || 0);

    let bestIdx = -1;
    let bestScore = Infinity;
    list.forEach((candidate, idx) => {
      if (candidate.role !== msgRole) return;
      if (candidate.content !== msgContent) return;
      if (String(candidate.parent_id || '') !== String(msgParent || '')) return;
      const delta = Math.abs((candidate.created_at || 0) - msgCreated);
      if (delta < bestScore) {
        bestScore = delta;
        bestIdx = idx;
      }
    });

    if (bestIdx >= 0) {
      const [candidate] = list.splice(bestIdx, 1);
      pendingTempMessagesByChat.set(key, list);
      replaceTempMessageId(chatId, candidate.id, message.id);
    }
  };

  const waitForResolvedMessageId = (chatId, id, timeoutMs = 5000) => {
    const resolved = resolveTempMessageId(chatId, id);
    if (!isTempMessageId(resolved)) return Promise.resolve(resolved);
    const chatKey = String(chatId);
    const tempKey = String(resolved);
    return new Promise((resolve) => {
      const resolverMap = pendingTempResolversByChat.get(chatKey) || new Map();
      const list = resolverMap.get(tempKey) || [];
      list.push(resolve);
      resolverMap.set(tempKey, list);
      pendingTempResolversByChat.set(chatKey, resolverMap);

      const timer = setTimeout(() => {
        const current = resolverMap.get(tempKey) || [];
        const idx = current.indexOf(resolve);
        if (idx >= 0) current.splice(idx, 1);
        if (current.length === 0) resolverMap.delete(tempKey);
        if (resolverMap.size === 0) pendingTempResolversByChat.delete(chatKey);
        resolve(null);
      }, timeoutMs);

      // If resolved before timeout, clear the timer.
      const wrappedResolve = (value) => {
        clearTimeout(timer);
        resolve(value);
      };
      list[list.length - 1] = wrappedResolve;
      resolverMap.set(tempKey, list);
    });
  };

  const setBranchSelection = (chatId, parentId, messageId) => {
    if (!chatId || !messageId) return;
    const key = String(chatId);
    const parentKey = parentId ? String(parentId) : '__root__';
    const map = branchSelectionByChat.get(key) || new Map();
    map.set(parentKey, String(messageId));
    branchSelectionByChat.set(key, map);
  };

  const getMessageById = (chatId, messageId) => {
    if (!chatId || !messageId) return null;
    const list = state.messagesByChat[chatId] || [];
    return list.find((msg) => String(msg.id) === String(messageId)) || null;
  };

  const getChatHandlers = (chat) => ({
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
      loadMessages(id, { modelMode: 'default' });
      if (state.isMobile) setState({ showSidebar: false });
    },
    rename: async (id) => {
      if (isTempChatId(id)) return;
      const newTitle = window.prompt('Enter new title:', chat.title);
      if (newTitle && newTitle !== chat.title) {
        await apiFetch(`/api/chats/${id}`, {
          method: 'PUT',
          body: JSON.stringify({ title: newTitle })
        });
        await loadChats();
      }
    },
    setIcon: async (id) => {
      if (isTempChatId(id)) return;
      const { showIconPickerModal } = await loadIconPickerModal();
      await showIconPickerModal(id, chat.icon);
    },
    pin: async (id) => {
      if (isTempChatId(id)) return;
      const res = await apiFetch(`/api/chats/${id}/pin`, { method: 'POST' });
      if (!res.ok) {
        const payload = await res.json().catch(() => ({}));
        alert(payload.error || `Failed to pin chat (${res.status})`);
        return;
      }

      await loadChats();
    },
    duplicate: async (id) => {
      if (isTempChatId(id)) return;
      const res = await apiFetch(`/api/chats/${id}/clone`, { method: 'POST' });
      if (!res.ok) {
        const payload = await res.json().catch(() => ({}));
        alert(payload.error || `Failed to duplicate chat (${res.status})`);
        return;
      }

      const data = await res.json().catch(() => ({}));
      const clonedChatId = data?.chat?.id || null;
      await loadChats();
      const nextId = clonedChatId || state.activeChatId;
      syncChatUrl(nextId);
      setState({ activeChatId: nextId });
      if (nextId) {
        await loadMessages(nextId, { modelMode: 'default' });
      }
    },
    tag: async (id) => {
      if (isTempChatId(id)) return;
      const { showTagModal } = await loadTagModal();
      await showTagModal(id, chat.tags);
    },
    moveFolder: async (id) => {
        if (isTempChatId(id)) return;
        // Implement folder picker modal
        const folderId = window.prompt('Enter folder ID (or empty to remove):', chat.folder_id || '');
        await apiFetch(`/api/chats/${id}/folder`, {
            method: 'PATCH',
            body: JSON.stringify({ folder_id: folderId || null })
        });
        await loadChats();
    },
    share: async (id) => {
      if (isTempChatId(id)) return;
      syncChatUrl(id);
      setState({ activeChatId: id });
      await loadMessages(id, { modelMode: 'default' });
      await refreshShareState();
      const existing = sharedByChatId.get(id) || null;
      renderShareModal(existing);
    },
    archive: async (id) => {
      if (isTempChatId(id)) return;
      await toggleArchiveChat(id);
      await loadChats();
      const nextId = id === state.activeChatId ? state.chats?.[0]?.id || null : state.activeChatId;
      syncChatUrl(nextId, { replace: true });
      setState({ activeChatId: nextId });
      if (nextId) {
        await loadMessages(nextId, { modelMode: 'default' });
      } else {
        drawMessages([]);
      }
    },
    delete: async (id) => {
      if (isTempChatId(id)) return;
      if (window.confirm('Are you sure you want to delete this chat?')) {
        const wasActive = id === state.activeChatId;
        const prevChats = state.chats.slice();
        const removedChat = prevChats.find((chat) => String(chat.id) === String(id)) || null;
        const nextChatsSnapshot = prevChats.filter((chat) => String(chat.id) !== String(id));
        const nextId = wasActive ? (nextChatsSnapshot[0]?.id || null) : state.activeChatId;
        setState((prev) => {
          const nextChats = prev.chats.filter((chat) => String(chat.id) !== String(id));
          const nextActiveChatId = wasActive ? (nextChats[0]?.id || null) : prev.activeChatId;
          const nextMessagesByChat = { ...prev.messagesByChat };
          delete nextMessagesByChat[id];
          return { chats: nextChats, activeChatId: nextActiveChatId, messagesByChat: nextMessagesByChat };
        });

        currentLeafByChatId.delete(id);
        streamingOverrideByChat.delete(id);

        syncChatUrl(nextId, { replace: true });
        if (nextId) {
          await loadMessages(nextId, { modelMode: 'default' });
        } else {
          drawMessages([]);
        }

        const res = await apiFetch(`/api/chats/${id}`, { method: 'DELETE' });
        if (!res.ok) {
          // Roll back optimistic delete on failure.
          if (removedChat) {
            setState((prev) => ({ chats: [removedChat, ...prev.chats] }));
          }
          await loadChats();
        }
      }
    }
  });

  const isTempChatId = (id) => String(id || '').startsWith('temp-');
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
      tags: '[]',
      created_at: nowTs,
      updated_at: nowTs,
    };
  };

  function scheduleSidebarEnhancements() {
    const run = () => {
      loadFolderSidebar()
        .then(({ createFolderSidebar }) => createFolderSidebar(getChatHandlers))
        .then((folderContainer) => {
          if (!folderContainer || !chatList?.parentNode) return;
          chatList.parentNode.insertBefore(folderContainer, chatList);
        })
        .catch(() => {});

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

  function renderShareModal(shareData = null) {
    const hasShare = Boolean(shareData?.share_id);
    const shareUrl = hasShare ? `${window.location.origin}${shareData.share_url}` : '';

    shareModalContainer.innerHTML = `
      <div id="share-modal-root" class="fixed inset-0 z-[120]" role="dialog" aria-modal="true">
        <div id="share-overlay" class="absolute inset-0 bg-black/30"></div>
        <div class="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[92%] max-w-lg rounded-2xl bg-white border border-gray-200 shadow-xl p-5">
          <h3 class="text-lg font-semibold text-gray-900">Share Chat</h3>
          <p class="text-xs text-gray-500 mt-1">Create a read-only public link for this chat.</p>
          <div class="mt-4 rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-700 break-all">${hasShare ? escapeHtml(shareUrl) : 'No active share link'}</div>
          <div class="mt-4 flex items-center justify-end gap-2">
            <button id="close-share-modal" class="px-3 py-2 text-sm rounded-lg border border-gray-200 hover:bg-gray-50">Close</button>
            <button id="copy-share-link" class="px-3 py-2 text-sm rounded-lg border border-gray-200 hover:bg-gray-50 ${hasShare ? '' : 'hidden'}">Copy Link</button>
            <button id="generate-share-link" class="px-3 py-2 text-sm rounded-lg bg-black text-white hover:bg-gray-800">${hasShare ? 'Refresh Link' : 'Generate Link'}</button>
            <button id="revoke-share-link" class="px-3 py-2 text-sm rounded-lg bg-red-600 text-white hover:bg-red-700 ${hasShare ? '' : 'hidden'}">Revoke</button>
          </div>
        </div>
      </div>
    `;

    const close = () => {
      shareModalContainer.innerHTML = '';
    };

    shareModalContainer.querySelector('#share-overlay')?.addEventListener('click', close);
    shareModalContainer.querySelector('#close-share-modal')?.addEventListener('click', close);

    shareModalContainer.querySelector('#copy-share-link')?.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(shareUrl);
      } catch {
        window.prompt('Copy link', shareUrl);
      }
    });

    shareModalContainer.querySelector('#generate-share-link')?.addEventListener('click', async () => {
      if (!state.activeChatId) return;
      const data = await shareChat(state.activeChatId);
      sharedByChatId.set(state.activeChatId, data);
      drawChats(state.chats, state.activeChatId);
      renderShareModal(data);
    });

    shareModalContainer.querySelector('#revoke-share-link')?.addEventListener('click', async () => {
      if (!state.activeChatId) return;
      await unshareChat(state.activeChatId);
      sharedByChatId.delete(state.activeChatId);
      drawChats(state.chats, state.activeChatId);
      renderShareModal(null);
    });
  }

  function renderCitationModal(citationId, detailText) {
    citationModalContainer.innerHTML = `
      <div class="fixed inset-0 z-[130]" role="dialog" aria-modal="true">
        <div id="citation-overlay" class="absolute inset-0 bg-black/30"></div>
        <div class="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[94%] max-w-2xl h-[70vh] rounded-2xl bg-white border border-gray-200 shadow-xl flex flex-col">
          <div class="px-5 py-3 border-b border-gray-100 flex items-center justify-between">
            <div>
              <h3 class="text-sm font-semibold text-gray-900">Citation</h3>
              <p class="text-xs text-gray-500">${escapeHtml(citationId)}</p>
            </div>
            <button id="close-citation" class="p-2 hover:bg-gray-100 rounded-lg">✕</button>
          </div>
          <div class="p-4 overflow-auto text-sm text-gray-800 whitespace-pre-wrap">${escapeHtml(detailText || 'No preview available')}</div>
        </div>
      </div>
    `;

    const close = () => {
      citationModalContainer.innerHTML = '';
    };
    citationModalContainer.querySelector('#citation-overlay')?.addEventListener('click', close);
    citationModalContainer.querySelector('#close-citation')?.addEventListener('click', close);
  }

  async function openCitation(citationId) {
    let detailText = `Source ID: ${citationId}`;
    try {
      const meta = await getFileMetadata(citationId);
      detailText = `${meta.filename || citationId}\n\nType: ${meta.content_type || 'unknown'}\n\n`;
      try {
        const content = await getFileContent(citationId);
        detailText += typeof content.content === 'string'
          ? content.content
          : JSON.stringify(content.content, null, 2);
      } catch {
        detailText += (meta.text_excerpt || 'No content preview available');
      }
    } catch {
      detailText = `Source ID: ${citationId}\n\nNo detailed preview found for this source.`;
    }

    renderCitationModal(citationId, detailText);
  }

  async function openArchivedModal() {
    const data = await fetchArchivedChats();
    archivedModalContainer.innerHTML = `
      <div class="fixed inset-0 z-[125]" role="dialog" aria-modal="true">
        <div id="archived-overlay" class="absolute inset-0 bg-black/30"></div>
        <div class="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[94%] max-w-xl rounded-2xl bg-white border border-gray-200 shadow-xl p-5">
          <div class="flex items-center justify-between mb-4">
            <h3 class="text-lg font-semibold text-gray-900">Archived Chats</h3>
            <button id="close-archived-modal" class="p-2 hover:bg-gray-100 rounded-lg">✕</button>
          </div>
          <div class="space-y-2 max-h-[60vh] overflow-auto">
            ${(data.chats || []).map((chat) => `
              <div class="border border-gray-200 rounded-xl px-3 py-2 flex items-center justify-between gap-3">
                <div class="min-w-0">
                  <p class="text-sm font-medium text-gray-800 truncate">${escapeHtml(chat.title || 'Untitled')}</p>
                </div>
                <button data-restore-chat="${chat.id}" class="px-3 py-1.5 text-xs font-medium rounded-lg bg-black text-white hover:bg-gray-800">Restore</button>
              </div>
            `).join('') || '<p class="text-sm text-gray-500">No archived chats.</p>'}
          </div>
        </div>
      </div>
    `;

    const close = () => { archivedModalContainer.innerHTML = ''; };
    archivedModalContainer.querySelector('#archived-overlay')?.addEventListener('click', close);
    archivedModalContainer.querySelector('#close-archived-modal')?.addEventListener('click', close);
    archivedModalContainer.querySelectorAll('[data-restore-chat]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const id = btn.getAttribute('data-restore-chat');
        await toggleArchiveChat(id);
        await loadChats();
        close();
      });
    });
  }

  function drawChats(chats, activeId) {
    const mainListChats = chats.filter((c) => !c.folder_id);
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

  function renderAssistantContent(content) {
    return renderMessageContent(content);
  }

  function isImageAttachment(file) {
    return String(file?.content_type || '').toLowerCase().startsWith('image/');
  }

  function isTextAttachment(file) {
    return isTextLikeContentType(file?.content_type);
  }

  async function getAttachmentImageUrl(fileId) {
    const key = String(fileId || '');
    if (!key) return null;
    if (attachmentImageUrlCache.has(key)) return attachmentImageUrlCache.get(key);
    if (attachmentImagePromiseCache.has(key)) return attachmentImagePromiseCache.get(key);

    const promise = (async () => {
      const blob = await getFileBlob(key);
      const url = URL.createObjectURL(blob);
      attachmentImageUrlCache.set(key, url);
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

  function renderAttachmentPills(attachments = [], align = 'end') {
    if (!Array.isArray(attachments) || attachments.length === 0) return '';
    const images = attachments.filter(isImageAttachment);
    const others = attachments.filter((file) => !isImageAttachment(file));
    const alignItems = align === 'start' ? 'items-start' : 'items-end';
    const justify = align === 'start' ? 'justify-start' : 'justify-end';

    const imageHtml = images.map((file) => {
      const label = String(file?.filename || 'Image');
      const fileId = String(file?.id || '');
      if (!fileId) return '';
      return `
        <div class="rounded-2xl border border-gray-200 bg-white shadow-sm overflow-hidden" style="max-width:120px; max-height:120px;">
          <img data-attachment-image="${escapeHtml(fileId)}" alt="${escapeHtml(label)}" title="${escapeHtml(label)}" class="block h-auto w-auto object-contain bg-gray-100 transition-opacity duration-200" style="max-width:120px; max-height:120px;" loading="lazy" />
        </div>
      `;
    }).join('');

    const pillsHtml = others.map((file) => {
      const label = String(file?.filename || 'Attachment');
      return `
        <div class="flex items-center gap-2 rounded-full border border-gray-200 bg-white px-3 py-1 text-[11px] text-gray-600 shadow-sm">
          <svg xmlns="http://www.w3.org/2000/svg" class="w-3.5 h-3.5 text-gray-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/>
            <polyline points="14 2 14 8 20 8"/>
          </svg>
          <span class="max-w-[200px] truncate">${escapeHtml(label)}</span>
        </div>
      `;
    }).join('');

    const imageRow = imageHtml ? `<div class="flex flex-wrap gap-2 ${justify}">${imageHtml}</div>` : '';
    const pillRow = pillsHtml ? `<div class="flex flex-wrap gap-2 ${justify}">${pillsHtml}</div>` : '';
    return `
      <div class="flex flex-col gap-2 ${alignItems}">
        ${imageRow}
        ${pillRow}
      </div>
    `;
  }

  function extractThinkingBlocks(raw) {
    const source = String(raw || '');
    let text = source;
    const collected = [];
    const tagNames = ['thinking', 'thoughts', 'think', 'reasoning', 'reason'];

    for (const tag of tagNames) {
      const openToken = `<${tag}`;
      const closeToken = `</${tag}>`;
      while (true) {
        const lower = text.toLowerCase();
        const openIdx = lower.indexOf(openToken);
        if (openIdx === -1) break;
        const openEnd = text.indexOf('>', openIdx);
        if (openEnd === -1) break;
        const closeIdx = lower.indexOf(closeToken, openEnd + 1);
        if (closeIdx === -1) {
          const remainder = text.slice(openEnd + 1);
          if (remainder.trim()) collected.push(remainder);
          text = text.slice(0, openIdx);
          break;
        }
        const inner = text.slice(openEnd + 1, closeIdx);
        if (inner.trim()) collected.push(inner);
        text = text.slice(0, openIdx) + text.slice(closeIdx + closeToken.length);
      }
    }

    return {
      cleaned: text.trim(),
      thinking: collected.map((part) => part.trim()).filter(Boolean).join('\n\n'),
      hasTag: /<thinking\b|<thoughts?\b/i.test(source) || collected.length > 0,
    };
  }

  function formatThoughtDuration(ms) {
    const value = Number(ms);
    if (!Number.isFinite(value) || value <= 0) return 'Thought';
    if (value < 1000) return 'Thought for less than a second';
    const seconds = Math.round(value / 1000);
    if (seconds <= 1) return 'Thought for 1 second';
    return `Thought for ${seconds} seconds`;
  }

  function renderThinkingBlock({ messageId, label, thinking, collapsed, toggleKey }) {
    if (!label) return '';
    const hasContent = Boolean(thinking);
    const contentHtml = hasContent
      ? `<div data-thinking-body="${toggleKey}" class="${collapsed ? 'hidden' : ''} mt-2 border-l-2 border-gray-200 pl-3 text-[13px] leading-[1.6] text-gray-500 italic">
          ${renderMessageContent(thinking)}
        </div>`
      : '';
    const chevronClass = collapsed ? '-rotate-90' : 'rotate-0';
    return `
      <div class="mt-2 rounded-xl border border-gray-100 bg-gray-50/80 px-3 py-2">
        <button type="button" data-thinking-toggle="${toggleKey}" class="w-full flex items-center justify-between text-xs font-medium text-gray-500 hover:text-gray-700 transition">
          <span>${escapeHtml(label)}</span>
          <svg data-thinking-chevron="${toggleKey}" xmlns="http://www.w3.org/2000/svg" class="w-3.5 h-3.5 transition-transform ${chevronClass}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="6 9 12 15 18 9"></polyline>
          </svg>
        </button>
        ${contentHtml}
      </div>
    `;
  }

  function normalizeToolCalls(raw) {
    if (!raw) return [];
    if (Array.isArray(raw)) return raw;
    if (typeof raw === 'string') {
      try {
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed : [];
      } catch {
        return [];
      }
    }
    return [];
  }

  function normalizeMessageBlocks(raw) {
    if (!raw) return [];
    if (Array.isArray(raw)) return raw;
    if (typeof raw === 'string') {
      try {
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed : [];
      } catch {
        return [];
      }
    }
    return [];
  }

  function normalizeMessageBlockRecord(raw, index = 0) {
    if (!raw) return null;
    const type = String(raw.type || '').trim();
    if (!type) return null;
    const content = raw.content == null ? '' : String(raw.content);
    const toolCallId = raw.tool_call_id || raw.toolCallId || raw.tool_callId || null;
    return {
      id: String(raw.id || `${type}-${index + 1}`),
      type,
      content,
      toolCallId: toolCallId ? String(toolCallId) : null,
    };
  }

  function normalizeToolCallRecord(raw) {
    if (!raw) return null;
    const id = raw.id || raw.tool_call_id || raw.toolCallId;
    if (!id) return null;
    const name = String(raw.name || raw.tool_name || raw.toolName || 'Tool').trim() || 'Tool';
    const input = raw.input ?? raw.arguments ?? raw.args ?? '';
    const output = raw.output ?? raw.result ?? '';
    const error = raw.error ?? null;
    const status = raw.status || raw.state || (error ? 'error' : (output ? 'completed' : 'running'));
    return {
      id: String(id),
      name,
      input: input == null ? '' : String(input),
      output: output == null ? '' : String(output),
      error: error == null ? null : String(error),
      status: String(status),
    };
  }

  function getMessageBlocks(messageId) {
    const key = String(messageId || '');
    if (!key) return [];
    const existing = messageBlocksById.get(key);
    if (existing) return existing;
    const created = [];
    messageBlocksById.set(key, created);
    return created;
  }

  function appendBlock(messageId, type, delta) {
    if (!messageId) return;
    const blocks = getMessageBlocks(messageId);
    const last = blocks.length ? blocks[blocks.length - 1] : null;
    const text = String(delta || '');
    if (last && last.type === type) {
      last.content = `${last.content || ''}${text}`;
      return;
    }
    const index = blocks.filter((block) => block.type === type).length + 1;
    blocks.push({ id: `${type}-${index}`, type, content: text });
  }

  function ensureThinkingBlock(messageId) {
    if (!messageId) return;
    const blocks = getMessageBlocks(messageId);
    const last = blocks.length ? blocks[blocks.length - 1] : null;
    if (last && last.type === 'thinking') return;
    const index = blocks.filter((block) => block.type === 'thinking').length + 1;
    blocks.push({ id: `thinking-${index}`, type: 'thinking', content: '' });
  }

  function ensureToolBlock(messageId, toolCallId) {
    if (!messageId || !toolCallId) return;
    const blocks = getMessageBlocks(messageId);
    const id = `tool:${toolCallId}`;
    if (blocks.some((block) => block.id === id)) return;
    blocks.push({ id, type: 'tool', toolCallId });
  }

  function getToolCallsForMessage(messageId) {
    const key = String(messageId);
    return toolCallsByMessageId.get(key) || [];
  }

  function syncToolCallsForMessage(messageId, rawToolCalls, { isStreaming } = {}) {
    const key = String(messageId);
    const normalized = normalizeToolCalls(rawToolCalls)
      .map(normalizeToolCallRecord)
      .filter(Boolean);
    if (!normalized.length) {
      if (!isStreaming) toolCallsByMessageId.delete(key);
      return;
    }
    toolCallsByMessageId.set(key, normalized);
  }

  function syncMessageBlocksForMessage(messageId, rawBlocks, { isStreaming } = {}) {
    const key = String(messageId);
    const normalized = normalizeMessageBlocks(rawBlocks)
      .map(normalizeMessageBlockRecord)
      .filter(Boolean);
    if (!normalized.length) {
      if (!isStreaming) messageBlocksById.delete(key);
      return;
    }
    if (isStreaming && messageBlocksById.has(key)) return;
    messageBlocksById.set(key, normalized.map((block, index) => ({
      id: block.id || `${block.type}-${index + 1}`,
      type: block.type,
      content: block.content || '',
      toolCallId: block.toolCallId || null,
    })));
  }

  function updateToolCallState(messageId, payload) {
    const key = String(messageId || '');
    if (!key) return;
    const list = toolCallsByMessageId.get(key) ? [...toolCallsByMessageId.get(key)] : [];
    const record = normalizeToolCallRecord(payload);
    if (!record) return;
    const idx = list.findIndex((item) => String(item.id) === String(record.id));
    if (idx >= 0) {
      list[idx] = { ...list[idx], ...record };
    } else {
      list.push(record);
    }
    toolCallsByMessageId.set(key, list);
    ensureToolBlock(key, record.id);
  }

  function buildToolToggleKey(messageId, toolCallId) {
    return `${messageId}:${toolCallId}`;
  }

  function renderToolCallItem(messageId, call) {
    if (!call) return '';
      const key = buildToolToggleKey(messageId, call.id);
      const expanded = toolExpandedByKey.get(key) === true;
      const collapsed = !expanded;
      const status = String(call.status || '').toLowerCase();
      const isRunning = status === 'running';
      const isError = status === 'error';
      const label = isRunning
        ? `Executing ${call.name}...`
        : (isError ? `Tool error from ${call.name}` : `View Result from ${call.name}`);
      const dotClass = isError
        ? 'bg-red-500'
        : (isRunning ? 'bg-gray-400' : 'bg-green-500');
      const chevronClass = collapsed ? '-rotate-90' : 'rotate-0';
      const bodyClass = collapsed ? 'hidden' : '';
      const inputValue = call.input ? escapeHtml(call.input) : '<span class="text-gray-400">No input.</span>';
      const outputValue = call.output
        ? escapeHtml(call.output)
        : (isRunning ? '<span class="text-gray-400">Waiting for result...</span>' : '<span class="text-gray-400">No output.</span>');
      const statusIcon = isRunning
        ? `<svg class="h-3.5 w-3.5 animate-spin text-gray-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="9" stroke="currentColor" stroke-opacity="0.25"></circle>
            <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor"></path>
          </svg>`
        : `<span class="inline-flex h-2 w-2 rounded-full ${dotClass}"></span>`;
      return `
        <div class="mt-2 rounded-xl border border-gray-200 bg-white px-3 py-2 shadow-sm">
          <button type="button" data-tool-toggle="${buildToolToggleKey(messageId, call.id)}" class="w-full flex items-center justify-between text-xs font-semibold text-gray-600 hover:text-gray-900 transition">
            <span class="flex items-center gap-2">
              ${statusIcon}
              <span>${escapeHtml(label)}</span>
            </span>
            <svg data-tool-chevron="${buildToolToggleKey(messageId, call.id)}" xmlns="http://www.w3.org/2000/svg" class="w-3.5 h-3.5 transition-transform ${chevronClass}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="6 9 12 15 18 9"></polyline>
            </svg>
          </button>
          <div data-tool-body="${buildToolToggleKey(messageId, call.id)}" class="${bodyClass} mt-3 space-y-3 text-[12px] text-gray-600">
            <div>
              <div class="text-[10px] font-semibold uppercase tracking-wider text-gray-400">Input</div>
              <pre class="mt-1 whitespace-pre-wrap rounded-lg bg-[#111827] px-2 py-2 text-[12px] text-gray-100 border border-gray-900/10 font-mono">${inputValue}</pre>
            </div>
            <div>
              <div class="text-[10px] font-semibold uppercase tracking-wider text-gray-400">Output</div>
              <pre class="mt-1 whitespace-pre-wrap rounded-lg bg-[#111827] px-2 py-2 text-[12px] text-gray-100 border border-gray-900/10 font-mono">${outputValue}</pre>
            </div>
          </div>
        </div>
      `;
  }

  function splitThinkingSegments(raw) {
    const source = String(raw || '');
    if (!source) return [];
    const segments = [];
    const tagNames = ['thinking', 'thoughts', 'think', 'reasoning', 'reason'];
    let cursor = 0;
    const lower = source.toLowerCase();
    while (cursor < source.length) {
      let nextTag = null;
      for (const tag of tagNames) {
        const openToken = `<${tag}`;
        const idx = lower.indexOf(openToken, cursor);
        if (idx !== -1 && (nextTag === null || idx < nextTag.index)) {
          nextTag = { tag, index: idx };
        }
      }
      if (!nextTag) {
        const text = source.slice(cursor);
        if (text.trim()) segments.push({ type: 'text', text });
        break;
      }
      if (nextTag.index > cursor) {
        const text = source.slice(cursor, nextTag.index);
        if (text.trim()) segments.push({ type: 'text', text });
      }
      const openEnd = source.indexOf('>', nextTag.index);
      if (openEnd === -1) break;
      const closeToken = `</${nextTag.tag}>`;
      const closeIdx = lower.indexOf(closeToken, openEnd + 1);
      if (closeIdx === -1) {
        const remainder = source.slice(openEnd + 1);
        if (remainder.trim()) segments.push({ type: 'thinking', text: remainder });
        break;
      }
      const inner = source.slice(openEnd + 1, closeIdx);
      if (inner.trim()) segments.push({ type: 'thinking', text: inner });
      cursor = closeIdx + closeToken.length;
    }
    return segments;
  }

  function ensureBlocksFromContent(messageId, content) {
    const blocks = getMessageBlocks(messageId);
    if (blocks.length) return blocks;
    const segments = splitThinkingSegments(content);
    if (!segments.length) {
      blocks.push({ id: 'text-1', type: 'text', content: String(content || '') });
      return blocks;
    }
    let textCount = 0;
    let thinkingCount = 0;
    segments.forEach((segment) => {
      if (segment.type === 'thinking') {
        thinkingCount += 1;
        blocks.push({ id: `thinking-${thinkingCount}`, type: 'thinking', content: segment.text });
      } else {
        textCount += 1;
        blocks.push({ id: `text-${textCount}`, type: 'text', content: segment.text });
      }
    });
    return blocks;
  }

  function renderAssistantMessageBody({ messageId, content, isError, isStreaming }) {
    const isThinkingActive = thinkingActiveByMessageId.get(String(messageId)) === true;
    const duration = thinkingDurationByMessageId.get(String(messageId));
    const toolCalls = getToolCallsForMessage(messageId);
    const blocks = ensureBlocksFromContent(String(messageId), content);
    const hasThinking = blocks.some((block) => block?.type === 'thinking') || isThinkingActive;
    const hasRunningTools = toolCalls.some((call) => String(call?.status || '').toLowerCase() === 'running');
    if (toolCalls.length) {
      const existingToolIds = new Set(
        blocks.filter((block) => block?.type === 'tool').map((block) => String(block.toolCallId || block.id || ''))
      );
      toolCalls.forEach((call) => {
        const id = String(call.id || '');
        if (!id || existingToolIds.has(id)) return;
        blocks.push({ id: `tool:${id}`, type: 'tool', toolCallId: id });
      });
    }
    const toolMap = new Map(toolCalls.map((call) => [String(call.id), call]));
    const blocksHtml = blocks.map((block) => {
      if (!block) return '';
      if (block.type === 'tool') {
        return renderToolCallItem(String(messageId), toolMap.get(block.toolCallId || block.id.slice(5)));
      }
      if (block.type === 'thinking') {
        const label = isStreaming
          ? (hasThinking || isThinkingActive ? 'Thinking…' : '')
          : (hasThinking ? formatThoughtDuration(duration) : '');
        const toggleKey = `${messageId}:${block.id}`;
        const collapsed = thinkingCollapsedByKey.get(toggleKey) ?? false;
        return label ? renderThinkingBlock({ messageId, label, thinking: block.content, collapsed, toggleKey }) : '';
      }
      if (block.type === 'text') {
        if (!block.content) return '';
        return renderAssistantContent(block.content);
      }
      return '';
    }).join('');
    const textBlocks = blocks.filter((block) => block?.type === 'text');
    const textContent = textBlocks.map((block) => block.content || '').join('');
    const hasTextBlocks = textBlocks.length > 0;
    const renderedAnswer = hasTextBlocks ? '' : renderAssistantContent(content);
    const asyncNotice = !isStreaming && hasRunningTools
      ? `<div class="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[12px] text-amber-700">
          Tools are still running in the background. Results will appear when ready.
        </div>`
      : '';
    if (!isError) return `${asyncNotice}${blocksHtml}${renderedAnswer}`;

    const raw = String(textContent || content || '');
    const shouldToggle = raw.length > 240 || raw.includes('\n');
    const expanded = errorExpandedByMessageId.get(String(messageId)) ?? false;
    const bodyClass = expanded ? '' : 'max-h-24 overflow-hidden';
    const overlayClass = expanded ? 'hidden' : '';
    const toggleLabel = expanded ? 'Less' : 'More';
    const toggleHtml = shouldToggle
      ? `<button type="button" data-error-toggle="${messageId}" class="mt-2 text-[11px] font-semibold text-red-700 hover:text-red-800">${toggleLabel}</button>`
      : '';
    const overlayHtml = shouldToggle
      ? `<div data-error-overlay="${messageId}" class="pointer-events-none absolute inset-x-0 bottom-7 h-10 bg-gradient-to-t from-red-50 to-transparent ${overlayClass}"></div>`
      : '';

    const errorBlock = `
      <div class="relative rounded-lg border border-red-200 bg-red-50 text-red-700 px-3 py-2 text-[14px] leading-[1.6] font-sans">
        <div data-error-body="${messageId}" class="${bodyClass}">
          ${renderAssistantContent(raw)}
        </div>
        ${overlayHtml}
        ${toggleHtml}
      </div>
    `;
    return `${asyncNotice}${blocksHtml}${errorBlock}`;
  }

  function formatModelDisplayName(modelId) {
    const raw = String(modelId || '').trim();
    if (!raw) return 'Assistant';
    const idx = raw.indexOf(':');
    if (idx > 0) return raw.slice(idx + 1);
    return raw;
  }

  function updateMessageContentDom(messageId, content, options = {}) {
    if (!messageId) return false;
    const el = messagesList.querySelector(`[data-message-content="${messageId}"]`);
    if (!el) return false;
    const { isError = false, isStreaming = false } = options;
    const forceError = isError || el.dataset.messageError === '1';
    if (forceError) {
      el.dataset.messageError = '1';
    }
    el.innerHTML = renderAssistantMessageBody({
      messageId,
      content,
      isError: forceError,
      isStreaming,
    });
    return true;
  }

  function formatApiErrorMessage(payload, fallback) {
    let message = fallback || 'Request failed.';
    if (payload?.details?.message) {
      message = payload.details.message;
    } else if (payload?.error) {
      message = payload.error;
    } else if (payload?.message) {
      message = payload.message;
    }
    if (payload?.details?.unsupported_types?.length) {
      const list = payload.details.unsupported_types.join(', ');
      message = `Selected model does not support ${list} attachment${payload.details.unsupported_types.length > 1 ? 's' : ''}.`;
    }
    return message;
  }

  function applyAssistantErrorMessage(chatId, messageId, errorText) {
    if (!chatId || !messageId) return;
    const safeText = String(errorText || 'Request failed.');
    setState((prev) => {
      const currentMessages = [...(prev.messagesByChat[chatId] || [])];
      const targetIdx = currentMessages.findIndex((m) => String(m.id) === String(messageId));
      if (targetIdx < 0) return prev;
      currentMessages[targetIdx] = {
        ...currentMessages[targetIdx],
        content: safeText,
        done: true,
        status: 'error',
        error_message: safeText,
      };
      return { ...prev, messagesByChat: { ...prev.messagesByChat, [chatId]: currentMessages } };
    });
    if (state.activeChatId === chatId) {
      updateMessageContentDom(messageId, safeText, { isError: true, isStreaming: false });
    }
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
    const firstUserMsg = projectedMessages.find((m) => m.role === 'user');

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
      syncMessageBlocksForMessage(msgId, m.message_blocks, { isStreaming });
      syncToolCallsForMessage(msgId, m.tool_calls, { isStreaming });
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
                <button data-delete-message="${msgId}" data-index="${i}" class="p-1 hover:text-red-600 hover:bg-red-50 rounded transition text-gray-400" title="Delete">
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
                  <button data-delete-message="${msgId}" data-index="${i}" class="p-1.5 hover:text-red-600 hover:bg-red-50 rounded-md transition" title="Delete">
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

    // Re-attach event listeners
    messagesList.querySelectorAll('[data-error-toggle]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-error-toggle');
        if (!id) return;
        const isExpanded = errorExpandedByMessageId.get(String(id)) ?? false;
        const next = !isExpanded;
        errorExpandedByMessageId.set(String(id), next);

        const body = messagesList.querySelector(`[data-error-body="${id}"]`);
        const overlay = messagesList.querySelector(`[data-error-overlay="${id}"]`);
        if (body) {
          body.classList.toggle('max-h-24', !next);
          body.classList.toggle('overflow-hidden', !next);
        }
        if (overlay) {
          overlay.classList.toggle('hidden', next);
        }
        btn.textContent = next ? 'Less' : 'More';
      });
    });
    messagesList.querySelectorAll('[data-copy-message]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const idx = Number(btn.getAttribute('data-copy-message'));
        const text = projectedMessages[idx]?.content || '';
        try {
          await navigator.clipboard.writeText(text);
          showToast('Message copied');
        } catch {
          window.prompt('Copy message', text);
        }
      });
    });

    messagesList.querySelectorAll('[data-edit-message]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-edit-message');
        const m = projectedMessages.find(msg => String(msg.id) === String(id));
        const content = m?.content || '';
        const newEditing = { ...state.ui.editingMessages, [id]: content };
        setState({ ui: { ...state.ui, editingMessages: newEditing } });
        drawMessages(messages);
        // Removed scrollToMessage to prevent UI jitter/jumps
      });
    });

    const onRoundSwitch = (targetMsgId, direction) => {
      const resolvedId = resolveTempMessageId(chatId, targetMsgId);
      const rounds = roundsByMessageId.get(String(resolvedId));
      if (!rounds) return;
      const nextId = direction === 'next' ? rounds.nextId : rounds.prevId;
      if (!nextId) return;

      const chatMap = branchSelectionByChat.get(chatId) || new Map();
      chatMap.set(String(rounds.parentKey), String(nextId));
      branchSelectionByChat.set(chatId, chatMap);

      currentLeafByChatId.set(chatId, String(nextId));
      drawMessages(messages);
    };

    messagesList.querySelectorAll('[data-round-prev]').forEach((btn) => {
      btn.addEventListener('click', () => onRoundSwitch(btn.dataset.roundPrev, 'prev'));
    });
    messagesList.querySelectorAll('[data-round-next]').forEach((btn) => {
      btn.addEventListener('click', () => onRoundSwitch(btn.dataset.roundNext, 'next'));
    });

    messagesList.querySelectorAll('.cancel-edit-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-message-id');
        const newEditing = { ...state.ui.editingMessages };
        delete newEditing[id];
        setState({ ui: { ...state.ui, editingMessages: newEditing } });
        drawMessages(messages);
      });
    });

    messagesList.querySelectorAll('.save-copy-btn').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const originalId = btn.getAttribute('data-message-id');
        let id = originalId;
        const textarea = messagesList.querySelector(`.edit-message-textarea[data-message-id="${originalId}"]`);
        const newContent = textarea?.value.trim() || '';
        if (isTempMessageId(id)) {
          const resolved = await waitForResolvedMessageId(state.activeChatId, id);
          if (!resolved) {
            showToast('Message still saving. Please wait.');
            return;
          }
          id = resolved;
        }
        if (!newContent) return;

        const chatId = state.activeChatId;
        const sourceMsg = getMessageById(chatId, originalId) || projectedMessages.find(msg => String(msg.id) === String(originalId));

        try {
          const res = await apiFetch(`/api/chats/${chatId}/messages/${id}/branch`, {
            method: 'POST',
            body: JSON.stringify({
              content: newContent,
              role: 'assistant',
              no_reply: true
            })
          });

          if (res.ok) {
            const data = await res.json().catch(() => ({}));
            const newEditing = { ...state.ui.editingMessages };
            delete newEditing[originalId];
            delete newEditing[id];
            setState({ ui: { ...state.ui, editingMessages: newEditing } });
            if (data?.message?.id) {
              currentLeafByChatId.set(chatId, String(data.message.id));
              setBranchSelection(chatId, sourceMsg?.parent_id || null, data.message.id);
            }
            await loadMessages(chatId);
          } else {
            const err = await res.json().catch(() => ({}));
            const message = err?.details?.message || err.error || err.message || 'Failed to copy message';
            alert(message);
          }
        } catch (e) {
          console.error('Copy failed', e);
          alert('An error occurred while copying the message.');
        }
      });
    });

    messagesList.querySelectorAll('.save-edit-btn').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const originalId = btn.getAttribute('data-message-id');
        const textarea = messagesList.querySelector(`.edit-message-textarea[data-message-id="${originalId}"]`);
        const newContent = textarea?.value.trim() || '';
        if (!newContent) return;

        const chatId = state.activeChatId;
        const sourceMsg = getMessageById(chatId, originalId) || projectedMessages.find(msg => String(msg.id) === String(originalId));
        if (!sourceMsg) return;
        
        if (sourceMsg?.role === 'assistant') {
          let id = originalId;
          if (isTempMessageId(id)) {
            const resolved = await waitForResolvedMessageId(state.activeChatId, id);
            if (!resolved) {
              showToast('Message still saving. Please wait.');
              return;
            }
            id = resolved;
          }
          // Assistant Edit: In-place update
          try {
            const res = await apiFetch(`/api/chats/${chatId}/messages/${id}`, {
              method: 'PUT',
              body: JSON.stringify({ content: newContent })
            });

            if (res.ok) {
              const newEditing = { ...state.ui.editingMessages };
              delete newEditing[originalId];
              delete newEditing[id];
              setState({ ui: { ...state.ui, editingMessages: newEditing } });
              await loadMessages(chatId, {
                draw: state.activeChatId === chatId,
                updateActiveModel: state.activeChatId === chatId,
              });
            } else {
              const err = await res.json().catch(() => ({}));
              alert(err.error || err.message || 'Failed to update message');
            }
          } catch (e) {
            console.error('Update failed', e);
            alert('An error occurred while updating the message.');
          }
          return;
        }

        // User Edit: Branching (Existing logic)
        const branchParentId = sourceMsg?.parent_id || null;
        const sourceAttachments = Array.isArray(sourceMsg?.attachments) ? sourceMsg.attachments : [];
        const attachmentIds = Array.from(new Set(sourceAttachments.map((item) => item?.id).filter(Boolean)));

        // Remove from editing state immediately to avoid UI shifts
        const newEditing = { ...state.ui.editingMessages };
        delete newEditing[originalId];
        setState({ ui: { ...state.ui, editingMessages: newEditing } });

        // Optimistic UI
        const tempUserId = `temp-user-${Date.now()}`;
        const tempAssistantId = `temp-assistant-${Date.now()}`;
        const nowTs = Math.floor(Date.now() / 1000);
        
        let localMessages = [...(state.messagesByChat[chatId] || [])];
        const tempUserMessage = {
          id: tempUserId,
          role: 'user',
          content: newContent,
          model: state.activeModelId,
          attachments: sourceAttachments,
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

        currentLeafByChatId.set(chatId, tempAssistantId);
        setState((prev) => ({ messagesByChat: { ...prev.messagesByChat, [chatId]: localMessages } }));
        if (state.activeChatId === chatId) drawMessages(localMessages);

        const controller = new AbortController();
        activeStreamAbort = () => controller.abort();
        setGlobalStreamAbort(activeStreamAbort);

        const runBranchRequest = async (sourceId) => {
          let assistantMessageId = tempAssistantId;
          let errorMessage = null;
          let errorActive = false;
          let assistantText = '';

          const applyAssistantText = (streaming = true) => {
            streamingOverrideByChat.set(chatId, {
              targetMsgId: assistantMessageId,
              content: assistantText,
            });

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
          };

          try {
            setStreamingState(chatId, true);
            const res = await apiFetch(`/api/chats/${chatId}/messages/${sourceId}/branch`, {
              method: 'POST',
              body: JSON.stringify({
                content: newContent,
                model: state.activeModelId || undefined,
                ...(attachmentIds.length ? { attachments: attachmentIds } : {}),
              }),
              signal: controller.signal
            });

            if (!res.ok || !res.body) {
              const err = await res.json().catch(() => ({}));
              const message = formatApiErrorMessage(err, 'Failed to connect to the server.');
              applyAssistantErrorMessage(chatId, assistantMessageId, message);
              return;
            }

            const reader = res.body.getReader();
            const decoder = new TextDecoder();
            const parser = new SseLineParser((payload) => {
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
                ensureThinkingBlock(assistantMessageId);
                applyAssistantText();
              }
              if (payload?.event === 'reasoning_delta') {
                const delta = String(payload.delta || '');
                if (delta) {
                  appendBlock(assistantMessageId, 'thinking', delta);
                  thinkingActiveByMessageId.set(String(assistantMessageId), true);
                  applyAssistantText();
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
                updateToolCallState(targetId, payload);
                applyAssistantText();
              }
              if (payload?.error) {
                errorMessage = payload.message || payload.error || 'LLM request failed';
                errorActive = true;
                const label = `Error: ${errorMessage}`;
                assistantText = assistantText ? `${assistantText}\n\n${label}` : label;
                applyAssistantText();
              }
            });

            while (true) {
              const { done, value } = await reader.read();
              if (done) {
                const finalDelta = parser.flush();
                if (finalDelta) {
                  assistantText += finalDelta;
                  appendBlock(assistantMessageId, 'text', finalDelta);
                }
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
                break;
              }
              const chunk = decoder.decode(value, { stream: true });
              const delta = parser.push(chunk);
              if (delta) {
                assistantText += delta;
                appendBlock(assistantMessageId, 'text', delta);
              }
              applyAssistantText();
            }
          } catch (e) {
            if (e?.name !== 'AbortError') {
              console.error('Branching failed', e);
              if (!errorActive) {
                errorMessage = String(e?.message || 'LLM request failed');
                errorActive = true;
                assistantText = assistantText || `Error: ${errorMessage}`;
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
          }
        };

        const sourceId = originalId;
        if (isTempMessageId(sourceId)) {
          waitForResolvedMessageId(chatId, sourceId).then((resolved) => {
            if (!resolved) {
              showToast('Message still saving. Please wait.');
              return;
            }
            runBranchRequest(resolved);
          });
        } else {
          runBranchRequest(sourceId);
        }
      });
    });

    messagesList.querySelectorAll('[data-delete-message]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        if (!confirm('Are you sure you want to delete this message and all subsequent messages?')) return;
        
        const chatId = state.activeChatId;
        const originalId = btn.getAttribute('data-delete-message');
        let id = originalId;
        
        const prevMessages = state.messagesByChat[chatId] || [];
        const prevLeaf = currentLeafByChatId.get(chatId) || null;
        const prevBranchMap = branchSelectionByChat.get(chatId)
          ? new Map(branchSelectionByChat.get(chatId))
          : null;

        const byParent = new Map();
        prevMessages.forEach((msg) => {
          const parentKey = msg.parent_id ? String(msg.parent_id) : '__root__';
          if (!byParent.has(parentKey)) byParent.set(parentKey, []);
          byParent.get(parentKey).push(String(msg.id));
        });
        const idsToDelete = new Set();
        const stack = [String(id)];
        while (stack.length) {
          const current = stack.pop();
          if (!current || idsToDelete.has(current)) continue;
          idsToDelete.add(current);
          const children = byParent.get(String(current)) || [];
          children.forEach((child) => stack.push(String(child)));
        }

        const rollbackDelete = () => {
          if (!prevMessages.length) return;
          setState((prev) => ({ messagesByChat: { ...prev.messagesByChat, [chatId]: prevMessages } }));
          if (prevLeaf) currentLeafByChatId.set(chatId, String(prevLeaf));
          else currentLeafByChatId.delete(chatId);
          if (prevBranchMap) branchSelectionByChat.set(chatId, prevBranchMap);
          if (state.activeChatId === chatId) drawMessages(prevMessages);
        };

        if (idsToDelete.size > 0) {
          const streamingTarget = streamingOverrideByChat.get(chatId)?.targetMsgId;
          const streamingId = streamingTarget ? resolveTempMessageId(chatId, streamingTarget) : null;
          if (streamingId && idsToDelete.has(String(streamingId))) {
            activeStreamAbort?.();
            clearGlobalStreamAbort(activeStreamAbort);
            activeStreamAbort = null;
            streamingOverrideByChat.delete(chatId);
          }

          const remaining = prevMessages.filter((msg) => !idsToDelete.has(String(msg.id)));
          const nextLeaf = remaining.length ? remaining[remaining.length - 1].id : null;
          if (nextLeaf) currentLeafByChatId.set(chatId, String(nextLeaf));
          else currentLeafByChatId.delete(chatId);

          if (prevBranchMap) {
            const nextMap = new Map();
            for (const [k, v] of prevBranchMap.entries()) {
              if (idsToDelete.has(String(k)) || idsToDelete.has(String(v))) continue;
              nextMap.set(k, v);
            }
            branchSelectionByChat.set(chatId, nextMap);
          }

          setState((prev) => ({
            messagesByChat: { ...prev.messagesByChat, [chatId]: remaining }
          }));
          if (state.activeChatId === chatId) {
            requestAnimationFrame(() => {
              drawMessages(remaining);
            });
          }
        }

        const runDelete = async (resolvedId) => {
          try {
            const res = await apiFetch(`/api/chats/${chatId}/messages/${resolvedId}`, {
              method: 'DELETE'
            });
            
            if (res.status === 404) {
              alert('backend api not found');
              rollbackDelete();
              return;
            }

            if (res.ok) {
              await loadMessages(chatId);
            } else {
              const err = await res.json().catch(() => ({}));
              alert(err.error || 'Failed to delete message');
              rollbackDelete();
            }
          } catch (e) {
            console.error('Delete failed', e);
            alert('An error occurred while deleting the message.');
            rollbackDelete();
          }
        };

        if (isTempMessageId(id)) {
          waitForResolvedMessageId(chatId, id).then((resolved) => {
            if (!resolved) {
              showToast('Delete queued while message saves.');
              return;
            }
            runDelete(resolved);
          });
          return;
        }

        runDelete(id);
      });
    });

    messagesList.querySelectorAll('[data-retry-message]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        let id = btn.getAttribute('data-retry-message');
        if (isTempMessageId(id)) {
          const resolved = await waitForResolvedMessageId(state.activeChatId, id);
          if (!resolved) {
            showToast('Message still saving. Please wait.');
            return;
          }
          id = resolved;
        }
        const chatId = state.activeChatId;
        const sourceMsg = getMessageById(chatId, id) || projectedMessages.find(msg => String(msg.id) === String(id));
        if (!sourceMsg) return;
        const branchParentId = sourceMsg.parent_id || null;

        // Optimistic UI
        const tempAssistantId = `temp-assistant-${Date.now()}`;
        const nowTs = Math.floor(Date.now() / 1000);
        
        let localMessages = [...(state.messagesByChat[chatId] || [])];
        localMessages.push({
          id: tempAssistantId,
          role: 'assistant',
          content: '',
          model: state.activeModelId,
          parent_id: branchParentId,
          created_at: nowTs,
          done: false,
        });

        currentLeafByChatId.set(chatId, tempAssistantId);
        setBranchSelection(chatId, branchParentId, tempAssistantId);
        setState((prev) => ({ messagesByChat: { ...prev.messagesByChat, [chatId]: localMessages } }));
        if (state.activeChatId === chatId) drawMessages(localMessages);

        const controller = new AbortController();
        activeStreamAbort = () => controller.abort();
        setGlobalStreamAbort(activeStreamAbort);

        try {
          setStreamingState(chatId, true);
          const res = await apiFetch(`/api/chats/${chatId}/messages/${id}/regenerate`, {
            method: 'POST',
            signal: controller.signal
          });
          
          if (!res.ok || !res.body) {
            setStreamingState(chatId, false);
            const err = await res.json().catch(() => ({}));
            alert(err.error || 'backend api not found');
            return;
          }

          const reader = res.body.getReader();
          const decoder = new TextDecoder();
          let assistantMessageId = tempAssistantId;
          let errorMessage = null;
          let errorActive = false;
          const parser = new SseLineParser((payload) => {
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
              ensureThinkingBlock(assistantMessageId);
              applyAssistantText();
            }
            if (payload?.event === 'reasoning_delta') {
              const delta = String(payload.delta || '');
              if (delta) {
                appendBlock(assistantMessageId, 'thinking', delta);
                thinkingActiveByMessageId.set(String(assistantMessageId), true);
                applyAssistantText();
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
              updateToolCallState(targetId, payload);
              applyAssistantText();
            }
            if (payload?.error) {
              errorMessage = payload.message || payload.error || 'LLM request failed';
              errorActive = true;
              const label = `Error: ${errorMessage}`;
              assistantText = assistantText ? `${assistantText}\n\n${label}` : label;
              applyAssistantText();
            }
          });
          let assistantText = '';

          const applyAssistantText = (streaming = true) => {
            streamingOverrideByChat.set(chatId, {
              targetMsgId: assistantMessageId,
              content: assistantText,
            });
            
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
          };

          while (true) {
            const { done, value } = await reader.read();
            if (done) {
              const finalDelta = parser.flush();
              if (finalDelta) {
                assistantText += finalDelta;
                appendBlock(assistantMessageId, 'text', finalDelta);
              }
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
                parentId: branchParentId,
              });
              await loadMessages(chatId, {
                draw: state.activeChatId === chatId,
                updateActiveModel: state.activeChatId === chatId,
                fallbackMessage: fallback,
              });
              break;
            }
            const chunk = decoder.decode(value, { stream: true });
            const delta = parser.push(chunk);
            if (delta) {
              assistantText += delta;
              appendBlock(assistantMessageId, 'text', delta);
            }
            applyAssistantText();
          }
        } catch (e) {
          if (e?.name !== 'AbortError') {
            console.error('Regeneration failed', e);
            if (!errorActive) {
              errorMessage = String(e?.message || 'LLM request failed');
              errorActive = true;
              assistantText = assistantText || `Error: ${errorMessage}`;
              applyAssistantText(false);
            }
            const fallback = buildFallbackAssistantMessage(chatId, assistantMessageId, {
              content: assistantText,
              errorActive,
              errorMessage,
              model: state.activeModelId,
              parentId: branchParentId,
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
        }
      });
    });

    messagesList.querySelectorAll('[data-citation-id]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-citation-id');
        openCitation(id);
      });
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

  async function loadMessages(chatId, options = {}) {
    const { draw = true, updateActiveModel = draw, modelMode = 'keep', fallbackMessage = null } = options;
    if (!chatId) {
      if (draw) drawMessages([]);
      return;
    }

    if (draw) {
      setState({ ui: { loadingChatId: chatId } });
      const existing = state.messagesByChat[chatId] || [];
      drawMessages(existing);
    }

    const res = await apiFetch(`/api/chats/${chatId}`);
    if (!res.ok) return;
    const data = await res.json();

    let messages = (data.messages || []).map((m) => {
      const status = String(m?.status || '');
      const isRunning = m?.role === 'assistant' && (status === 'streaming' || status === 'tool_running');
      return { ...m, done: !isRunning };
    });
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

    const lastMsgId = data.chat?.current_message_id || (messages.length > 0 ? messages[messages.length - 1].id : null);
    if (lastMsgId) {
      currentLeafByChatId.set(chatId, String(lastMsgId));
    }
    if (appliedFallbackId) {
      currentLeafByChatId.set(chatId, String(appliedFallbackId));
    }

    const hasRunning = messages.some((m) => {
      const status = String(m?.status || '');
      return m?.role === 'assistant' && (status === 'streaming' || status === 'tool_running');
    });

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
      updateToolCallState(messageId, payload);
      if (state.activeChatId === chatId) {
        updateMessageContentDom(messageId, state.messagesByChat[chatId]?.find((m) => String(m.id) === messageId)?.content || '', {
          isError: false,
          isStreaming: true,
        });
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
      syncChatUrl(null);
      drawMessages([]);
      return;
    }

    const tempChat = buildTempChat();
    setState((prev) => ({
      chats: [tempChat, ...pruneTempChats(prev.chats)],
      activeChatId: tempChat.id,
      activeModelId: prev.activeModelId || prev.defaultModelId || prev.globalDefaultModelId || tempChat.model,
      newChatDraft: '',
    }));
    syncChatUrl(null);
    drawMessages([]);
  }

  async function sendSingleMessage(text, hooks = {}) {
    let chatId = state.activeChatId;
    let tempChatId = null;
    let autoTitle = null;
    const isTempChat = chatId && isTempChatId(chatId);
    const hadMessagesBefore = chatId ? (state.messagesByChat[chatId] || []).length > 0 : false;

    if (!chatId) {
      const tempChat = buildTempChat();
      tempChatId = tempChat.id;

      setState((prev) => ({
        chats: [tempChat, ...pruneTempChats(prev.chats)],
        activeChatId: tempChatId,
        activeModelId: prev.activeModelId || prev.defaultModelId || prev.globalDefaultModelId || tempChat.model,
      }));

      chatId = tempChatId;
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
        return {
          chats: deduped,
          activeChatId: realChatId,
          activeModelId: prev.activeModelId || data.chat.model || prev.defaultModelId || prev.globalDefaultModelId,
          messagesByChat: nextMessagesByChat,
          attachmentsByChat: nextAttachmentsByChat,
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

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let assistantMessageId = tempAssistantId;
    let errorMessage = null;
    let errorActive = false;
    const parser = new SseLineParser((payload) => {
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
        ensureThinkingBlock(assistantMessageId);
        applyAssistantText(true);
      }
      if (payload?.event === 'reasoning_delta') {
        const delta = String(payload.delta || '');
        if (delta) {
          appendBlock(assistantMessageId, 'thinking', delta);
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
        updateToolCallState(targetId, payload);
        applyAssistantText();
      }
      if (payload?.error) {
        errorMessage = payload.message || payload.error || 'LLM request failed';
        errorActive = true;
        const label = `Error: ${errorMessage}`;
        assistantText = assistantText ? `${assistantText}\n\n${label}` : label;
        applyAssistantText();
      }
    });
    let assistantText = '';

    const applyAssistantText = (streaming = true) => {
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
    };

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          const finalDelta = parser.flush();
          if (finalDelta) {
            assistantText += finalDelta;
            appendBlock(assistantMessageId, 'text', finalDelta);
          }
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
          break;
        }
        const chunk = decoder.decode(value, { stream: true });
        const delta = parser.push(chunk);
        if (delta) {
          assistantText += delta;
          appendBlock(assistantMessageId, 'text', delta);
        }
        applyAssistantText(true);
      }
    } catch (err) {
      if (err?.name !== 'AbortError') {
        console.error('Stream error:', err);
        if (!errorActive) {
          errorMessage = String(err?.message || 'LLM request failed');
          errorActive = true;
          assistantText = assistantText || `Error: ${errorMessage}`;
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

  async function sendMessage(text, hooks = {}) {
    const prompt = String(text || '').trim();
    if (!prompt) {
      hooks.onFinished?.();
      return;
    }
    return sendSingleMessage(prompt, hooks);
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

  const TEXT_LIKE_MIME_TYPES = new Set([
    'application/csv',
    'application/x-iif',
    'application/json',
    'application/json5',
    'application/x-json5',
    'application/x-ndjson',
    'application/ndjson',
    'application/xml',
    'application/x-xml',
    'application/yaml',
    'application/x-yaml',
    'application/javascript',
    'application/x-javascript',
    'application/typescript',
  ]);

  const inferContentTypeFromName = (name) => {
    const lower = String(name || '').toLowerCase();
    const ext = lower.includes('.') ? lower.split('.').pop() : '';
    switch (ext) {
      case 'png': return 'image/png';
      case 'jpg':
      case 'jpeg': return 'image/jpeg';
      case 'webp': return 'image/webp';
      case 'gif': return 'image/gif';
      case 'pdf': return 'application/pdf';
      case 'txt': return 'text/plain';
      case 'md': return 'text/markdown';
      case 'csv': return 'text/csv';
      case 'tsv': return 'text/tsv';
      case 'json': return 'application/json';
      case 'json5': return 'application/json5';
      case 'ndjson': return 'application/x-ndjson';
      case 'yml':
      case 'yaml': return 'application/yaml';
      case 'xml': return 'application/xml';
      case 'js': return 'application/javascript';
      case 'ts': return 'application/typescript';
      case 'html': return 'text/html';
      case 'css': return 'text/css';
      case 'py': return 'text/x-python';
      default: return '';
    }
  };

  const getFileContentType = (file) => {
    const explicit = String(file?.type || '').trim();
    if (explicit) return explicit;
    return inferContentTypeFromName(file?.name);
  };

  const isTextLikeContentType = (type) => {
    const mediaType = String(type || '').toLowerCase();
    if (!mediaType) return false;
    if (mediaType.startsWith('text/')) return true;
    return TEXT_LIKE_MIME_TYPES.has(mediaType);
  };

  const isSupportedAttachmentType = (type) => {
    const mediaType = String(type || '').toLowerCase();
    if (!mediaType) return false;
    if (mediaType.startsWith('image/')) return true;
    if (mediaType === 'application/pdf') return true;
    if (isTextLikeContentType(mediaType)) return true;
    return false;
  };

  const getAttachmentKindFromType = (type) => {
    const mediaType = String(type || '').toLowerCase();
    if (!mediaType) return 'other';
    if (mediaType.startsWith('image/')) return 'image';
    if (mediaType === 'application/pdf') return 'pdf';
    if (isTextLikeContentType(mediaType)) return 'text';
    if (mediaType.startsWith('audio/')) return 'audio';
    if (mediaType.startsWith('video/')) return 'video';
    return 'other';
  };

  const getActiveModelAttachmentCaps = () => {
    const activeId = state.activeModelId;
    if (!activeId) return null;
    const model = (state.models || []).find((item) => String(item.id) === String(activeId));
    const caps = model?.attachments;
    if (!caps || typeof caps !== 'object') return { text: true };
    if (typeof caps.text !== 'boolean') return { ...caps, text: true };
    return caps;
  };

  const isAttachmentAllowedByModel = (type) => {
    const kind = getAttachmentKindFromType(type);
    const caps = getActiveModelAttachmentCaps();
    if (kind === 'text') return caps?.text === true;
    if (!caps) return false;
    return caps[kind] === true;
  };

  const getAllowedAttachmentKinds = () => {
    const caps = getActiveModelAttachmentCaps();
    const allowed = [];
    if (caps?.image === true) allowed.push('image');
    if (caps?.pdf === true) allowed.push('pdf');
    if (caps?.text === true) allowed.push('text (local)');
    return allowed;
  };

  const getAllowedNonLocalKinds = () => {
    const caps = getActiveModelAttachmentCaps();
    const allowed = [];
    if (caps?.image === true) allowed.push('image');
    if (caps?.pdf === true) allowed.push('pdf');
    return allowed;
  };

  const handleFilesSelected = async (event) => {
    const files = Array.isArray(event?.detail?.files) ? event.detail.files : [];
    if (!files.length) return;
    const toast = showToastProgress(`Uploading ${files.length} file${files.length > 1 ? 's' : ''}...`);
    try {
      const allowedNonLocalKinds = getAllowedNonLocalKinds();
      const chatId = state.activeChatId;
      const uploaded = [];
      let skippedUnsupported = 0;
      let skippedByModel = 0;
      for (const file of files) {
        const mediaType = getFileContentType(file);
        if (!isSupportedAttachmentType(mediaType)) {
          skippedUnsupported += 1;
          continue;
        }
        if (!isAttachmentAllowedByModel(mediaType)) {
          skippedByModel += 1;
          continue;
        }
        try {
          const data = await uploadFile(file, chatId, { timeoutMs: 30000 });
          uploaded.push({
            id: data.id,
            filename: data.filename,
            content_type: data.content_type,
            file_size: data.file_size,
          });
        } catch (err) {
          const message = String(err?.message || '');
          if (message.toLowerCase().includes('timeout')) {
            showToast(`Upload timed out for ${file?.name || 'file'}`);
          } else if (message) {
            showToast(`Failed to upload ${file?.name || 'file'}: ${message}`);
          } else {
            showToast(`Failed to upload ${file?.name || 'file'}`);
          }
        }
      }
      if (skippedUnsupported > 0) {
        showToast('Some files were skipped (unsupported type).');
      }
      if (skippedByModel > 0) {
        if (allowedNonLocalKinds.length > 0) {
          showToast(`Current model supports ${allowedNonLocalKinds.join(', ')} attachments.`);
        } else if (getAllowedAttachmentKinds().includes('text (local)')) {
          showToast('Only text attachments are supported for this model.');
        } else {
          showToast('Attachments are disabled for this model.');
        }
      }
      if (uploaded.length) {
        const current = getDraftAttachments(chatId);
        const seen = new Set(current.map((item) => String(item?.id || '')));
        const next = [...current];
        uploaded.forEach((item) => {
          const key = String(item?.id || '');
          if (!key || seen.has(key)) return;
          seen.add(key);
          next.push(item);
        });
        setDraftAttachments(chatId, next);
      }
    } finally {
      toast.close();
    }
  };

  const handleAttachFiles = (event) => {
    const files = Array.isArray(event?.detail?.files) ? event.detail.files : [];
    if (!files.length) return;
    const allowedKinds = getAllowedAttachmentKinds();
    const allowedNonLocalKinds = getAllowedNonLocalKinds();
    const chatId = state.activeChatId;
    const filtered = files.filter((file) => {
      const mediaType = file?.content_type || file?.type || getFileContentType(file);
      return isSupportedAttachmentType(mediaType);
    });
    const modelFiltered = filtered.filter((file) => {
      const mediaType = file?.content_type || file?.type || getFileContentType(file);
      return isAttachmentAllowedByModel(mediaType);
    });
    if (filtered.length !== files.length) {
      showToast('Some files were skipped (unsupported type).');
    }
    if (modelFiltered.length !== filtered.length) {
      if (allowedNonLocalKinds.length > 0) {
        showToast(`Current model supports ${allowedNonLocalKinds.join(', ')} attachments.`);
      } else if (allowedKinds.includes('text (local)')) {
        showToast('Only text attachments are supported for this model.');
      } else {
        showToast('Attachments are disabled for this model.');
      }
    }
    const current = getDraftAttachments(chatId);
    const seen = new Set(current.map((item) => String(item?.id || '')));
    const next = [...current];
    modelFiltered.forEach((file) => {
      const key = String(file?.id || '');
      if (!key || seen.has(key)) return;
      seen.add(key);
      next.push({
        id: file.id,
        filename: file.filename,
        content_type: file.content_type,
        file_size: file.file_size,
      });
    });
    setDraftAttachments(chatId, next);
  };

  window.addEventListener('growchat:files-selected', handleFilesSelected);
  window.addEventListener('attach-files', handleAttachFiles);

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

  return () => {
    if (activeStreamAbort) activeStreamAbort();
    if (chatListLoadObserver) chatListLoadObserver.disconnect();
    unsubscribe();
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
    window.removeEventListener('growchat:files-selected', handleFilesSelected);
    window.removeEventListener('attach-files', handleAttachFiles);
    window.removeEventListener('growchat:realtime', onRealtimeEvent);
    window.removeEventListener('popstate', onPopState);
    root.__cleanup = null;
  };
}
