/**
 * Shared model display helpers used by models-render and models-sync-ui.
 * Extracted from the duplicated provider/pagination computation block
 * (CLONE GROUP: 22 lines, 186 tokens).
 */
// fallow-ignore-file security-sink

import { normalizeModelSearchQuery } from '../../../shared/utils/model-search.js';
import { filterModelsBySearchAndProvider } from '../../../shared/utils/model-filters.js';

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
