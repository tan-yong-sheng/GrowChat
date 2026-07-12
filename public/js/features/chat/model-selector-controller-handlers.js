import { state, setState } from '../../shared/store.js';
import { persistDefaultModelSelection } from './model-selector-helpers.js';

/**
 * Creates a handleSetDefault handler for the model selector controller.
 *
 * @param {{ renderList: Function }} deps - Dependencies needed by the handler
 * @returns {(modelId: string) => Promise<void>}
 */
export function createHandleSetDefault({ renderList }) {
  return async (modelId) => {
    try {
      const { apiFetch } = await import('../../shared/api.js');
      const { currentDefaultModelId, currentPreferences } = readCurrentPreferences();
      const nextDefaultModelId = resolveNextDefaultModelId(currentDefaultModelId, modelId);
      const nextPreferences = buildNextPreferences(currentPreferences, nextDefaultModelId);

      const result = await persistDefaultModelSelection({
        apiFetch,
        modelId: nextDefaultModelId,
        currentPreferences: nextPreferences,
      });

      if (!result.ok) return;

      setState((prev) =>
        applyPersistedDefault(prev, { result, nextDefaultModelId })
      );
      renderList(state, { reset: true, rebuild: true });
    } catch (err) {
      console.error('Failed to set default model:', err);
    }
  };
}

function readCurrentPreferences() {
  let currentDefaultModelId = null;
  let currentPreferences = {};

  setState((prev) => {
    currentDefaultModelId = prev.defaultModelId;
    currentPreferences = { ...(prev.user?.preferences || {}) };
    return prev; // no state change, just reading
  });

  return { currentDefaultModelId, currentPreferences };
}

function resolveNextDefaultModelId(currentDefaultModelId, modelId) {
  if (currentDefaultModelId === modelId) return null;
  return modelId;
}

function buildNextPreferences(currentPreferences, nextDefaultModelId) {
  const nextPreferences = { ...currentPreferences };
  if (nextDefaultModelId) nextPreferences.defaultModelId = nextDefaultModelId;
  else delete nextPreferences.defaultModelId;
  return nextPreferences;
}

function applyPersistedDefault(prev, { result, nextDefaultModelId }) {
  const updated = { defaultModelId: nextDefaultModelId };
  if (!result.persisted) return updated;
  const prefs = { ...(prev.user?.preferences || {}) };
  if (nextDefaultModelId) prefs.defaultModelId = nextDefaultModelId;
  else delete prefs.defaultModelId;
  updated.user = prev.user ? { ...prev.user, preferences: prefs } : prev.user;
  return updated;
}
