import {
  apiFetch,
  fetchArchivedChats,
  fetchChats,
  fetchSharedChats,
  getFileContent,
  getFileMetadata,
  getClientSessionId,
  shareChat,
  toggleArchiveChat,
  unshareChat,
} from './api.js';
import { escapeHtml, renderMessageContent, SseLineParser, showToast } from './utils.js';
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
  const clientSessionId = getClientSessionId();
  let activeStreamAbort = null;
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

  const resolveTempMessageId = (chatId, id) => {
    if (!chatId || !id) return id;
    const map = tempMessageIdMapByChat.get(String(chatId));
    if (!map) return id;
    return map.get(String(id)) || id;
  };

  const replaceTempMessageId = (chatId, tempId, realId) => {
    if (!chatId || !tempId || !realId || tempId === realId) return;
    mapTempMessageId(chatId, tempId, realId);
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
    const modelToUse = state.activeModelId || state.defaultModelId;
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

  function renderAssistantContent(content, isError) {
    const rendered = renderMessageContent(content);
    if (!isError) return rendered;
    return `<div class="rounded-lg border border-red-200 bg-red-50 text-red-700 px-3 py-2 text-[14px] leading-[1.6] font-sans">${rendered}</div>`;
  }

  function formatModelDisplayName(modelId) {
    const raw = String(modelId || '').trim();
    if (!raw) return 'Assistant';
    const idx = raw.indexOf(':');
    if (idx > 0) return raw.slice(idx + 1);
    return raw;
  }

  function updateMessageContentDom(messageId, content, isError = false) {
    if (!messageId) return false;
    const el = messagesList.querySelector(`[data-message-content="${messageId}"]`);
    if (!el) return false;
    const forceError = isError || el.dataset.messageError === '1';
    if (forceError) {
      el.dataset.messageError = '1';
    }
    el.innerHTML = renderAssistantContent(content, forceError);
    return true;
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
        return `
          <div class="flex justify-end w-full group py-2" data-message-id="${msgId}">
            <div class="flex flex-col items-end max-w-[85%] gap-1">
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
                ${renderAssistantContent(displayContent, isError)}
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
            alert(err.error || err.message || 'Failed to copy message');
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

        const runBranchRequest = async (sourceId) => {
          try {
            setStreamingState(chatId, true);
            const res = await apiFetch(`/api/chats/${chatId}/messages/${sourceId}/branch`, {
              method: 'POST',
              body: JSON.stringify({ content: newContent, model: state.activeModelId || undefined }),
              signal: controller.signal
            });

            if (!res.ok || !res.body) {
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
            if (payload?.event === 'start' && payload?.user_message_id) {
              replaceTempMessageId(chatId, tempUserId, String(payload.user_message_id));
            }
            if (payload?.event === 'start' && payload?.message_id) {
              assistantMessageId = String(payload.message_id);
              replaceTempMessageId(chatId, tempAssistantId, assistantMessageId);
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

          const applyAssistantText = () => {
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
              updateMessageContentDom(assistantMessageId, assistantText, errorActive);
            }
          };

            while (true) {
              const { done, value } = await reader.read();
              if (done) {
                assistantText += parser.flush();
                applyAssistantText();
                streamingOverrideByChat.delete(chatId);
                await loadMessages(chatId, {
                  draw: state.activeChatId === chatId,
                  updateActiveModel: state.activeChatId === chatId,
                });
                break;
              }
              const chunk = decoder.decode(value, { stream: true });
              assistantText += parser.push(chunk);
              applyAssistantText();
            }
          } catch (e) {
            if (e?.name !== 'AbortError') {
              console.error('Branching failed', e);
              alert('An error occurred while branching the chat.');
            }
          } finally {
            streamingOverrideByChat.delete(chatId);
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

          const applyAssistantText = () => {
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
              updateMessageContentDom(assistantMessageId, assistantText, errorActive);
            }
          };

          while (true) {
            const { done, value } = await reader.read();
            if (done) {
              assistantText += parser.flush();
              applyAssistantText();
              streamingOverrideByChat.delete(chatId);
              await loadMessages(chatId, {
                draw: state.activeChatId === chatId,
                updateActiveModel: state.activeChatId === chatId,
              });
              break;
            }
            const chunk = decoder.decode(value, { stream: true });
            assistantText += parser.push(chunk);
            applyAssistantText();
          }
        } catch (e) {
          if (e?.name !== 'AbortError') {
            console.error('Regeneration failed', e);
          }
        } finally {
          streamingOverrideByChat.delete(chatId);
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
    const { draw = true, updateActiveModel = draw, modelMode = 'keep' } = options;
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

    const messages = (data.messages || []).map(m => ({ ...m, done: true }));

    const lastMsgId = data.chat?.current_message_id || (messages.length > 0 ? messages[messages.length - 1].id : null);
    if (lastMsgId) {
      currentLeafByChatId.set(chatId, String(lastMsgId));
    }

    const nextState = {
      messagesByChat: { ...state.messagesByChat, [chatId]: messages },
    };
    if (updateActiveModel) {
      let preferredModelId = state.activeModelId;
      if (modelMode === 'default') {
        preferredModelId = data?.chat?.model || state.activeModelId || state.defaultModelId;
      } else if (modelMode === 'chat') {
        preferredModelId = data?.chat?.model || state.activeModelId || state.defaultModelId;
      }
      nextState.activeModelId = preferredModelId;
    }
    nextState.ui = { loadingChatId: null };
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
      activeModelId: prev.activeModelId || prev.defaultModelId || tempChat.model,
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
        activeModelId: prev.activeModelId || prev.defaultModelId || tempChat.model,
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
          activeModelId: prev.activeModelId || prev.defaultModelId || tempChat.model,
        }));
      }
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
    const tempUserMessage = {
      id: tempUserId,
      role: 'user',
      content: text,
      model: state.activeModelId,
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
      const modelToUse = state.activeModelId || state.defaultModelId;
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
        return {
          chats: deduped,
          activeChatId: realChatId,
          activeModelId: prev.activeModelId || data.chat.model || prev.defaultModelId,
          messagesByChat: nextMessagesByChat,
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
    hooks.onAbortable?.(activeStreamAbort);

    let res;
    setStreamingState(chatId, true);
    try {
      res = await apiFetch(`/api/chats/${chatId}/messages`, {
        method: 'POST',
        body: JSON.stringify({ message: text, model: state.activeModelId || undefined }),
        signal: controller.signal,
      });
    } catch (err) {
      setStreamingState(chatId, false);
      const isAbort = err?.name === 'AbortError';
      if (localMessages.length > 0) {
        localMessages[localMessages.length - 1].done = true;
        localMessages[localMessages.length - 1].content = isAbort ? 'Stopped.' : 'Failed to connect to the server.';
        setState((prev) => ({ messagesByChat: { ...prev.messagesByChat, [chatId]: localMessages } }));
        if (state.activeChatId === chatId) drawMessages(localMessages);
      }
      return;
    }

    if (!res.ok || !res.body) {
      setStreamingState(chatId, false);
      if (localMessages.length > 0) {
        localMessages[localMessages.length - 1].done = true;
        localMessages[localMessages.length - 1].content = 'Failed to connect to the server.';
        setState((prev) => ({ messagesByChat: { ...prev.messagesByChat, [chatId]: localMessages } }));
        if (state.activeChatId === chatId) drawMessages(localMessages);
      }
      return;
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

    const applyAssistantText = () => {
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
        updateMessageContentDom(assistantMessageId, assistantText, errorActive);
      }
    };

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          assistantText += parser.flush();
          applyAssistantText();
          streamingOverrideByChat.delete(chatId);
          await loadMessages(chatId, {
            draw: state.activeChatId === chatId,
            updateActiveModel: state.activeChatId === chatId,
          });
          break;
        }
        const chunk = decoder.decode(value, { stream: true });
        assistantText += parser.push(chunk);
        applyAssistantText();
      }
    } catch (err) {
      if (err?.name !== 'AbortError') {
        console.error('Stream error:', err);
      }
    } finally {
      streamingOverrideByChat.delete(chatId);
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
  window.addEventListener('growchat:open-archived', onOpenArchivedEvent);
  window.addEventListener('popstate', onPopState);

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
    window.removeEventListener('growchat:realtime', onRealtimeEvent);
    window.removeEventListener('popstate', onPopState);
    root.__cleanup = null;
  };
}
