import { normalizeProviderFamily } from './provider-registry.js';

export function normalizeUrl(url) {
  if (!url) return '';
  return String(url).trim().replace(/\/$/, '');
}

export function normalizeBaseUrl(url) {
  return normalizeUrl(url);
}

export function getConnectionApiType(providerType) {
  switch (
    normalizeProviderFamily(providerType) ||
    String(providerType || '')
      .trim()
      .toLowerCase()
  ) {
    case 'google':
      return 'stream-generate-content';
    case 'anthropic':
      return 'messages';
    default:
      return 'chat-completions';
  }
}

export function getConnectionApiTypeLabel(providerType) {
  switch (
    normalizeProviderFamily(providerType) ||
    String(providerType || '')
      .trim()
      .toLowerCase()
  ) {
    case 'google':
      return 'Gemini Stream Generate Content';
    case 'anthropic':
      return 'Messages';
    default:
      return 'Chat Completions';
  }
}

export function getConnectionDefaultBaseUrl(providerType) {
  switch (
    normalizeProviderFamily(providerType) ||
    String(providerType || '')
      .trim()
      .toLowerCase()
  ) {
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
  const seed = [
    conn?.providerFamily || conn?.providerType || '',
    conn?.url || conn?.baseUrl || '',
    conn?.key || '',
    conn?.headers || '',
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

export function dedupeConnectionConfigs(connections = []) {
  const deduped = [];
  const indexBySignature = new Map();
  for (const conn of Array.isArray(connections) ? connections : []) {
    const providerType = String(conn?.providerType || conn?.providerFamily || '')
      .trim()
      .toLowerCase();
    const apiType = String(conn?.apiType || getConnectionApiType(providerType) || '')
      .trim()
      .toLowerCase();
    const baseUrl = normalizeBaseUrl(conn?.baseUrl || conn?.url || '');
    const signature = `${providerType}::${apiType}::${baseUrl}`;
    const existingIndex = indexBySignature.get(signature);
    if (existingIndex === undefined) {
      indexBySignature.set(signature, deduped.length);
      deduped.push(conn);
      continue;
    }
    const existing = deduped[existingIndex];
    const existingIsConfig = existing?.source === 'config';
    const incomingIsConfig = conn?.source === 'config';
    const existingIsUser = existing?.source === 'user';
    const incomingIsUser = conn?.source === 'user';
    const existingPriority = existingIsUser ? 2 : existingIsConfig ? 1 : 0;
    const incomingPriority = incomingIsUser ? 2 : incomingIsConfig ? 1 : 0;
    if (incomingPriority > existingPriority) {
      deduped[existingIndex] = conn;
    }
  }
  return deduped;
}
