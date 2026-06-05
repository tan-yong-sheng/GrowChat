// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

const MOCK_DRAW_CALLS = [];

vi.mock('../../public/js/features/chat/chat-wire-deps.js', () => {
  let subscribeCb = null;
  let stateValue = {
    chats: [{ id: 'c1', title: 'Chat 1' }],
    chatsPagination: {},
    activeChatId: 'c1',
    messagesByChat: {},
    models: [],
    modelsLoading: false,
    activeModelId: 'm1',
    defaultModelId: 'm1',
    globalDefaultModelId: 'm1',
    toolServers: [],
    toolServersLoading: false,
    toolServersLoaded: false,
    showSidebar: true,
    sidebarCollapsed: false,
    sidebarWidth: 260,
    isMobile: false,
    showSearch: false,
    search: {},
    showFiles: false,
    files: {},
    attachmentsByChat: {},
    newChatAttachments: [],
    toolSelectionsByChat: {},
    newChatToolSelection: null,
    permissions: [],
    userRoles: [],
    rbacLoading: false,
    drafts: {},
    newChatDraft: '',
    ui: {},
  };

  function getWireChatDeps() {
    return {
      state: stateValue,
      setState: (updater) => {
        const next = typeof updater === 'function' ? updater(stateValue) : updater;
        if (!next) return;
        stateValue = { ...stateValue, ...next };
        if (subscribeCb) {
          try {
            subscribeCb(stateValue);
          } catch {
            // ignore listener errors in test harness
          }
        }
      },
      subscribe: (cb) => {
        subscribeCb = cb;
        cb(stateValue);
        return () => {
          subscribeCb = null;
        };
      },
      apiFetch: vi.fn(),
      fetchChats: vi.fn(async () => ({ chats: [], limit: 30, offset: 0, has_more: false })),
      fetchSharedChats: vi.fn(async () => ({ chats: [] })),
      shareChat: vi.fn(),
      unshareChat: vi.fn(),
      fetchArchivedChats: vi.fn(async () => ({ chats: [] })),
      toggleArchiveChat: vi.fn(),
      getFileMetadata: vi.fn(),
      getFileContent: vi.fn(),
      uploadFile: vi.fn(),
      fetchToolServers: vi.fn(async () => ({})),
      consumeToolServersInvalidation: vi.fn(),
      getFileBlob: vi.fn(),
      getClientSessionId: vi.fn(() => 'session-1'),
      showToast: vi.fn(),
      showToastProgress: vi.fn(),
      escapeHtml: vi.fn((s) => s),
      renderAssistantMessageBody: vi.fn(() => '<div>assistant</div>'),
      getAllowedAttachmentKinds: vi.fn(() => ({ allowedKinds: [], accepts: [] })),
      getAllowedNonLocalKinds: vi.fn(() => []),
      getFileContentType: vi.fn(),
      isAttachmentAllowedByModel: vi.fn(() => true),
      isSupportedAttachmentType: vi.fn(() => true),
      touchRecentChat: vi.fn(),
      formatApiErrorMessage: vi.fn((_, fallback) => fallback),
      extractThinkingBlocks: vi.fn(() => []),
      createChatCacheController: vi.fn(() => ({
        schedulePrune: vi.fn(),
        destroy: vi.fn(),
      })),
      createChatMessageIdentityTracker: vi.fn(() => ({
        getMessageById: vi.fn(),
        getBranchSelectionByChat: vi.fn(() => new Map()),
        replaceTempMessageId: vi.fn(),
        matchPendingTempMessage: vi.fn(),
      })),
      createChatMessageStream: vi.fn(() => ({
        sendMessage: vi.fn(),
        sendSingleMessage: vi.fn(),
        sendWithOptimisticState: vi.fn(),
        prepareSendOptimisticUI: vi.fn(() => ({
          optimistic: { tempChatId: 'temp-1', autoTitle: null },
          chatId: 'temp-1',
          tempUserId: 'temp-user-1',
          tempAssistantId: 'temp-asst-1',
          localMessages: [],
        })),
        startResumeStream: vi.fn(),
        stopResumeStream: vi.fn(),
      })),
      createChatDataController: vi.fn(() => ({
        refreshShareState: vi.fn(),
        loadChats: vi.fn(),
        loadMessages: vi.fn(async () => {}),
      })),
      createChatRenderController: vi.fn(() => ({
        drawMessages: vi.fn(),
        drawChats: (chats, activeId) => MOCK_DRAW_CALLS.push({ chats, activeId }),
      })),
      createChatShellController: vi.fn(() => ({
        syncChatUrl: vi.fn(),
        loadMoreChats: vi.fn(),
        refreshChatListObserver: vi.fn(),
        startNewChat: vi.fn(),
        onToggleSidebar: vi.fn(),
        onOpenSearch: vi.fn(),
        onNewChat: vi.fn(),
        onHome: vi.fn(),
        onOpenArchivedEvent: vi.fn(),
        onPopState: vi.fn(),
        bindShellEvents: vi.fn(() => () => {}),
        dispose: vi.fn(),
      })),
      createChatUiResources: vi.fn(() => ({
        loadAllowedToolServers: vi.fn(),
        checkToolServersInvalidation: vi.fn(),
        bindToolServersInvalidationListener: vi.fn(),
        unbindToolServersInvalidationListener: vi.fn(),
        hydrateAttachmentImages: vi.fn(),
        loadSearchModalModule: vi.fn(async () => ({ renderSearchModal: vi.fn() })),
        loadFilesModalModule: vi.fn(async () => ({ renderFilesModal: vi.fn() })),
        clearAttachmentCaches: vi.fn(),
        scheduleSidebarEnhancements: vi.fn(),
      })),
      loadChatStreamModule: vi.fn(async () => ({
        createChatStreamController: vi.fn(() => ({
          startStreamPolling: vi.fn(),
          stopStreamPolling: vi.fn(),
          stopResumeStream: vi.fn(),
          getRunningMessageId: vi.fn(),
        })),
      })),
      loadChatModalsModule: vi.fn(async () => ({})),
      loadChatFileEventsModule: vi.fn(async () => ({})),
      loadChatMessageSeqModule: vi.fn(async () => ({})),
      loadChatSidebarListModule: vi.fn(async () => ({
        buildChatSidebarListFragment: vi.fn(() => document.createDocumentFragment()),
      })),
      loadChatStreamControllerModule: vi.fn(async () => ({})),
      loadChatStreamStateModule: vi.fn(async () => ({})),
      loadChatListActionsModule: vi.fn(async () => ({})),
      loadChatMessageListControllerModule: vi.fn(async () => ({})),
      loadChatRealtimeControllerModule: vi.fn(async () => ({})),
      renderPlaceholder: vi.fn(() => vi.fn()),
      renderMessageInput: vi.fn(() => ({
        setValue: vi.fn(),
        submit: vi.fn(),
        destroy: vi.fn(),
      })),
      renderModelSelector: vi.fn(() => () => {}),
      renderSidebar: vi.fn(() => () => {}),
      createChatMessageDom: vi.fn(() => ({
        updateMessageContentDom: vi.fn(),
        applyAssistantErrorMessage: vi.fn(),
      })),
      appendBlock: vi.fn(),
      ensureThinkingBlock: vi.fn(),
      updateToolCallState: vi.fn(),
    };
  }

  return { getWireChatDeps };
});

