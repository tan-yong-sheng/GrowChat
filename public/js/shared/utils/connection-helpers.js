import { sortModelsByActiveThenName } from './model-state.js';
import {
  normalizeConnectionModelSelectionMode,
  resolveConnectionModelSelectionMode,
} from './connection-model-selection.js';

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
export function providerLabel(providerType) {
  switch (normalizeProviderType(providerType)) {
    case 'google':
    case 'gemini-compatible':
      return 'Gemini';
    case 'anthropic':
    case 'claude-compatible':
      return 'Claude';
    case 'openai-compatible':
      return 'OpenAI Compatible';
    case 'openai':
    default:
      return 'OpenAI';
  }
}
export function providerDisplayLabel(providerType) {
  const raw = normalizeProviderType(providerType);
  if (raw === 'openai-compatible') return 'OpenAI Compatible';
  if (raw === 'gemini-compatible') return 'Gemini Compatible';
  if (raw === 'claude-compatible') return 'Claude Compatible';
  return providerLabel(raw);
}
export function providerUrlPlaceholder(providerType) {
  switch (normalizeProviderType(providerType)) {
    case 'google':
    case 'gemini-compatible':
      return 'https://generativelanguage.googleapis.com/v1beta';
    case 'anthropic':
    case 'claude-compatible':
      return 'https://api.anthropic.com/v1';
    default:
      return 'https://api.openai.com/v1';
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
export function resolveUrlLabel(providerType) {
  return `URL${isCompatibleProviderType(providerType) ? ' *' : ''}`;
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
export function resolveKeyLabel() {
  return 'API Key';
}
export function connectionApiTypeDetails(providerType) {
  switch (normalizeProviderType(providerType)) {
    case 'google':
    case 'gemini-compatible':
      return {
        value: 'stream-generate-content',
        label: 'Gemini Stream Generate Content',
        endpoint: 'Uses /v1beta/models/:model:streamGenerateContent?alt=sse',
      };
    case 'anthropic':
    case 'claude-compatible':
      return {
        value: 'messages',
        label: 'Messages',
        endpoint: 'Uses /v1/messages',
      };
    default:
      return {
        value: 'chat-completions',
        label: 'Chat Completions',
        endpoint: 'Uses /v1/chat/completions',
      };
  }
}
export function normalizeConnectionManualModels(value = []) {
  if (!Array.isArray(value)) return [];
  const seen = new Set();
  const models = [];
  value.forEach((item) => {
    const rawId = String(item?.modelId || item?.id || item?.name || item || '').trim();
    if (!rawId) return;
    const safeId = stripModelsPrefix(rawId);
    if (seen.has(safeId)) return;
    seen.add(safeId);
    models.push({
      modelId: safeId,
      name: String(item?.name || safeId).trim() || safeId,
    });
  });
  return models;
}

function stripModelsPrefix(value) {
  return String(value || '')
    .trim()
    .replace(/^models\//, '');
}

function firstDefinedModelName(model, fallback) {
  return String(model?.name || model?.displayName || model?.id || fallback || '').trim();
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
  return {
    ...conn,
    providerType,
    providerFamily: normalizeProviderFamily(providerType),
    apiType: connectionApiTypeDetails(providerType).value,
    providerId: conn.providerId || '',
    manualModels: normalizeConnectionManualModels(conn.manualModels),
    manualModelsMode:
      normalizeConnectionModelSelectionMode(conn.manualModelsMode || conn.manual_models_mode) ||
      'all',
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

export function getConnectionProviderId(connection = {}) {
  const providerId = String(connection?.providerId || '').trim();
  if (providerId) return providerId;
  const providerType = normalizeProviderType(
    connection?.providerType || connection?.providerFamily || 'openai'
  );
  const connectionId = String(connection?.id || '').trim();
  if (!connectionId) return providerType;
  const prefix = COMPATIBLE_PROVIDER_PREFIX[providerType];
  if (prefix) return `${prefix}/${connectionId}`;
  const family = normalizeProviderFamily(providerType);
  return `${family || providerType}/${connectionId}`;
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
