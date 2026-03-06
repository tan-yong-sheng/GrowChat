export const state = {
  // App Core
  chats: [],
  activeChatId: null,
  messagesByChat: {},
  models: [],
  activeModelId: null,
  
  // UI Layout
  showSidebar: window.innerWidth >= 768,
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
  
  // Interaction State
  drafts: JSON.parse(localStorage.getItem('drafts') || '{}'), // chatId -> draft text
  newChatDraft: '',
  ui: {
    loading: false,
    streaming: false
  }
};

const listeners = new Set();

export function setState(updater) {
  const changes = typeof updater === 'function' ? updater(state) : updater;
  let hasChanges = false;
  
  for (const key in changes) {
    if (typeof changes[key] === 'object' && changes[key] !== null && !Array.isArray(changes[key])) {
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
    if (changes.drafts) localStorage.setItem('drafts', JSON.stringify(state.drafts));
    
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