import { getWireChatDeps } from '../../public/js/features/chat/chat-wire-deps.js';
import { renderChat } from '../../public/js/features/chat/chat.js';

function makeRoot() {
  const root = document.createElement('div');
  const ids = [
    'chat-list',
    'chat-list-container',
    'messages-list',
    'welcome-screen-container',
    'message-input-container',
    'sidebar-backdrop',
    'search-modal-container',
    'files-modal-container',
    'share-modal-container',
    'archived-modal-container',
    'message-input',
    'send-btn',
    'stop-btn',
    'mic-btn',
    'loading-spinner',
    'open-files-btn',
    'open-tools-btn',
    'attach-menu',
    'tools-menu',
    'tools-menu-all-on',
    'tools-menu-all-off',
    'tools-menu-list',
    'attach-upload',
    'attach-capture',
    'attachment-input',
    'camera-input',
    'attachment-list',
    'attachment-hint',
    'pending-queue',
    'composer',
    'sidebar',
    'toggle-chats-btn',
    'toggle-chats-icon',
    'new-chat',
    'toggle-sidebar-mobile',
    'toggle-sidebar-desktop',
    'sidebar-home-btn',
    'open-search',
    'model-selector-container',
  ];
  ids.forEach((id) => {
    const child = document.createElement('div');
    child.id = id;
    root.appendChild(child);
  });
  return root;
}

