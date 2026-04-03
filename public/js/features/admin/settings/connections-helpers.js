import { sortModelsByActiveThenName } from '../../../shared/utils/model-state.js';
import {
  normalizeConnectionModelSelectionMode,
  resolveConnectionModelSelectionMode,
} from '../../../shared/utils/connection-model-selection.js';

export function normalizeProviderType(value) {
  return String(value || '').trim().toLowerCase();
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

function normalizeSavedConnectionModelId(providerId, modelId) {
  const safeProvider = String(providerId || '').trim();
  let raw = String(modelId || '').trim();
  if (!raw) return '';
  if (raw.startsWith('models/')) {
    raw = raw.slice('models/'.length);
  }
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
    const safeId = rawId.startsWith('models/') ? rawId.slice('models/'.length) : rawId;
    if (seen.has(safeId)) return;
    seen.add(safeId);
    models.push({
      modelId: safeId,
      name: String(item?.name || safeId).trim() || safeId,
    });
  });
  return models;
}

export function normalizeModelRecord(model = {}) {
  const id = String(model?.id || model?.modelId || model?.name || '').trim();
  if (!id) return null;
  const safeId = id.startsWith('models/') ? id.slice('models/'.length) : id;
  const rawName = String(model?.name || model?.displayName || model?.id || safeId).trim();
  const name = rawName.startsWith('models/') ? rawName.slice('models/'.length) : rawName;
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
    manualModelsMode: normalizeConnectionModelSelectionMode(conn.manualModelsMode || conn.manual_models_mode) || 'all',
  };
}

export function cloneModelSelection(value = []) {
  return new Set(Array.from(value || []));
}

export function getModalDraftKey(connection = null) {
  return String(connection?.id || '').trim() || '__new__';
}

export function persistModalDraft(connectionsState, connection = null) {
  const resolvedConnection = connection || connectionsState.selectedConnection;
  const key = getModalDraftKey(resolvedConnection);
  if (!key) return;
  const drafts = connectionsState.modalDrafts || (connectionsState.modalDrafts = new Map());
  drafts.set(key, {
    models: Array.isArray(connectionsState.modalModels)
      ? connectionsState.modalModels.map((model) => normalizeModalModelRecord(model, resolvedConnection)).filter(Boolean)
      : [],
    selection: cloneModalModelSelection(connectionsState.modalModelsSelection, resolvedConnection),
    original: cloneModalModelSelection(connectionsState.modalModelsOriginal, resolvedConnection),
    query: String(connectionsState.modalModelsQuery || ''),
  });
}

export function applyModalDraft(connectionsState, connection = null) {
  const key = getModalDraftKey(connection);
  const draft = connectionsState.modalDrafts?.get(key);
  if (!draft) return false;
  connectionsState.modalModels = Array.isArray(draft.models)
    ? draft.models.map((model) => normalizeModalModelRecord(model, connection)).filter(Boolean)
    : [];
  connectionsState.modalModelsSelection = cloneModalModelSelection(draft.selection, connection);
  connectionsState.modalModelsOriginal = cloneModalModelSelection(draft.original, connection);
  connectionsState.modalModelsQuery = String(draft.query || '');
  return true;
}

export function getConnectionProviderId(connection = {}) {
  const providerId = String(connection?.providerId || '').trim();
  if (providerId) return providerId;
  const providerType = normalizeProviderType(connection?.providerType || connection?.providerFamily || 'openai');
  const connectionId = String(connection?.id || '').trim();
  if (!connectionId) return providerType;
  const family = normalizeProviderFamily(providerType);
  if (providerType === 'openai-compatible') return `openai/${connectionId}`;
  if (providerType === 'gemini-compatible') return `google/${connectionId}`;
  if (providerType === 'claude-compatible') return `anthropic/${connectionId}`;
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
  return normalizeConnectionManualModels(connection.manualModels).map((model) => {
    const id = formatConnectionModelId(providerId, model.modelId);
    return normalizeModelRecord({
      id,
      name: model.name || model.modelId,
      manual: true,
      manualModelId: model.modelId,
    });
  }).filter(Boolean);
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
  return new Set(Array.from(selected).map((modelId) => normalizeModalModelId(modelId, connection)).filter(Boolean));
}

export function mergeConnectionModalModels(existingModels = [], discoveredModels = [], connection = null) {
  const merged = new Map();
  [...(Array.isArray(existingModels) ? existingModels : []), ...(Array.isArray(discoveredModels) ? discoveredModels : [])]
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

export function previewConnectionModalModels(existingModels = [], existingSelection = new Set(), discoveredModels = [], connection = null) {
  const connectionMode = normalizeConnectionModelSelectionMode(connection?.manual_models_mode || connection?.manualModelsMode);
  const normalizedSelection = existingSelection instanceof Set
    ? new Set(Array.from(existingSelection).map((modelId) => normalizeModalModelId(String(modelId || '').trim(), connection)).filter(Boolean))
    : new Set();
  const previousStates = new Map(
    (Array.isArray(existingModels) ? existingModels : []).map((model) => {
      const modelId = normalizeModalModelId(String(model?.id || '').trim(), connection);
      return [modelId, Boolean(normalizedSelection.has(modelId))];
    }),
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
      : (Array.isArray(existingModels) && existingModels.length === 0 && normalizedSelection.size === 0);
    if (wasEnabled) selection.add(model.id);
  });
  return {
    models,
    selection,
    original: new Set(selection),
  };
}

export function buildSelectedConnectionModels(models = [], selection = new Set(), connection = null) {
  const providerId = getConnectionProviderId(connection || {});
  const selected = selection instanceof Set ? selection : new Set();
  const seen = new Set();
  const next = [];

  (Array.isArray(models) ? models : []).forEach((model) => {
    if (!model || !selected.has(model.id)) return;
    const rawModelId = normalizeSavedConnectionModelId(providerId, model.manualModelId || model.id || '');
    if (!rawModelId || seen.has(rawModelId)) return;
    seen.add(rawModelId);
    next.push({
      modelId: rawModelId,
      name: String(model.name || rawModelId).trim() || rawModelId,
    });
  });

  return normalizeConnectionManualModels(next);
}

export function buildModalConnectionDraft(scope = null, selectedConnection = null) {
  const root = scope || document;
  return {
    id: selectedConnection?.id || '',
    name: root.querySelector('#modal-conn-name')?.value || '',
    url: root.querySelector('#modal-conn-url')?.value || '',
    key: root.querySelector('#modal-conn-key')?.value || '',
    headers: root.querySelector('#modal-conn-headers')?.value || '',
    providerType: root.querySelector('#modal-conn-provider')?.value || 'openai',
    providerFamily: root.querySelector('#modal-conn-provider')?.value || 'openai',
  };
}

export function applyModalModelPreview(connectionsState, models, scope = null, renderModels = null) {
  const root = scope || document;
  const connection = connectionsState.selectedConnection || null;
  const preview = previewConnectionModalModels(
    connectionsState.modalModels,
    connectionsState.modalModelsSelection || new Set(),
    models,
    connection,
  );
  connectionsState.modalModels = preview.models;
  connectionsState.modalModelsOriginal = preview.original;
  connectionsState.modalModelsSelection = preview.selection;
  connectionsState.modalModelsConnectionId = connectionsState.selectedConnection?.id || '__preview__';
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
