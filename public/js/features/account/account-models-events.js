/**
 * Event binding for the account models section.
 */
import { normalizeModelSearchQuery } from '../../shared/utils/model-search.js';
import { buildProviderOptions } from '../../shared/utils/model-filters.js';
import { renderModelRow } from './account-models-helpers.js';
import { escapeHtml } from '../../shared/utils/dom-escape.js';
import { cloneAttachmentCaps } from '../../shared/utils/attachment-caps.js';
import {
  initModelsSearchGuard,
  createModelsSearchDebounce,
} from '../../shared/utils/models-search-binding.js';

export function bindModelsEvents(ctx) {
  const { container, sectionState, persistModelSettings, syncUi, loadModels } = ctx;

  if (initModelsSearchGuard(container)) return;

  const debounce = createModelsSearchDebounce();

  function handleModelSearchInput(event) {
    const target = event.target;
    if (!(target instanceof HTMLInputElement)) return;
    if (target.id !== 'account-model-search-input') return;
    const nextValue = target.value;
    debounce.run(() => {
      sectionState.query = nextValue;
      sectionState.offset = 0;
      loadModels(true);
    });
  }

  function clearModelSearch() {
    sectionState.query = '';
    sectionState.offset = 0;
    loadModels(true);
  }

  function prevModelPage() {
    sectionState.offset = Math.max(0, sectionState.offset - sectionState.limit);
    loadModels(true);
  }

  function nextModelPage() {
    sectionState.offset = sectionState.offset + sectionState.limit;
    loadModels(true);
  }

  function snapshotModelToggleState(modelId) {
    return {
      modelId,
      models: sectionState.models.map((item) => ({
        ...item,
        attachments: cloneAttachmentCaps(item.attachments),
      })),
      disabledModelIds: Array.from(sectionState.disabledModelIds),
      attachmentCaps: cloneAttachmentCaps(sectionState.attachmentCaps),
      providerOptions: Array.isArray(sectionState.providerOptions)
        ? sectionState.providerOptions.map((option) => ({ ...option }))
        : [],
      activeTotal: sectionState.activeTotal,
      total: sectionState.total,
    };
  }

  function applyModelToggle(modelId) {
    const visibleIndex = sectionState.models.findIndex((item) => item.id === modelId);
    if (visibleIndex < 0) return false;
    const model = sectionState.models[visibleIndex];
    const shouldEnable = model.enabled === false;
    sectionState.models = sectionState.models.map((item, index) =>
      index === visibleIndex
        ? {
            ...item,
            enabled: shouldEnable,
            hidden_for_user: !shouldEnable,
            visible_for_user: shouldEnable,
          }
        : item
    );
    sectionState.activeTotal = Math.max(0, sectionState.activeTotal + (shouldEnable ? 1 : -1));
    sectionState.total = Math.max(0, sectionState.total);
    if (shouldEnable) sectionState.disabledModelIds.delete(modelId);
    else sectionState.disabledModelIds.add(modelId);
    sectionState.providerOptions = buildProviderOptions(sectionState.models, {
      includeAll: true,
    });
    return true;
  }

  function handleModelToggle(event) {
    const target = event.target instanceof Element ? event.target : null;
    if (!target) return;
    const toggleBtn = target.closest('.model-toggle');
    if (!toggleBtn) return;
    const modelId = toggleBtn.getAttribute('data-model-id');
    const rollback = snapshotModelToggleState(modelId);
    if (!applyModelToggle(modelId)) return;
    syncUi();
    sectionState.error = '';
    void persistModelSettings({ rollback });
  }

  function dispatchModelClick(event) {
    const target = event.target instanceof Element ? event.target : null;
    if (!target) return;
    if (target.closest('#model-clear-search-btn')) return clearModelSearch();
    if (target.closest('#prev-page')) return prevModelPage();
    if (target.closest('#next-page')) return nextModelPage();
    handleModelToggle(event);
  }

  function handleProviderChange(event) {
    const target = event.target;
    if (!(target instanceof HTMLSelectElement)) return;
    if (target.id === 'account-model-provider-select') {
      sectionState.provider = target.value || 'all';
      sectionState.offset = 0;
      loadModels(true);
      return;
    }
    if (target.id === 'page-size-select') {
      sectionState.limit = parseInt(target.value, 10) || 20;
      sectionState.offset = 0;
      loadModels(true);
    }
  }

  container.addEventListener('input', handleModelSearchInput);
  container.addEventListener('click', dispatchModelClick);
  container.addEventListener('change', handleProviderChange);
}
