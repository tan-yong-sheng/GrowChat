/**
 * Connection modal form helpers — module-level helpers extracted from the
 * closure inside createConnectionsModalForm so the parent stays under the
 * function-length/statement limits.
 */

import {
  normalizeConnectionManualModels,
  formatConnectionModelId,
  getConnectionProviderId,
  inflateManualConnectionModels,
} from './connections-helpers.js';

function upsertModalModel(nextModels, manualRecord, fullId, safe) {
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
  return nextModels;
}

function clearDeletedModelTombstones(state, safe, fullId) {
  if (!Array.isArray(state.deletedManualModelIds)) return [];
  return state.deletedManualModelIds.filter((id) => id !== safe && id !== fullId);
}

export function buildAddedModalModels(connectionsState, fullId, safe) {
  const nextModels = Array.isArray(connectionsState.modalModels)
    ? [...connectionsState.modalModels]
    : [];
  const manualRecord = {
    id: fullId,
    name: safe,
    manual: true,
    manualModelId: safe,
  };
  upsertModalModel(nextModels, manualRecord, fullId, safe);
  return nextModels;
}

export function commitAddedModalModelState(connectionsState, fullId, safe, nextModels) {
  // Note: we intentionally do NOT mutate connection.manualModels here. The
  // modal-local modalModels + modalModelsSelection drives the save payload
  // (buildSelectedConnectionModels), so writing to the live connection is
  // unnecessary. Mutating it would also break the cancel/refresh-resurrects
  // invariant: if the user cancels, the in-memory connection would still
  // carry the new model even though nothing was persisted.
  connectionsState.modalModelsError = null;
  connectionsState.modalModelsLoading = false;
  connectionsState.modalModels = nextModels;
  connectionsState.modalModelsSelection = new Set(connectionsState.modalModelsSelection || []);
  connectionsState.modalModelsSelection.add(fullId);
  connectionsState.modalModelsOriginal = new Set(connectionsState.modalModelsOriginal || []);
  connectionsState.modalModelsOriginal.add(fullId);
  // Clear any tombstone from a previous remove of the same model so the
  // re-add isn't silently filtered out by buildSelectedConnectionModels().
  connectionsState.deletedManualModelIds = clearDeletedModelTombstones(
    connectionsState,
    safe,
    fullId
  );
}

export function getModalConnection(connectionsState) {
  const connection = connectionsState.selectedConnection;
  if (!connection?.id || connection?.readOnly) return null;
  return connection;
}

export function getModelInputValue(scope) {
  const input = scope.querySelector('#modal-manual-model-id');
  if (!input) return null;
  const raw = String(input.value || '').trim();
  const safe = raw.replace(/^models\//i, '');
  if (!safe) return null;
  return { input, safe };
}

export function resolveModelFullId(connection, safe) {
  const providerId = getConnectionProviderId(connection);
  const fullId = formatConnectionModelId(providerId, safe);
  if (!fullId) return null;
  return fullId;
}

export function addModelToManualModels(connection, safe) {
  const nextManualModels = normalizeConnectionManualModels(connection.manualModels);
  if (!nextManualModels.some((model) => model.modelId === safe)) {
    nextManualModels.push({ modelId: safe, name: safe });
  }
  return nextManualModels;
}

export function parseConnectionTestError(responsePayload) {
  return (
    responsePayload.details?.message ||
    responsePayload.message ||
    responsePayload.error ||
    'Connection failed'
  );
}

export function getRefreshModelStatusMessage(responsePayload) {
  const count = Array.isArray(responsePayload.models) ? responsePayload.models.length : 0;
  return count > 0 ? `Connection successful. ${count} models loaded.` : 'Connection successful.';
}

export function resetModalModelsState(connectionsState) {
  connectionsState.modalModels = [];
  connectionsState.modalModelsSelection = new Set();
  connectionsState.modalModelsOriginal = new Set();
}

export function mergeRefreshedManualModels(connectionsState) {
  const existingManualModels = connectionsState.selectedConnection
    ? inflateManualConnectionModels(connectionsState.selectedConnection).filter(
        (model) =>
          !Array.isArray(connectionsState.deletedManualModelIds) ||
          !connectionsState.deletedManualModelIds.includes(model.manualModelId)
      )
    : [];
  if (existingManualModels.length > 0) {
    const merged = new Map((connectionsState.modalModels || []).map((model) => [model.id, model]));
    existingManualModels.forEach((model) => {
      if (!merged.has(model.id)) {
        merged.set(model.id, model);
        connectionsState.modalModelsSelection.add(model.id);
        connectionsState.modalModelsOriginal.add(model.id);
      }
    });
    connectionsState.modalModels = Array.from(merged.values());
  }
}
