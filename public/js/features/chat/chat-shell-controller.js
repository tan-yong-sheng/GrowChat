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
  syncChatUrl = () => {},
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
  headerMenuBtn = null,
  headerMenuDropdown = null,
  getChatHandlers = () => ({}) ,
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

  function refreshChatListObserver() {
    if (chatListLoadObserver) {
      chatListLoadObserver.disconnect();
      chatListLoadObserver = null;
    }

    if (!state.chatsPagination?.hasMore || !chatListContainerEl) return;
    const sentinel = root?.querySelector('#chat-list-load-more');
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

  function startNewChat() {
    const activeTempId = state.activeChatId && isTempChatId(state.activeChatId) ? state.activeChatId : null;
    if (activeTempId && (state.messagesByChat[activeTempId] || []).length === 0) {
      setState({ activeChatId: activeTempId, newChatDraft: '' });
      if (state.newChatToolSelection !== null) {
        setDraftToolNames(activeTempId, state.newChatToolSelection);
        setDraftToolNames(null, null);
      }
      syncRoute(activeTempId);
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
    syncRoute(tempChat.id);
    drawMessages([]);
  }

  const onToggleSidebar = () => {
    if (state.isMobile) {
      setState({ showSidebar: !state.showSidebar });
    } else if (!state.showSidebar) {
      setState({ showSidebar: true });
    } else {
      setState({ sidebarCollapsed: !state.sidebarCollapsed });
    }
  };

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

  const onHeaderMenuClick = (e) => {
    e.stopPropagation();
    if (headerMenuDropdown) {
      headerMenuDropdown.classList.toggle('hidden');
    }
  };

  const onHeaderMenuAction = async (e) => {
    const actionBtn = e.target?.closest?.('button[data-action]');
    if (!actionBtn || !state.activeChatId) return;

    const action = actionBtn.dataset.action;
    const chatId = state.activeChatId;
    const chat = state.chats.find((item) => item.id === chatId);
    const handlers = getChatHandlers(chat);

    if (action === 'share') handlers.share?.(chatId);
    else if (action === 'rename') handlers.rename?.(chatId);
    else if (action === 'archive') handlers.archive?.(chatId);
    else if (action === 'delete') handlers.delete?.(chatId);

    headerMenuDropdown?.classList.add('hidden');
  };

  const onDocumentClickForHeaderMenu = (e) => {
    if (headerMenuBtn && headerMenuDropdown && !headerMenuBtn.contains(e.target) && !headerMenuDropdown.contains(e.target)) {
      headerMenuDropdown.classList.add('hidden');
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
    headerMenuBtn?.addEventListener('click', onHeaderMenuClick);
    headerMenuDropdown?.addEventListener('click', onHeaderMenuAction);
    window.addEventListener('growchat:open-archived', onOpenArchivedEvent);
    window.addEventListener('popstate', onPopState);
    document.addEventListener('click', onDocumentClickForHeaderMenu);

    return () => {
      sidebarHomeBtn?.removeEventListener('click', onHome);
      toggleSidebarMobile?.removeEventListener('click', onToggleSidebar);
      toggleSidebarDesktop?.removeEventListener('click', onToggleSidebar);
      openSearchBtn?.removeEventListener('click', onOpenSearch);
      newChatBtn?.removeEventListener('click', onNewChat);
      sidebarBackdrop?.removeEventListener('click', onSidebarBackdropClick);
      toggleChatsBtn?.removeEventListener('click', onToggleChats);
      headerMenuBtn?.removeEventListener('click', onHeaderMenuClick);
      headerMenuDropdown?.removeEventListener('click', onHeaderMenuAction);
      window.removeEventListener('growchat:open-archived', onOpenArchivedEvent);
      window.removeEventListener('popstate', onPopState);
      document.removeEventListener('click', onDocumentClickForHeaderMenu);
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
