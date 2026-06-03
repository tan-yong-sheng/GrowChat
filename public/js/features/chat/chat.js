// Chat module - main orchestration.
// Split from original chat.js for line-count compliance.

import { renderChat as _renderChat } from './chat-html.js';
import { getWireChatDeps } from './chat-wire-deps.js';
import { initWireChat } from './chat-wire-init.js';
import { setupWireChatFeatures } from './chat-wire-setup.js';
import { setupWireChatControllers } from './chat-wire-controllers.js';

export function renderChat(container) {
  return _renderChat(container, wireChat);
}

function wireChat(root) {
  const ctx = { root };
  const deps = getWireChatDeps();
  initWireChat(root, deps, ctx);
  setupWireChatFeatures(ctx, deps);
  setupWireChatControllers(ctx, deps);
  // prettier-ignore
  const {
    PINNED_COLLAPSED_KEY, applyAssistantErrorMessage, archivedModalContainer, bindToolServersInvalidationListener, buildChatSidebarListFragmentImpl, buildFallbackAssistantMessage, buildTempChat, chatList, chatListContainerEl, checkToolServersInvalidation, clearGlobalStreamAbort, consumeSseTextStream,
    currentLeafByChatId, destroyChatFileEvents, destroyMessageListInteractions, destroySidebar, drawMessages, ensureChatFileEvents, ensureChatListHandlers, ensureMessageListInteractions, ensureMessageSequenceTracker, ensureRealtimeController, ensureStreamRuntime, filesModalContainer,
    getChatHandlers, getDraftAttachments, getDraftToolNames, getMessageById, getMessageSeq, headerMenuBtn, headerMenuDropdown, isTempChatId, loadAllowedToolServers, loadChats, loadChatsImpl, loadMessages,
    loadMessagesImpl, maybeRefreshChatListObserver, messageBlocksById, messageInputContainer, messagesList, newChatBtn, notePayloadSeq, onChatListInteraction, onRealtimeEvent, openArchivedModal, openCitation, openSearchBtn,
    pruneTempChats, recentChatIds, refreshChatListObserver, refreshChatListObserverImpl, refreshShareState, refreshShareStateImpl, registerPendingTempMessage, replaceTempMessageId, resolveTempMessageId, schedulePrune, scheduleSidebarHydrationWarmup, searchModalContainer,
    setBranchSelection, setDraftAttachments, setDraftToolNames, setGlobalStreamAbort, setStreamingState, shareModalContainer, sharedByChatId, shellController, sidebar, sidebarBackdrop, sidebarHomeBtn, startNewChat,
    startNewChatImpl, streamSession, streamingOverrideByChat, syncChatUrl, syncChatUrlImpl, thinkingActiveByMessageId, thinkingCollapsedByKey, thinkingDurationByMessageId, thinkingStartByMessageId, toggleChatsBtn, toggleChatsIcon, toggleSidebarDesktop,
    toggleSidebarMobile, toolCallsByMessageId, toolExpandedByKey, uiResources, unbindToolServersInvalidationListener, updateChatTitleLocal, updateMessageContentDom, welcomeScreenContainer
  } = ctx;
  let activeStreamAbort = ctx.activeStreamAbort;
  let chatMessageFlow = ctx.chatMessageFlow;
  let pinnedSectionCollapsed = ctx.pinnedSectionCollapsed;
  let sidebarHydrationWarmupTimer = ctx.sidebarHydrationWarmupTimer;
  // prettier-ignore
  const {
    apiFetch, appendBlock, createChatDataController, createChatMessageStream, createChatShellController, ensureThinkingBlock, extractThinkingBlocks, formatApiErrorMessage,
    renderMessageInput, renderModelSelector, renderPlaceholder, setState, state, subscribe, touchRecentChat, updateToolCallState,
    toggleArchiveChat, fetchChats, fetchSharedChats
  } = deps;

  const destroyShellEvents = shellController.bindShellEvents();
  const dataController = createChatDataController({
    state,
    setState,
    apiFetch,
    fetchChats,
    fetchSharedChats,
    sharedByChatId,
    recentChatIds,
    currentLeafByChatId,
    streamSession,
    drawMessages,
    startResumeStream,
    touchRecentChat,
    schedulePrune,
    isTempChatId,
  });
  ctx.refreshShareStateImpl = dataController.refreshShareState;
  ctx.loadChatsImpl = dataController.loadChats;
  ctx.loadMessagesImpl = dataController.loadMessages;
  chatMessageFlow = createChatMessageStream({
    state,
    setState,
    apiFetch,
    syncChatUrl,
    drawMessages,
    buildTempChat,
    pruneTempChats,
    getDraftAttachments,
    getDraftToolNames,
    setDraftAttachments,
    updateChatTitleLocal,
    currentLeafByChatId,
    registerPendingTempMessage,
    setBranchSelection,
    streamingOverrideByChat,
    setGlobalStreamAbort,
    clearGlobalStreamAbort,
    setStreamingState,
    getActiveStreamAbort: () => activeStreamAbort,
    setActiveStreamAbort: (value) => {
      activeStreamAbort = value;
    },
    consumeSseTextStream,
    appendBlock,
    ensureThinkingBlock,
    updateToolCallState,
    notePayloadSeq,
    buildFallbackAssistantMessage,
    formatApiErrorMessage,
    updateMessageContentDom,
    applyAssistantErrorMessage,
    getMessageById,
    loadMessages,
    getMessageSeq,
    extractThinkingBlocksFn: extractThinkingBlocks,
    thinkingStartByMessageId,
    thinkingDurationByMessageId,
    thinkingActiveByMessageId,
    messageBlocksById,
    toolCallsByMessageId,
    streamSession,
    isTempChatId,
    replaceTempMessageId,
    resolveTempMessageId,
  });
  uiResources.scheduleSidebarEnhancements(root);
  let destroySearchModal;
  let destroyFilesModal;
  async function ensureSearchModal() {
    if (destroySearchModal) return;
    const { renderSearchModal } = await uiResources.loadSearchModalModule();
    destroySearchModal = renderSearchModal(searchModalContainer, startNewChat, loadMessages);
  }
  async function ensureFilesModal() {
    if (destroyFilesModal) return;
    const { renderFilesModal } = await uiResources.loadFilesModalModule();
    destroyFilesModal = renderFilesModal(filesModalContainer);
  }
  const inputComponent = renderMessageInput(messageInputContainer, sendMessage, async () => {
    await ensureFilesModal();
    setState({ showFiles: true });
  });
  bindToolServersInvalidationListener();
  checkToolServersInvalidation();
  const modelSelectorContainer = root.querySelector('#model-selector-container');
  const destroyModelSelector = modelSelectorContainer
    ? renderModelSelector(modelSelectorContainer)
    : null;
  let toolServersWarmupTriggered = false;
  const warmupToolServers = () => {
    if (toolServersWarmupTriggered) return;
    toolServersWarmupTriggered = true;
    void loadAllowedToolServers();
  };
  function getActiveModel() {
    return state.models.find((m) => m.id === state.activeModelId) || null;
  }
  let destroyPlaceholder;
  function drawPlaceholder() {
    destroyPlaceholder = renderPlaceholder(welcomeScreenContainer, {
      model: getActiveModel(),
      onSuggestionClick: (text) => {
        inputComponent.setValue(text);
      },
    });
  }
  drawPlaceholder();
  function drawChats(chats, activeId) {
    if (!buildChatSidebarListFragmentImpl) {
      scheduleSidebarHydrationWarmup();
      const fallbackFragment = document.createDocumentFragment();
      const chatItems = Array.isArray(chats) ? chats : [];
      if (chatItems.length === 0 && !state?.chatsPagination?.loading) {
        const emptyState = document.createElement('div');
        emptyState.className = 'px-3 py-4 text-sm text-gray-400 sidebar-full-only';
        emptyState.textContent = 'No chat sessions yet.';
        fallbackFragment.appendChild(emptyState);
      } else {
        chatItems.slice(0, 24).forEach((chat) => {
          const handlers = getChatHandlers(chat);
          const item = document.createElement('li');
          const button = document.createElement('button');
          button.type = 'button';
          button.className = `w-full text-left px-3 py-2 rounded-lg text-sm transition ${String(chat?.id) === String(activeId) ? 'bg-white text-gray-900 font-medium' : 'text-gray-600 hover:bg-white'}`;
          button.textContent = chat?.title || 'Untitled Chat';
          button.addEventListener('click', () => {
            handlers.onClick?.(chat?.id);
          });
          item.appendChild(button);
          fallbackFragment.appendChild(item);
        });
      }
      if (state?.chatsPagination?.loading) {
        const loadingRow = document.createElement('div');
        loadingRow.className = 'px-3 py-3 text-xs text-gray-400';
        loadingRow.textContent = 'Loading more chats...';
        fallbackFragment.appendChild(loadingRow);
      } else if (state?.chatsPagination?.hasMore) {
        const sentinel = document.createElement('div');
        sentinel.id = 'chat-list-load-more';
        sentinel.className = 'h-6';
        fallbackFragment.appendChild(sentinel);
      }
      chatList.innerHTML = '';
      chatList.appendChild(fallbackFragment);
      return;
    }
    const fragment = buildChatSidebarListFragmentImpl({
      chats,
      activeId,
      models: state.models,
      state,
      isPinnedSectionCollapsed: pinnedSectionCollapsed,
      onPinnedToggle: () => {
        pinnedSectionCollapsed = !pinnedSectionCollapsed;
        try {
          localStorage.setItem(PINNED_COLLAPSED_KEY, pinnedSectionCollapsed ? '1' : '0');
        } catch {
          /* ignored */
        }
        drawChats(state.chats, state.activeChatId);
      },
      getChatHandlers,
    });
    chatList.innerHTML = '';
    chatList.appendChild(fragment);
  }
  window.addEventListener('growchat:realtime', onRealtimeEvent);
  async function sendMessage(text, hooks = {}, options = {}) {
    const prompt = String(text || '').trim();
    if (!prompt) {
      hooks.onFinished?.();
      return;
    }
    // Render optimistic UI synchronously before any async work,
    // so the user sees their message instantly.
    const optimisticState = chatMessageFlow?.prepareSendOptimisticUI?.(prompt);
    try {
      // Lazy-load stream modules in parallel — these resolve instantly
      // if already warmed up via focusin, otherwise fetch the JS chunks.
      await ensureStreamRuntime();
      await ensureMessageSequenceTracker();
      return chatMessageFlow?.sendWithOptimisticState?.(prompt, hooks, options, optimisticState);
    } catch (err) {
      console.error('sendMessage init failed:', err);
      hooks.onFinished?.();
    }
  }
  messageInputContainer.addEventListener(
    'focusin',
    () => {
      void ensureChatFileEvents();
      warmupToolServers();
      void ensureMessageSequenceTracker();
    },
    { once: true }
  );
  const onHeaderMenuInteraction = () => {
    void ensureChatListHandlers();
    warmupToolServers();
  };
  const handleMessageListInteractionFallback = (event) => {
    if (!event?.target) return;
    const thinkingTarget = event.target.closest?.('[data-thinking-toggle]');
    if (thinkingTarget) {
      const key = thinkingTarget.getAttribute('data-thinking-toggle');
      if (!key) return;
      const isCollapsed = thinkingCollapsedByKey.get(key) ?? false;
      const next = !isCollapsed;
      thinkingCollapsedByKey.set(key, next);
      const body = messagesList?.querySelector(`[data-thinking-body="${key}"]`);
      const chevron = messagesList?.querySelector(`[data-thinking-chevron="${key}"]`);
      if (body) body.classList.toggle('hidden', next);
      if (chevron) {
        chevron.classList.toggle('-rotate-90', next);
        chevron.classList.toggle('rotate-0', !next);
      }
      return;
    }
    const toolTarget = event.target.closest?.('[data-tool-toggle]');
    if (toolTarget) {
      const key = toolTarget.getAttribute('data-tool-toggle');
      if (!key) return;
      const expanded = toolExpandedByKey.get(key) === true;
      const next = !expanded;
      toolExpandedByKey.set(key, next);
      const body = messagesList?.querySelector(`[data-tool-body="${key}"]`);
      const chevron = messagesList?.querySelector(`[data-tool-chevron="${key}"]`);
      if (body) body.classList.toggle('hidden', !next);
      if (chevron) {
        chevron.classList.toggle('-rotate-90', !next);
        chevron.classList.toggle('rotate-0', next);
      }
      return;
    }
    const citationTarget = event.target.closest?.('[data-citation-id]');
    if (citationTarget) {
      const id = citationTarget.getAttribute('data-citation-id');
      if (!id) return;
      openCitation(id);
    }
  };
  const onMessageListInteraction = (event) => {
    handleMessageListInteractionFallback(event);
    void ensureMessageListInteractions();
    void ensureStreamRuntime();
    void ensureMessageSequenceTracker();
  };
  let lastActiveChatId = state.activeChatId;
  const unsubscribe = subscribe((currentState) => {
    if (currentState.showSearch) {
      ensureSearchModal();
    }
    if (currentState.showFiles) {
      ensureFilesModal();
    }
    if (currentState.showSidebar && currentState.isMobile) {
      sidebarBackdrop.classList.remove('hidden');
      document.body.style.overflow = 'hidden';
    } else {
      sidebarBackdrop.classList.add('hidden');
      if (
        !currentState.showSearch &&
        !shareModalContainer.innerHTML &&
        !archivedModalContainer.innerHTML
      ) {
        document.body.style.overflow = '';
      }
    }
    if (currentState.activeChatId && currentState.activeChatId !== lastActiveChatId) {
      if (lastActiveChatId) streamSession.stopStreamPolling(lastActiveChatId);
      void ensureRealtimeController();
      touchRecentChat(recentChatIds, currentState.activeChatId);
      schedulePrune();
    }
    lastActiveChatId = currentState.activeChatId;
    headerMenuBtn.disabled = !currentState.activeChatId || isTempChatId(currentState.activeChatId);
    drawChats(currentState.chats, currentState.activeChatId);
    maybeRefreshChatListObserver();
  });
  chatListContainerEl?.addEventListener('wheel', onChatListInteraction, {
    once: true,
    passive: true,
  });
  chatListContainerEl?.addEventListener('touchstart', onChatListInteraction, {
    once: true,
    passive: true,
  });
  chatListContainerEl?.addEventListener('scroll', onChatListInteraction, {
    once: true,
    passive: true,
  });
  chatListContainerEl?.addEventListener('pointerenter', onChatListInteraction, {
    once: true,
    passive: true,
  });
  chatListContainerEl?.addEventListener('focusin', onChatListInteraction, {
    once: true,
  });
  chatListContainerEl?.addEventListener('click', onChatListInteraction, {
    once: true,
    capture: true,
  });
  headerMenuBtn?.addEventListener('click', onHeaderMenuInteraction, {
    once: true,
  });
  headerMenuDropdown?.addEventListener('click', onHeaderMenuInteraction, {
    once: true,
  });
  messagesList?.addEventListener('click', onMessageListInteraction, {
    once: true,
    capture: true,
  });
  drawChats(state.chats, state.activeChatId);
  maybeRefreshChatListObserver();
  requestAnimationFrame(() => {
    drawChats(state.chats, state.activeChatId);
    maybeRefreshChatListObserver();
  });
  if (state.activeChatId) {
    void ensureRealtimeController();
    loadMessages(state.activeChatId, { modelMode: 'default' }).finally(() => {
      drawChats(state.chats, state.activeChatId);
      maybeRefreshChatListObserver();
    });
  }
  async function startResumeStream(chatId, messageId) {
    await ensureStreamRuntime();
    await ensureMessageSequenceTracker();
    return chatMessageFlow?.startResumeStream?.(chatId, messageId);
  }
  return () => {
    if (sidebarHydrationWarmupTimer) {
      clearTimeout(sidebarHydrationWarmupTimer);
      sidebarHydrationWarmupTimer = null;
    }
    if (activeStreamAbort) activeStreamAbort();
    streamSession.dispose();
    unsubscribe();
    uiResources.clearAttachmentCaches();
    destroySearchModal?.();
    destroyFilesModal?.();
    destroyModelSelector?.();
    destroySidebar?.();
    inputComponent?.destroy?.();
    destroyPlaceholder?.();
    destroyChatFileEvents?.();
    destroyMessageListInteractions?.();
    window.removeEventListener('growchat:realtime', onRealtimeEvent);
    unbindToolServersInvalidationListener();
    chatListContainerEl?.removeEventListener('wheel', onChatListInteraction);
    chatListContainerEl?.removeEventListener('touchstart', onChatListInteraction);
    chatListContainerEl?.removeEventListener('scroll', onChatListInteraction);
    headerMenuBtn?.removeEventListener('click', onHeaderMenuInteraction);
    headerMenuDropdown?.removeEventListener('click', onHeaderMenuInteraction);
    messagesList?.removeEventListener('click', onMessageListInteraction, true);
    destroyShellEvents?.();
    shellController.dispose?.();
    root.__cleanup = null;
  };
}

export { wireChat };
