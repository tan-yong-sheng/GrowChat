import { toggleSidebar } from '../../shared/components/sidebar-helpers.js';

export function createChatShellController({
  state,
  setState = () => {},
  fetchChats = async () => ({ chats: [], limit: 0, offset: 0, has_more: false }),
  drawMessages = () => {},
  loadMessages = async () => {},
  buildTempChat = () => null,
  pruneTempChats = (list) => list,
  setDraftToolNames = () => {},
  isTempChatId = () => false,
  openArchivedModal = () => {},
  ensureSearchModal = async () => {},
  chatListContainerEl = null,
  root = null,
  sidebarHomeBtn = null,
  toggleSidebarMobile = null,
  toggleSidebarDesktop = null,
  openSearchBtn = null,
  newChatBtn = null,
  sidebarBackdrop = null,
  toggleChatsBtn = null,
  toggleChatsIcon = null,
  getChatHandlers = () => ({}),
} = {}) {
  let loadMoreChatsPromise = null;
  let chatListLoadObserver = null;
  let isChatsCollapsed = false;

  function syncRoute(chatId, { replace = false } = {}) {
    const nextPath = chatId ? `/c/${encodeURIComponent(chatId)}` : '/';
    if (window.location.pathname === nextPath) return;
    window.history[replace ? 'replaceState' : 'pushState']({}, '', nextPath);
  }

  function loadMoreChats() {
    if (!shouldLoadMoreChats()) return loadMoreChatsPromise;

    setState({ chatsPagination: { loading: true } });
    const { limit, offset } = state.chatsPagination;
    loadMoreChatsPromise = fetchChats({ limit, offset })
      .then(applyLoadedChats)
      .catch(handleLoadMoreChatsError)
      .finally(() => {
        loadMoreChatsPromise = null;
      });

    return loadMoreChatsPromise;
  }

  function shouldLoadMoreChats() {
    if (loadMoreChatsPromise) return false;
    if (!state.chatsPagination?.hasMore) return false;
    if (state.chatsPagination?.loading) return false;
    return true;
  }

  function mergeChatsWith(nextChats) {
    const existingIds = new Set(state.chats.map((chat) => chat.id));
    return state.chats.concat(nextChats.filter((chat) => !existingIds.has(chat.id)));
  }

  function applyLoadedChats(data) {
    const nextChats = data.chats || [];
    const { limit, offset } = state.chatsPagination;
    setState({
      chats: mergeChatsWith(nextChats),
      chatsPagination: {
        limit: data.limit || limit,
        offset: (data.offset || offset) + nextChats.length,
        hasMore: data.has_more === true,
        loading: false,
      },
    });
  }

  function handleLoadMoreChatsError(err) {
    console.error('Failed to load more chats:', err);
    setState({ chatsPagination: { loading: false } });
  }

  function refreshChatListObserver() {
    if (chatListLoadObserver) {
      chatListLoadObserver.disconnect();
      chatListLoadObserver = null;
    }

    if (!state.chatsPagination?.hasMore || !chatListContainerEl) return;
    const sentinel = root?.querySelector('#chat-list-load-more');
    if (!sentinel) return;

    chatListLoadObserver = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            loadMoreChats();
          }
        });
      },
      {
        root: chatListContainerEl,
        rootMargin: '120px 0px',
        threshold: 0.1,
      }
    );

    chatListLoadObserver.observe(sentinel);
  }

  function startNewChat() {
    if (reuseEmptyTempChat()) return;
    startFreshTempChat();
}

function reuseEmptyTempChat() {
    const activeTempId = activeEmptyTempChatId();
    if (!activeTempId) return false;
    setState({ activeChatId: activeTempId, newChatDraft: '' });
    transferDraftToolSelection(activeTempId);
    syncRoute(activeTempId);
    drawMessages([]);
    return true;
}

function activeEmptyTempChatId() {
    if (!state.activeChatId || !isTempChatId(state.activeChatId)) return null;
    if ((state.messagesByChat[state.activeChatId] || []).length !== 0) return null;
    return state.activeChatId;
}

function transferDraftToolSelection(chatId) {
    if (state.newChatToolSelection === null) return;
    setDraftToolNames(chatId, state.newChatToolSelection);
    setDraftToolNames(null, null);
}

function startFreshTempChat() {
    const tempChat = buildTempChat();
    transferDraftToolSelection(tempChat.id);
    setState((prev) => ({
      chats: [tempChat, ...pruneTempChats(prev.chats)],
      activeChatId: tempChat.id,
      activeModelId:
        prev.activeModelId || prev.defaultModelId || prev.globalDefaultModelId || tempChat.model,
      newChatDraft: '',
    }));
    syncRoute(tempChat.id);
    drawMessages([]);
}

  const onToggleSidebar = () => toggleSidebar(state, setState);

  const onOpenSearch = async () => {
    await ensureSearchModal();
    setState({ showSearch: true });
  };

  const onNewChat = () => startNewChat();

  const onHome = () => {
    setState({ activeChatId: null });
    syncRoute(null);
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
      syncRoute(state.activeChatId, { replace: true });
      return;
    }

    setState({ activeChatId: routeChatId });
    await loadMessages(routeChatId, { modelMode: 'default' });
  };

  const onToggleChats = () => {
    isChatsCollapsed = !isChatsCollapsed;
    if (!toggleChatsBtn || !toggleChatsIcon || !chatListContainerEl) return;
    if (isChatsCollapsed) {
      chatListContainerEl.classList.add('hidden');
      toggleChatsIcon.classList.add('rotate-180');
    } else {
      chatListContainerEl.classList.remove('hidden');
      toggleChatsIcon.classList.remove('rotate-180');
    }
  };

  const onSidebarBackdropClick = () => setState({ showSidebar: false });

  function bindShellEvents() {
    sidebarHomeBtn?.addEventListener('click', onHome);
    toggleSidebarMobile?.addEventListener('click', onToggleSidebar);
    toggleSidebarDesktop?.addEventListener('click', onToggleSidebar);
    openSearchBtn?.addEventListener('click', onOpenSearch);
    newChatBtn?.addEventListener('click', onNewChat);
    sidebarBackdrop?.addEventListener('click', onSidebarBackdropClick);
    toggleChatsBtn?.addEventListener('click', onToggleChats);
    window.addEventListener('growchat:open-archived', onOpenArchivedEvent);
    window.addEventListener('popstate', onPopState);

    return () => {
      sidebarHomeBtn?.removeEventListener('click', onHome);
      toggleSidebarMobile?.removeEventListener('click', onToggleSidebar);
      toggleSidebarDesktop?.removeEventListener('click', onToggleSidebar);
      openSearchBtn?.removeEventListener('click', onOpenSearch);
      newChatBtn?.removeEventListener('click', onNewChat);
      sidebarBackdrop?.removeEventListener('click', onSidebarBackdropClick);
      toggleChatsBtn?.removeEventListener('click', onToggleChats);
      window.removeEventListener('growchat:open-archived', onOpenArchivedEvent);
      window.removeEventListener('popstate', onPopState);
    };
  }

  function dispose() {
    if (chatListLoadObserver) {
      chatListLoadObserver.disconnect();
      chatListLoadObserver = null;
    }
    loadMoreChatsPromise = null;
  }

  return {
    syncChatUrl: syncRoute,
    loadMoreChats,
    refreshChatListObserver,
    startNewChat,
    onToggleSidebar,
    onOpenSearch,
    onNewChat,
    onHome,
    onOpenArchivedEvent,
    onPopState,
    bindShellEvents,
    dispose,
  };
}
