/**
 * Connection modal form operations — add/remove/load/refresh modal-model
 * orchestration extracted from the closure inside createConnectionsModalForm
 * so the parent stays under the function-length/statement limits.
 */

import { apiFetch } from '../../../shared/api.js';
import { cloneModelSelection, inflateManualConnectionModels } from './connections-helpers.js';
import { previewConnectionModalModels } from './connections-helpers-modal-models.js';
import { normalizeConnectionModelSelectionMode } from '../../../shared/utils/connection-model-selection.js';
import { renderModalModels } from './connections-modal-form-render-models.js';
import { buildTestableConnectionPayload } from '../../../shared/utils/connection-helpers.js';
import {
  buildAddedModalModels,
  commitAddedModalModelState,
  getModalConnection,
  getModelInputValue,
  resolveModelFullId,
  addModelToManualModels,
  parseConnectionTestError,
  getRefreshModelStatusMessage,
  resetModalModelsState,
  mergeRefreshedManualModels,
} from './connections-modal-form-helpers.js';

function parseModelFetchError(err) {
  return err.details?.message || err.message || err.error || 'Failed to load models';
}

function inferConnectionModelMode(connection, seedSelection) {
  const rawMode = connection?.manualModelsMode || connection?.manual_models_mode;
  return (
    normalizeConnectionModelSelectionMode(rawMode) || (seedSelection.size > 0 ? 'some' : 'all')
  );
}

function initializeModalState(connectionsState, connection, connectionId, scope) {
  const seedModels = inflateManualConnectionModels(connection);
  const seedSelection = new Set(seedModels.map((model) => model.id));
  const inferredMode = inferConnectionModelMode(connection, seedSelection);
  connectionsState.modalModelsLoading = true;
  connectionsState.modalModelsError = null;
  connectionsState.modalModelsConnectionId = connectionId;
  connectionsState.modalModels = seedModels;
  connectionsState.modalModelsSelection = seedSelection;
  connectionsState.modalModelsOriginal = cloneModelSelection(seedSelection);
  renderModalModels(connectionsState, scope);
  return { seedModels, seedSelection, inferredMode };
}

function clearModalModelsState(connectionsState, scope) {
  connectionsState.modalModels = [];
  connectionsState.modalModelsSelection = new Set();
  connectionsState.modalModelsOriginal = new Set();
  connectionsState.modalModelsQuery = '';
  connectionsState.modalModelsConnectionId = null;
  connectionsState.modalModelsError = null;
  connectionsState.modalModelsLoading = false;
  renderModalModels(connectionsState, scope);
}

function findRemoveableManualModel(connectionsState, modelId) {
  if (!connectionsState.selectedConnection?.id || connectionsState.selectedConnection?.readOnly)
    return null;
  const models = Array.isArray(connectionsState.modalModels) ? connectionsState.modalModels : [];
  const target = models.find((m) => m.id === modelId);
  if (!target || !target.manual) return null;
  return target;
}

function applyRemovedModelState(connectionsState, modelId, deletedModelId) {
  connectionsState.modalModels = connectionsState.modalModels.filter((m) => m.id !== modelId);
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
}

function enterRefreshMode(connectionsState, modalRoot, setTestStatus) {
  connectionsState.modalModelsLoading = true;
  connectionsState.modalModelsError = null;
  renderModalModels(connectionsState, modalRoot);
  setTestStatus('testing', 'Verifying connection and loading models...', modalRoot);
}

function applyRefreshedModels(connectionsState, models) {
  const preview = previewConnectionModalModels(
    connectionsState.modalModels,
    connectionsState.modalModelsSelection,
    models,
    connectionsState.selectedConnection
  );
  connectionsState.modalModels = preview.models;
  connectionsState.modalModelsSelection = preview.selection;
  connectionsState.modalModelsOriginal = preview.original;
  mergeRefreshedManualModels(connectionsState);
}

function handleRefreshSuccess(connectionsState, modalRoot, setTestStatus, responsePayload) {
  if (Array.isArray(responsePayload.models)) {
    applyRefreshedModels(connectionsState, responsePayload.models);
  } else {
    resetModalModelsState(connectionsState);
  }
  renderModalModels(connectionsState, modalRoot);
  setTestStatus('success', getRefreshModelStatusMessage(responsePayload), modalRoot);
}

function handleRefreshError(connectionsState, modalRoot, setTestStatus, err) {
  resetModalModelsState(connectionsState);
  connectionsState.modalModelsError = err.message || 'Failed to load models';
  renderModalModels(connectionsState, modalRoot);
  setTestStatus('error', err.message || 'Connection failed', modalRoot);
}

function exitRefreshMode(connectionsState, modalRoot) {
  connectionsState.modalModelsLoading = false;
  renderModalModels(connectionsState, modalRoot);
}

export function addManualModalModel(
  { connectionsState, container, setTestStatus },
  scope = container
) {
  const modalRoot = scope.querySelector('#edit-connection-modal') || scope;
  const connection = getModalConnection(connectionsState);
  if (!connection) return;
  const modelInput = getModelInputValue(scope);
  if (!modelInput) {
    setTestStatus('error', 'Model name is required', modalRoot);
    return;
  }
  const { input, safe } = modelInput;
  const fullId = resolveModelFullId(connection, safe);
  if (!fullId) {
    setTestStatus('error', 'Model name is required', modalRoot);
    return;
  }
  const nextModels = buildAddedModalModels(connectionsState, fullId, safe);
  addModelToManualModels(connection, safe);
  commitAddedModalModelState(connectionsState, fullId, safe, nextModels);
  input.value = '';
  renderModalModels(connectionsState, modalRoot);
}

export function removeManualModalModel(
  { connectionsState, container },
  modelId,
  scope = container
) {
  const target = findRemoveableManualModel(connectionsState, modelId);
  if (!target) return;
  const modalRoot = scope.querySelector('#edit-connection-modal') || scope;
  const deletedModelId = target.manualModelId || modelId;
  applyRemovedModelState(connectionsState, modelId, deletedModelId);
  renderModalModels(connectionsState, modalRoot);
}

export async function loadModalModels(
  { connectionsState, container },
  connection,
  scope = container
) {
  const connectionId = String(connection?.id || '').trim();
  if (!connectionId) {
    clearModalModelsState(connectionsState, scope);
    return;
  }
  const { seedModels, seedSelection, inferredMode } = initializeModalState(
    connectionsState,
    connection,
    connectionId,
    scope
  );
  try {
    const res = await apiFetch('/api/admin/models?limit=0&offset=0&include_disabled=1');
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(parseModelFetchError(err));
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
    connectionsState.modalModelsError = parseModelFetchError(err);
  } finally {
    connectionsState.modalModelsLoading = false;
    renderModalModels(connectionsState, scope);
  }
}

export async function refreshModalModels(
  { connectionsState, container, setTestStatus },
  scope = container
) {
  const testable = buildTestableConnectionPayload(scope, connectionsState.selectedConnection);
  if (!testable) {
    setTestStatus('error', 'URL is required for compatible providers', scope);
    return;
  }
  const { modalRoot, payload } = testable;
  enterRefreshMode(connectionsState, modalRoot, setTestStatus);
  try {
    const res = await apiFetch('/api/admin/openai/connections/test', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    const responsePayload = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(parseConnectionTestError(responsePayload));
    }
    handleRefreshSuccess(connectionsState, modalRoot, setTestStatus, responsePayload);
  } catch (err) {
    handleRefreshError(connectionsState, modalRoot, setTestStatus, err);
  } finally {
    exitRefreshMode(connectionsState, modalRoot);
  }
}
