import { createDB } from '../db.js';
import { getConfigValue } from './app-config.js';

function splitEnvList(value) {
  if (!value) return [];
  return String(value)
    .split(';')
    .map((item) => item.trim())
    .filter(Boolean);
}

function normalizeUrl(url) {
  if (!url) return '';
  return url.endsWith('/') ? url.slice(0, -1) : url;
}

function labelFromUrl(url) {
  try {
    const parsed = new URL(url);
    return parsed.hostname;
  } catch {
    return url || 'OpenAI';
  }
}

function normalizeBaseUrl(url) {
  if (!url) return '';
  return String(url).trim().replace(/\/$/, '');
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
  const seed = `${conn?.url || conn?.baseUrl || ''}|${conn?.key || ''}|${conn?.headers || ''}|${index}`;
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
    console.warn('Failed to load OpenAI env overrides:', err?.message || err);
    return new Map();
  }
}

export function getEnvOpenAIConnectionConfigs(env, options = {}) {
  const includeDisabled = options.includeDisabled === true;
  const baseUrlsRaw = env.OPENAI_API_BASE_URLS || env.OPENAI_BASE_URL || '';
  const keysRaw = env.OPENAI_API_KEYS || env.OPENAI_API_KEY || '';

  const baseUrls = splitEnvList(baseUrlsRaw);
  const keys = splitEnvList(keysRaw);

  if (baseUrls.length === 0 && keys.length === 0) {
    return [];
  }

  if (baseUrls.length === 0 && keys.length > 0) {
    baseUrls.push('https://api.openai.com/v1');
  }

  if (baseUrls.length === 1 && keys.length > 1) {
    while (baseUrls.length < keys.length) {
      baseUrls.push(baseUrls[0]);
    }
  }

  if (keys.length === 1 && baseUrls.length > 1) {
    while (keys.length < baseUrls.length) {
      keys.push(keys[0]);
    }
  }

  const max = Math.max(baseUrls.length, keys.length, 1);
  const connections = [];

  for (let i = 0; i < max; i += 1) {
    const url = normalizeBaseUrl(baseUrls[i] || baseUrls[0] || 'https://api.openai.com/v1');
    const key = keys[i] || keys[0] || '';
    connections.push({
      id: `env-${i}`,
      name: `OpenAI (${labelFromUrl(url)})`,
      baseUrl: url,
      key,
      headers: {},
      source: 'env',
      enabled: true,
      providerType: 'openai-compatible',
    });
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
        return {
          id: ensureConnectionId({ ...conn, url, baseUrl: url, headers: conn.headers }, index),
          name: String(conn.name || 'OpenAI Compatible').slice(0, 120),
          baseUrl: url,
          key: String(conn.key || '').trim(),
          headers,
          source: 'config',
          enabled,
          providerType: String(conn.providerType || 'openai-compatible').toLowerCase(),
        };
      })
      .filter(Boolean);
    if (includeDisabled) return normalized;
    return normalized.filter((conn) => conn.enabled !== false);
  } catch (err) {
    console.warn('Failed to load stored OpenAI connections:', err?.message || err);
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
  const baseUrlsRaw = env.OPENAI_API_BASE_URLS || env.OPENAI_BASE_URL || '';
  const keysRaw = env.OPENAI_API_KEYS || env.OPENAI_API_KEY || '';

  const baseUrls = splitEnvList(baseUrlsRaw);
  const keys = splitEnvList(keysRaw);

  if (baseUrls.length === 0 && keys.length === 0) {
    return [];
  }

  if (baseUrls.length === 0 && keys.length > 0) {
    baseUrls.push('https://api.openai.com/v1');
  }

  if (baseUrls.length === 1 && keys.length > 1) {
    while (baseUrls.length < keys.length) {
      baseUrls.push(baseUrls[0]);
    }
  }

  if (keys.length === 1 && baseUrls.length > 1) {
    while (keys.length < baseUrls.length) {
      keys.push(keys[0]);
    }
  }

  const max = Math.max(baseUrls.length, keys.length, 1);
  const connections = [];

  for (let i = 0; i < max; i += 1) {
    const url = normalizeUrl(baseUrls[i] || baseUrls[0] || 'https://api.openai.com/v1');
    const key = keys[i] || keys[0] || '';
    connections.push({
      id: `env-${i}`,
      name: `OpenAI (${labelFromUrl(url)})`,
      url,
      keyMasked: key ? `••••${key.slice(-4)}` : '',
      hasKey: Boolean(key),
      headers: '',
      providerType: 'openai-compatible',
      apiType: 'chat-completions',
      readOnly: true,
      source: 'env',
      enabled: true,
    });
  }

  return connections;
}
