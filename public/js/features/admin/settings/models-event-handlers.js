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
    container.addEventListener('input', (event) => {
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
    });

    container.addEventListener('change', (event) => {
      const target = event.target;
      if (!(target instanceof HTMLSelectElement)) return;
      if (target.id === 'model-provider-select') {
        modelsState.provider = target.value || 'all';
        modelsState.offset = 0;
        loadModels(true);
        return;
      }
      if (target.id === 'page-size-select') {
        modelsState.limit = parseInt(target.value, 10);
        modelsState.offset = 0;
        loadModels(true);
      }
    });

    container.addEventListener('click', (event) => {
      const target = event.target instanceof Element ? event.target : null;
      if (!target) return;

      if (target.closest('#model-clear-search-btn')) {
        const searchInput = container.querySelector('#model-search-input');
        debounce.clear();
        modelsState.query = '';
        modelsState.offset = 0;
        if (searchInput) searchInput.value = '';
        container.querySelector('#model-clear-search-container')?.classList.add('hidden');
        loadModels(true);
        searchInput?.focus();
        return;
      }

      if (target.closest('#prev-page')) {
        modelsState.offset = Math.max(0, modelsState.offset - modelsState.limit);
        loadModels(true);
        return;
      }

      if (target.closest('#next-page')) {
        modelsState.offset = modelsState.offset + modelsState.limit;
        loadModels(true);
        return;
      }

      const capBtn = target.closest('[data-cap-model]');
      if (capBtn) {
        const modelId = capBtn.getAttribute('data-cap-model');
        const kind = capBtn.getAttribute('data-cap-kind');
        if (!modelId || !kind) return;
        void toggleAttachmentCap(modelId, kind);
        return;
      }

      const aclBtn = target.closest('[data-model-acl]');
      if (aclBtn) {
        if (!canManageAcls) return;
        const modelId = aclBtn.getAttribute('data-model-acl');
        if (!modelId) return;
        const model = (modelsState.models || []).find((item) => item.id === modelId);
        openModelAccessModal(
          { id: modelId, name: model?.name || modelId },
          {
            onApply: async (rules) => {
              await saveAclChanges(modelId, rules);
            },
          }
        );
      }
    });
  };

  return { bindDelegatedEvents };
}
