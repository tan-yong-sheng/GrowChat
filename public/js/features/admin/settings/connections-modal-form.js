/**
 * Connection modal form helpers — field population, model rendering,
 * and model loading/refreshing for the connection create/edit modal.
 */

import { apiFetch } from '../../../shared/api.js';
import {
  normalizeConnectionManualModels,
  normalizeModelRecord,
  formatConnectionModelId,
  getConnectionProviderId,
  providerDisplayLabel,
  providerUrlPlaceholder,
  isCompatibleProviderType,
  resolveUrlLabel,
  resolveKeyLabel,
  cloneModelSelection,
  inflateManualConnectionModels,
} from './connections-helpers.js';
import { buildTestableConnectionPayload } from '../../../shared/utils/connection-helpers.js';
import {
  updateApiTypeDisplay,
  previewConnectionModalModels,
} from './connections-helpers-modal-models.js';
import { normalizeConnectionModelSelectionMode } from '../../../shared/utils/connection-model-selection.js';
import { renderModalModels } from './connections-modal-form-render-models.js';

function queryConnectionModalRefs(scope) {
  return {
    nameInput: scope.querySelector('#modal-conn-name'),
    urlInput: scope.querySelector('#modal-conn-url'),
    keyInput: scope.querySelector('#modal-conn-key'),
    headersInput: scope.querySelector('#modal-conn-headers'),
    providerSelect: scope.querySelector('#modal-conn-provider'),
    testButton: scope.querySelector('#test-connection'),
    testMessage: scope.querySelector('#connection-test-message'),
    title: scope.querySelector('#modal-title'),
    providerHint: scope.querySelector('#modal-conn-provider-hint'),
    urlLabel: scope.querySelector('#modal-conn-url-label'),
    urlHint: scope.querySelector('#modal-conn-url-hint'),
    keyLabel: scope.querySelector('#modal-conn-key-label'),
    keyHint: scope.querySelector('#modal-conn-key-hint'),
    deleteBtn: scope.querySelector('#delete-connection'),
  };
}

function setElementValue(el, value) {
  if (el) el.value = value;
}

function setElementText(el, text) {
  if (el) el.textContent = text;
}

function setElementDisabled(el, disabled) {
  if (el) el.disabled = disabled;
}

function toggleElementClass(el, className, force) {
  if (el) el.classList.toggle(className, force);
}

function resolveEffectiveProviderType(refs, connection) {
  const selected = refs.providerSelect?.value;
  return selected || connection?.providerType || 'openai';
}

function applyFieldValues(refs, connection) {
  setElementValue(refs.nameInput, connection?.name || '');
  setElementValue(refs.urlInput, connection?.url || '');
  setElementValue(refs.keyInput, '');
  setElementValue(refs.headersInput, connection?.headers || '');
  setElementValue(refs.providerSelect, connection?.providerType || 'openai');
}

function applyReadOnlyState(refs, isReadOnlyConnection) {
  setElementDisabled(refs.nameInput, isReadOnlyConnection);
  setElementDisabled(refs.urlInput, isReadOnlyConnection);
  setElementDisabled(refs.keyInput, isReadOnlyConnection);
  setElementDisabled(refs.headersInput, isReadOnlyConnection);
  setElementDisabled(refs.providerSelect, isReadOnlyConnection);
  toggleElementClass(refs.nameInput, 'text-gray-400', isReadOnlyConnection);
  toggleElementClass(refs.urlInput, 'text-gray-400', isReadOnlyConnection);
  toggleElementClass(refs.keyInput, 'text-gray-400', isReadOnlyConnection);
  toggleElementClass(refs.headersInput, 'text-gray-400', isReadOnlyConnection);
  toggleElementClass(refs.providerSelect, 'text-gray-400', isReadOnlyConnection);
}

function applyUrlPlaceholder(refs, providerType, isReadOnlyConnection) {
  if (!refs.urlInput) return;
  const defaultUrl = providerUrlPlaceholder(providerType);
  refs.urlInput.placeholder = defaultUrl;
  const needsDefault =
    !isCompatibleProviderType(providerType) &&
    !String(refs.urlInput.value || '').trim() &&
    !isReadOnlyConnection;
  if (needsDefault) {
    refs.urlInput.value = defaultUrl;
  }
}

