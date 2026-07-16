/**
 * Notice, scope summary, and model loading helpers for the model selector.
 */
import { state, setState } from '../../shared/store.js';
import { filterEnabledModels } from '../../shared/utils/model-state.js';
import { getModelSelectorAvailabilitySummary } from './model-selector-helpers.js';
import { fetchModels, readModelsCache } from '../../shared/api.js';
import { getModelsCacheGeneration } from '../../shared/utils/models-cache-generation.js';

export function createModelSelectorNoticeHelpers(elems) {
  const { summaryEl, noticeEl } = elems;
  let noticeClearTimer = null;
  let loadingPromise = null;

  const getSelectableModelCount = (models = []) =>
    filterEnabledModels(Array.isArray(models) ? models : []).filter(
      (model) => model?.hidden_for_user !== true
    ).length;

  const syncScopeSummary = (currentState) => {
    if (!summaryEl) return;
    summaryEl.textContent = getModelSelectorAvailabilitySummary(
      getSelectableModelCount(currentState.models),
      { loading: currentState.modelsLoading }
    );
  };

  const clearModelAvailabilityNotice = () => {
    if (noticeClearTimer) {
      clearTimeout(noticeClearTimer);
      noticeClearTimer = null;
    }
  };

  const setModelAvailabilityNotice = (message, key) => {
    clearModelAvailabilityNotice();
    setState({
      ui: {
        modelAvailabilityNotice: message
          ? {
              key,
              message,
              tone: 'warning',
            }
          : null,
      },
    });
    if (message) {
      noticeClearTimer = setTimeout(() => {
        if (state.ui?.modelAvailabilityNotice?.key === key) {
          setState({
            ui: {
              modelAvailabilityNotice: null,
            },
          });
        }
      }, 6000);
    }
  };

  const syncAvailabilityNotice = (currentState) => {
    if (!noticeEl) return;
    const notice = currentState.ui?.modelAvailabilityNotice || null;
    if (!notice?.message) {
      noticeEl.classList.add('hidden');
      noticeEl.textContent = '';
      noticeEl.className = 'hidden mx-2 mt-1 rounded-md border px-3 py-2 text-xs';
      return;
    }
    noticeEl.classList.remove('hidden');
    noticeEl.textContent = notice.message;
    noticeEl.className =
      'mx-2 mt-1 rounded-md border px-3 py-2 text-xs border-amber-200 bg-amber-50 text-amber-800';
  };

  function shouldSkipModelsLoad() {
    return state.modelsLoading || (state.models && state.models.length > 0);
  }

  function applyCachedModels(cache, requestGeneration) {
    if (!cache?.models?.length) return false;
    if (requestGeneration !== getModelsCacheGeneration()) return true;
    const models = filterEnabledModels(cache.models);
    setState({ models, modelCatalogMeta: cache.visibility || null, modelsLoading: false });
    return true;
  }

  async function applyFetchedModels(data, requestGeneration) {
    if (requestGeneration !== getModelsCacheGeneration()) return;
    const models = filterEnabledModels(Array.isArray(data?.models) ? data.models : []);
    setState({ models, modelCatalogMeta: data?.visibility || null, modelsLoading: false });
  }

  function handleModelsLoadError(err) {
    console.error('Failed to load models:', err);
    setState({ modelsLoading: false });
  }

  async function loadModelsOnce() {
    setState({ modelsLoading: true });
    const requestGeneration = getModelsCacheGeneration();
    try {
      const cache = await readModelsCache();
      if (applyCachedModels(cache, requestGeneration)) return;
      const data = await fetchModels({ cache: 'default', scope: 'effective' });
      await applyFetchedModels(data, requestGeneration);
    } catch (err) {
      handleModelsLoadError(err);
    } finally {
      loadingPromise = null;
    }
  }

  const ensureModelsLoaded = async () => {
    if (shouldSkipModelsLoad()) return loadingPromise;
    loadingPromise = loadModelsOnce();
    return loadingPromise;
  };

  return {
    getSelectableModelCount,
    syncScopeSummary,
    clearModelAvailabilityNotice,
    setModelAvailabilityNotice,
    syncAvailabilityNotice,
    ensureModelsLoaded,
  };
}
