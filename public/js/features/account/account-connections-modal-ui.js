/**
 * Modal UI helpers and event binding for the account connections section.
 */
import { sortModelsByActiveThenName } from '../../shared/utils/model-state.js';
import {
  isCompatibleProviderType,
  normalizeModelRecord,
  providerDisplayLabel as adminProviderDisplayLabel,
  resolveUrlLabel,
} from '../../shared/utils/connection-helpers.js';
import {
  previewConnectionModalModels,
  buildSelectedConnectionModels,
  updateApiTypeDisplay,
} from '../admin/settings/connections-helpers-modal-models.js';
import {
  normalizeConnectionModelSelectionMode,
  resolveConnectionModelSelectionMode,
} from '../../shared/utils/connection-model-selection.js';
import { buildConnectionModalModelsMarkup } from '../../shared/components/connection-modal.js';
import { normalizeProviderType, providerUrlPlaceholder } from './account-connections-helpers.js';
import { testUserConnection } from '../../shared/api/resources.js';
import { syncProviderUi } from './account-connections-modal-ui-sync-provider.js';

/**
 * Sanitize a string value — trims, stringifies null/undefined.
 * Equivalent to String(v || '').trim() with explicit || semantics.
 */
const sanitizeString = (v) => String(v == null ? '' : v).trim();

/**
 * Resolve a property from an object with a fallback chain.
 * Used for legacy property name resolution.
 */
const resolveProperty = (obj, ...keys) => {
  for (const key of keys) {
    const v = obj?.[key];
    if (v != null && v !== '') return v;
  }
  return '';
};

/**
 * Strip empty optional fields from a payload object.
 * Removes keys whose values are falsy (empty strings / undefined / null).
 */
const stripOptionalFields = (payload) => {
  for (const key of ['key', 'headers', 'auth_type', 'id']) {
    if (!payload[key]) {
      delete payload[key];
    }
  }
  return payload;
};

import {
  handleConnectionModalSave,
  handleConnectionModalDelete,
  persistConnectionPayload,
} from './account-connections-modal-actions.js';

