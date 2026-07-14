// Chat module - main orchestration.
// Split from original chat.js for line-count compliance.

import { rollbackOptimisticConversation } from './chat-message-stream-temp-chat.js';
import { appendEmptyChatStateItem } from './chat-sidebar-helpers.js';
import { renderChat as _renderChat } from './chat-html.js';
import { getWireChatDeps } from './chat-wire-deps.js';
import { initWireChat } from './chat-wire-init.js';
import { setupWireChatFeatures } from './chat-wire-setup.js';
import { setupWireChatControllers } from './chat-wire-controllers.js';
import { toggleThinkingSection, toggleToolSection } from './chat-message-interactions.js';

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
    PINNED_COLLAPSED_KEY, applyAssistantErrorMessage, archivedModalContainer, bindToolServersInvalidationListener,  buildFallbackAssistantMessage, buildTempChat, chatList, chatListContainerEl, checkToolServersInvalidation, clearGlobalStreamAbort, consumeSseTextStream,
    currentLeafByChatId, destroyChatFileEvents, destroyMessageListInteractions, destroySidebar, drawMessages, ensureChatFileEvents, ensureChatListHandlers, ensureMessageListInteractions, ensureMessageSequenceTracker, ensureRealtimeController, ensureStreamRuntime, filesModalContainer,
    getChatHandlers, getDraftAttachments, getDraftToolNames, getMessageById, getMessageSeq, isTempChatId, loadAllowedToolServers, loadChats, loadChatsImpl, loadMessages,
    loadMessagesImpl, maybeRefreshChatListObserver, messageBlocksById, messageInputContainer, messagesList, newChatBtn, notePayloadSeq, onChatListInteraction, onRealtimeEvent, openArchivedModal, openCitation, openSearchBtn,
    pruneTempChats, recentChatIds, refreshChatListObserver, refreshChatListObserverImpl, refreshShareState, refreshShareStateImpl, registerPendingTempMessage, replaceTempMessageId, resolveTempMessageId, schedulePrune, scheduleSidebarHydrationWarmup, searchModalContainer,
    destroyShellEvents, setBranchSelection, setDraftAttachments, setDraftToolNames, setGlobalStreamAbort, setStreamingState, shareModalContainer, sharedByChatId, shellController, sidebar, sidebarBackdrop, sidebarHomeBtn, startNewChat,
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
  ctx.ensureSearchModal = ensureSearchModal;
  ctx.ensureFilesModal = ensureFilesModal;
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
  function buildChatButton(chat, activeId, handlers) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `w-full text-left px-3 py-2 rounded-lg text-sm transition ${String(chat?.id) === String(activeId) ? 'bg-white text-gray-900 font-medium' : 'text-gray-600 hover:bg-white'}`;
    button.textContent = chat?.title || 'Untitled Chat';
    button.addEventListener('click', () => {
      handlers.onClick?.(chat?.id);
    });
    return button;
  }
  function appendLoadingRow(fragment) {
    const loadingRow = document.createElement('div');
    loadingRow.className = 'px-3 py-3 text-xs text-gray-600';
    loadingRow.textContent = 'Loading more chats...';
    const loadingItem = document.createElement('li');
    loadingItem.appendChild(loadingRow);
    fragment.appendChild(loadingItem);
  }
  function appendMoreSentinel(fragment) {
    const sentinel = document.createElement('div');
    sentinel.id = 'chat-list-load-more';
    sentinel.className = 'h-6';
    const sentinelItem = document.createElement('li');
    sentinelItem.appendChild(sentinel);
    fragment.appendChild(sentinelItem);
  }
  function buildFallbackChatListFragment(chats, activeId) {
    const fallbackFragment = document.createDocumentFragment();
    const chatItems = Array.isArray(chats) ? chats : [];
    if (chatItems.length === 0 && !state?.chatsPagination?.loading) {
      appendEmptyChatStateItem(fallbackFragment);
    } else {
      chatItems.slice(0, 24).forEach((chat) => {
        const handlers = getChatHandlers(chat);
        const item = document.createElement('li');
        item.appendChild(buildChatButton(chat, activeId, handlers));
        fallbackFragment.appendChild(item);
      });
    }
    if (state?.chatsPagination?.loading) {
      appendLoadingRow(fallbackFragment);
    } else if (state?.chatsPagination?.hasMore) {
      appendMoreSentinel(fallbackFragment);
    }
    return fallbackFragment;
  }
  function buildPinnedToggle() {
    pinnedSectionCollapsed = !pinnedSectionCollapsed;
    try {
      localStorage.setItem(PINNED_COLLAPSED_KEY, pinnedSectionCollapsed ? '1' : '0');
    } catch {
      /* ignored */
    }
    drawChats(state.chats, state.activeChatId);
  }
  function drawChats(chats, activeId) {
    if (!ctx.buildChatSidebarListFragmentImpl) {
      scheduleSidebarHydrationWarmup();
      const fallbackFragment = buildFallbackChatListFragment(chats, activeId);
      chatList.innerHTML = '';
      chatList.appendChild(fallbackFragment);
      return;
    }
    const fragment = ctx.buildChatSidebarListFragmentImpl({
      chats,
      activeId,
      models: state.models,
      state,
      isPinnedSectionCollapsed: pinnedSectionCollapsed,
      onPinnedToggle: buildPinnedToggle,
      getChatHandlers,
    });
    chatList.innerHTML = '';
    chatList.appendChild(fragment);
  }
  ctx.drawChats = drawChats;
  window.addEventListener('growchat:realtime', onRealtimeEvent);
  function preparePrompt(text) {
    return String(text || '').trim();
  }

  function rollbackOptimisticSend(optimisticState) {
    if (!optimisticState) return;
    const tempChatId = optimisticState.optimistic?.tempChatId;
    if (tempChatId) {
      rollbackOptimisticConversation({ setState, tempChatId });
    }
  }

  function finishSendError(err, hooks) {
    console.error('sendMessage init failed:', err);
    hooks.onFinished?.();
  }

  async function sendMessage(text, hooks = {}, options = {}) {
    const prompt = preparePrompt(text);
    if (!prompt) {
      hooks.onFinished?.();
      return;
    }
    let optimisticState;
    try {
      // Render optimistic UI synchronously before any async work,
      // so the user sees their message instantly.
      optimisticState = chatMessageFlow?.prepareSendOptimisticUI?.(prompt);
      // Lazy-load stream modules in parallel — these resolve instantly
      // if already warmed up via focusin, otherwise fetch the JS chunks.
      await ensureStreamRuntime();
      await ensureMessageSequenceTracker();
      return chatMessageFlow?.sendWithOptimisticState?.(prompt, hooks, options, optimisticState);
    } catch (err) {
      rollbackOptimisticSend(optimisticState);
      finishSendError(err, hooks);
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
  const handleMessageListInteractionFallback = (event) => {
    if (!event?.target) return;
    if (toggleThinkingSection(event, messagesList, thinkingCollapsedByKey)) return;
    if (toggleToolSection(event, messagesList, toolExpandedByKey)) return;
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
  let lastChatsRef = state.chats;
  let pendingChatListRaf = null;
  const scheduleChatListUpdate = () => {
    if (pendingChatListRaf !== null) return;
    pendingChatListRaf = requestAnimationFrame(() => {
      pendingChatListRaf = null;
      drawChats(state.chats, state.activeChatId);
      maybeRefreshChatListObserver();
    });
  };
  const updateSidebarBackdrop = (currentState) => {
    if (currentState.showSidebar && currentState.isMobile) {
      sidebarBackdrop.classList.remove('hidden');
      document.body.style.overflow = 'hidden';
      return;
    }
    sidebarBackdrop.classList.add('hidden');
    if (
      !currentState.showSearch &&
      !shareModalContainer.innerHTML &&
      !archivedModalContainer.innerHTML
    ) {
      document.body.style.overflow = '';
    }
  };

  const updateActiveChat = (currentState) => {
    if (currentState.activeChatId && currentState.activeChatId !== lastActiveChatId) {
      if (lastActiveChatId) streamSession.stopStreamPolling(lastActiveChatId);
      void ensureRealtimeController();
      touchRecentChat(recentChatIds, currentState.activeChatId);
      schedulePrune();
    }
  };

  const updateChatList = (currentState) => {
    const chatListChanged = currentState.chats !== lastChatsRef;
    const activeChanged = currentState.activeChatId !== lastActiveChatId;
    lastActiveChatId = currentState.activeChatId;
    if (chatListChanged) {
      lastChatsRef = currentState.chats;
      scheduleChatListUpdate();
    } else if (activeChanged) {
      // Active chat changed but list reference didn't — still need to update
      // the active highlight.  Defer with rAF to batch with other renders.
      scheduleChatListUpdate();
    } else {
      maybeRefreshChatListObserver();
    }
  };

  const unsubscribe = subscribe((currentState) => {
    if (currentState.showSearch) {
      ensureSearchModal();
    }
    if (currentState.showFiles) {
      ensureFilesModal();
    }
    updateSidebarBackdrop(currentState);
    updateActiveChat(currentState);
    updateChatList(currentState);
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
  function maybeCall(fn) {
    if (typeof fn === 'function') fn();
  }

  function removeEventListenerIfPresent(target, ...args) {
    if (target) target.removeEventListener(...args);
  }

  function clearChatTimers() {
    if (sidebarHydrationWarmupTimer) {
      clearTimeout(sidebarHydrationWarmupTimer);
      sidebarHydrationWarmupTimer = null;
    }
    if (pendingChatListRaf !== null) {
      cancelAnimationFrame(pendingChatListRaf);
      pendingChatListRaf = null;
    }
  }

  function disposeChatModals() {
    maybeCall(destroySearchModal);
    maybeCall(destroyFilesModal);
    maybeCall(destroyModelSelector);
    maybeCall(destroySidebar);
    maybeCall(inputComponent?.destroy);
    maybeCall(destroyPlaceholder);
    maybeCall(destroyChatFileEvents);
    maybeCall(destroyMessageListInteractions);
  }

  function removeChatEventListeners() {
    window.removeEventListener('growchat:realtime', onRealtimeEvent);
    unbindToolServersInvalidationListener();
    removeEventListenerIfPresent(chatListContainerEl, 'wheel', onChatListInteraction);
    removeEventListenerIfPresent(chatListContainerEl, 'touchstart', onChatListInteraction);
    removeEventListenerIfPresent(chatListContainerEl, 'scroll', onChatListInteraction);
    removeEventListenerIfPresent(messagesList, 'click', onMessageListInteraction, true);
    maybeCall(destroyShellEvents);
    maybeCall(shellController.dispose);
  }

  return () => {
    clearChatTimers();
    if (activeStreamAbort) activeStreamAbort();
    streamSession.dispose();
    unsubscribe();
    uiResources.clearAttachmentCaches();
    disposeChatModals();
    removeChatEventListeners();
    root.__cleanup = null;
  };
}

export { wireChat };
