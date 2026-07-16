import { sortModelsByActiveThenName } from './model-state.js';
import {
  normalizeConnectionModelSelectionMode,
  resolveConnectionModelSelectionMode,
} from './connection-model-selection.js';
// Import and re-export shared provider-display utilities from the canonical source.
// This eliminates duplicate function definitions with connection-modal-utils.js.
import {
  providerLabel,
  providerDisplayLabel,
  providerUrlPlaceholder,
  resolveUrlLabel,
  resolveKeyLabel,
  connectionApiTypeDetails,
} from '../components/connection-modal-utils.js';
export {
  providerLabel,
  providerDisplayLabel,
  providerUrlPlaceholder,
  resolveUrlLabel,
  resolveKeyLabel,
  connectionApiTypeDetails,
};

export function normalizeProviderType(value) {
  return String(value || '')
    .trim()
    .toLowerCase();
}
export function normalizeProviderFamily(value) {
  switch (normalizeProviderType(value)) {
    case 'openai':
    case 'openai-compatible':
      return 'openai';
    case 'google':
    case 'gemini':
    case 'gemini-compatible':
      return 'google';
    case 'anthropic':
    case 'claude':
    case 'claude-compatible':
      return 'anthropic';
    default:
      return 'openai';
  }
}
export function isCompatibleProviderType(providerType) {
  const raw = normalizeProviderType(providerType);
  return raw === 'openai-compatible' || raw === 'gemini-compatible' || raw === 'claude-compatible';
}
export function resolveModalUrl(providerType, rawUrl) {
  const value = String(rawUrl || '').trim();
  if (value) return value;
  if (isCompatibleProviderType(providerType)) return '';
  return providerUrlPlaceholder(providerType);
}

export function normalizeSavedConnectionModelId(providerId, modelId) {
  const safeProvider = String(providerId || '').trim();
  const raw = stripModelsPrefix(String(modelId || '').trim());
  if (!raw) return '';
  if (!safeProvider) {
    return raw;
  }
  let next = raw;
  while (next.startsWith(`${safeProvider}:`)) {
    next = next.slice(safeProvider.length + 1);
  }
  return next;
}
export function normalizeConnectionManualModels(value = []) {
  if (!Array.isArray(value)) return [];
  return collectManualModels(value);
}

