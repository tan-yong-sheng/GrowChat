import { readStoredJson, readStoredString, writeStoredJson, writeStoredString } from './utils/storage.js';

export const state = {
  // App Core
  chats: [],
  chatsPagination: {
    limit: 30,
    offset: 0,
    hasMore: false,
    loading: false
  },
  activeChatId: null,
  messagesByChat: {},
  models: [],
  modelsLoading: false,
  activeModelId: null,
  defaultModelId: null,
  globalDefaultModelId: null,
  
  // UI Layout
  showSidebar: window.innerWidth >= 768,
  sidebarCollapsed: readStoredString(localStorage, 'sidebarCollapsed', 'false') === 'true',
  sidebarWidth: Number.parseInt(readStoredString(localStorage, 'sidebarWidth', ''), 10) || 260,
  isMobile: window.innerWidth < 768,
  
  // Search Modal State
  showSearch: false,
  search: {
    query: '',
    results: [],
    selectedIndex: -1,
    previewChatId: null,
    loading: false,
    offset: 0,
    hasMore: true
  },

  // Files Modal State
  showFiles: false,
  files: {
    items: [],
    loading: false,
    selectedIds: [],
    offset: 0,
    hasMore: true
  },
  attachmentsByChat: {},
  newChatAttachments: [],

  // RBAC State
  permissions: [],
  userRoles: [],
  rbacLoading: false,
  
  // Interaction State
  drafts: readStoredJson(localStorage, 'drafts', {}), // chatId -> draft text
  newChatDraft: readStoredString(localStorage, 'newChatDraft', ''),
  ui: {
    loading: false,
    streaming: false,
    streamingChatId: null,
    loadingChatId: null,
    editingMessages: {}, // { messageId: content }
    pendingDeleteMessageKeys: {}, // { `${chatId}:${messageId}`: true }
  }
};

const listeners = new Set();

export function setState(updater) {
  const changes = typeof updater === 'function' ? updater(state) : updater;
  let hasChanges = false;
  const replaceObjectKeys = new Set(['drafts']);
  
  for (const key in changes) {
    if (typeof changes[key] === 'object' && changes[key] !== null && !Array.isArray(changes[key])) {
      if (replaceObjectKeys.has(key)) {
        if (state[key] !== changes[key]) {
          state[key] = changes[key];
          hasChanges = true;
        }
        continue;
      }
      // Nested update for search/ui objects
      if (!state[key]) state[key] = {};
      for (const subKey in changes[key]) {
        if (state[key][subKey] !== changes[key][subKey]) {
          state[key][subKey] = changes[key][subKey];
          hasChanges = true;
        }
      }
    } else if (state[key] !== changes[key]) {
      state[key] = changes[key];
      hasChanges = true;
    }
  }

  if (hasChanges) {
    // Persist certain state fields
    if (changes.sidebarWidth) writeStoredString(localStorage, 'sidebarWidth', state.sidebarWidth);
    if (changes.sidebarCollapsed !== undefined) writeStoredString(localStorage, 'sidebarCollapsed', state.sidebarCollapsed);
    if (changes.drafts) writeStoredJson(localStorage, 'drafts', state.drafts);
    if (changes.newChatDraft !== undefined) writeStoredString(localStorage, 'newChatDraft', state.newChatDraft || '');
    if (changes.defaultModelId) {
      // defaultModelId is stored server-side; avoid persisting stale local values.
    }
    
    notifyListeners();
  }
}

export function subscribe(listener) {
  listeners.add(listener);
  listener(state);
  return () => listeners.delete(listener);
}

function notifyListeners() {
  listeners.forEach(listener => listener(state));
}

window.addEventListener('resize', () => {
  const isMobile = window.innerWidth < 768;
  if (state.isMobile !== isMobile) {
    setState({ 
      isMobile,
      showSidebar: !isMobile
    });
  }
});
