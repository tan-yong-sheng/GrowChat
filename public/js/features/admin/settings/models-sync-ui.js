/**
 * Model UI sync function for the models settings view.
 */
// fallow-ignore-file security-sink

import {
  computeProviderPaginationMeta,
  buildProviderOptionsMarkup,
  renderModelRowsHtml,
} from './models-display-shared.js';
import { buildProviderOptions } from '../../../shared/utils/model-filters.js';
import {
  syncModelsHeaderState,
  syncModelsPaginationState,
  syncModelsTableState,
} from '../../../shared/components/models-section.js';
import { getAttachmentCapTooltip, getAttachmentCapValue } from './models-helpers.js';
import { escapeHtml } from '../../../shared/utils/dom-escape.js';

export function createModelsSyncUi(deps) {
  const {
    container,
    modelsState,
    canManageAcls,
    isActiveTab,
    getLocalModels,
    getActiveModelCount,
    _updateModelToggle,
    _updateCapButton,
  } = deps;

  const syncUi = () => {
    const visibleModels = getLocalModels();
    const providerOptions = modelsState.providerOptions.length
      ? modelsState.providerOptions
      : buildProviderOptions(visibleModels, { includeAll: false });

    const {
      usingFilter,
      enabledProviders,
      allOption,
      mergedProviders,
      filteredModels,
      pageTotal,
      totalPages,
      currentPage,
      pageStart,
      pageEnd,
    } = computeProviderPaginationMeta(
      modelsState,
      providerOptions,
      visibleModels,
      getActiveModelCount()
    );

    syncModelsHeaderState(container, {
      countTitle: 'Selected models',
      countLabel: 'Selected models',
      countValue: getActiveModelCount(),
      searchId: 'model-search-input',
      searchValue: modelsState.query,
      clearId: 'model-clear-search-container',
      clearButtonId: 'model-clear-search-btn',
      clearHidden: !modelsState.query,
      providerId: 'model-provider-select',
      providerValue: modelsState.provider,
      providerOptionsMarkup: buildProviderOptionsMarkup(mergedProviders, modelsState.provider),
    });

    syncModelsTableState(container, {
      loading: modelsState.loading,
      rowsHtml: renderModelRowsHtml(modelsState, filteredModels, canManageAcls),
      emptyMessage:
        pageTotal === 0 && !usingFilter
          ? 'No models are selected upstream.'
          : `No models found${usingFilter ? ` matching "${modelsState.query}"` : ''}.`,
      tbodyId: 'models-table-body',
      emptyColSpan: 4,
    });

    syncModelsPaginationState(container, {
      pageSizeId: 'page-size-select',
      limit: modelsState.limit,
      pageStart,
      pageEnd,
      pageTotal,
      currentPage,
      totalPages,
      loading: modelsState.loading,
      usingFilter,
    });

    const errorSlot = container.querySelector('#models-error-container');
    if (errorSlot) {
      errorSlot.innerHTML = modelsState.error
        ? `<div data-error-banner class="rounded-md border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-600 flex items-center justify-between gap-3"><span>${modelsState.error}</span></div>`
        : '';
    }

    // Save button removed - using immediate-save pattern
  };

  return { syncUi };
}
