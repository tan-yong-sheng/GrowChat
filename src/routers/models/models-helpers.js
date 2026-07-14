/**
 * Model Helper Functions
 *
 * Shared utility functions for model configuration and management.
 */
import { getConfigValue } from '../../utils/app-config.js';
import { loadAttachmentCapsFromRaw } from '../../utils/attachment-caps.js';
import { normalizeAttachmentCaps, normalizeModelId } from '../../admin/tool-servers.js';
import { normalizeConnectionManualModels } from '../../llm/connections.js';
import {
  applyModelAttachmentCapUpdate,
  patchModelAttachments,
} from '../admin/admin-config-helpers.js';
import {
  loadModelAttachmentCaps,
  applyAttachmentDefaults,
  getModelAttachmentCapsEntry,
  MODEL_ATTACHMENT_CAPS_KEY,
  DEFAULT_ATTACHMENT_CAPS,
} from '../../chat/attachments.js';
import { createRootLogger } from '../../utils/logger.js';

const rootLogger = createRootLogger({});
const CONNECTION_DISCOVERY_CACHE_TTL_MS = 60 * 1000;

/**
 * Parse common pagination/search params from a search params instance.
 * Shared between public and admin model list handlers.
 * @param {URLSearchParams} params
 * @returns {{limit: number, offset: number, query: string}}
 */
export function parseModelListSearchParams(params) {
  const limit = parseInt(params.get('limit') || '0', 10);
  const offset = parseInt(params.get('offset') || '0', 10);
  const rawQuery = params.get('q') || '';
  const query = String(rawQuery).trim().toLowerCase();
  return { limit, offset, query };
}
const connectionDiscoveryCacheByEnv = new WeakMap();
const fallbackConnectionDiscoveryCache = new Map();

export function isValidModelId(value) {
  const id = String(value || '').trim();
  if (!id) return false;
  if (id.length > 200) return false;
  if (/\s/.test(id)) return false;
  return true;
}

export async function ensureModelAccessTable(db, _logger = rootLogger) {
  try {
    await db.run(
      `CREATE TABLE IF NOT EXISTS model_access (
        model_id TEXT PRIMARY KEY,
        is_enabled INTEGER NOT NULL DEFAULT 1,
        updated_at INTEGER NOT NULL DEFAULT (unixepoch())
      )`
    );
    await db.run(
      'CREATE INDEX IF NOT EXISTS idx_model_access_enabled ON model_access (is_enabled)'
    );
  } catch (err) {
    rootLogger.warn('Failed to ensure model_access table', { error: err.message });
  }
}

export async function getDisabledModelSet(db, logger = rootLogger) {
  try {
    await ensureModelAccessTable(db, logger);
    const rows = await db.all('SELECT model_id FROM model_access WHERE is_enabled = 0');
    return new Set(rows.map((row) => row.model_id));
  } catch (err) {
    rootLogger.warn('Failed to read model_access disabled set', { error: err.message });
    return new Set();
  }
}

export async function getModelAccessMap(db, logger = rootLogger) {
  try {
    await ensureModelAccessTable(db, logger);
    const rows = await db.all('SELECT model_id, is_enabled FROM model_access');
    const map = new Map();
    rows.forEach((row) => {
      map.set(row.model_id, row.is_enabled === 1);
    });
    return map;
  } catch (err) {
    rootLogger.warn('Failed to read model_access map', { error: err.message });
    return new Map();
  }
}

export { loadAttachmentCapsFromRaw } from '../../utils/attachment-caps.js';

export function applyAttachmentCapsPatch(caps, update) {
  applyModelAttachmentCapUpdate(caps, update);
}

export function buildModelAttachmentCapSaveStatement(db, caps) {
  return db.prepare(
    'INSERT INTO app_config (key, value, updated_at) VALUES (?, ?, unixepoch()) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = unixepoch()',
    [MODEL_ATTACHMENT_CAPS_KEY, JSON.stringify(caps || {})]
  );
}

