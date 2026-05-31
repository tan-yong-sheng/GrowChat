/**
 * Shared models cache generation counter.
 *
 * Used by session-bootstrap.js (increment on invalidation)
 * and model-selector-controller.js (check before/after fetch)
 * to guard against stale fetch responses overwriting fresh state.
 *
 * @module shared/utils/models-cache-generation
 */

let modelsCacheGeneration = 0;

export function getModelsCacheGeneration() {
  return modelsCacheGeneration;
}

export function incrementModelsCacheGeneration() {
  modelsCacheGeneration += 1;
  return modelsCacheGeneration;
}
