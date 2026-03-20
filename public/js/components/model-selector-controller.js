import { state, setState, subscribe } from '../store.js';
import { showToast, showToastProgress } from '../utils.js';
import { sortModelsByActiveThenName } from '../utils/model-state.js';
import {
  getModelDisplayLabel,
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

  const ensureModelsLoaded = async () => {
    if (state.modelsLoading || (state.models && state.models.length > 0)) return loadingPromise;
    setState({ modelsLoading: true });
    loadingPromise = (async () => {
      try {
        const { fetchModels } = await import('../api.js');
        const data = await fetchModels();
        const models = data.models || [];
        const currentId = state.activeModelId;
        const nextActiveModelId = currentId || (models[0]?.id || null);
        setState({
          models,
          activeModelId: nextActiveModelId,
          modelsLoading: false,
        });
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
      el.classList.remove('ring-2', 'ring-black/40', 'bg-gray-100', 'text-gray-900');
      el.removeAttribute('data-active');
    });
    const activeModel = visibleModels[activeIndex];
    if (!activeModel) return;
    const activeEl = listContainer.querySelector(`button[data-model-id="${activeModel.id}"]`);
    if (!activeEl) return;
    activeEl.classList.add('ring-2', 'ring-black/40', 'bg-gray-100', 'text-gray-900');
    activeEl.setAttribute('data-active', 'true');
    if (scroll) activeEl.scrollIntoView({ block: 'nearest' });
  };

  const updateSelectedModel = (currentState, previousId) => {
    if (!isOpen) return;
    if (previousId) {
      const oldEl = listContainer.querySelector(`button[data-model-id="${previousId}"]`);
      if (oldEl) {
        oldEl.classList.remove('bg-gray-50', 'text-gray-900', 'font-bold');
        oldEl.classList.add('hover:bg-gray-50', 'text-gray-700');
        oldEl.setAttribute('aria-selected', 'false');
        const icon = oldEl.querySelector('svg');
        if (icon) icon.remove();
      }
    }
    const nextId = currentState.activeModelId;
    if (!nextId) return;
    const newEl = listContainer.querySelector(`button[data-model-id="${nextId}"]`);
    if (newEl) {
      newEl.classList.add('bg-gray-50', 'text-gray-900', 'font-bold');
      newEl.classList.remove('hover:bg-gray-50', 'text-gray-700');
      newEl.setAttribute('aria-selected', 'true');
      if (!newEl.querySelector('svg')) {
        newEl.insertAdjacentHTML('beforeend', '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="text-gray-800"><path d="M20 6 9 17l-5-5"/></svg>');
      }
    }
  };

  const renderList = (currentState, { reset = false, rebuild = false } = {}) => {
    if (currentState.modelsLoading) {
      listContainer.innerHTML = '<div class="px-3 py-6 text-center text-sm text-gray-400 italic">Loading models...</div>';
      renderedCount = 0;
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
        ? `<div class="px-3 py-8 text-center text-sm text-gray-400 italic">No models found for "${searchQuery}"</div>`
        : '<div class="px-3 py-6 text-center text-sm text-gray-400 italic">No models available</div>';
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
    if (!state.activeModelId) return;
    const modelId = state.activeModelId;
    if (state.defaultModelId === modelId) {
      showToast('Already the default model');
      return;
    }
    const progressToast = showToastProgress('Setting default model...');
    const { apiFetch } = await import('../api.js');
    const result = await persistDefaultModelSelection({
      apiFetch,
      modelId,
      currentPreferences: state.user?.preferences || {},
      onSuccess: (message) => progressToast.update(message),
      onFallback: (message) => progressToast.update(message),
    });
    if (result.ok) {
      setState({ defaultModelId: modelId });
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
      setState({ activeModelId: model.id });
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
    setState({ activeModelId: newModelId });
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
    const models = Array.isArray(currentState.models) ? currentState.models : [];
    const hasModels = models.length > 0;
    const activeModel = hasModels ? (models.find((m) => m.id === currentState.activeModelId) || null) : null;
    if (!hasModels) {
      if (currentState.activeModelId) nameSpan.textContent = currentState.activeModelId;
      else nameSpan.textContent = currentState.modelsLoading ? 'Loading...' : 'Select a Model';
    } else if (activeModel) {
      nameSpan.textContent = getModelDisplayLabel(activeModel) || activeModel.id;
    } else {
      nameSpan.textContent = currentState.activeModelId ? 'Unknown model' : 'Select a Model';
    }

    headerSetDefaultBtn.textContent = 'Set as default';
    headerSetDefaultBtn.className = 'text-gray-400 font-primary hover:text-gray-500 transition-colors';
    headerSetDefaultBtn.disabled = false;
    headerSetDefaultBtn.style.cursor = 'pointer';

    const modelsChanged = currentState.models !== lastModelsRef || currentState.modelsLoading !== lastModelsLoading;
    if (modelsChanged) {
      sortedModels = sortModelsByActiveThenName(currentState.models || []);
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

    if (currentState.activeModelId !== lastActiveModelId) {
      updateSelectedModel(currentState, lastActiveModelId);
      lastActiveModelId = currentState.activeModelId;
    }
  });

  return () => {
    if (unsubscribe) unsubscribe();
    if (onDocumentClick) document.removeEventListener('click', onDocumentClick);
    if (searchDebounce) clearTimeout(searchDebounce);
  };
}
