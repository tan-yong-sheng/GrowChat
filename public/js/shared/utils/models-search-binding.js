/**
 * Shared guard and debounce utilities for models search.
 * Extracted from duplicate patterns between
 * account-models-events.js and models-event-handlers.js.
 *
 * Only the guard setup + debounce declaration are shared;
 * the full input/binding logic differs per file.
 */

/**
 * Initialize the models search event guard.
 * Returns true if already bound (skip), false if first call.
 * @param {HTMLElement} container
 * @returns {boolean} true if already bound
 */
export function initModelsSearchGuard(container) {
  if (container.dataset.modelsEventsBound === '1') return true;
  container.dataset.modelsEventsBound = '1';
  return false;
}

/**
 * Create a reusable debounce ref for models search.
 * @returns {{ searchDebounce: number|null, clear: () => void, run: (fn: () => void, ms?: number) => void }}
 */
export function createModelsSearchDebounce() {
  let searchDebounce = null;
  return {
    clear() {
      if (searchDebounce) {
        clearTimeout(searchDebounce);
        searchDebounce = null;
      }
    },
    run(fn, ms = 120) {
      if (searchDebounce) clearTimeout(searchDebounce);
      searchDebounce = setTimeout(fn, ms);
    },
  };
}