export function splitModelList(value) {
  if (!value) return [];
  return String(value)
    .split(/[;,]/)
    .map((v) => v.trim())
    .filter(Boolean);
}

export function hasConnectionAuthCredentials(connection = {}) {
  const key = String(connection?.key || '').trim();
  if (key) return true;
  const headers = connection?.headers;
  if (!headers || typeof headers !== 'object') return false;
  return Object.entries(headers).some(([name, value]) => {
    const normalizedName = String(name || '')
      .trim()
      .toLowerCase();
    if (!['authorization', 'x-api-key', 'x-goog-api-key', 'api-key'].includes(normalizedName)) {
      return false;
    }
    return String(value || '').trim().length > 0;
  });
}

export function shouldSuppressDiscoveryWarning(connection = {}, discovery = {}) {
  const status = Number(discovery?.error?.status || 0);
  if (status !== 401) return false;
  return !hasConnectionAuthCredentials(connection);
}

export function createConnectionDiscoveryCacheKey(env, uniqueConnections = [], allowSet = null) {
  const normalizedConnections = uniqueConnections.map(normalizeConnectionForCache);
  const allowed = allowSet ? Array.from(allowSet).sort() : [];
  return JSON.stringify({
    openaiModels: String(env.OPENAI_MODELS || env.OPENAI_API_MODELS || ''),
    defaultModels: String(env.DEFAULT_MODELS || ''),
    allowed,
    normalizedConnections,
  });
}

function normalizeConnectionHeaders(headers) {
  if (!headers || typeof headers !== 'object') return [];
  return Object.entries(headers)
    .map(([name, value]) => [String(name || '').toLowerCase(), String(value || '')])
    .sort((a, b) => a[0].localeCompare(b[0]));
}

function normalizeConnectionManualModelsForCache(manualModels) {
  return normalizeConnectionManualModels(manualModels)
    .map((model) => ({
      modelId: String(model?.modelId || ''),
      name: String(model?.name || ''),
    }))
    .sort((a, b) => a.modelId.localeCompare(b.modelId));
}

function getConnectionString(conn, key) {
  return String((conn && conn[key]) || '');
}

function getConnectionStringFallback(conn, keys) {
  for (const key of keys) {
    const value = conn && conn[key];
    if (value) return String(value);
  }
  return '';
}

function normalizeConnectionForCache(conn) {
  return {
    id: getConnectionString(conn, 'id'),
    source: getConnectionString(conn, 'source'),
    providerType: getConnectionString(conn, 'providerType'),
    providerFamily: getConnectionString(conn, 'providerFamily'),
    baseUrl: getConnectionString(conn, 'baseUrl'),
    key: getConnectionString(conn, 'key'),
    headers: normalizeConnectionHeaders(conn?.headers),
    manualModelsMode: getConnectionStringFallback(conn, ['manualModelsMode', 'manual_models_mode']),
    manualModels: normalizeConnectionManualModelsForCache(conn?.manualModels),
  };
}

export function getConnectionDiscoveryCache(env) {
  if (env && typeof env === 'object') {
    let cache = connectionDiscoveryCacheByEnv.get(env);
    if (!cache) {
      cache = new Map();
      connectionDiscoveryCacheByEnv.set(env, cache);
    }
    return cache;
  }
  return fallbackConnectionDiscoveryCache;
}

export function pruneExpiredConnectionDiscoveryCache(cache, now = Date.now()) {
  for (const [key, entry] of cache.entries()) {
    if (!entry || entry.expiresAt <= now) {
      cache.delete(key);
    }
  }
}

export {
  loadModelAttachmentCaps,
  applyAttachmentDefaults,
  getModelAttachmentCapsEntry,
  MODEL_ATTACHMENT_CAPS_KEY,
  DEFAULT_ATTACHMENT_CAPS,
  CONNECTION_DISCOVERY_CACHE_TTL_MS,
  connectionDiscoveryCacheByEnv,
  fallbackConnectionDiscoveryCache,
};
