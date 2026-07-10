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

  container.addEventListener('input', (event) => {
    const target = event.target;
    if (!(target instanceof HTMLInputElement)) return;
    if (target.id !== 'account-model-search-input') return;
    const nextValue = target.value;
    debounce.run(() => {
      sectionState.query = nextValue;
      sectionState.offset = 0;
      loadModels(true);
    });
  });

  container.addEventListener('click', (event) => {
    const target = event.target instanceof Element ? event.target : null;
    if (!target) return;

    const clearBtn = target.closest('#model-clear-search-btn');
    if (clearBtn) {
      sectionState.query = '';
      sectionState.offset = 0;
      loadModels(true);
      return;
    }

    const prevBtn = target.closest('#prev-page');
    if (prevBtn) {
      sectionState.offset = Math.max(0, sectionState.offset - sectionState.limit);
      loadModels(true);
      return;
    }

    const nextBtn = target.closest('#next-page');
    if (nextBtn) {
      sectionState.offset = sectionState.offset + sectionState.limit;
      loadModels(true);
      return;
    }

    const toggleBtn = target.closest('.model-toggle');
    if (toggleBtn) {
      const modelId = toggleBtn.getAttribute('data-model-id');
      const visibleIndex = sectionState.models.findIndex((item) => item.id === modelId);
      if (visibleIndex < 0) return;
      const model = sectionState.models[visibleIndex];
      const previousActiveTotal = sectionState.activeTotal;
      const previousTotal = sectionState.total;
      const previousModels = sectionState.models.map((item) => ({
        ...item,
        attachments: cloneAttachmentCaps(item.attachments),
      }));
      const previousDisabledModelIds = Array.from(sectionState.disabledModelIds);
      const previousAttachmentCaps = cloneAttachmentCaps(sectionState.attachmentCaps);
      const previousProviderOptions = Array.isArray(sectionState.providerOptions)
        ? sectionState.providerOptions.map((option) => ({ ...option }))
        : [];
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
      const rollback = {
        modelId,
        models: previousModels,
        disabledModelIds: previousDisabledModelIds,
        attachmentCaps: previousAttachmentCaps,
        providerOptions: previousProviderOptions,
        activeTotal: previousActiveTotal,
        total: previousTotal,
      };
      syncUi();
      sectionState.error = '';
      void persistModelSettings({ rollback });
      return;
    }
  });

  container.addEventListener('change', (event) => {
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
  });
}