let origRAF;
let origCancelRAF;
let rafQueue = [];

beforeEach(() => {
  MOCK_DRAW_CALLS.length = 0;
  rafQueue = [];
  origRAF = globalThis.requestAnimationFrame;
  origCancelRAF = globalThis.cancelAnimationFrame;
  globalThis.requestAnimationFrame = (cb) => {
    rafQueue.push(cb);
    return rafQueue.length;
  };
  globalThis.cancelAnimationFrame = vi.fn();
});

afterEach(() => {
  globalThis.requestAnimationFrame = origRAF;
  globalThis.cancelAnimationFrame = origCancelRAF;
});

describe('chat.js subscribe throttling', () => {
  it('does NOT redraw the chat list when only messagesByChat changes during streaming', async () => {
    const root = makeRoot();
    await renderChat(root);
    // Initial render: 1 draw call (synchronous setup at end of wireChat).
    expect(MOCK_DRAW_CALLS.length).toBe(1);

    const { setState } = getWireChatDeps();

    // Simulate 10 streaming deltas — only messagesByChat changes.
    for (let i = 0; i < 10; i += 1) {
      setState({
        messagesByChat: {
          c1: [{ id: 'a1', role: 'assistant', content: `delta ${i}` }],
        },
        ui: { streaming: true, streamingChatId: 'c1' },
      });
    }

    // chats reference never changed, so drawChats is NOT called synchronously
    // and is NOT scheduled (rAF queue remains empty).
    expect(MOCK_DRAW_CALLS.length).toBe(1);
    expect(rafQueue.length).toBe(0);
  });

  it('schedules a rAF redraw when chats reference changes (new chat added)', async () => {
    const root = makeRoot();
    await renderChat(root);
    expect(MOCK_DRAW_CALLS.length).toBe(1);

    const { setState } = getWireChatDeps();

    setState({
      chats: [
        { id: 'c1', title: 'Chat 1' },
        { id: 'c2', title: 'Chat 2' },
      ],
      activeChatId: 'c2',
    });

    // The chats reference changed — a rAF was scheduled, but drawChats has
    // not yet been called (it runs at the next frame).
    expect(MOCK_DRAW_CALLS.length).toBe(1);
    expect(rafQueue.length).toBe(1);

    // Flush the rAF — drawChats runs once.
    const pending = rafQueue.splice(0, rafQueue.length);
    pending.forEach((cb) => cb(performance.now()));

    expect(MOCK_DRAW_CALLS.length).toBe(2);
    expect(MOCK_DRAW_CALLS[1].chats).toHaveLength(2);
  });

  it('coalesces multiple rapid chat-list changes into a single rAF', async () => {
    const root = makeRoot();
    await renderChat(root);

    const { setState } = getWireChatDeps();
    const initialCalls = MOCK_DRAW_CALLS.length;

    // Multiple state updates within the same frame all change chats ref.
    setState({ chats: [{ id: 'c2', title: 'Chat 2' }] });
    setState({ chats: [{ id: 'c3', title: 'Chat 3' }] });
    setState({ chats: [{ id: 'c4', title: 'Chat 4' }] });

    // Only one rAF should be queued.
    expect(rafQueue.length).toBe(1);

    // Flush — single redraw with the final chats list.
    const pending = rafQueue.splice(0, rafQueue.length);
    pending.forEach((cb) => cb(performance.now()));

    expect(MOCK_DRAW_CALLS.length).toBe(initialCalls + 1);
    expect(MOCK_DRAW_CALLS[MOCK_DRAW_CALLS.length - 1].chats[0].id).toBe('c4');
  });
});
