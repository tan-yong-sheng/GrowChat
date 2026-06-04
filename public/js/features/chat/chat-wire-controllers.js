// WireChat controllers: render, message list, chat handlers, shell.
// Phase 3 of wireChat extraction from chat.js.

export function setupWireChatControllers(ctx, deps) {
  const {
    messagesList,
    welcomeScreenContainer,
    messagesContainer,
    thinkingCollapsedByKey,
    toolExpandedByKey,
    thinkingActiveByMessageId,
    thinkingDurationByMessageId,
    thinkingStartByMessageId,
    toolCallsByMessageId,
    messageBlocksById,
    errorExpandedByMessageId,
    currentLeafByChatId,
    branchSelectionByChat,
    streamingOverrideByChat,
    loadMessages,
    openCitation,
    setStreamingState,
    clearGlobalStreamAbort,
    setGlobalStreamAbort,
    consumeSseTextStream,
    notePayloadSeq,
    updateMessageContentDom,
    applyAssistantErrorMessage,
    sharedByChatId,
    isTempChatId,
    loadChats,
    refreshShareState,
    renderShareModal,
    syncChatUrl,
    streamSession,
    messageInputContainer,
    chatListContainerEl,
    sidebarHomeBtn,
    toggleSidebarMobile,
    toggleSidebarDesktop,
    openSearchBtn,
    newChatBtn,
    sidebarBackdrop,
    toggleChatsBtn,
    toggleChatsIcon,
    uiResources,
    pruneTempChats,
    buildTempChat,
    getDraftAttachments,
    getDraftToolNames,
    setDraftAttachments,
    setDraftToolNames,
    chatMessageFlow,
    resolveTempMessageId,
    replaceTempMessageId,
    registerPendingTempMessage,
    waitForResolvedMessageId,
    setBranchSelection,
    getMessageSeq,
    updateChatTitleLocal,
    recentChatIds,
    schedulePrune,
    drawMessages,
    sidebar,
    startNewChat,
    chatList,
    openArchivedModal,
    pinnedSectionCollapsed,
    PINNED_COLLAPSED_KEY,
    ensureSearchModal,
  } = ctx;
  const {
    state,
    setState,
    apiFetch,
    fetchChats,
    fetchSharedChats,
    appendBlock,
    ensureThinkingBlock,
    updateToolCallState,
    createChatRenderController,
    createChatShellController,
    createChatMessageStream,
    createChatDataController,
    loadChatListActionsModule,
    loadChatMessageListControllerModule,
    formatApiErrorMessage,
    extractThinkingBlocks,
    touchRecentChat,
    showToast,
    renderMessageInput,
  } = deps;

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
  const getMessageById = (chatId, messageId) => {
    if (!chatId || !messageId) return null;
    const list = state.messagesByChat[chatId] || [];
    return list.find((msg) => String(msg.id) === String(messageId)) || null;
  };
  const hydrateAttachmentImages = (containerEl) => uiResources.hydrateAttachmentImages(containerEl);
  const renderController = createChatRenderController({
    state,
    setState,
    messagesList,
    welcomeScreenContainer,
    messagesContainer,
    hydrateAttachmentImages,
    branchSelectionByChat,
    currentLeafByChatId,
    streamingOverrideByChat,
    errorExpandedByMessageId,
    thinkingCollapsedByKey,
    toolExpandedByKey,
    thinkingActiveByMessageId,
    thinkingDurationByMessageId,
    thinkingStartByMessageId,
    toolCallsByMessageId,
    messageBlocksById,
    showToast,
    apiFetch,
    loadMessages,
    waitForResolvedMessageId,
    getMessageById,
    resolveTempMessageId,
    replaceTempMessageId,
    registerPendingTempMessage,
    setBranchSelection,
    setStreamingState,
    getActiveStreamAbort: () => ctx.activeStreamAbort,
    setActiveStreamAbort: (value) => {
      ctx.activeStreamAbort = value;
    },
    clearGlobalStreamAbort,
    setGlobalStreamAbort,
    consumeSseTextStream,
    appendBlock,
    ensureThinkingBlock,
    updateToolCallState,
    notePayloadSeq,
    buildFallbackAssistantMessage,
    formatApiErrorMessage,
    updateMessageContentDom,
    applyAssistantErrorMessage,
    openCitation,
  });
  ctx.drawMessagesImpl = renderController.drawMessages;
  let destroyMessageListInteractions = null;
  let messageListInteractionsReadyPromise = null;
  const ensureMessageListInteractions = () => {
    if (destroyMessageListInteractions) return Promise.resolve(true);
    if (messageListInteractionsReadyPromise) return messageListInteractionsReadyPromise;
    messageListInteractionsReadyPromise = loadChatMessageListControllerModule()
      .then(({ createChatMessageListController }) => {
        destroyMessageListInteractions = createChatMessageListController({
          messagesList,
          thinkingCollapsedByKey,
          toolExpandedByKey,
          openCitation,
        });
        return true;
      })
      .catch((err) => {
        console.warn('Failed to load chat message list interactions:', err);
        messageListInteractionsReadyPromise = null;
        return null;
      });
    return messageListInteractionsReadyPromise;
  };
  const createFallbackChatHandlers = () => ({
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
      void loadMessages(id, { modelMode: 'default' });
      if (state.isMobile) setState({ showSidebar: false });
    },
    rename: async () => {},
    pin: async () => {},
    duplicate: async () => {},
    share: async () => {},
    archive: async () => {},
    delete: async () => {},
  });
  let getChatHandlersImpl = createFallbackChatHandlers;
  const getChatHandlers = (...args) => getChatHandlersImpl(...args);
  let chatListHandlersReadyPromise = null;
  const ensureChatListHandlers = () => {
    if (chatListHandlersReadyPromise) return chatListHandlersReadyPromise;
    chatListHandlersReadyPromise = loadChatListActionsModule()
      .then(({ createChatListHandlers }) => {
        getChatHandlersImpl = createChatListHandlers({
          state,
          apiFetch,
          loadChats,
          loadMessages,
          syncChatUrl,
          setState,
          isTempChatId,
          refreshShareState,
          renderShareModal,
          sharedByChatId,
          toggleArchiveChat: deps.toggleArchiveChat,
          drawMessages,
          currentLeafByChatId,
          streamingOverrideByChatId: streamingOverrideByChat,
        });
        ctx.drawChats?.(state.chats, state.activeChatId);
        return true;
      })
      .catch((err) => {
        console.warn('Failed to load chat list handlers:', err);
        chatListHandlersReadyPromise = null;
        return null;
      });
    return chatListHandlersReadyPromise;
  };
  const pruneTempChatsImpl = (list) =>
    Array.isArray(list) ? list.filter((c) => !isTempChatId(c?.id)) : [];
  const buildTempChatImpl = (id = null) => {
    const nowTs = Math.floor(Date.now() / 1000);
    const modelToUse = state.activeModelId || state.defaultModelId || state.globalDefaultModelId;
    const tempChatId = id || `temp-${nowTs}-${Math.random().toString(36).slice(2, 8)}`;
    return {
      id: tempChatId,
      title: 'New Chat',
      model: modelToUse || null,
      pinned: 0,
      created_at: nowTs,
      updated_at: nowTs,
    };
  };
  const shellController = createChatShellController({
    state,
    setState,
    fetchChats,
    drawMessages,
    loadMessages,
    buildTempChat: buildTempChatImpl,
    pruneTempChats: pruneTempChatsImpl,
    setDraftToolNames,
    isTempChatId,
    openArchivedModal,
    ensureSearchModal: ctx.ensureSearchModal,
    chatListContainerEl,
    root: ctx.root,
    sidebarHomeBtn,
    toggleSidebarMobile,
    toggleSidebarDesktop,
    openSearchBtn,
    newChatBtn,
    sidebarBackdrop,
    toggleChatsBtn,
    toggleChatsIcon,
    getChatHandlers,
  });
  ctx.syncChatUrlImpl = shellController.syncChatUrl;
  ctx.startNewChatImpl = shellController.startNewChat;
  ctx.refreshChatListObserverImpl = shellController.refreshChatListObserver;

  Object.assign(ctx, {
    destroyShellEvents: shellController.bindShellEvents(),
    shellController,
    renderController,
    destroyMessageListInteractions,
    messageListInteractionsReadyPromise,
    ensureMessageListInteractions,
    getChatHandlers,
    chatListHandlersReadyPromise,
    ensureChatListHandlers,
    pruneTempChats: pruneTempChatsImpl,
    buildTempChat: buildTempChatImpl,
    buildFallbackAssistantMessage,
    getMessageById,
    hydrateAttachmentImages,
    getChatHandlersImpl,
  });
}
