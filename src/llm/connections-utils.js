import { normalizeProviderFamily } from './provider-registry.js';

export function normalizeUrl(url) {
  if (!url) return '';
  return String(url).trim().replace(/\/$/, '');
}

export function normalizeBaseUrl(url) {
  return normalizeUrl(url);
}

function resolveProviderFamilyKey(providerType) {
  const family = normalizeProviderFamily(providerType);
  if (family) return family;
  return String(providerType || '')
    .trim()
    .toLowerCase();
}

export function getConnectionApiType(providerType) {
  switch (resolveProviderFamilyKey(providerType)) {
    case 'google':
      return 'stream-generate-content';
    case 'anthropic':
      return 'messages';
    default:
      return 'chat-completions';
  }
}

export function getConnectionApiTypeLabel(providerType) {
  switch (resolveProviderFamilyKey(providerType)) {
    case 'google':
      return 'Gemini Stream Generate Content';
    case 'anthropic':
      return 'Messages';
    default:
      return 'Chat Completions';
  }
}

export function getConnectionDefaultBaseUrl(providerType) {
  switch (resolveProviderFamilyKey(providerType)) {
    case 'google':
      return 'https://generativelanguage.googleapis.com/v1beta';
    case 'anthropic':
      return 'https://api.anthropic.com/v1';
    default:
      return 'https://api.openai.com/v1';
  }
}

export function isConnectionUrlRequired(providerType) {
  const raw = String(providerType || '')
    .trim()
    .toLowerCase();
  return raw === 'openai-compatible' || raw === 'gemini-compatible' || raw === 'claude-compatible';
}

export function labelFromFamily(family) {
  switch (normalizeProviderFamily(family)) {
    case 'google':
      return 'Gemini';
    case 'anthropic':
      return 'Claude';
    default:
      return 'OpenAI';
  }
}

export function normalizeAuthType(value) {
  const raw = String(value || '')
    .trim()
    .toLowerCase();
  if (['bearer', 'x-api-key', 'x-goog-api-key', 'api-key'].includes(raw)) {
    return raw;
  }
  return '';
}

export function hashString(value) {
  let hash = 5381;
  const str = String(value || '');
  for (let i = 0; i < str.length; i += 1) {
    hash = (hash << 5) + hash + str.charCodeAt(i);
  }
  return (hash >>> 0).toString(36);
}

export function stableConnectionId(conn, index = 0) {
  // Serialize headers deterministically to avoid collisions from object coercion
  let headersStr = conn?.headers || '';
  if (typeof headersStr === 'object' && !Array.isArray(headersStr)) {
    try {
      headersStr = JSON.stringify(headersStr, Object.keys(headersStr).sort());
    } catch {
      headersStr = String(headersStr);
    }
  }
  const seed = [
    conn?.providerFamily || conn?.providerType || '',
    conn?.url || conn?.baseUrl || '',
    conn?.key || '',
    headersStr,
    index,
  ].join('|');
  return `conn-${hashString(seed)}`;
}

export function ensureConnectionId(conn, index = 0) {
  return conn?.id || stableConnectionId(conn, index);
}

export function safeParseHeaders(raw) {
  if (!raw) return {};
  if (typeof raw === 'object' && !Array.isArray(raw)) return raw;
  try {
    const parsed = JSON.parse(String(raw));
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    return parsed;
  } catch {
    return {};
  }
}

export function normalizeConnectionManualModels(value = []) {
  if (!Array.isArray(value)) return [];
  const deduped = [];
  const seen = new Set();
  for (const item of value) {
    const rawId = String(item?.modelId || item?.id || item?.name || item || '').trim();
    if (!rawId) continue;
    const safeId = rawId.startsWith('models/') ? rawId.slice('models/'.length) : rawId;
    if (seen.has(safeId)) continue;
    seen.add(safeId);
    deduped.push({
      modelId: safeId,
      name: String(item?.name || safeId).trim() || safeId,
    });
  }
  return deduped;
}

export function extractConnectionModelId(item) {
  const raw = String(
    item?.id || item?.modelId || item?.model_id || item?.name || item?.model || ''
  ).trim();
  if (!raw) return '';
  return raw.startsWith('models/') ? raw.slice('models/'.length) : raw;
}

function resolveProviderType(conn) {
  return String(conn?.providerType || conn?.providerFamily || '')
    .trim()
    .toLowerCase();
}

function resolveApiType(conn, providerType) {
  return String(conn?.apiType || getConnectionApiType(providerType) || '')
    .trim()
    .toLowerCase();
}

function resolveBaseUrl(conn) {
  return normalizeBaseUrl(conn?.baseUrl || conn?.url || '');
}

function buildConnectionSignature(providerType, apiType, baseUrl) {
  return `${providerType}::${apiType}::${baseUrl}`;
}

function resolveSourcePriority(source) {
  if (source === 'user') return 2;
  if (source === 'config') return 1;
  return 0;
}

function shouldReplaceExisting(existing, incoming) {
  return resolveSourcePriority(incoming?.source) > resolveSourcePriority(existing?.source);
}

export function dedupeConnectionConfigs(connections = []) {
  const deduped = [];
  const indexBySignature = new Map();
  for (const conn of Array.isArray(connections) ? connections : []) {
    const providerType = resolveProviderType(conn);
    const apiType = resolveApiType(conn, providerType);
    const baseUrl = resolveBaseUrl(conn);
    const signature = buildConnectionSignature(providerType, apiType, baseUrl);
    const existingIndex = indexBySignature.get(signature);
    if (existingIndex === undefined) {
      indexBySignature.set(signature, deduped.length);
      deduped.push(conn);
      continue;
    }
    if (shouldReplaceExisting(deduped[existingIndex], conn)) {
      deduped[existingIndex] = conn;
    }
  }
  return deduped;
}
