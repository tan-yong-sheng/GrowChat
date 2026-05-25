import { apiFetch } from '../../../shared/api.js';
import { sortModelsByActiveThenName } from '../../../shared/utils/model-state.js';
import { buildProviderOptions } from '../../../shared/utils/model-filters.js';
import {
  extractAttachmentCapsFromModels,
  getAttachmentCapTooltip as getCapTooltip,
  getAttachmentCapValue,
} from './models-helpers.js';

function cloneAclRules(rules = [], normalizer = (rule) => rule) {
  if (!Array.isArray(rules)) return [];
  return rules
    .map((rule) => ({ ...normalizer(rule) }))
    .filter((rule) => rule !== null && rule !== undefined);
}

import { broadcastModelsInvalidation } from '../../../shared/utils/model-sync.js';
import { createModelsRender } from './models-render.js';
import { createModelsSyncUi } from './models-sync-ui.js';
import { createModelsEventHandlers } from './models-event-handlers.js';

export function renderModelsSettings(container, data) {
  const isActiveTab = () => container?.dataset?.settingsTab === 'models';
  const canManageAcls = data.capabilities?.canManageAcls !== false;
  const modelsState =
    data.modelsSettings ||
    (data.modelsSettings = {
      loading: false,
      error: null,
      models: [],
      total: 0,
      activeTotal: 0,
      limit: 20,
      offset: 0,
      disabledModels: new Set(),
      attachmentCaps: {},
      capsLoading: false,
      capsError: null,
      query: '',
      provider: 'all',
      providerOptions: [],
      invalidateToken: null,
      needsReload: false,
    });
  const ensureMounted = () =>
    container.dataset.modelsMounted === '1' &&
    Boolean(container.querySelector('[data-models-scroll]'));
  const getLocalModels = () =>
    modelsState.models.map((model) => ({
      ...model,
      enabled: model.enabled !== false && !modelsState.disabledModels.has(model.id),
    }));
  const getActiveModelCount = () =>
    Number.isFinite(modelsState.activeTotal) ? modelsState.activeTotal : 0;

  if (
    data.modelsSettingsInvalidate &&
    modelsState.invalidateToken !== data.modelsSettingsInvalidate
  ) {
    modelsState.invalidateToken = data.modelsSettingsInvalidate;
    modelsState.models = [];
    modelsState.total = 0;
    modelsState.offset = 0;
    modelsState.error = null;
    modelsState.query = '';
    modelsState.provider = 'all';
    modelsState.providerOptions = [];
    modelsState.needsReload = true;
  }

  const setCapValue = (modelId, kind, value) => {
    const current = modelsState.attachmentCaps?.[modelId] || {};
    const next = { ...current };
    next[kind] = Boolean(value);
    modelsState.attachmentCaps = {
      ...(modelsState.attachmentCaps || {}),
      [modelId]: next,
    };
  };

  const showError = (message) => {
    const errorSlot = container.querySelector('#models-error-container');
    if (errorSlot) {
      errorSlot.innerHTML = `<div data-error-banner class="rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-600 flex items-center justify-between gap-3"><span>${message}</span></div>`;
      setTimeout(() => {
        if (errorSlot.querySelector('[data-error-banner]')) {
          errorSlot.innerHTML = '';
        }
      }, 4000);
    }
  };

  const _toggleModelEnabled = async (modelId) => {
    const model = modelsState.models.find((m) => m.id === modelId);
    if (!model) return;

    const wasDisabled = modelsState.disabledModels.has(modelId);
    const nextEnabled = wasDisabled;

    // Optimistic update
    if (wasDisabled) {
      modelsState.disabledModels.delete(modelId);
      modelsState.activeTotal = getActiveModelCount() + 1;
    } else {
      modelsState.disabledModels.add(modelId);
      modelsState.activeTotal = Math.max(0, getActiveModelCount() - 1);
    }
    syncUi();

    try {
      const res = await apiFetch('/api/admin/models', {
        method: 'PUT',
        body: JSON.stringify({
          updates: [{ id: modelId, enabled: nextEnabled }],
          attachment_updates: [],
          access_updates: [],
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || err.message || 'Failed to update model');
      }
      broadcastModelsInvalidation();
    } catch (err) {
      // Rollback on error
      if (wasDisabled) {
        modelsState.disabledModels.add(modelId);
        modelsState.activeTotal = Math.max(0, getActiveModelCount() - 1);
      } else {
        modelsState.disabledModels.delete(modelId);
        modelsState.activeTotal = getActiveModelCount() + 1;
      }
      syncUi();
      showError(err.message || 'Failed to update model');
    }
  };

  const toggleAttachmentCap = async (modelId, kind) => {
    const currentValue = getAttachmentCapValue(modelsState.attachmentCaps, modelId, kind);
    const nextValue = !currentValue;

    // Optimistic update
    setCapValue(modelId, kind, nextValue);
    syncUi();

    try {
      const res = await apiFetch('/api/admin/models', {
        method: 'PUT',
        body: JSON.stringify({
          updates: [],
          attachment_updates: [{ model_id: modelId, attachments: { [kind]: nextValue } }],
          access_updates: [],
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || err.message || 'Failed to update attachment capability');
      }
      broadcastModelsInvalidation();
    } catch (err) {
      // Rollback on error
      setCapValue(modelId, kind, currentValue);
      syncUi();
      showError(err.message || 'Failed to update attachment capability');
    }
  };

  const saveAclChanges = async (modelId, rules) => {
    try {
      const res = await apiFetch('/api/admin/models', {
        method: 'PUT',
        body: JSON.stringify({
          updates: [],
          attachment_updates: [],
          access_updates: [{ modelId, rules: cloneAclRules(rules) }],
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || err.message || 'Failed to save access rules');
      }
      broadcastModelsInvalidation();
    } catch (err) {
      showError(err.message || 'Failed to save access rules');
    }
  };

  const _updateModelToggle = (btn, enabled) => {
    if (!btn) return;
    btn.classList.toggle('bg-black', enabled);
    btn.classList.toggle('bg-gray-200', !enabled);
    const knob = btn.querySelector('span');
    if (knob) {
      knob.classList.toggle('translate-x-4', enabled);
      knob.classList.toggle('translate-x-0', !enabled);
    }
  };

  const _updateCapButton = (btn, enabled) => {
    if (!btn) return;
    const label = btn.getAttribute('data-cap-label') || 'Attachment';
    const kind = btn.getAttribute('data-cap-kind') || '';
    const state = enabled ? 'allowed' : 'unset';
    btn.dataset.capState = state;
    btn.title = getCapTooltip(label, kind, state);
    btn.classList.toggle('bg-emerald-500', enabled);
    btn.classList.toggle('text-white', enabled);
    btn.classList.toggle('border-emerald-500', enabled);
    btn.classList.toggle('bg-gray-50', !enabled);
    btn.classList.toggle('text-gray-500', !enabled);
    btn.classList.toggle('border-gray-200', !enabled);
  };

  const { syncUi } = createModelsSyncUi({
    container,
    modelsState,
    canManageAcls,
    isActiveTab,
    getLocalModels,
    getActiveModelCount,
    _updateModelToggle,
    _updateCapButton,
  });

  const { bindDelegatedEvents } = createModelsEventHandlers({
    container,
    modelsState,
    canManageAcls,
    _toggleModelEnabled,
    toggleAttachmentCap,
    saveAclChanges,
    _updateModelToggle,
    _updateCapButton,
    openModelAccessModal,
    syncUi,
    loadModels,
    render: () => render(),
  });

  const openModelAccessModal = (model, opts) =>
    import('./models-access-modal.js').then((m) => m.openModelAccessModal(model, opts));

  const { render } = createModelsRender({
    container,
    modelsState,
    canManageAcls,
    isActiveTab,
    ensureMounted,
    getLocalModels,
    getActiveModelCount,
    showError,
    syncUi,
    bindDelegatedEvents,
    openModelAccessModal,
    _updateModelToggle,
    _updateCapButton,
    _toggleModelEnabled,
    toggleAttachmentCap,
  });

  const loadModels = async (force = false) => {
    if (!isActiveTab()) return;
    if (modelsState.models.length > 0 && !force) return;
    const shouldShowLoading = modelsState.models.length === 0;
    modelsState.loading = shouldShowLoading;
    if (shouldShowLoading) {
      render();
    }
    try {
      const res = await apiFetch('/api/admin/models?limit=0&offset=0');
      if (res.ok) {
        const payload = await res.json();
        const selectedModels = sortModelsByActiveThenName(
          (Array.isArray(payload.models) ? payload.models : []).filter(
            (model) => model?.enabled !== false
          )
        );
        modelsState.models = selectedModels;
        modelsState.total = selectedModels.length;
        modelsState.activeTotal = selectedModels.length;
        modelsState.providerOptions = buildProviderOptions(modelsState.models, {
          includeAll: false,
        });
        modelsState.disabledModels = new Set();
        const capsFromModels = extractAttachmentCapsFromModels(modelsState.models);
        modelsState.attachmentCaps = capsFromModels;
      }
    } catch (err) {
      console.warn('Failed to load models for settings', err);
      modelsState.error = err.message;
    } finally {
      modelsState.loading = false;
      if (isActiveTab()) render();
    }
  };

  render();
  loadModels(modelsState.needsReload);
  modelsState.needsReload = false;
}