export function createModalUi(ctx) {
  const {
    toggleKeyBtn,
    keyInput,
    saveBtn,
    deleteBtn,
    testMessage,
    viewState,
    providerSelect,
    baseUrlInput,
    bodyEl,
    nameInput,
    modalState,
    isEdit,
    connection,
    searchInput,
    modelsList,
    modelsStatus,
    manualInput,
    manualAddBtn,
    selectNoneBtn,
    selectAllBtn,
    closeModal,
    render,
    upsertPersonalConnection,
    mergeSavedConnection,
    canManageConnections,
    container,
    headersInput,
    closeBtn,
    overlay,
    testBtn,
    removePersonalConnection,
  } = ctx;

  const updateToggleLabel = () => {
    if (!toggleKeyBtn || !keyInput) return;
    toggleKeyBtn.setAttribute('aria-label', keyInput.type === 'password' ? 'Show key' : 'Hide key');
    const label = toggleKeyBtn.querySelector('[data-password-toggle-label]');
    if (label) label.textContent = keyInput.type === 'password' ? 'Show' : 'Hide';
  };
  const setError = (message) => {
    setTestMessage(message, message ? 'error' : 'idle');
  };
  const setSaving = (saving) => {
    viewState.saving = saving;
    if (saveBtn) {
      saveBtn.disabled = saving;
      saveBtn.textContent = saving ? 'Saving...' : 'Save';
      saveBtn.classList.toggle('opacity-60', saving);
      saveBtn.classList.toggle('cursor-not-allowed', saving);
    }
    if (deleteBtn) {
      deleteBtn.disabled = saving;
      deleteBtn.classList.toggle('opacity-60', saving);
      deleteBtn.classList.toggle('cursor-not-allowed', saving);
    }
  };
  const setTestMessage = (message, tone = 'idle') => {
    if (!testMessage) return;
    testMessage.textContent = message || '';
    testMessage.classList.toggle('hidden', !message);
    testMessage.classList.toggle('text-red-500', tone === 'error');
    testMessage.classList.toggle('text-gray-900', tone === 'success');
    testMessage.classList.toggle('text-gray-400', tone === 'idle' || tone === 'testing');
  };
  const renderEmptyState = (message) => {
    if (!modelsList || !modelsStatus) return false;
    modelsList.innerHTML = `<div class="px-4 py-3 text-xs text-gray-400">${message}</div>`;
    modelsStatus.textContent = '';
    if (searchInput) searchInput.value = modalState.query;
    return true;
  };
  const renderLoadingState = () => {
    if (!modelsList || !modelsStatus) return false;
    modelsList.innerHTML = '<div class="px-4 py-3 text-xs text-gray-400">Loading models...</div>';
    modelsStatus.textContent = '';
    if (searchInput) searchInput.value = modalState.query;
    return true;
  };
  const renderErrorState = () => {
    if (!modelsList || !modelsStatus) return false;
    modelsList.innerHTML =
      '<div class="px-4 py-3 text-xs text-red-500">Failed to load models.</div>';
    modelsStatus.textContent = modalState.modelsError;
    modelsStatus.classList.add('text-red-500');
    if (searchInput) searchInput.value = modalState.query;
    return true;
  };
  const hasModelUiElements = () => modelsList && modelsStatus;

  const shouldShowEmptyModelsState = () =>
    !connection?.id && (!Array.isArray(modalState.models) || modalState.models.length === 0);

  const resolveSelectedModels = () =>
    modalState.selection instanceof Set ? modalState.selection : new Set();

  const buildModelsStatusText = (models, selected) =>
    models.length ? `Models selected in this connection: ${selected.size}` : '';

  const renderModels = () => {
    if (!hasModelUiElements()) return;
    if (shouldShowEmptyModelsState()) {
      renderEmptyState('Click Verify to load models from this connection.');
      return;
    }
    if (modalState.loadingModels) {
      renderLoadingState();
      return;
    }
    if (modalState.modelsError) {
      renderErrorState();
      return;
    }
    const models = sortModelsByActiveThenName(modalState.models);
    const selected = resolveSelectedModels();
    modelsList.innerHTML = buildConnectionModalModelsMarkup(
      models,
      modalState.query,
      selected,
      false,
      ''
    );
    modelsStatus.classList.remove('text-red-500');
    modelsStatus.textContent = buildModelsStatusText(models, selected);
    if (searchInput) searchInput.value = modalState.query;
  };
  const resolveProviderType = () =>
    normalizeProviderType(
      providerSelect?.value || connection?.provider_type || connection?.providerType || 'openai'
    );
  const resolveConnectionUrl = (providerType) => {
    const baseUrl = sanitizeString(baseUrlInput?.value);
    return isCompatibleProviderType(providerType)
      ? baseUrl
      : baseUrl || providerUrlPlaceholder(providerType);
  };
  const buildSelectedModels = () =>
    buildSelectedConnectionModels(modalState.models, modalState.selection, connection);
  const resolveManualModelsMode = () => {
    const existingMode =
      normalizeConnectionModelSelectionMode(
        connection?.manual_models_mode || connection?.manualModelsMode
      ) || 'all';
    const hasModels = Array.isArray(modalState.models) && modalState.models.length > 0;
    return hasModels
      ? resolveConnectionModelSelectionMode(modalState.models, modalState.selection)
      : existingMode;
  };
  const resolveConnectionName = () => sanitizeString(nameInput?.value);
  const resolveConnectionKey = () => sanitizeString(keyInput?.value);
  const resolveConnectionHeaders = () => sanitizeString(headersInput?.value);
  const resolveConnectionAuthType = () =>
    sanitizeString(connection?.auth_type || connection?.authType || '').toLowerCase();
  const resolveConnectionEnabled = () => connection?.enabled !== false;

  const buildPayload = () => {
    const providerType = resolveProviderType();
    const payload = {
      id: isEdit ? sanitizeString(connection?.id) : undefined,
      name: resolveConnectionName(),
      provider_type: providerType,
      base_url: resolveConnectionUrl(providerType),
      key: resolveConnectionKey(),
      headers: resolveConnectionHeaders(),
      auth_type: resolveConnectionAuthType(),
      enabled: resolveConnectionEnabled(),
      manual_models: buildSelectedModels(),
      manual_models_mode: resolveManualModelsMode(),
    };
    return stripOptionalFields(payload);
  };
  const validateConnectionUrl = (payload) => {
    if (isCompatibleProviderType(payload.provider_type) && !payload.base_url) {
      throw new Error('Connection URL is required');
    }
  };
  const prepareTestConnection = () => {
    const payload = buildPayload();
    if (!payload.name) throw new Error('Name is required');
    validateConnectionUrl(payload);
    setTestMessage('Testing connection...', 'testing');
    modalState.loadingModels = true;
    renderModels();
    return payload;
  };

  const normalizeDiscoveredModels = (result) => {
    if (!Array.isArray(result?.models)) return [];
    return result.models
      .map((model) =>
        normalizeModelRecord({
          id: model.id,
          name: model.name || model.id,
          manual: false,
        })
      )
      .filter(Boolean);
  };

  const applyTestSuccess = (result, discovered) => {
    const preview = previewConnectionModalModels(
      modalState.models,
      modalState.selection,
      discovered,
      { ...connection, manualModelsMode: modalState.manualModelsMode }
    );
    modalState.models = preview.models;
    modalState.selection = preview.selection;
    modalState.modelsError = '';
    setTestMessage(
      result?.message || `Connection successful. ${discovered.length} models loaded.`,
      'success'
    );
  };

  const applyTestError = (err) => {
    const message = err?.message || 'Failed to test connection';
    modalState.modelsError = message;
    setTestMessage(message, 'error');
  };

  const finishTestLoading = () => {
    modalState.loadingModels = false;
    renderModels();
  };

  const testConnection = async () => {
    const payload = prepareTestConnection();
    try {
      const result = await testUserConnection(payload);
      const discovered = normalizeDiscoveredModels(result);
      applyTestSuccess(result, discovered);
    } catch (err) {
      applyTestError(err);
    } finally {
      finishTestLoading();
    }
  };
  const saveConnection = async () => {
    const payload = buildPayload();
    const name = sanitizeString(payload.name);
    if (!name) {
      throw new Error('Name is required');
    }
    validateConnectionUrl(payload);
    return persistConnectionPayload(payload, isEdit, connection?.id);
  };
  const finishAndRender = () => {
    closeModal();
    render();
  };
  saveBtn?.addEventListener('click', (event) =>
    handleConnectionModalSave(event, {
      viewState,
      setError,
      setSaving,
      saveConnection,
      isEdit,
      connection,
      upsertPersonalConnection,
      mergeSavedConnection,
      finishAndRender,
    })
  );
  deleteBtn?.addEventListener('click', (event) =>
    handleConnectionModalDelete(event, {
      viewState,
      setError,
      setSaving,
      isEdit,
      connection,
      removePersonalConnection,
      finishAndRender,
    })
  );
  closeBtn?.addEventListener('click', closeModal);
  overlay?.addEventListener('click', closeModal);
  providerSelect?.addEventListener('change', () =>
    syncProviderUi(providerSelect, baseUrlInput, bodyEl, nameInput)
  );
  toggleKeyBtn?.addEventListener('click', () => {
    if (!keyInput) return;
    keyInput.type = keyInput.type === 'password' ? 'text' : 'password';
    updateToggleLabel();
  });
  updateToggleLabel();
  testBtn?.addEventListener('click', async () => {
    if (viewState.saving) return;
    setError('');
    try {
      await testConnection();
    } catch (err) {
      setError(err?.message || 'Failed to test connection');
    }
  });
  searchInput?.addEventListener('input', (event) => {
    modalState.query = String(event.target.value || '');
    renderModels();
  });
  selectAllBtn?.addEventListener('click', () => {
    modalState.selection = new Set((modalState.models || []).map((model) => model.id));
    renderModels();
  });
  selectNoneBtn?.addEventListener('click', () => {
    modalState.selection = new Set();
    renderModels();
  });
  manualAddBtn?.addEventListener('click', () => {
    const raw = sanitizeString(manualInput?.value);
    if (!raw) return;
    const normalized = normalizeModelRecord({
      id: raw,
      name: raw,
      manual: true,
      manualModelId: raw,
    });
    if (!normalized) return;
    const nextModels = Array.isArray(modalState.models) ? modalState.models.slice() : [];
    if (!nextModels.some((model) => model.id === normalized.id)) {
      nextModels.push(normalized);
    }
    modalState.models = sortModelsByActiveThenName(nextModels);
    modalState.selection = new Set(modalState.models.map((model) => model.id));
    modalState.query = '';
    modalState.modelsError = '';
    if (manualInput) manualInput.value = '';
    renderModels();
  });
  modelsList?.addEventListener('change', (event) => {
    const checkbox = event.target.closest('[data-model-id]');
    if (!checkbox) return;
    const modelId = checkbox.dataset.modelId;
    if (!modelId) return;
    if (checkbox.checked) {
      modalState.selection.add(modelId);
    } else {
      modalState.selection.delete(modelId);
    }
    renderModels();
  });
  syncProviderUi(providerSelect, baseUrlInput, bodyEl, nameInput);
  renderModels();

  return {
    updateToggleLabel,
    setError,
    setSaving,
    setTestMessage,
    syncProviderUi,
    renderModels,
    buildPayload,
    testConnection,
    saveConnection,
    finishAndRender,
    bindEvents: () => {},
  };
}
