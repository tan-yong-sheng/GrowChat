import {
  readStoredJson,
  readStoredString,
  writeStoredJson,
  writeStoredString,
} from './utils/storage.js';

const TABLET_BREAKPOINT_PX = 768;
const DEFAULT_SIDEBAR_WIDTH_PX = 260;

export const state = {
  // App Core
  chats: [],
  chatsPagination: {
    limit: 30,
    offset: 0,
    hasMore: false,
    loading: false,
  },
  activeChatId: null,
  messagesByChat: {},
  models: [],
  modelCatalogMeta: null,
  modelsLoading: false,
  activeModelId: null,
  defaultModelId: null,
  globalDefaultModelId: null,
  toolServers: [],
  toolServersLoading: false,
  toolServersLoaded: false,

  // UI Layout
  showSidebar: window.innerWidth >= TABLET_BREAKPOINT_PX,
  sidebarCollapsed: readStoredString(localStorage, 'sidebarCollapsed', 'false') === 'true',
  sidebarWidth:
    Number.parseInt(readStoredString(localStorage, 'sidebarWidth', ''), 10) ||
    DEFAULT_SIDEBAR_WIDTH_PX,
  isMobile: window.innerWidth < TABLET_BREAKPOINT_PX,

  // Search Modal State
  showSearch: false,
  search: {
    query: '',
    results: [],
    selectedIndex: -1,
    previewChatId: null,
    loading: false,
    offset: 0,
    hasMore: true,
  },

  // Files Modal State
  showFiles: false,
  files: {
    items: [],
    loading: false,
    selectedIds: [],
    offset: 0,
    hasMore: true,
  },
  attachmentsByChat: {},
  newChatAttachments: [],
  toolSelectionsByChat: readStoredJson(localStorage, 'toolSelectionsByChat', {}),
  newChatToolSelection: null,

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
    modelAvailabilityNotice: null,
    editingMessages: {}, // { messageId: content }
    pendingDeleteMessageKeys: {}, // { `${chatId}:${messageId}`: true }
  },
};

const listeners = new Set();

function computeChanges(updater) {
  return typeof updater === 'function' ? updater(state) : updater;
}

function isPlainStateObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function replaceStateObject(key, value) {
  if (state[key] === value) return false;
  state[key] = value;
  return true;
}

function mergeStateObject(key, value) {
  if (!state[key]) state[key] = {};
  let changed = false;
  for (const subKey in value) {
    if (state[key][subKey] !== value[subKey]) {
      state[key][subKey] = value[subKey];
      changed = true;
    }
  }
  return changed;
}

function setStateValue(key, value) {
  if (state[key] === value) return false;
  state[key] = value;
  return true;
}

function applyStateChange(key, value, replaceObjectKeys) {
  if (!isPlainStateObject(value)) {
    return setStateValue(key, value);
  }
  if (replaceObjectKeys.has(key)) {
    return replaceStateObject(key, value);
  }
  return mergeStateObject(key, value);
}

function persistSidebarWidth(changes) {
  if (changes.sidebarWidth) writeStoredString(localStorage, 'sidebarWidth', state.sidebarWidth);
}

function persistSidebarCollapsed(changes) {
  if (changes.sidebarCollapsed !== undefined) {
    writeStoredString(localStorage, 'sidebarCollapsed', state.sidebarCollapsed);
  }
}

function persistDrafts(changes) {
  if (changes.drafts) writeStoredJson(localStorage, 'drafts', state.drafts);
}

function persistNewChatDraft(changes) {
  if (changes.newChatDraft !== undefined) {
    writeStoredString(localStorage, 'newChatDraft', state.newChatDraft || '');
  }
}

function persistToolSelections(changes) {
  if (changes.toolSelectionsByChat) {
    writeStoredJson(localStorage, 'toolSelectionsByChat', state.toolSelectionsByChat);
  }
}

function persistStateChanges(changes) {
  persistSidebarWidth(changes);
  persistSidebarCollapsed(changes);
  persistDrafts(changes);
  persistNewChatDraft(changes);
  persistToolSelections(changes);
  // defaultModelId is stored server-side; avoid persisting stale local values.
}

export function setState(updater) {
  const changes = computeChanges(updater);
  const replaceObjectKeys = new Set([
    'drafts',
    'messagesByChat',
    'attachmentsByChat',
    'toolSelectionsByChat',
  ]);

  let hasChanges = false;
  for (const key in changes) {
    hasChanges = applyStateChange(key, changes[key], replaceObjectKeys) || hasChanges;
  }

  if (hasChanges) {
    persistStateChanges(changes);
    notifyListeners();
  }
}

export function subscribe(listener) {
  listeners.add(listener);
  listener(state);
  return () => listeners.delete(listener);
}

export function snapshotSidebarState() {
  return {
    showSidebar: state.showSidebar,
    sidebarCollapsed: state.sidebarCollapsed,
  };
}

export function restoreSidebarState(snapshot = null) {
  if (!snapshot || typeof snapshot !== 'object') return;
  setState({
    showSidebar: snapshot.showSidebar !== undefined ? snapshot.showSidebar : state.showSidebar,
    sidebarCollapsed:
      snapshot.sidebarCollapsed !== undefined ? snapshot.sidebarCollapsed : state.sidebarCollapsed,
  });
}

function notifyListeners() {
  listeners.forEach((listener) => listener(state));
}

window.addEventListener('resize', () => {
  const isMobile = window.innerWidth < TABLET_BREAKPOINT_PX;
  if (state.isMobile !== isMobile) {
    setState({
      isMobile,
      showSidebar: !isMobile,
    });
  }
});
