/**
 * Model UI sync function for the models settings view.
 */

import { normalizeModelSearchQuery } from '../../../shared/utils/model-search.js';
import {
  buildProviderOptions,
  filterModelsBySearchAndProvider,
} from '../../../shared/utils/model-filters.js';
import {
  renderModelsHeaderHtml,
  renderModelsPaginationHtml,
  renderModelsTableShellHtml,
  syncModelsHeaderState,
  syncModelsPaginationState,
  syncModelsTableState,
} from '../../../shared/components/models-section.js';
import { renderModelAccessBadgeForModel } from '../../../shared/components/model-access-badge.js';
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
    const query = normalizeModelSearchQuery(modelsState.query);
    const usingFilter = Boolean(query);
    const visibleModels = getLocalModels();
    const providerOptions = modelsState.providerOptions.length
      ? modelsState.providerOptions
      : buildProviderOptions(visibleModels, { includeAll: false });
    const enabledProviders = providerOptions.filter((option) => Number(option.active || 0) > 0);

    const allOption = {
      value: 'all',
      label: 'All Providers',
      active: getActiveModelCount(),
      total: modelsState.total ?? visibleModels.length,
    };
    const mergedProviders = [
      allOption,
      ...enabledProviders.filter((option) => option.value !== 'all'),
    ];
    const filteredModels = filterModelsBySearchAndProvider(modelsState.models, {
      query,
      provider: modelsState.provider,
    });
    const pageTotal = modelsState.total;
    const totalPages = Math.ceil(modelsState.total / modelsState.limit) || 1;
    const currentPage = Math.floor(modelsState.offset / modelsState.limit) + 1;
    const pageStart = pageTotal === 0 ? 0 : modelsState.offset + 1;
    const pageEnd = Math.min(modelsState.offset + modelsState.limit, pageTotal);

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
      providerOptionsMarkup: mergedProviders
        .map(
          (option) => `
        <option value="${option.value}" ${option.value === modelsState.provider ? 'selected' : ''}>
          ${option.label}${Number.isFinite(option.active) && Number.isFinite(option.total) ? ` (${option.active} active, ${option.total} total)` : ''}
        </option>
      `
        )
        .join(''),
    });

    syncModelsTableState(container, {
      loading: modelsState.loading,
      rowsHtml: modelsState.loading
        ? `
                    ${Array.from({ length: 5 })
                      .map(
                        () => `
                      <tr class="bg-white text-xs animate-pulse">
                        <td class="px-4 py-4"><div class="h-4 w-32 rounded bg-gray-100"></div></td>
                        <td class="px-4 py-4"><div class="h-4 w-40 rounded bg-gray-100"></div></td>
                        <td class="px-4 py-4"><div class="h-6 w-20 rounded-full bg-gray-100"></div></td>
                        <td class="px-4 py-4 text-right"><div class="ml-auto h-5 w-9 rounded-full bg-gray-100"></div></td>
                      </tr>
                    `
                      )
                      .join('')}
                  `
        : filteredModels.length === 0
          ? ''
          : filteredModels
              .map((model) => {
                const _isDisabled = modelsState.disabledModels.has(model.id);
                return `
                    <tr data-model-row="${model.id}" class="text-xs hover:bg-gray-50/50 transition-colors ${_isDisabled ? 'bg-gray-50/80 opacity-70' : 'bg-white'}">
<td class="px-4 py-4 font-medium text-gray-900 truncate" title="${escapeHtml(model.name || model.id)}">${escapeHtml(model.name || model.id)}</td>
                      <td class="px-4 py-4 font-mono truncate ${_isDisabled ? 'text-gray-300' : 'text-gray-400'}" title="${escapeHtml(model.id)}">${escapeHtml(model.id)}</td>
                      <td class="px-4 py-4">
                        <div class="flex items-center gap-2">
                          ${renderModelAccessBadgeForModel(model)}
                        </div>
                      </td>
                      <td class="px-4 py-4 text-right">
                        <div class="flex items-center justify-end gap-2">
                          <button
                            type="button"
                            class="inline-flex items-center justify-center h-8 w-8 rounded-lg text-gray-600 hover:bg-gray-100 transition focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 ${_isDisabled || !canManageAcls ? 'hidden' : ''}"
                            data-model-acl="${model.id}"
                            title="Edit access rules"
                            aria-label="Edit access rules"
                            ${_isDisabled || !canManageAcls ? 'tabindex="-1" aria-hidden="true" disabled aria-disabled="true"' : ''}
                          >
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.75" stroke="currentColor" class="size-5">
                              <path stroke-linecap="round" stroke-linejoin="round" d="M16.5 10.5V7.5a4.5 4.5 0 1 0-9 0v3m-.75 0h10.5a1.5 1.5 0 0 1 1.5 1.5v6.75a1.5 1.5 0 0 1-1.5 1.5H6.75a1.5 1.5 0 0 1-1.5-1.5V12a1.5 1.5 0 0 1 1.5-1.5Zm4.5 3.75v2.25" />
                            </svg>
                          </button>
                        </div>
                      </td>
                    </tr>
                  `;
              })
              .join(''),
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
        ? `<div data-error-banner class="rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-600 flex items-center justify-between gap-3"><span>${modelsState.error}</span></div>`
        : '';
    }

    // Save button removed - using immediate-save pattern
  };

  return { syncUi };
}
