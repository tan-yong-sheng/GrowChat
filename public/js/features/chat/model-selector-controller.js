import { state, setState, subscribe } from '../../shared/store.js';
import { showToast, showToastProgress } from '../../shared/utils.js';
import { filterEnabledModels, getPreferredModelId, sortModelsByActiveThenName } from '../../shared/utils/model-state.js';
import {
  getModelDisplayLabel,
  getModelAvailabilityFallbackNotice,
  getModelSelectorAvailabilitySummary,
  getModelSelectorDerivedState,
  persistDefaultModelSelection,
  renderModelSelectorOption,
} from './model-selector-helpers.js';

export function createModelSelectorController(container) {
  let unsubscribe;
  let onDocumentClick;

  const btn = container.querySelector('#model-selector-btn');
  const chevron = container.querySelector('#model-selector-chevron');
  const dropdown = container.querySelector('#model-selector-dropdown');
  const nameSpan = container.querySelector('#active-model-name');
  const summaryEl = container.querySelector('#model-selector-summary');
  const noticeEl = container.querySelector('#model-selector-notice');
  const searchInput = container.querySelector('#model-search-input');
  const listContainer = container.querySelector('#model-list-container');
  const headerSetDefaultBtn = container.querySelector('#header-set-default-btn');

  let isOpen = false;
  let searchQuery = '';
  let activeIndex = -1;
  let visibleModels = [];
  let allFilteredModels = [];
  let visibleCount = 10;
  const PAGE_SIZE = 10;
  const MAX_VISIBLE_NO_SCROLL = 40;
  let loadingPromise = null;
  let sortedModels = [];
  let lastModelsRef = null;
  let lastModelsLoading = null;
  let lastActiveModelId = null;
  let renderedCount = 0;
  let searchDebounce = null;
  let noticeClearTimer = null;

  const getSelectableModelCount = (models = []) => filterEnabledModels(Array.isArray(models) ? models : [])
    .filter((model) => model?.hidden_for_user !== true)
    .length;

  const syncScopeSummary = (currentState) => {
    if (!summaryEl) return;
    summaryEl.textContent = getModelSelectorAvailabilitySummary(
      getSelectableModelCount(currentState.models),
      { loading: currentState.modelsLoading }
    );
  };

  const clearModelAvailabilityNotice = () => {
    if (noticeClearTimer) {
      clearTimeout(noticeClearTimer);
      noticeClearTimer = null;
    }
  };

  const setModelAvailabilityNotice = (message, key) => {
    clearModelAvailabilityNotice();
    setState({
      ui: {
        modelAvailabilityNotice: message ? {
          key,
          message,
          tone: 'warning',
        } : null,
      },
    });
    if (message) {
      noticeClearTimer = setTimeout(() => {
        if (state.ui?.modelAvailabilityNotice?.key === key) {
          setState({
            ui: {
              modelAvailabilityNotice: null,
            },
          });
        }
      }, 6000);
    }
  };

  const syncAvailabilityNotice = (currentState) => {
    if (!noticeEl) return;
    const notice = currentState.ui?.modelAvailabilityNotice || null;
    if (!notice?.message) {
      noticeEl.classList.add('hidden');
      noticeEl.textContent = '';
      noticeEl.className = 'hidden mx-2 mt-1 rounded-xl border px-3 py-2 text-xs';
      return;
    }

    noticeEl.classList.remove('hidden');
    noticeEl.textContent = notice.message;
    noticeEl.className = 'mx-2 mt-1 rounded-xl border px-3 py-2 text-xs border-amber-200 bg-amber-50 text-amber-800';
  };

  const ensureModelsLoaded = async () => {
    if (state.modelsLoading || (state.models && state.models.length > 0)) return loadingPromise;
    loadingPromise = (async () => {
      try {
        const { prefetchModels } = await import('../../bootstrap/session-bootstrap.js');
        await prefetchModels({ allowCache: true });
      } catch (err) {
        console.error('Failed to load models:', err);
        setState({ modelsLoading: false });
      } finally {
        loadingPromise = null;
      }
    })();
    return loadingPromise;
  };

  const applyActiveHighlight = (scroll = false) => {
    const buttons = listContainer.querySelectorAll('button[data-model-id]');
    if (!buttons.length) return;
    buttons.forEach((el) => {
      el.classList.remove('ring-2', 'ring-black/40', 'bg-gray-100', 'text-gray-900', 'font-semibold', 'shadow-sm');
      el.removeAttribute('data-active');
    });
    const activeModel = visibleModels[activeIndex];
    if (!activeModel) return;
    const activeEl = listContainer.querySelector(`button[data-model-id="${activeModel.id}"]`);
    if (!activeEl) return;
    activeEl.classList.add('ring-2', 'ring-black/40', 'bg-gray-100', 'text-gray-900', 'font-semibold', 'shadow-sm');
    activeEl.setAttribute('data-active', 'true');
    if (scroll) activeEl.scrollIntoView({ block: 'nearest' });
  };

  const updateSelectedModel = (currentState, previousId) => {
    if (!isOpen) return;
    if (previousId) {
      const oldEl = listContainer.querySelector(`button[data-model-id="${previousId}"]`);
      if (oldEl) {
        oldEl.classList.remove('bg-gray-100', 'text-gray-900', 'font-bold', 'font-semibold', 'ring-1', 'ring-gray-200', 'shadow-sm');
        oldEl.classList.add('hover:bg-gray-50', 'text-gray-700');
        const icon = oldEl.querySelector('svg');
        if (icon) icon.remove();
      }
    }
    const nextId = currentState.activeModelId;
    if (!nextId) return;
    const newEl = listContainer.querySelector(`button[data-model-id="${nextId}"]`);
    if (newEl) {
      newEl.classList.add('bg-gray-100', 'text-gray-900', 'font-semibold', 'ring-1', 'ring-gray-200', 'shadow-sm');
      newEl.classList.remove('hover:bg-gray-50', 'text-gray-700');
      if (!newEl.querySelector('svg')) {
        newEl.insertAdjacentHTML('beforeend', '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="text-gray-800"><path d="M20 6 9 17l-5-5"/></svg>');
      }
    }
  };

  const renderList = (currentState, { reset = false, rebuild = false } = {}) => {
    if (currentState.modelsLoading) {
      listContainer.innerHTML = '<div class="px-3 py-6 text-center text-sm text-gray-600 italic">Loading models...</div>';
      renderedCount = 0;
      syncScopeSummary(currentState);
      return;
    }

    if (rebuild) {
      const derived = getModelSelectorDerivedState({
        sortedModels,
        searchQuery,
        visibleCount,
        pageSize: PAGE_SIZE,
        maxVisibleNoScroll: MAX_VISIBLE_NO_SCROLL,
      });
      allFilteredModels = derived.allFilteredModels;
      visibleCount = derived.visibleCount;
      visibleModels = derived.visibleModels;
    }

    if (!allFilteredModels.length) {
      visibleModels = [];
      renderedCount = 0;
      listContainer.innerHTML = searchQuery
        ? `<div class="px-3 py-8 text-center text-sm text-gray-600 italic">No models found for "${searchQuery}"</div>`
        : '<div class="px-3 py-6 text-center text-sm text-gray-600 italic">No selectable models are currently available for this chat.</div>';
      syncScopeSummary(currentState);
      return;
    }

    if (reset) {
      listContainer.innerHTML = '';
      renderedCount = 0;
    }

    visibleCount = Math.min(visibleCount, allFilteredModels.length);
    visibleModels = allFilteredModels.slice(0, visibleCount);

    if (renderedCount < visibleCount) {
      const chunk = allFilteredModels
        .slice(renderedCount, visibleCount)
        .map((m) => renderModelSelectorOption(m, currentState))
        .join('');
      listContainer.insertAdjacentHTML('beforeend', chunk);
      renderedCount = visibleCount;
    }

    applyActiveHighlight(false);
    syncScopeSummary(currentState);
  };

  const toggle = () => {
    isOpen = !isOpen;
    btn.setAttribute('aria-expanded', isOpen);
    if (isOpen) {
      dropdown.classList.remove('hidden');
      dropdown.classList.add('flex');
      chevron.classList.add('rotate-180');
      searchInput.value = '';
      searchQuery = '';
      activeIndex = -1;
      visibleCount = PAGE_SIZE;
      ensureModelsLoaded();
      setTimeout(() => searchInput.focus(), 10);
      renderList(state, { reset: true, rebuild: true });
    } else {
      dropdown.classList.add('hidden');
      dropdown.classList.remove('flex');
      chevron.classList.remove('rotate-180');
      activeIndex = -1;
    }
  };

  const handleSetDefault = async (e) => {
    e.stopPropagation();
    const modelId = state.activeModelId || getPreferredModelId(state.models || [], [state.defaultModelId, state.globalDefaultModelId]);
    if (!modelId) return;
    const isDefault = state.defaultModelId === modelId;
    const progressToast = showToastProgress(isDefault ? 'Unsetting default model...' : 'Setting default model...');
    const { apiFetch } = await import('../../shared/api.js');
    const result = await persistDefaultModelSelection({
      apiFetch,
      modelId: isDefault ? null : modelId,
      currentPreferences: state.user?.preferences || {},
      onSuccess: (message) => progressToast.update(message),
      onFallback: (message) => progressToast.update(message),
    });
    if (result.ok) {
      const nextDefaultModelId = isDefault ? null : modelId;
      const nextPreferences = { ...(state.user?.preferences || {}) };
      if (nextDefaultModelId) nextPreferences.defaultModelId = nextDefaultModelId;
      else delete nextPreferences.defaultModelId;
      setState({
        defaultModelId: nextDefaultModelId,
        user: state.user ? { ...state.user, preferences: nextPreferences } : state.user,
      });
      if (isOpen) toggle();
    }
  };

  headerSetDefaultBtn.onclick = handleSetDefault;
  btn.onclick = (e) => {
    e.stopPropagation();
    toggle();
  };

  searchInput.onclick = (e) => e.stopPropagation();
  searchInput.oninput = (e) => {
    const nextQuery = e.target.value.toLowerCase();
    if (searchDebounce) clearTimeout(searchDebounce);
    searchDebounce = setTimeout(() => {
      searchQuery = nextQuery;
      activeIndex = -1;
      visibleCount = PAGE_SIZE;
      renderList(state, { reset: true, rebuild: true });
    }, 120);
  };
  searchInput.onkeydown = (e) => {
    if (!isOpen) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (!allFilteredModels.length) return;
      if (activeIndex < 0) activeIndex = 0;
      else if (activeIndex + 1 < visibleModels.length) activeIndex += 1;
      else if (visibleCount < allFilteredModels.length) {
        visibleCount = Math.min(visibleCount + PAGE_SIZE, allFilteredModels.length);
        activeIndex += 1;
        renderList(state, { reset: false, rebuild: false });
        applyActiveHighlight(true);
        return;
      }
      applyActiveHighlight(true);
      return;
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (!allFilteredModels.length) return;
      if (activeIndex < 0) activeIndex = Math.max(visibleModels.length - 1, 0);
      else activeIndex = Math.max(activeIndex - 1, 0);
      applyActiveHighlight(true);
      return;
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      const model = visibleModels[activeIndex];
      if (!model) return;
      clearModelAvailabilityNotice();
      setState({
        activeModelId: model.id,
        ui: { modelAvailabilityNotice: null },
      });
      toggle();
      return;
    }
    if (e.key === 'Escape') {
      e.preventDefault();
      if (isOpen) toggle();
    }
  };

  onDocumentClick = (e) => {
    if (isOpen && !container.contains(e.target)) {
      toggle();
    }
  };
  document.addEventListener('click', onDocumentClick);

  listContainer.addEventListener('click', (e) => {
    const button = e.target.closest('button[data-model-id]');
    if (!button) return;
    const newModelId = button.getAttribute('data-model-id');
    clearModelAvailabilityNotice();
    setState({
      activeModelId: newModelId,
      ui: { modelAvailabilityNotice: null },
    });
    toggle();
  });

  listContainer.addEventListener('scroll', () => {
    if (!isOpen || !allFilteredModels.length) return;
    const nearBottom = listContainer.scrollTop + listContainer.clientHeight >= listContainer.scrollHeight - 40;
    if (!nearBottom) return;
    if (visibleCount >= allFilteredModels.length) return;
    visibleCount = Math.min(visibleCount + PAGE_SIZE, allFilteredModels.length);
    renderList(state, { reset: false, rebuild: false });
  });

  unsubscribe = subscribe((currentState) => {
    const models = filterEnabledModels(Array.isArray(currentState.models) ? currentState.models : []);
    const hasModels = models.length > 0;
    const preferredModelId = hasModels ? getPreferredModelId(models, [
      currentState.activeModelId,
      currentState.defaultModelId,
      currentState.globalDefaultModelId,
    ]) : null;
    const preferredModel = preferredModelId ? (models.find((m) => m.id === preferredModelId) || null) : null;
    const activeModelExists = Boolean(currentState.activeModelId && models.some((model) => model.id === currentState.activeModelId));

    if (!hasModels) {
      nameSpan.textContent = currentState.modelsLoading ? 'Loading...' : 'No selectable models';
    } else if (preferredModel) {
      nameSpan.textContent = getModelDisplayLabel(preferredModel) || preferredModel.id;
    } else {
      nameSpan.textContent = 'Select a Model';
    }

    const isDefaultModel = Boolean(preferredModelId && currentState.defaultModelId === preferredModelId);
    headerSetDefaultBtn.textContent = isDefaultModel ? 'Unset default' : 'Set as default';
    headerSetDefaultBtn.className = hasModels
      ? 'text-gray-400 font-primary hover:text-gray-500 transition-colors'
      : 'text-gray-400 font-primary transition-colors opacity-50 cursor-not-allowed pointer-events-none';
    headerSetDefaultBtn.disabled = !hasModels;
    headerSetDefaultBtn.style.cursor = hasModels ? 'pointer' : 'not-allowed';

    const modelsChanged = currentState.models !== lastModelsRef || currentState.modelsLoading !== lastModelsLoading;
    if (modelsChanged) {
      sortedModels = sortModelsByActiveThenName(models);
      lastModelsRef = currentState.models;
      lastModelsLoading = currentState.modelsLoading;
      const derived = getModelSelectorDerivedState({
        sortedModels,
        searchQuery,
        visibleCount: PAGE_SIZE,
        pageSize: PAGE_SIZE,
        maxVisibleNoScroll: MAX_VISIBLE_NO_SCROLL,
      });
      allFilteredModels = derived.allFilteredModels;
      visibleCount = derived.visibleCount;
      visibleModels = derived.visibleModels;
      activeIndex = -1;
      if (isOpen) {
        renderList(currentState, { reset: true, rebuild: false });
      }
    }

    syncScopeSummary(currentState);
    syncAvailabilityNotice(currentState);

    if (hasModels && currentState.activeModelId && !activeModelExists && preferredModelId && currentState.activeModelId !== preferredModelId) {
      const fallbackLabel = getModelDisplayLabel(preferredModel) || preferredModel?.id || 'a different model';
      const noticeKey = `${currentState.activeModelId}:${preferredModelId}`;
      const currentNoticeKey = currentState.ui?.modelAvailabilityNotice?.key || null;
      if (currentNoticeKey !== noticeKey) {
        const chatModelId = currentState.chats?.find((chat) => chat?.id === currentState.activeChatId)?.model || null;
        const visibilityMeta = currentState.modelCatalogMeta || {};
        const fallbackNotice = getModelAvailabilityFallbackNotice({
          previousModelId: currentState.activeModelId,
          fallbackModel: preferredModel,
          currentChatModelId: chatModelId,
          disabledModelIds: visibilityMeta.disabled_model_ids || [],
          hiddenModelIds: visibilityMeta.hidden_model_ids || [],
        });
        setModelAvailabilityNotice(
          fallbackNotice?.message || `Your current model is no longer available. Switched to ${fallbackLabel}.`,
          noticeKey
        );
      }
      if (currentState.activeModelId !== preferredModelId) {
        setState({ activeModelId: preferredModelId });
      }
      return;
    }

    if (hasModels && preferredModelId && currentState.activeModelId !== preferredModelId) {
      setState({ activeModelId: preferredModelId });
      return;
    }

    if (currentState.activeModelId !== lastActiveModelId) {
      updateSelectedModel(currentState, lastActiveModelId);
      lastActiveModelId = currentState.activeModelId;
    }
  });

  return () => {
    if (unsubscribe) unsubscribe();
    if (onDocumentClick) document.removeEventListener('click', onDocumentClick);
    if (searchDebounce) clearTimeout(searchDebounce);
    clearModelAvailabilityNotice();
  };
}

