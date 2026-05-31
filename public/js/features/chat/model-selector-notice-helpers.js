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
      noticeEl.className = 'hidden mx-2 mt-1 rounded-xl border px-3 py-2 text-xs';
      return;
    }
    noticeEl.classList.remove('hidden');
    noticeEl.textContent = notice.message;
    noticeEl.className =
      'mx-2 mt-1 rounded-xl border px-3 py-2 text-xs border-amber-200 bg-amber-50 text-amber-800';
  };

  const ensureModelsLoaded = async () => {
    if (state.modelsLoading || (state.models && state.models.length > 0)) return loadingPromise;
    loadingPromise = (async () => {
      setState({ modelsLoading: true });
      const requestGeneration = getModelsCacheGeneration();
      try {
        const cache = await readModelsCache();
        if (cache?.models?.length) {
          if (requestGeneration !== getModelsCacheGeneration()) return;
          const models = filterEnabledModels(cache.models);
          setState({ models, modelCatalogMeta: cache.visibility || null, modelsLoading: false });
          return;
        }
        const data = await fetchModels({ cache: 'default', scope: 'effective' });
        if (requestGeneration !== getModelsCacheGeneration()) return;
        const models = filterEnabledModels(Array.isArray(data?.models) ? data.models : []);
        setState({ models, modelCatalogMeta: data?.visibility || null, modelsLoading: false });
      } catch (err) {
        console.error('Failed to load models:', err);
        setState({ modelsLoading: false });
      } finally {
        loadingPromise = null;
      }
    })();
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
