/**
 * Model render function for the models settings view.
 */

import {
  computeProviderPaginationMeta,
  buildProviderOptionsMarkup,
  renderModelRowsHtml,
} from './models-display-shared.js';

import { buildProviderOptions } from '../../../shared/utils/model-filters.js';
import {
  renderModelsHeaderHtml,
  renderModelsPaginationHtml,
  renderModelsTableShellHtml,
} from '../../../shared/components/models-section.js';

export function createModelsRender(deps) {
  const {
    container,
    modelsState,
    canManageAcls,
    isActiveTab,
    ensureMounted,
    getLocalModels,
    getActiveModelCount,
    syncUi,
    bindDelegatedEvents,
    _updateModelToggle,
    _updateCapButton,
    _toggleModelEnabled,
  } = deps;

  function render() {
    if (!isActiveTab()) return;

    const providerOptions = buildProviderOptions(getLocalModels(), { includeAll: false });
    const {
      usingFilter,
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
      getLocalModels(),
      getActiveModelCount()
    );

    const rowsHtml = renderModelRowsHtml(modelsState, filteredModels, canManageAcls);

    if (!ensureMounted()) {
      container.innerHTML = `
      <div class="flex flex-col flex-1 min-h-0 animate-in fade-in duration-300 w-full">
<div id="models-error-container">${modelsState.error ? `<div data-error-banner class="rounded-md border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-600 flex items-center justify-between gap-3"><span>${modelsState.error}</span></div>` : ''}</div>
        ${renderModelsHeaderHtml({
          countTitle: 'Selected models',
          countLabel: 'Selected models',
          countValue: getActiveModelCount(),
          searchId: 'model-search-input',
          searchValue: modelsState.query,
          clearId: 'model-clear-search-container',
          clearButtonId: 'model-clear-search-btn',
          clearHidden: !modelsState.query,
          providerId: 'model-provider-select',
          providerOptionsMarkup: buildProviderOptionsMarkup(mergedProviders, modelsState.provider),
        })}
        ${renderModelsTableShellHtml({
          loading: modelsState.loading,
          rowsHtml,
          emptyMessage: `No models found${usingFilter ? ` matching "${modelsState.query}"` : ''}.`,
          tbodyId: 'models-table-body',
          emptyColSpan: 4,
        })}
        ${renderModelsPaginationHtml({
          pageSizeId: 'page-size-select',
          limit: modelsState.limit,
          pageStart,
          pageEnd,
          pageTotal,
          currentPage,
          totalPages,
          loading: modelsState.loading,
          usingFilter,
        })}
      </div>
    `;
      container.dataset.modelsMounted = '1';
      bindDelegatedEvents();
    } else {
      syncUi();
    }
  }

  return { render };
}