function applyNamePlaceholder(refs, providerType) {
  if (refs.nameInput) {
    refs.nameInput.placeholder = `e.g. ${providerDisplayLabel(providerType)}`;
  }
}

const MODAL_TITLES = {
  update: 'Edit Connection',
  default: 'Add Connection',
};

function resolveModalTitle(modalMode) {
  return modalMode === 'update' ? MODAL_TITLES.update : MODAL_TITLES.default;
}

function applyProviderLabels(refs, providerType) {
  setElementText(refs.providerHint, providerDisplayLabel(providerType));
  setElementText(refs.urlLabel, resolveUrlLabel(providerType));
  const urlHintText = isCompatibleProviderType(providerType)
    ? 'Required for compatible providers.'
    : 'Uses the built-in default if left blank.';
  setElementText(refs.urlHint, urlHintText);
}

function applyKeyLabels(refs, connection) {
  setElementText(refs.keyLabel, resolveKeyLabel());
  const hasSavedKey = Boolean(connection?.hasKey || connection?.keyMasked);
  const keyHintText = hasSavedKey
    ? 'A key is already saved. Leave this blank to keep it.'
    : 'Optional for providers that do not require a key.';
  setElementText(refs.keyHint, keyHintText);
}

function applyModalButtons(refs, isReadOnlyConnection, modalMode) {
  const hideDelete = modalMode !== 'update' || isReadOnlyConnection;
  toggleElementClass(refs.deleteBtn, 'hidden', hideDelete);
  toggleElementClass(refs.testButton, 'hidden', isReadOnlyConnection);
  toggleElementClass(refs.testMessage, 'hidden', isReadOnlyConnection);
}

