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
  resolveModalUrl,
} from './connections-helpers.js';
import {
  updateApiTypeDisplay,
  previewConnectionModalModels,
  buildModalConnectionPayload,
} from './connections-helpers-modal-models.js';
import { normalizeConnectionModelSelectionMode } from '../../../shared/utils/connection-model-selection.js';
import { buildConnectionModalModelsMarkup } from '../../../shared/components/connection-modal.js';
import { sortModelsByActiveThenName } from '../../../shared/utils/model-state.js';

export function createConnectionsModalForm(deps) {
  const { container, connectionsState, setTestStatus } = deps;

  const fillModalFields = (connection, scope = container) => {
    const nameInput = scope.querySelector('#modal-conn-name');
    const urlInput = scope.querySelector('#modal-conn-url');
    const keyInput = scope.querySelector('#modal-conn-key');
    const headersInput = scope.querySelector('#modal-conn-headers');
    const providerSelect = scope.querySelector('#modal-conn-provider');
    const testButton = scope.querySelector('#test-connection');
    const testMessage = scope.querySelector('#connection-test-message');
    const isReadOnlyConnection = Boolean(connection?.readOnly);

    if (nameInput) nameInput.value = connection?.name || '';
    if (urlInput) urlInput.value = connection?.url || '';
    if (keyInput) keyInput.value = '';
    if (headersInput) headersInput.value = connection?.headers || '';
    if (providerSelect) providerSelect.value = connection?.providerType || 'openai';

    if (urlInput) {
      const providerType = providerSelect?.value || connection?.providerType || 'openai';
      const defaultUrl = providerUrlPlaceholder(providerType);
      urlInput.placeholder = defaultUrl;
      if (
        !isCompatibleProviderType(providerType) &&
        !String(urlInput.value || '').trim() &&
        !isReadOnlyConnection
      ) {
        urlInput.value = defaultUrl;
      }
    }
    if (nameInput)
      nameInput.placeholder = `e.g. ${providerDisplayLabel(providerSelect?.value || connection?.providerType || 'openai')}`;

    if (nameInput) nameInput.disabled = isReadOnlyConnection;
    if (urlInput) urlInput.disabled = isReadOnlyConnection;
    if (keyInput) keyInput.disabled = isReadOnlyConnection;
    if (headersInput) headersInput.disabled = isReadOnlyConnection;
    if (providerSelect) providerSelect.disabled = isReadOnlyConnection;

    if (nameInput) nameInput.classList.toggle('text-gray-400', isReadOnlyConnection);
    if (urlInput) urlInput.classList.toggle('text-gray-400', isReadOnlyConnection);
    if (keyInput) keyInput.classList.toggle('text-gray-400', isReadOnlyConnection);
    if (headersInput) headersInput.classList.toggle('text-gray-400', isReadOnlyConnection);
    if (providerSelect) providerSelect.classList.toggle('text-gray-400', isReadOnlyConnection);

    const title = scope.querySelector('#modal-title');
    if (title)
      title.textContent =
        connectionsState.modalMode === 'update' ? 'Edit Connection' : 'Add Connection';

    const providerHint = scope.querySelector('#modal-conn-provider-hint');
    if (providerHint)
      providerHint.textContent = providerDisplayLabel(
        providerSelect?.value || connection?.providerType || 'openai'
      );

    const urlLabel = scope.querySelector('#modal-conn-url-label');
    if (urlLabel)
      urlLabel.textContent = resolveUrlLabel(
        providerSelect?.value || connection?.providerType || 'openai'
      );

    const urlHint = scope.querySelector('#modal-conn-url-hint');
    if (urlHint) {
      urlHint.textContent = isCompatibleProviderType(
        providerSelect?.value || connection?.providerType || 'openai'
      )
        ? 'Required for compatible providers.'
        : 'Uses the built-in default if left blank.';
    }

    const keyLabel = scope.querySelector('#modal-conn-key-label');
    if (keyLabel) keyLabel.textContent = resolveKeyLabel();

    const keyHint = scope.querySelector('#modal-conn-key-hint');
    if (keyHint) {
      keyHint.textContent =
        connection?.hasKey || connection?.keyMasked
          ? 'A key is already saved. Leave this blank to keep it.'
          : 'Optional for providers that do not require a key.';
    }

    updateApiTypeDisplay(scope, providerSelect?.value || connection?.providerType || 'openai');

    const deleteBtn = scope.querySelector('#delete-connection');
    if (deleteBtn)
      deleteBtn.classList.toggle(
        'hidden',
        connectionsState.modalMode !== 'update' || isReadOnlyConnection
      );

    if (testButton) testButton.classList.toggle('hidden', isReadOnlyConnection);
    if (testMessage) testMessage.classList.toggle('hidden', isReadOnlyConnection);
    setTestStatus('idle', '', scope);
  };

  const renderModalModels = (scope = container) => {
    const list = scope.querySelector('#modal-models-list');
    const status = scope.querySelector('#modal-models-status');
    if (!list || !status) return;
    if (
      !connectionsState.selectedConnection &&
      (!Array.isArray(connectionsState.modalModels) || connectionsState.modalModels.length === 0)
    ) {
      list.innerHTML =
        '<div class="px-4 py-3 text-xs text-gray-400">Click Verify to load models from this connection.</div>';
      status.textContent = '';
      return;
    }
    if (connectionsState.modalModelsLoading) {
      list.innerHTML = '<div class="px-4 py-3 text-xs text-gray-400">Loading models...</div>';
      status.textContent = '';
      return;
    }
    if (connectionsState.modalModelsError) {
      list.innerHTML = '<div class="px-4 py-3 text-xs text-red-500">Failed to load models.</div>';
      status.textContent = connectionsState.modalModelsError;
      status.classList.add('text-red-500');
      return;
    }
    const models = sortModelsByActiveThenName(connectionsState.modalModels);
    const selected = connectionsState.modalModelsSelection || new Set();
    if (!models.length) {
      list.innerHTML =
        '<div class="px-4 py-3 text-xs text-gray-400">No models discovered for this connection.</div>';
      status.textContent = '';
      return;
    }
    list.innerHTML = buildConnectionModalModelsMarkup(
      models,
      connectionsState.modalModelsQuery,
      selected,
      connectionsState.modalModelsLoading,
      connectionsState.modalModelsError || ''
    );
    status.classList.remove('text-red-500');
    status.textContent = models.length
      ? `Models selected in this connection: ${selected.size}`
      : '';
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
    renderModalModels(modalRoot);
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
    renderModalModels(modalRoot);
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
      renderModalModels(scope);
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
    renderModalModels(scope);
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
      renderModalModels(scope);
    }
  };

  const refreshModalModels = async (scope = container) => {
    const modalRoot = scope.querySelector('#edit-connection-modal') || scope;
    const payload = buildModalConnectionPayload(modalRoot, connectionsState.selectedConnection);
    const resolvedUrl = resolveModalUrl(payload.providerType, payload.url);
    if (!resolvedUrl) {
      setTestStatus('error', 'URL is required for compatible providers', modalRoot);
      return;
    }
    payload.url = resolvedUrl;
    connectionsState.modalModelsLoading = true;
    connectionsState.modalModelsError = null;
    renderModalModels(modalRoot);
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
        renderModalModels(modalRoot);
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
          renderModalModels(modalRoot);
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
      renderModalModels(modalRoot);
    } catch (err) {
      connectionsState.modalModels = [];
      connectionsState.modalModelsSelection = new Set();
      connectionsState.modalModelsOriginal = new Set();
      connectionsState.modalModelsError = err.message || 'Failed to load models';
      renderModalModels(modalRoot);
      setTestStatus('error', err.message || 'Connection failed', modalRoot);
    } finally {
      connectionsState.modalModelsLoading = false;
      renderModalModels(modalRoot);
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
