/**
 * Shared model display helpers used by models-render and models-sync-ui.
 * Extracted from the duplicated provider/pagination computation block
 * (CLONE GROUP: 22 lines, 186 tokens).
 */
// fallow-ignore-file security-sink

import { normalizeModelSearchQuery } from '../../../shared/utils/model-search.js';
import { filterModelsBySearchAndProvider } from '../../../shared/utils/model-filters.js';
import { escapeHtml } from '../../../shared/utils/dom-escape.js';
import { renderModelAccessBadgeForModel } from '../../../shared/components/model-access-badge.js';

/**
 * Compute shared provider/pagination metadata from the models state.
 * Both render and sync files repeat this exact computation — now shared.
 *
 * @param {object} state - The models state object
 * @param {Array} providerOptions - Pre-computed provider options array
 * @param {Array} models - Local visible models array (from getLocalModels())
 * @param {number} activeModelCount - Active model count (from getActiveModelCount())
 * @returns {object} Object with query, usingFilter, enabledProviders,
 *   allOption, mergedProviders, filteredModels, pageTotal, totalPages,
 *   currentPage, pageStart, pageEnd
 */
export function computeProviderPaginationMeta(state, providerOptions, models, activeModelCount) {
  const usingFilter = Boolean(normalizeModelSearchQuery(state.query));

  const enabledProviders = providerOptions.filter((option) => Number(option.active || 0) > 0);
  const allOption = {
    value: 'all',
    label: 'All Providers',
    active: activeModelCount,
    total: state.total ?? models.length,
  };
  const mergedProviders = [
    allOption,
    ...enabledProviders.filter((option) => option.value !== 'all'),
  ];
  const filteredModels = filterModelsBySearchAndProvider(state.models, {
    query: state.query,
    provider: state.provider,
  });
  const pageTotal = state.total;
  const totalPages = Math.ceil(state.total / state.limit) || 1;
  const currentPage = Math.floor(state.offset / state.limit) + 1;
  const pageStart = pageTotal === 0 ? 0 : state.offset + 1;
  const pageEnd = Math.min(state.offset + state.limit, pageTotal);

  return {
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
  };
}

/**
 * Build the <option> markup for the provider <select> dropdown.
 * Replaces the duplicated mergedProviders.map(...)(...).join('') in both files.
 *
 * @param {Array} mergedProviders - The merged providers array
 * @param {string} currentProvider - Current provider value for 'selected' comparison
 * @returns {string} HTML options markup
 */
export function buildProviderOptionsMarkup(mergedProviders, currentProvider) {
  return mergedProviders
    .map(
      (option) =>
        `<option value="${option.value}" ${option.value === currentProvider ? 'selected' : ''}>
          ${option.label}${
            Number.isFinite(option.active) && Number.isFinite(option.total)
              ? ` (${option.active} active, ${option.total} total)`
              : ''
          }
        </option>`
    )
    .join('');
}

/**
 * Render the models table rows HTML (loading skeleton or model rows).
 * Shared between models-render and models-sync-ui.
 *
 * @param {object} modelsState - The models state object
 * @param {Array} filteredModels - Filtered models to render
 * @param {boolean} canManageAcls - Whether ACL management is allowed
 * @returns {string} HTML markup for the table rows
 */
export function renderModelRowsHtml(modelsState, filteredModels, canManageAcls) {
  if (modelsState.loading) {
    return `
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
                  `;
  }

  if (filteredModels.length === 0) return '';

  return filteredModels
    .map((model) => {
      const isDisabled = modelsState.disabledModels.has(model.id);
      return `
                    <tr data-model-row="${escapeHtml(model.id)}" class="text-xs hover:bg-gray-50/50 transition-colors ${isDisabled ? 'bg-gray-50/80 opacity-70' : 'bg-white'}">
<td class="px-4 py-4 font-medium text-gray-900 truncate" title="${escapeHtml(model.name || model.id)}">${escapeHtml(model.name || model.id)}</td>
                      <td class="px-4 py-4 font-mono truncate ${isDisabled ? 'text-gray-300' : 'text-gray-400'}" title="${escapeHtml(model.id)}">${escapeHtml(model.id)}</td>
                      <td class="px-4 py-4">
                        <div class="flex items-center gap-2">
                          ${renderModelAccessBadgeForModel(model)}
                        </div>
                      </td>
                      <td class="px-4 py-4 text-right">
                        <div class="flex items-center justify-end gap-2">
                          <button
                            type="button"
                            class="inline-flex items-center justify-center h-8 w-8 rounded-lg text-gray-600 hover:bg-gray-100 transition focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary/20 ${isDisabled || !canManageAcls ? 'hidden' : ''}"
                            data-model-acl="${escapeHtml(model.id)}"
                            title="Edit access rules"
                            aria-label="Edit access rules"
                            ${isDisabled || !canManageAcls ? 'tabindex="-1" aria-hidden="true" disabled aria-disabled="true"' : ''}
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
    .join('');
}