export function createConnectionsModalForm(deps) {
  const { container, connectionsState, setTestStatus } = deps;

  const fillModalFields = (connection, scope = container) => {
    const refs = queryConnectionModalRefs(scope);
    const isReadOnlyConnection = Boolean(connection?.readOnly);
    const providerType = resolveEffectiveProviderType(refs, connection);

    applyFieldValues(refs, connection);
    applyUrlPlaceholder(refs, providerType, isReadOnlyConnection);
    applyNamePlaceholder(refs, providerType);
    applyReadOnlyState(refs, isReadOnlyConnection);
    setElementText(refs.title, resolveModalTitle(connectionsState.modalMode));
    applyProviderLabels(refs, providerType);
    applyKeyLabels(refs, connection);
    applyModalButtons(refs, isReadOnlyConnection, connectionsState.modalMode);

    updateApiTypeDisplay(scope, providerType);
    setTestStatus('idle', '', scope);
  };

  const addManualModalModel = (scope = container) => {
    const modalRoot = scope.querySelector('#edit-connection-modal') || scope;
    const connection = connectionsState.selectedConnection;
    if (!connection?.id || connection?.readOnly) return;
    const input = modalRoot.querySelector('#modal-manual-model-id');
    if (!input) return;
    const raw = String(input.value || '').trim();
    const safe = raw.replace(/^models\//i, '');
    if (!safe) {
      setTestStatus('error', 'Model name is required', modalRoot);
      return;
    }
    const providerId = getConnectionProviderId(connection);
    const fullId = formatConnectionModelId(providerId, safe);
    if (!fullId) {
      setTestStatus('error', 'Model name is required', modalRoot);
      return;
    }
    const nextModels = Array.isArray(connectionsState.modalModels)
      ? [...connectionsState.modalModels]
      : [];
    const manualRecord = normalizeModelRecord({
      id: fullId,
      name: safe,
      manual: true,
      manualModelId: safe,
    });
    const existingIndex = nextModels.findIndex((model) => model.id === fullId);
    if (existingIndex === -1) {
      nextModels.push(manualRecord);
    } else {
      nextModels[existingIndex] = {
        ...nextModels[existingIndex],
        ...manualRecord,
        manual: true,
        manualModelId: safe,
      };
    }
    const nextManualModels = normalizeConnectionManualModels(connection.manualModels);
    if (!nextManualModels.some((model) => model.modelId === safe)) {
      nextManualModels.push({ modelId: safe, name: safe });
    }
    connectionsState.modalModelsError = null;
    connectionsState.modalModelsLoading = false;
    // Note: we intentionally do NOT mutate connection.manualModels here. The
    // modal-local modalModels + modalModelsSelection drives the save payload
    // (buildSelectedConnectionModels), so writing to the live connection is
    // unnecessary. Mutating it would also break the cancel/refresh-resurrects
    // invariant: if the user cancels, the in-memory connection would still
    // carry the new model even though nothing was persisted.
    connectionsState.modalModels = nextModels;
    connectionsState.modalModelsSelection = new Set(connectionsState.modalModelsSelection || []);
    connectionsState.modalModelsSelection.add(fullId);
    connectionsState.modalModelsOriginal = new Set(connectionsState.modalModelsOriginal || []);
    connectionsState.modalModelsOriginal.add(fullId);
    // Clear any tombstone from a previous remove of the same model so the
    // re-add isn't silently filtered out by buildSelectedConnectionModels().
    if (Array.isArray(connectionsState.deletedManualModelIds)) {
      connectionsState.deletedManualModelIds = connectionsState.deletedManualModelIds.filter(
        (id) => id !== safe && id !== fullId
      );
    }
    input.value = '';
    renderModalModels(connectionsState, modalRoot);
  };

  const removeManualModalModel = (modelId, scope = container) => {
    const modalRoot = scope.querySelector('#edit-connection-modal') || scope;
    const connection = connectionsState.selectedConnection;
    if (!connection?.id || connection?.readOnly) return;
    const models = Array.isArray(connectionsState.modalModels) ? connectionsState.modalModels : [];
    const target = models.find((m) => m.id === modelId);
    if (!target || !target.manual) return;
    const deletedModelId = target.manualModelId || modelId;
    connectionsState.modalModels = models.filter((m) => m.id !== modelId);
    if (connectionsState.modalModelsSelection instanceof Set) {
      connectionsState.modalModelsSelection.delete(modelId);
    }
    if (connectionsState.modalModelsOriginal instanceof Set) {
      connectionsState.modalModelsOriginal.delete(modelId);
    }
    if (!Array.isArray(connectionsState.deletedManualModelIds)) {
      connectionsState.deletedManualModelIds = [];
    }
    connectionsState.deletedManualModelIds.push(deletedModelId);
    // Note: we intentionally do NOT mutate connection.manualModels here.
    // The modal-local modalModels + deletedManualModelIds drives the save
    // payload (buildSelectedConnectionModels + the delete filter in the
    // save handler), so writing to the live connection is unnecessary.
    // Mutating it would also break the cancel/refresh-resurrects invariant:
    // if the user cancels, the in-memory connection would still carry the
    // deletion even though nothing was persisted, and the next open would
    // show a stale model list. refreshModalModels() filters the seeded
    // manual models against deletedManualModelIds to keep the deleted
    // model from resurrecting after a Test/Verify.
    renderModalModels(connectionsState, modalRoot);
  };

  const loadModalModels = async (connection, scope = container) => {
    const connectionId = String(connection?.id || '').trim();
    if (!connectionId) {
      connectionsState.modalModels = [];
      connectionsState.modalModelsSelection = new Set();
      connectionsState.modalModelsOriginal = new Set();
      connectionsState.modalModelsQuery = '';
      connectionsState.modalModelsConnectionId = null;
      connectionsState.modalModelsError = null;
      connectionsState.modalModelsLoading = false;
      renderModalModels(connectionsState, scope);
      return;
    }
    const seedModels = inflateManualConnectionModels(connection);
    const seedSelection = new Set(seedModels.map((model) => model.id));
    const inferredMode =
      normalizeConnectionModelSelectionMode(
        connection?.manualModelsMode || connection?.manual_models_mode
      ) || (seedSelection.size > 0 ? 'some' : 'all');
    connectionsState.modalModelsLoading = true;
    connectionsState.modalModelsError = null;
    connectionsState.modalModelsConnectionId = connectionId;
    connectionsState.modalModels = seedModels;
    connectionsState.modalModelsSelection = seedSelection;
    connectionsState.modalModelsOriginal = cloneModelSelection(seedSelection);
    renderModalModels(connectionsState, scope);
    try {
      const res = await apiFetch('/api/admin/models?limit=0&offset=0&include_disabled=1');
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(
          err.details?.message || err.message || err.error || 'Failed to load models'
        );
      }
      const payload = await res.json();
      const allModels = Array.isArray(payload?.models) ? payload.models : [];
      const preview = previewConnectionModalModels(seedModels, seedSelection, allModels, {
        ...connection,
        manualModelsMode: inferredMode,
      });
      connectionsState.modalModels = preview.models;
      connectionsState.modalModelsSelection = preview.selection;
      connectionsState.modalModelsOriginal = preview.original;
    } catch (err) {
      connectionsState.modalModelsError = err.message || 'Failed to load models';
    } finally {
      connectionsState.modalModelsLoading = false;
      renderModalModels(connectionsState, scope);
    }
  };

  const refreshModalModels = async (scope = container) => {
    const testable = buildTestableConnectionPayload(scope, connectionsState.selectedConnection);
    if (!testable) {
      setTestStatus('error', 'URL is required for compatible providers', scope);
      return;
    }
    const { modalRoot, payload } = testable;
    connectionsState.modalModelsLoading = true;
    connectionsState.modalModelsError = null;
    renderModalModels(connectionsState, modalRoot);
    setTestStatus('testing', 'Verifying connection and loading models...', modalRoot);
    try {
      const res = await apiFetch('/api/admin/openai/connections/test', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      const responsePayload = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(
          responsePayload.details?.message ||
            responsePayload.message ||
            responsePayload.error ||
            'Connection failed'
        );
      }
      if (Array.isArray(responsePayload.models)) {
        const preview = previewConnectionModalModels(
          connectionsState.modalModels,
          connectionsState.modalModelsSelection,
          responsePayload.models,
          connectionsState.selectedConnection
        );
        connectionsState.modalModels = preview.models;
        connectionsState.modalModelsSelection = preview.selection;
        connectionsState.modalModelsOriginal = preview.original;
        renderModalModels(connectionsState, modalRoot);
        const existingManualModels = connectionsState.selectedConnection
          ? inflateManualConnectionModels(connectionsState.selectedConnection).filter(
              (model) =>
                !Array.isArray(connectionsState.deletedManualModelIds) ||
                !connectionsState.deletedManualModelIds.includes(model.manualModelId)
            )
          : [];
        if (existingManualModels.length > 0) {
          const merged = new Map(
            (connectionsState.modalModels || []).map((model) => [model.id, model])
          );
          existingManualModels.forEach((model) => {
            if (!merged.has(model.id)) {
              merged.set(model.id, model);
              connectionsState.modalModelsSelection.add(model.id);
              connectionsState.modalModelsOriginal.add(model.id);
            }
          });
          connectionsState.modalModels = Array.from(merged.values());
          renderModalModels(connectionsState, modalRoot);
        }
      } else {
        connectionsState.modalModels = [];
        connectionsState.modalModelsSelection = new Set();
        connectionsState.modalModelsOriginal = new Set();
      }
      const count = Array.isArray(responsePayload.models) ? responsePayload.models.length : 0;
      setTestStatus(
        'success',
        count > 0 ? `Connection successful. ${count} models loaded.` : 'Connection successful.',
        modalRoot
      );
      renderModalModels(connectionsState, modalRoot);
    } catch (err) {
      connectionsState.modalModels = [];
      connectionsState.modalModelsSelection = new Set();
      connectionsState.modalModelsOriginal = new Set();
      connectionsState.modalModelsError = err.message || 'Failed to load models';
      renderModalModels(connectionsState, modalRoot);
      setTestStatus('error', err.message || 'Connection failed', modalRoot);
    } finally {
      connectionsState.modalModelsLoading = false;
      renderModalModels(connectionsState, modalRoot);
    }
  };

  const updateModalSaveButton = (scope = container) => {
    const btn = scope.querySelector('#save-modal');
    if (!btn) return;
    const saving = connectionsState.modalSaving;
    btn.disabled = saving;
    btn.textContent = saving ? 'Saving...' : 'Save';
    btn.classList.toggle('opacity-60', saving);
    btn.classList.toggle('cursor-not-allowed', saving);
  };

  return {
    fillModalFields,
    renderModalModels,
    addManualModalModel,
    removeManualModalModel,
    loadModalModels,
    refreshModalModels,
    updateModalSaveButton,
  };
}
