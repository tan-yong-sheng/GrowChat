export const state = {
  // App Core
  chats: [],
  activeChatId: null,
  messagesByChat: {},
  models: [],
  activeModelId: null,
  defaultModelId: localStorage.getItem('defaultModelId'),
  
  // UI Layout
  showSidebar: window.innerWidth >= 768,
  sidebarCollapsed: localStorage.getItem('sidebarCollapsed') === 'true',
  sidebarWidth: parseInt(localStorage.getItem('sidebarWidth')) || 260,
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

  // RBAC State
  permissions: [],
  userRoles: [],
  rbacLoading: false,
  
  // Interaction State
  drafts: JSON.parse(localStorage.getItem('drafts') || '{}'), // chatId -> draft text
  newChatDraft: '',
  ui: {
    loading: false,
    streaming: false,
    editingMessages: {} // { messageId: content }
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
    if (changes.sidebarWidth) localStorage.setItem('sidebarWidth', state.sidebarWidth);
    if (changes.sidebarCollapsed !== undefined) localStorage.setItem('sidebarCollapsed', state.sidebarCollapsed);
    if (changes.drafts) localStorage.setItem('drafts', JSON.stringify(state.drafts));
    if (changes.defaultModelId) localStorage.setItem('defaultModelId', state.defaultModelId);
    
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
