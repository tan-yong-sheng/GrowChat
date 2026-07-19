// WireChat setup: drafts, identity, stream runtime, title, realtime.
// Phase 2 of wireChat extraction from chat.js.

export function setupWireChatFeatures(ctx, deps) {
  let {
    activeStreamAbort,
    consumeSseTextStream,
    drawMessages,
    ensureStreamSession,
    loadChats,
    loadMessages,
    messagesList,
    notePayloadSeq,
    openCitation,
    processedRealtimeEvents,
    refreshShareState,
    renderShareModal,
    sharedByChatId,
    sidebar,
    streamSession,
    syncChatUrl,
    uiResources,
    welcomeScreenContainer,
    updateMessageContentDom,
    applyAssistantErrorMessage,
    clientSessionId,
    chatMessageFlow,
    openCitationImpl,
    destroyChatFileEvents,
  } = ctx;
  const {
    state,
    setState,
    createChatMessageDom,
    createChatMessageIdentityTracker,
    renderSidebar,
    loadChatStreamStateModule,
    loadChatRealtimeControllerModule,
    updateToolCallState,
    touchRecentChat,
    schedulePrune,
  } = deps;

  const setGlobalStreamAbort = (fn) => {
    window.__growchatAbortStream = fn;
  };
  const clearGlobalStreamAbort = (fn) => {
    if (window.__growchatAbortStream === fn) {
      window.__growchatAbortStream = null;
    }
  };
  const getDraftAttachments = (chatId = state.activeChatId) => {
    if (chatId) {
      return state.attachmentsByChat?.[chatId] || [];
    }
    return state.newChatAttachments || [];
  };
  const setDraftAttachments = (chatId, attachments) => {
    if (chatId) {
      setState({
        attachmentsByChat: { ...(state.attachmentsByChat || {}), [chatId]: attachments },
      });
      return;
    }
    setState({ newChatAttachments: attachments });
  };
  const normalizeToolNames = (names) => {
    if (!Array.isArray(names)) return null;
    const seen = new Set();
    const next = [];
    for (const value of names) {
      const name = String(value || '').trim();
      if (!name || seen.has(name)) continue;
      seen.add(name);
      next.push(name);
    }
    return next;
  };
  const getDraftToolNames = (chatId = state.activeChatId) => {
    if (chatId) {
      const stored = state.toolSelectionsByChat?.[chatId];
      return stored === undefined ? null : stored;
    }
    return state.newChatToolSelection;
  };
  const setDraftToolNames = (chatId, names) => {
    const next = names === null ? null : normalizeToolNames(names);
    if (chatId) {
      setState((prev) => {
        const nextMap = { ...(prev.toolSelectionsByChat || {}) };
        if (next === null) {
          delete nextMap[chatId];
        } else {
          nextMap[chatId] = next;
        }
        return { toolSelectionsByChat: nextMap };
      });
      return;
    }
    setState({ newChatToolSelection: next });
  };
  const loadAllowedToolServers = () => uiResources.loadAllowedToolServers();
  const checkToolServersInvalidation = () => uiResources.checkToolServersInvalidation();
  const bindToolServersInvalidationListener = () =>
    uiResources.bindToolServersInvalidationListener();
  const unbindToolServersInvalidationListener = () =>
    uiResources.unbindToolServersInvalidationListener();
  const PINNED_COLLAPSED_KEY = 'growchat_pinned_section_collapsed';
  let pinnedSectionCollapsed = false;
  try {
    pinnedSectionCollapsed = localStorage.getItem(PINNED_COLLAPSED_KEY) === '1';
  } catch {
    /* ignore */
  }
  const destroySidebar = renderSidebar(sidebar, ctx.root);
  const messageIdentityTracker = createChatMessageIdentityTracker({
    setState,
    messagesList,
    activeChatIdGetter: () => state.activeChatId,
  });
  const {
    currentLeafByChatId,
    branchSelectionByChat,
    streamingOverrideByChat,
    resolveTempMessageId,
    replaceTempMessageId,
    registerPendingTempMessage,
    matchPendingTempMessage,
    waitForResolvedMessageId,
    setBranchSelection,
  } = messageIdentityTracker;
  const isTempChatId = (id) => String(id || '').startsWith('temp-');
  let setStreamingStateImpl = () => {};
  let requestCancelStreamImpl = async () => false;
  const setStreamingState = (...args) => setStreamingStateImpl(...args);
  let streamRuntimeReadyPromise = null;
  const ensureStreamRuntime = () => {
    if (streamRuntimeReadyPromise) return streamRuntimeReadyPromise;
    streamRuntimeReadyPromise = Promise.all([ensureStreamSession(), loadChatStreamStateModule()])
      .then(([session, streamStateModule]) => {
        if (!session || !streamStateModule?.createChatStreamState) return null;
        const streamState = streamStateModule.createChatStreamState({
          state,
          setState,
          apiFetch: deps.apiFetch,
          streamSession,
          streamingOverrideByChat,
          drawMessages,
          getActiveStreamAbort: () => ctx.activeStreamAbort,
          setActiveStreamAbort: (value) => {
            activeStreamAbort = value;
            ctx.activeStreamAbort = value;
          },
          clearGlobalStreamAbort,
        });
        setStreamingStateImpl = streamState?.setStreamingState || (() => {});
        requestCancelStreamImpl = streamState?.requestCancelStream || (async () => false);
        return true;
      })
      .catch((err) => {
        console.warn('Failed to initialize stream runtime:', err);
        streamRuntimeReadyPromise = null;
        return null;
      });
    return streamRuntimeReadyPromise;
  };
  const requestCancelStream = async (...args) => {
    await ensureStreamRuntime();
    return requestCancelStreamImpl(...args);
  };
  window.__growchatRequestCancel = (...args) => requestCancelStream(...args);
  const createFallbackTitleUpdater = () => (chatId, nextTitle) => {
    const targetId = String(chatId || '');
    const title = String(nextTitle || '').trim();
    if (!targetId || !title) return;
    setState((prev) => {
      const chats = Array.isArray(prev.chats) ? prev.chats : [];
      let changed = false;
      const nextChats = chats.map((chat) => {
        if (String(chat?.id || '') !== targetId) return chat;
        if (String(chat?.title || '') === title) return chat;
        changed = true;
        return { ...chat, title };
      });
      return changed ? { chats: nextChats } : {};
    });
  };
  const fallbackUpdateChatTitleLocal = createFallbackTitleUpdater();
  let updateChatTitleLocalImpl = fallbackUpdateChatTitleLocal;
  let onRealtimeEventImpl = null;
  let realtimeControllerReadyPromise = null;
  const updateChatTitleLocal = (...args) => updateChatTitleLocalImpl(...args);
  const ensureRealtimeController = () => {
    if (realtimeControllerReadyPromise) return realtimeControllerReadyPromise;
    realtimeControllerReadyPromise = loadChatRealtimeControllerModule()
      .then(({ createChatRealtimeController }) => {
        const realtimeController = createChatRealtimeController({
          state,
          setState,
          drawMessages,
          loadChats,
          loadMessages,
          touchRecentChat,
          schedulePrune,
          currentLeafByChatId,
          streamingOverrideByChat,
          setStreamingState,
          updateToolCallState,
          updateMessageContentDom,
          matchPendingTempMessage,
          replaceTempMessageId,
          getActiveStreamAbort: () => ctx.activeStreamAbort,
          setActiveStreamAbort: (value) => {
            activeStreamAbort = value;
            ctx.activeStreamAbort = value;
          },
          clearGlobalStreamAbort,
          clientSessionId,
          processedRealtimeEvents,
          toolCallsByMessageId: ctx.toolCallsByMessageId,
          messageBlocksById: ctx.messageBlocksById,
          isTempChatId,
        });
        onRealtimeEventImpl = realtimeController?.onRealtimeEvent || null;
        updateChatTitleLocalImpl =
          realtimeController?.updateChatTitleLocal || fallbackUpdateChatTitleLocal;
        return realtimeController;
      })
      .catch((err) => {
        console.warn('Failed to initialize realtime controller:', err);
        realtimeControllerReadyPromise = null;
        return null;
      });
    return realtimeControllerReadyPromise;
  };
  const onRealtimeEvent = (event) => {
    if (onRealtimeEventImpl) {
      onRealtimeEventImpl(event);
      return;
    }
    void ensureRealtimeController().then((controller) => {
      controller?.onRealtimeEvent?.(event);
    });
  };

  Object.assign(ctx, {
    activeStreamAbort,
    setGlobalStreamAbort,
    clearGlobalStreamAbort,
    getDraftAttachments,
    setDraftAttachments,
    normalizeToolNames,
    getDraftToolNames,
    setDraftToolNames,
    loadAllowedToolServers,
    checkToolServersInvalidation,
    bindToolServersInvalidationListener,
    unbindToolServersInvalidationListener,
    PINNED_COLLAPSED_KEY,
    pinnedSectionCollapsed,
    destroySidebar,
    currentLeafByChatId,
    branchSelectionByChat,
    streamingOverrideByChat,
    resolveTempMessageId,
    replaceTempMessageId,
    registerPendingTempMessage,
    matchPendingTempMessage,
    waitForResolvedMessageId,
    setBranchSelection,
    isTempChatId,
    setStreamingState,
    setStreamingStateImpl,
    requestCancelStreamImpl,
    streamRuntimeReadyPromise,
    ensureStreamRuntime,
    requestCancelStream,
    fallbackUpdateChatTitleLocal,
    updateChatTitleLocalImpl,
    onRealtimeEventImpl,
    realtimeControllerReadyPromise,
    updateChatTitleLocal,
    ensureRealtimeController,
    onRealtimeEvent,
  });
}
