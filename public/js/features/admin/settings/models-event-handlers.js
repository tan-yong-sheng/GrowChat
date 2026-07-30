import {
  initModelsSearchGuard,
  createModelsSearchDebounce,
} from '../../../shared/utils/models-search-binding.js';

/**
 * DOM event binding for the models settings view.
 */

export function createModelsEventHandlers(deps) {
  const {
    container,
    modelsState,
    canManageAcls,
    _toggleModelEnabled,
    toggleAttachmentCap,
    saveAclChanges,
    _updateModelToggle,
    _updateCapButton,
    openModelAccessModal,
    syncUi,
    loadModels,
    render,
  } = deps;

  const bindDelegatedEvents = () => {
    if (initModelsSearchGuard(container)) return;

    const debounce = createModelsSearchDebounce();

    const handleModelSearchInput = (event) => {
      const target = event.target;
      if (!(target instanceof HTMLInputElement)) return;
      if (target.id !== 'model-search-input') return;
      const nextValue = target.value;
      const clearSearchContainer = container.querySelector('#model-clear-search-container');
      clearSearchContainer?.classList.toggle('hidden', !nextValue);
      debounce.run(() => {
        modelsState.query = nextValue;
        modelsState.offset = 0;
        loadModels(true);
      });
    };

    const handleModelProviderChange = (target) => {
      modelsState.provider = target.value || 'all';
      modelsState.offset = 0;
      loadModels(true);
    };

    const handlePageSizeChange = (target) => {
      modelsState.limit = parseInt(target.value, 10);
      modelsState.offset = 0;
      loadModels(true);
    };

    const handleModelChange = (event) => {
      const target = event.target;
      if (!(target instanceof HTMLSelectElement)) return;
      if (target.id === 'model-provider-select') return handleModelProviderChange(target);
      if (target.id === 'page-size-select') return handlePageSizeChange(target);
    };

    const clearModelSearch = () => {
      const searchInput = container.querySelector('#model-search-input');
      debounce.clear();
      modelsState.query = '';
      modelsState.offset = 0;
      if (searchInput) searchInput.value = '';
      container.querySelector('#model-clear-search-container')?.classList.add('hidden');
      loadModels(true);
      searchInput?.focus();
    };

    const goToPrevPage = () => {
      modelsState.offset = Math.max(0, modelsState.offset - modelsState.limit);
      loadModels(true);
    };

    const goToNextPage = () => {
      modelsState.offset = modelsState.offset + modelsState.limit;
      loadModels(true);
    };

    const handleCapBtnClick = (capBtn) => {
      const modelId = capBtn.getAttribute('data-cap-model');
      const kind = capBtn.getAttribute('data-cap-kind');
      if (!modelId || !kind) return;
      void toggleAttachmentCap(modelId, kind);
    };

    const handleAclBtnClick = (aclBtn) => {
      if (!canManageAcls) return;
      const modelId = aclBtn.getAttribute('data-model-acl');
      if (!modelId) return;
      const model = (modelsState.models || []).find((item) => item.id === modelId);
      openModelAccessModal(
        { id: modelId, name: model?.name || modelId },
        { onApply: async (rules) => saveAclChanges(modelId, rules) }
      );
    };

    const modelClickHandlers = new Map([
      ['#model-clear-search-btn', clearModelSearch],
      ['#prev-page', goToPrevPage],
      ['#next-page', goToNextPage],
    ]);

    const resolveModelClickAction = (target) => {
      for (const [selector, handler] of modelClickHandlers) {
        if (target.closest(selector)) return handler;
      }
      const capBtn = target.closest('[data-cap-model]');
      if (capBtn) return () => handleCapBtnClick(capBtn);
      const aclBtn = target.closest('[data-model-acl]');
      if (aclBtn) return () => handleAclBtnClick(aclBtn);
      return null;
    };

    const handleModelClick = (event) => {
      const target = event.target instanceof Element ? event.target : null;
      if (!target) return;
      const action = resolveModelClickAction(target);
      action?.();
    };

    container.addEventListener('input', handleModelSearchInput);
    container.addEventListener('change', handleModelChange);
    container.addEventListener('click', handleModelClick);
  };

  return { bindDelegatedEvents };
}
