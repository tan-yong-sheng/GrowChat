/**
 * Shared model search debounce setup for both admin-settings and account models views.
 *
 * Extracted from duplicated guard + input handler pattern between
 * models-event-handlers.js (settings) and account-models-events.js (account).
 */

const MODEL_SEARCH_DEBOUNCE_MS = 120;

export function setupModelSearchInput(container, searchInputId, onDebouncedSearch) {
  if (container.dataset.modelsEventsBound === '1') return;
  container.dataset.modelsEventsBound = '1';

  let searchDebounce = null;

  container.addEventListener('input', (event) => {
    const target = event.target;
    if (!(target instanceof HTMLInputElement)) return;
    if (target.id !== searchInputId) return;
    const nextValue = target.value;

    if (searchDebounce) clearTimeout(searchDebounce);
    searchDebounce = setTimeout(() => {
      onDebouncedSearch(nextValue);
    }, MODEL_SEARCH_DEBOUNCE_MS);
  });

  return searchDebounce;
}
