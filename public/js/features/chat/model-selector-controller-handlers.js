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

      // Use setState updater to read latest state and avoid stale closures
      // We do this in two steps: first read current state, then persist, then update
      let currentDefaultModelId = null;
      let currentPreferences = {};

      setState((prev) => {
        currentDefaultModelId = prev.defaultModelId;
        currentPreferences = { ...(prev.user?.preferences || {}) };
        return prev; // no state change, just reading
      });

      const isDefault = currentDefaultModelId === modelId;
      const nextDefaultModelId = isDefault ? null : modelId;
      const nextPreferences = { ...currentPreferences };
      if (nextDefaultModelId) nextPreferences.defaultModelId = nextDefaultModelId;
      else delete nextPreferences.defaultModelId;

      const result = await persistDefaultModelSelection({
        apiFetch,
        modelId: nextDefaultModelId,
        currentPreferences: nextPreferences,
      });

      if (result.ok) {
        setState((prev) => {
          const updated = { defaultModelId: nextDefaultModelId };
          // Only mutate user.preferences if the preference was actually persisted to the backend
          if (result.persisted) {
            const prefs = { ...(prev.user?.preferences || {}) };
            if (nextDefaultModelId) prefs.defaultModelId = nextDefaultModelId;
            else delete prefs.defaultModelId;
            updated.user = prev.user ? { ...prev.user, preferences: prefs } : prev.user;
          }
          return updated;
        });
        renderList(state, { reset: true, rebuild: true });
      }
    } catch (err) {
      console.error('Failed to set default model:', err);
    }
  };
}
