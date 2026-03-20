import { createDB } from '../db.js';
import { getConfigValue } from '../utils/app-config.js';
import { getConnectionProviderFamily, normalizeProviderFamily } from './provider-registry.js';
import { buildProviderId } from './provider-registry.js';

function splitEnvList(value) {
  if (!value) return [];
  return String(value)
    .split(/[;,]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function normalizeUrl(url) {
  if (!url) return '';
  return String(url).trim().replace(/\/$/, '');
}

function normalizeBaseUrl(url) {
  return normalizeUrl(url);
}

export function getConnectionApiType(providerType) {
  switch (normalizeProviderFamily(providerType) || String(providerType || '').trim().toLowerCase()) {
    case 'google':
      return 'stream-generate-content';
    case 'anthropic':
      return 'messages';
    default:
      return 'chat-completions';
  }
}

export function getConnectionApiTypeLabel(providerType) {
  switch (normalizeProviderFamily(providerType) || String(providerType || '').trim().toLowerCase()) {
    case 'google':
      return 'Gemini Stream Generate Content';
    case 'anthropic':
      return 'Messages';
    default:
      return 'Chat Completions';
  }
}

export function getConnectionDefaultBaseUrl(providerType) {
  switch (normalizeProviderFamily(providerType) || String(providerType || '').trim().toLowerCase()) {
    case 'google':
      return 'https://generativelanguage.googleapis.com/v1beta';
    case 'anthropic':
      return 'https://api.anthropic.com/v1';
    default:
      return 'https://api.openai.com/v1';
  }
}

export function isConnectionUrlRequired(providerType) {
  const raw = String(providerType || '').trim().toLowerCase();
  return raw === 'openai-compatible' || raw === 'gemini-compatible' || raw === 'claude-compatible' || raw === 'oc';
}

function labelFromUrl(url) {
  try {
    const parsed = new URL(url);
    return parsed.hostname;
  } catch {
    return url || 'OpenAI';
  }
}

function labelFromFamily(family) {
  switch (normalizeProviderFamily(family)) {
    case 'google':
      return 'Gemini';
    case 'anthropic':
      return 'Claude';
    default:
      return 'OpenAI';
  }
}

export function dedupeConnectionConfigs(connections = []) {
  const deduped = [];
  const indexBySignature = new Map();
  for (const conn of Array.isArray(connections) ? connections : []) {
    const providerType = String(conn?.providerType || conn?.providerFamily || '').trim().toLowerCase();
    const apiType = String(conn?.apiType || getConnectionApiType(providerType) || '').trim().toLowerCase();
    const baseUrl = normalizeBaseUrl(conn?.baseUrl || conn?.url || '');
    const signature = `${providerType}::${apiType}::${baseUrl}`;
    const existingIndex = indexBySignature.get(signature);
    if (existingIndex === undefined) {
      indexBySignature.set(signature, deduped.length);
      deduped.push(conn);
      continue;
    }

    const existing = deduped[existingIndex];
    const existingIsEnv = existing?.source === 'env';
    const incomingIsEnv = conn?.source === 'env';
    if (existingIsEnv && !incomingIsEnv) {
      deduped[existingIndex] = conn;
    }
  }
  return deduped;
}

function normalizeAuthType(value) {
  const raw = String(value || '').trim().toLowerCase();
  if (['bearer', 'x-api-key', 'x-goog-api-key', 'api-key'].includes(raw)) {
    return raw;
  }
  return '';
}

function hashString(value) {
  let hash = 5381;
  const str = String(value || '');
  for (let i = 0; i < str.length; i += 1) {
    hash = ((hash << 5) + hash) + str.charCodeAt(i);
  }
  return (hash >>> 0).toString(36);
}

function stableConnectionId(conn, index = 0) {
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

function safeParseHeaders(raw) {
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

async function getEnvOverrideMap(env) {
  if (!env?.DB) return new Map();
  try {
    const db = createDB(env.DB);
    const raw = await getConfigValue(db, 'openai_env_overrides', '{}');
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return new Map();
    const map = new Map();
    for (const [key, value] of Object.entries(parsed)) {
      map.set(String(key), value !== false);
    }
    return map;
  } catch (err) {
    console.warn('Failed to load connection env overrides:', err?.message || err);
    return new Map();
  }
}

function getConnectionAuthHeaderName(connection) {
  const family = getConnectionProviderFamily(connection);
  const authType = normalizeAuthType(connection?.authType);
  if (authType === 'bearer') return 'Authorization';
  if (authType === 'x-api-key' || authType === 'api-key') return 'x-api-key';
  if (authType === 'x-goog-api-key') return 'x-goog-api-key';
  switch (family) {
    case 'google':
      return 'x-goog-api-key';
    case 'anthropic':
      return 'x-api-key';
    default:
      return 'Authorization';
  }
}

export function buildConnectionHeaders(connection = {}) {
  const headers = { ...(connection.headers || {}) };
  const key = String(connection.key || '').trim();
  if (!key) return headers;

  const headerName = getConnectionAuthHeaderName(connection);
  if (headerName === 'Authorization') {
    if (!headers.Authorization) {
      headers.Authorization = `Bearer ${key}`;
    }
    return headers;
  }

  if (!headers[headerName]) {
    headers[headerName] = key;
  }
  return headers;
}

function normalizeConnectionModelItems(payload) {
  if (!payload || typeof payload !== 'object') return [];
  if (Array.isArray(payload.data)) return payload.data;
  if (Array.isArray(payload.models)) return payload.models;
  if (Array.isArray(payload.items)) return payload.items;
  return [];
}

export function extractConnectionModelId(item) {
  const raw = String(
    item?.id ||
      item?.modelId ||
      item?.model_id ||
      item?.name ||
      item?.model ||
      '',
  ).trim();
  if (!raw) return '';
  return raw.startsWith('models/') ? raw.slice('models/'.length) : raw;
}

function appendDiscoveryCandidate(urls, candidate) {
  const normalized = normalizeBaseUrl(candidate);
  if (!normalized || urls.includes(normalized)) return;
  urls.push(normalized);
}

export function getConnectionModelDiscoveryUrls(connection = {}) {
  const baseUrl = normalizeBaseUrl(connection.baseUrl || connection.url || '');
  if (!baseUrl) return [];

  const family = getConnectionProviderFamily(connection);
  const urls = [];
  const add = (path) => appendDiscoveryCandidate(urls, `${baseUrl}${path}`);

  switch (family) {
    case 'google':
      if (baseUrl.endsWith('/v1beta')) {
        add('/models');
      } else if (baseUrl.endsWith('/v1')) {
        add('/models');
      } else {
        add('/v1beta/models');
        add('/models');
        add('/v1/models');
      }
      break;
    case 'anthropic':
      if (baseUrl.endsWith('/v1')) {
        add('/models');
      } else {
        add('/v1/models');
        add('/models');
      }
      break;
    default:
      add('/models');
      if (!baseUrl.endsWith('/v1') && !baseUrl.endsWith('/v1beta')) {
        add('/v1/models');
      }
      break;
  }

  return urls;
}

export async function discoverConnectionModels(connection = {}, options = {}) {
  const fetchImpl = options.fetch || fetch;
  const headers = options.headers || buildConnectionHeaders(connection);
  const urls = options.urls || getConnectionModelDiscoveryUrls(connection);
  let lastError = null;

  for (const url of urls) {
    try {
      const res = await fetchImpl(url, { headers });
      if (!res.ok) {
        const body = await res.text().catch(() => '');
        lastError = {
          url,
          status: res.status,
          message: body.slice(0, 200),
        };
        continue;
      }

      const payload = await res.json().catch(() => ({}));
      const items = normalizeConnectionModelItems(payload);
      if (items.length === 0) {
        lastError = {
          url,
          status: res.status,
          message: 'No models returned',
        };
        continue;
      }

      return {
        url,
        items,
        payload,
      };
    } catch (err) {
      lastError = {
        url,
        message: err?.message || String(err),
      };
    }
  }

  return {
    url: null,
    items: [],
    payload: null,
    error: lastError,
  };
}

function buildEnvConnectionFromRaw({
  id,
  family,
  baseUrl,
  key,
  authType,
}) {
  const normalizedBaseUrl = normalizeBaseUrl(baseUrl);
  if (!normalizedBaseUrl) return null;
  const providerType = family === 'openai' ? 'openai-compatible' : family;
  return {
    id,
    name: `${labelFromFamily(family)} (${labelFromUrl(normalizedBaseUrl)})`,
    baseUrl: normalizedBaseUrl,
    key,
    headers: {},
    source: 'env',
    enabled: true,
    providerType,
    providerFamily: family,
    authType: authType || '',
    apiType: getConnectionApiType(providerType),
  };
}

function getEnvFamilyConfigs(env) {
  return [
    {
      family: 'openai',
      baseUrlsRaw: env.OPENAI_API_BASE_URLS || env.OPENAI_BASE_URL || '',
      keysRaw: env.OPENAI_API_KEYS || env.OPENAI_API_KEY || '',
      defaultBaseUrl: 'https://api.openai.com/v1',
      authType: 'bearer',
    },
    {
      family: 'google',
      baseUrlsRaw: env.GEMINI_API_BASE_URLS || env.GEMINI_BASE_URL || env.GOOGLE_GENERATIVE_AI_BASE_URL || env.GOOGLE_BASE_URL || '',
      keysRaw: env.GEMINI_API_KEYS || env.GEMINI_API_KEY || env.GOOGLE_GENERATIVE_AI_API_KEYS || env.GOOGLE_GENERATIVE_AI_API_KEY || env.GOOGLE_API_KEYS || env.GOOGLE_API_KEY || '',
      defaultBaseUrl: 'https://generativelanguage.googleapis.com/v1beta',
      authType: 'x-goog-api-key',
    },
    {
      family: 'anthropic',
      baseUrlsRaw: env.ANTHROPIC_API_BASE_URLS || env.ANTHROPIC_BASE_URL || '',
      keysRaw: env.ANTHROPIC_API_KEYS || env.ANTHROPIC_API_KEY || env.ANTHROPIC_AUTH_TOKENS || env.ANTHROPIC_AUTH_TOKEN || '',
      defaultBaseUrl: 'https://api.anthropic.com/v1',
      authType: 'x-api-key',
    },
  ];
}

export function getEnvOpenAIConnectionConfigs(env, options = {}) {
  const includeDisabled = options.includeDisabled === true;
  const connections = [];

  for (const familyConfig of getEnvFamilyConfigs(env)) {
    const baseUrls = splitEnvList(familyConfig.baseUrlsRaw);
    const keys = splitEnvList(familyConfig.keysRaw);

    if (baseUrls.length === 0 && keys.length === 0) {
      continue;
    }

    const resolvedBaseUrls = baseUrls.length > 0 ? [...baseUrls] : [familyConfig.defaultBaseUrl];
    const resolvedKeys = [...keys];

    if (resolvedBaseUrls.length === 1 && resolvedKeys.length > 1) {
      while (resolvedBaseUrls.length < resolvedKeys.length) {
        resolvedBaseUrls.push(resolvedBaseUrls[0]);
      }
    }

    if (resolvedKeys.length === 1 && resolvedBaseUrls.length > 1) {
      while (resolvedKeys.length < resolvedBaseUrls.length) {
        resolvedKeys.push(resolvedKeys[0]);
      }
    }

    const max = Math.max(resolvedBaseUrls.length, resolvedKeys.length, 1);
    for (let i = 0; i < max; i += 1) {
      const baseUrl = resolvedBaseUrls[i] || resolvedBaseUrls[0] || familyConfig.defaultBaseUrl;
      const key = resolvedKeys[i] || resolvedKeys[0] || '';
      const connection = buildEnvConnectionFromRaw({
        id: `env-${familyConfig.family}-${i}`,
        family: familyConfig.family,
        baseUrl,
        key,
        authType: familyConfig.authType,
      });
      if (connection) {
        connections.push(connection);
      }
    }
  }

  if (includeDisabled) return connections;
  return connections.filter((conn) => conn.enabled !== false);
}

export async function getStoredOpenAIConnectionConfigs(env, options = {}) {
  const includeDisabled = options.includeDisabled === true;
  if (!env?.DB) return [];
  try {
    const db = createDB(env.DB);
    const raw = await getConfigValue(db, 'openai_connections', '[]');
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const normalized = parsed
      .map((conn, index) => {
        const url = normalizeBaseUrl(conn.url || '');
        if (!url) return null;
        const headers = safeParseHeaders(conn.headers);
        const enabled = conn?.enabled !== false;
        const providerFamily = normalizeProviderFamily(conn.providerType || conn.providerFamily) || 'openai';
      return {
        id: ensureConnectionId({ ...conn, url, baseUrl: url, headers: conn.headers, providerFamily }, index),
        name: String(conn.name || `${labelFromFamily(providerFamily)} Compatible`).slice(0, 120),
        baseUrl: url,
        key: String(conn.key || '').trim(),
        headers,
        source: 'config',
        enabled,
        providerType: String(conn.providerType || providerFamily).toLowerCase(),
        providerFamily,
        providerId: buildProviderId({ id: ensureConnectionId({ ...conn, url, baseUrl: url, headers: conn.headers, providerFamily }, index), providerType: String(conn.providerType || providerFamily).toLowerCase(), providerFamily }),
        authType: normalizeAuthType(conn.authType),
        apiType: getConnectionApiType(conn.providerType || providerFamily),
        manualModels: normalizeConnectionManualModels(conn.manualModels),
      };
      })
      .filter(Boolean);
    if (includeDisabled) return normalized;
    return normalized.filter((conn) => conn.enabled !== false);
  } catch (err) {
    console.warn('Failed to load stored connections:', err?.message || err);
    return [];
  }
}

export async function getAllOpenAIConnectionConfigs(env, options = {}) {
  const includeDisabled = options.includeDisabled === true;
  const envConnections = getEnvOpenAIConnectionConfigs(env, { includeDisabled: true });
  const overrides = await getEnvOverrideMap(env);
  envConnections.forEach((conn) => {
    const override = overrides.get(conn.id);
    if (override === false) conn.enabled = false;
  });
  const storedConnections = await getStoredOpenAIConnectionConfigs(env, { includeDisabled });
  const combined = [...envConnections, ...storedConnections];
  if (includeDisabled) return combined;
  return combined.filter((conn) => conn.enabled !== false);
}

export async function getPrimaryOpenAIConnection(env) {
  const envConnections = await getAllOpenAIConnectionConfigs(env);
  const envWithKey = envConnections.find((conn) => conn.source === 'env' && conn.key);
  if (envWithKey) return envWithKey;

  const storedConnections = await getStoredOpenAIConnectionConfigs(env);
  const storedWithKey = storedConnections.find((conn) => conn.key);
  if (storedWithKey) return storedWithKey;

  return envConnections[0] || storedConnections[0] || null;
}

export async function getEnvOpenAIOverrides(env) {
  return getEnvOverrideMap(env);
}

export function buildEnvOpenAIConnections(env) {
  return getEnvOpenAIConnectionConfigs(env, { includeDisabled: true }).map((conn) => ({
    id: conn.id,
    name: conn.name,
    url: conn.baseUrl,
    keyMasked: conn.key ? `••••${String(conn.key).slice(-4)}` : '',
    hasKey: Boolean(conn.key),
    headers: '',
    providerType: conn.providerType,
    providerFamily: conn.providerFamily,
    providerId: conn.providerId || buildProviderId(conn),
    authType: conn.authType || '',
    apiType: conn.apiType || getConnectionApiType(conn.providerType || conn.providerFamily),
    readOnly: true,
    source: 'env',
    enabled: conn.enabled !== false,
  }));
}
