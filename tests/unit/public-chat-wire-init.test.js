// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { initWireChat } from '../../public/js/features/chat/chat-wire-init.js';

function makeDeps(overrides = {}) {
  return {
    apiFetch: vi.fn(),
    shareChat: vi.fn(),
    unshareChat: vi.fn(),
    fetchArchivedChats: vi.fn(),
    toggleArchiveChat: vi.fn(),
    getFileMetadata: vi.fn(),
    getFileContent: vi.fn(),
    uploadFile: vi.fn(),
    fetchToolServers: vi.fn(),
    consumeToolServersInvalidation: vi.fn(),
    getFileBlob: vi.fn(),
    getClientSessionId: vi.fn(() => 'session-1'),
    showToast: vi.fn(),
    showToastProgress: vi.fn(),
    escapeHtml: vi.fn((s) => s),
    state: {},
    setState: vi.fn(),
    renderAssistantMessageBody: vi.fn(),
    getAllowedAttachmentKinds: vi.fn(),
    getAllowedNonLocalKinds: vi.fn(),
    getFileContentType: vi.fn(),
    isAttachmentAllowedByModel: vi.fn(),
    isSupportedAttachmentType: vi.fn(),
    createChatMessageDom: vi.fn(() => ({
      updateMessageContentDom: vi.fn(),
      applyAssistantErrorMessage: vi.fn(),
    })),
    createChatCacheController: vi.fn(() => ({
      schedulePrune: vi.fn(),
    })),
    createChatUiResources: vi.fn(() => ({
      loadAllowedToolServers: vi.fn(),
      checkToolServersInvalidation: vi.fn(),
      bindToolServersInvalidationListener: vi.fn(),
      unbindToolServersInvalidationListener: vi.fn(),
      hydrateAttachmentImages: vi.fn(),
      loadSearchModalModule: vi.fn(),
      loadFilesModalModule: vi.fn(),
      clearAttachmentCaches: vi.fn(),
      scheduleSidebarEnhancements: vi.fn(),
    })),
    loadChatStreamModule: vi.fn(),
    loadChatModalsModule: vi.fn(),
    loadChatFileEventsModule: vi.fn(),
    loadChatMessageSeqModule: vi.fn(),
    loadChatSidebarListModule: vi.fn(),
    loadChatStreamControllerModule: vi.fn(),
    ...overrides,
  };
}

function makeRoot() {
  const el = document.createElement('div');
  const ids = [
    'toggle-chats-btn',
    'toggle-chats-icon',
    'chat-list',
    'chat-list-container',
    'messages-list',
    'welcome-screen-container',
    'message-input-container',
    'sidebar-home-btn',
    'new-chat',
    'toggle-sidebar-mobile',
    'toggle-sidebar-desktop',
    'header-menu-btn',
    'header-menu-dropdown',
    'sidebar',
    'sidebar-backdrop',
    'messages-container',
    'open-search',
    'search-modal-container',
    'files-modal-container',
    'share-modal-container',
    'archived-modal-container',
    'citation-modal-container',
  ];
  ids.forEach((id) => {
    const child = document.createElement('div');
    child.id = id;
    el.appendChild(child);
  });
  return el;
}

describe('initWireChat', () => {
  it('populates ctx with ensureStreamSession so setupWireChatFeatures can destructure it', () => {
    const root = makeRoot();
    const deps = makeDeps();
    const ctx = { root };

    initWireChat(root, deps, ctx);

    expect(typeof ctx.ensureStreamSession).toBe('function');
  });

  it('populates ctx with activeStreamAbort (initially null)', () => {
    const root = makeRoot();
    const deps = makeDeps();
    const ctx = { root };

    initWireChat(root, deps, ctx);

    expect(ctx).toHaveProperty('activeStreamAbort');
    expect(ctx.activeStreamAbort).toBeNull();
  });
});
