/**
 * Modal model helpers for connections settings.
 */
import { sortModelsByActiveThenName } from '../../../shared/utils/model-state.js';
import {
  normalizeConnectionModelSelectionMode,
  resolveConnectionModelSelectionMode,
} from '../../../shared/utils/connection-model-selection.js';
import {
  cloneModelSelection,
  normalizeConnectionManualModels,
  normalizeSavedConnectionModelId,
  normalizeModalModelRecord,
  normalizeModalModelId,
  getConnectionProviderId,
  connectionApiTypeDetails,
} from './connections-helpers.js';

export function cloneModalModelSelection(value = [], connection = null) {
  const selected = cloneModelSelection(value);
  if (!connection) return selected;
  return new Set(
    Array.from(selected)
      .map((modelId) => normalizeModalModelId(modelId, connection))
      .filter(Boolean)
  );
}

export function mergeConnectionModalModels(
  existingModels = [],
  discoveredModels = [],
  connection = null
) {
  const merged = new Map();
  [
    ...(Array.isArray(existingModels) ? existingModels : []),
    ...(Array.isArray(discoveredModels) ? discoveredModels : []),
  ]
    .map((model) => normalizeModalModelRecord(model, connection))
    .filter(Boolean)
    .forEach((model) => {
      const current = merged.get(model.id);
      if (current) {
        merged.set(model.id, { ...current, ...model });
      } else {
        merged.set(model.id, model);
      }
    });
  return sortModelsByActiveThenName(Array.from(merged.values()));
}

export function previewConnectionModalModels(
  existingModels = [],
  existingSelection = new Set(),
  discoveredModels = [],
  connection = null
) {
  const connectionMode = normalizeConnectionModelSelectionMode(
    connection?.manual_models_mode || connection?.manualModelsMode
  );
  const normalizedSelection =
    existingSelection instanceof Set
      ? new Set(
          Array.from(existingSelection)
            .map((modelId) => normalizeModalModelId(String(modelId || '').trim(), connection))
            .filter(Boolean)
        )
      : new Set();
  const previousStates = new Map(
    (Array.isArray(existingModels) ? existingModels : []).map((model) => {
      const modelId = normalizeModalModelId(String(model?.id || '').trim(), connection);
      return [modelId, Boolean(normalizedSelection.has(modelId))];
    })
  );
  const models = mergeConnectionModalModels(existingModels, discoveredModels, connection);
  const selection = new Set();
  if (connectionMode === 'all') {
    models.forEach((model) => selection.add(model.id));
    return {
      models,
      selection,
      original: new Set(selection),
    };
  }
  if (connectionMode === 'none') {
    return {
      models,
      selection,
      original: new Set(selection),
    };
  }
  models.forEach((model) => {
    const wasEnabled = previousStates.has(model.id)
      ? previousStates.get(model.id)
      : Array.isArray(existingModels) &&
        existingModels.length === 0 &&
        normalizedSelection.size === 0;
    if (wasEnabled) selection.add(model.id);
  });
  return {
    models,
    selection,
    original: new Set(selection),
  };
}

export function buildSelectedConnectionModels(
  models = [],
  selection = new Set(),
  connection = null
) {
  const providerId = getConnectionProviderId(connection || {});
  const selected = selection instanceof Set ? selection : new Set();
  const seen = new Set();
  const next = [];

  (Array.isArray(models) ? models : []).forEach((model) => {
    if (!model || !selected.has(model.id)) return;
    const rawModelId = normalizeSavedConnectionModelId(
      providerId,
      model.manualModelId || model.id || ''
    );
    if (!rawModelId || seen.has(rawModelId)) return;
    seen.add(rawModelId);
    next.push({
      modelId: rawModelId,
      name: String(model.name || rawModelId).trim() || rawModelId,
    });
  });

  return normalizeConnectionManualModels(next);
}

export function applyModalModelPreview(
  connectionsState,
  models,
  scope = null,
  renderModels = null
) {
  const root = scope || document;
  const connection = connectionsState.selectedConnection || null;
  const preview = previewConnectionModalModels(
    connectionsState.modalModels,
    connectionsState.modalModelsSelection || new Set(),
    models,
    connection
  );
  connectionsState.modalModels = preview.models;
  connectionsState.modalModelsOriginal = preview.original;
  connectionsState.modalModelsSelection = preview.selection;
  connectionsState.modalModelsConnectionId =
    connectionsState.selectedConnection?.id || '__preview__';
  if (typeof renderModels === 'function') {
    renderModels(root);
  }
}

export function resolveConnectionModalSelectionMode(models = [], selection = new Set()) {
  return resolveConnectionModelSelectionMode(models, selection);
}

export function updateApiTypeDisplay(scope, providerType) {
  const details = connectionApiTypeDetails(providerType);
  const label = scope.querySelector('#modal-conn-api-type-label');
  const hint = scope.querySelector('#modal-conn-api-type-hint');
  if (label) label.textContent = details.label;
  if (hint) hint.textContent = details.endpoint;
}

export function buildModalConnectionPayload(scope = null, selectedConnection = null) {
  const root = scope || document;
  return {
    id: selectedConnection?.id || '',
    name: root.querySelector('#modal-conn-name')?.value || '',
    url: root.querySelector('#modal-conn-url')?.value || '',
    key: root.querySelector('#modal-conn-key')?.value || '',
    headers: root.querySelector('#modal-conn-headers')?.value || '',
    providerType: root.querySelector('#modal-conn-provider')?.value || 'openai',
    providerFamily: root.querySelector('#modal-conn-provider')?.value || 'openai',
    authType: selectedConnection?.authType || selectedConnection?.auth_type || '',
  };
}