function stripModelsPrefix(value) {
  return String(value || '')
    .trim()
    .replace(/^models\//, '');
}

function firstDefinedModelName(model, fallback) {
  return String(model?.name || model?.displayName || model?.id || fallback || '').trim();
}

function extractManualModelId(item) {
  return String(item?.modelId || item?.id || item?.name || item || '').trim();
}

function buildManualModelName(item, safeId) {
  return String(item?.name || safeId).trim() || safeId;
}

function collectManualModels(value) {
  const seen = new Set();
  const models = [];
  for (const item of value) {
    const rawId = extractManualModelId(item);
    if (!rawId) continue;
    const safeId = stripModelsPrefix(rawId);
    if (seen.has(safeId)) continue;
    seen.add(safeId);
    models.push({ modelId: safeId, name: buildManualModelName(item, safeId) });
  }
  return models;
}
export function normalizeModelRecord(model = {}) {
  const id = String(model?.id || model?.modelId || model?.name || '').trim();
  if (!id) return null;
  const safeId = stripModelsPrefix(id);
  const name = stripModelsPrefix(firstDefinedModelName(model, safeId));
  return {
    ...model,
    id: safeId,
    name,
  };
}
export function normalizeConnectionRecord(conn = {}) {
  const providerType = normalizeProviderType(conn.providerType || conn.providerFamily || 'openai');
  // Preserve the absence of manualModelsMode so consumers can infer the
  // intended mode from the seed state (e.g. 'some' when seeded manual
  // models exist). Defaulting to 'all' here used to clobber the inferred
  // mode in loadModalModels() and could overwrite the partial-selection
  // state on save for connections that had no persisted mode.
  const rawMode = conn.manualModelsMode ?? conn.manual_models_mode;
  return {
    ...conn,
    providerType,
    providerFamily: normalizeProviderFamily(providerType),
    apiType: connectionApiTypeDetails(providerType).value,
    providerId: conn.providerId || '',
    manualModels: normalizeConnectionManualModels(conn.manualModels),
    manualModelsMode:
      rawMode === undefined || rawMode === null
        ? undefined
        : normalizeConnectionModelSelectionMode(rawMode),
  };
}
export function cloneModelSelection(value = []) {
  return new Set(Array.from(value || []));
}

const COMPATIBLE_PROVIDER_PREFIX = {
  'openai-compatible': 'openai',
  'gemini-compatible': 'google',
  'claude-compatible': 'anthropic',
};

function resolveProviderTypeForConnectionId(connection) {
  const providerType = normalizeProviderType(
    connection?.providerType || connection?.providerFamily || 'openai'
  );
  const connectionId = String(connection?.id || '').trim();
  return { providerType, connectionId };
}

function buildConnectionProviderIdFromPrefix(providerType, connectionId) {
  const prefix = COMPATIBLE_PROVIDER_PREFIX[providerType];
  if (prefix) return `${prefix}/${connectionId}`;
  const family = normalizeProviderFamily(providerType);
  return `${family || providerType}/${connectionId}`;
}

export function getConnectionProviderId(connection = {}) {
  const providerId = String(connection?.providerId || '').trim();
  if (providerId) return providerId;
  const { providerType, connectionId } = resolveProviderTypeForConnectionId(connection);
  if (!connectionId) return providerType;
  return buildConnectionProviderIdFromPrefix(providerType, connectionId);
}
export function formatConnectionModelId(providerId, modelId) {
  const safeProvider = String(providerId || '').trim();
  const safeModel = String(modelId || '').trim();
  if (!safeProvider || !safeModel) return '';
  return `${safeProvider}:${safeModel}`;
}
export function inflateManualConnectionModels(connection = {}) {
  const providerId = getConnectionProviderId(connection);
  return normalizeConnectionManualModels(connection.manualModels)
    .map((model) => {
      const id = formatConnectionModelId(providerId, model.modelId);
      return normalizeModelRecord({
        id,
        name: model.name || model.modelId,
        manual: true,
        manualModelId: model.modelId,
      });
    })
    .filter(Boolean);
}
export function normalizeModalModelRecord(model = {}, connection = null) {
  const normalized = normalizeModelRecord(model);
  if (!normalized) return null;
  if (normalized.connection_id || normalized.provider_id) return normalized;

  const canonicalId = normalizeModalModelId(normalized.id, connection);
  if (!canonicalId) return normalized;
  if (normalized.id === canonicalId) return normalized;
  return {
    ...normalized,
    id: canonicalId,
  };
}
export function normalizeModalModelId(modelId = '', connection = null) {
  const raw = String(modelId || '').trim();
  if (!raw) return '';
  const providerId = getConnectionProviderId(connection || {});
  if (!providerId) return raw;
  const canonicalId = formatConnectionModelId(providerId, raw);
  return raw.startsWith(`${providerId}:`) ? raw : canonicalId;
}
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
function normalizeSelectionIds(existingSelection, connection) {
  if (!(existingSelection instanceof Set)) return new Set();
  return new Set(
    Array.from(existingSelection)
      .map((modelId) => normalizeModalModelId(String(modelId || '').trim(), connection))
      .filter(Boolean)
  );
}

function buildPreviousStatesMap(existingModels, normalizedSelection, connection) {
  return new Map(
    (Array.isArray(existingModels) ? existingModels : []).map((model) => {
      const modelId = normalizeModalModelId(String(model?.id || '').trim(), connection);
      return [modelId, Boolean(normalizedSelection.has(modelId))];
    })
  );
}

function determineWasEnabled(model, previousStates, existingModels, normalizedSelection) {
  if (previousStates.has(model.id)) return previousStates.get(model.id);
  return (
    Array.isArray(existingModels) && existingModels.length === 0 && normalizedSelection.size === 0
  );
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
  const normalizedSelection = normalizeSelectionIds(existingSelection, connection);
  const previousStates = buildPreviousStatesMap(existingModels, normalizedSelection, connection);
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
    const wasEnabled = determineWasEnabled(
      model,
      previousStates,
      existingModels,
      normalizedSelection
    );
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
function readModalFieldValue(root, selector) {
  return root?.querySelector(selector)?.value || '';
}

function readModalProviderType(root) {
  return readModalFieldValue(root, '#modal-conn-provider') || 'openai';
}

export function buildModalConnectionPayload(scope = null, selectedConnection = null) {
  const root = scope || document;
  return {
    id: selectedConnection?.id || '',
    name: readModalFieldValue(root, '#modal-conn-name'),
    url: readModalFieldValue(root, '#modal-conn-url'),
    key: readModalFieldValue(root, '#modal-conn-key'),
    headers: readModalFieldValue(root, '#modal-conn-headers'),
    providerType: readModalProviderType(root),
    providerFamily: readModalProviderType(root),
    authType: selectedConnection?.authType || selectedConnection?.auth_type || '',
  };
}

export function buildTestableConnectionPayload(scope = null, selectedConnection = null) {
  const modalRoot = scope?.querySelector('#edit-connection-modal') || scope;
  const payload = buildModalConnectionPayload(modalRoot, selectedConnection);
  const resolvedUrl = resolveModalUrl(payload.providerType, payload.url);
  if (!resolvedUrl) return null;
  payload.url = resolvedUrl;
  return { modalRoot, payload };
}
