/**
 * Model Helper Functions
 *
 * Shared utility functions for model configuration and management.
 */
import { getConfigValue } from '../../utils/app-config.js';
import { normalizeAttachmentCaps, normalizeModelId } from '../../admin/tool-servers.js';
import { normalizeConnectionManualModels } from '../../llm/connections.js';
import { createRootLogger } from '../../utils/logger.js';

const rootLogger = createRootLogger({});
const MODEL_ATTACHMENT_CAPS_KEY = 'model_attachment_caps_v1';
const DEFAULT_ATTACHMENT_CAPS = { text: true };
const CONNECTION_DISCOVERY_CACHE_TTL_MS = 60 * 1000;
const connectionDiscoveryCacheByEnv = new WeakMap();
const fallbackConnectionDiscoveryCache = new Map();

export function isValidModelId(value) {
  const id = String(value || '').trim();
  if (!id) return false;
  if (id.length > 200) return false;
  if (/\s/.test(id)) return false;
  return true;
}

export async function loadModelAttachmentCaps(db) {
  if (!db) return {};
  try {
    const raw = await getConfigValue(db, MODEL_ATTACHMENT_CAPS_KEY, '{}');
    return loadAttachmentCapsFromRaw(raw);
  } catch {
    return {};
  }
}

export function applyAttachmentDefaults(attachments) {
  const caps = attachments && typeof attachments === 'object' ? { ...attachments } : {};
  caps.text = DEFAULT_ATTACHMENT_CAPS.text;
  return caps;
}

export function getModelAttachmentCapsEntry(caps, modelId) {
  const entry = caps?.[modelId];
  if (!entry || typeof entry !== 'object') return applyAttachmentDefaults(null);
  const attachments = entry.attachments;
  if (!attachments || typeof attachments !== 'object') return applyAttachmentDefaults(null);
  return applyAttachmentDefaults(attachments);
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

export function loadAttachmentCapsFromRaw(raw = '{}') {
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    return parsed;
  } catch {
    return {};
  }
}

export function applyAttachmentCapsPatch(caps, update) {
  const modelId = normalizeModelId(update?.model_id || update?.modelId);
  if (!modelId) {
    throw new Error('model_id is required');
  }
  const patch = normalizeAttachmentCaps(update?.attachments, { allowNull: true });
  const current = caps[modelId] && typeof caps[modelId] === 'object' ? caps[modelId] : {};
  const nextAttachments = { ...(current.attachments || {}) };
  for (const [key, value] of Object.entries(patch)) {
    if (value === null) {
      delete nextAttachments[key];
    } else {
      nextAttachments[key] = value;
    }
  }
  caps[modelId] = {
    ...current,
    attachments: nextAttachments,
    updated_at: Date.now(),
  };
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
  const normalizedConnections = uniqueConnections.map((conn) => ({
    id: String(conn?.id || ''),
    source: String(conn?.source || ''),
    providerType: String(conn?.providerType || ''),
    providerFamily: String(conn?.providerFamily || ''),
    baseUrl: String(conn?.baseUrl || ''),
    key: String(conn?.key || ''),
    headers:
      conn?.headers && typeof conn.headers === 'object'
        ? Object.entries(conn.headers)
            .map(([name, value]) => [String(name || '').toLowerCase(), String(value || '')])
            .sort((a, b) => a[0].localeCompare(b[0]))
        : [],
    manualModelsMode: String(conn?.manualModelsMode || conn?.manual_models_mode || ''),
    manualModels: normalizeConnectionManualModels(conn?.manualModels)
      .map((model) => ({
        modelId: String(model?.modelId || ''),
        name: String(model?.name || ''),
      }))
      .sort((a, b) => a.modelId.localeCompare(b.modelId)),
  }));
  const allowed = allowSet ? Array.from(allowSet).sort() : [];
  return JSON.stringify({
    openaiModels: String(env.OPENAI_MODELS || env.OPENAI_API_MODELS || ''),
    defaultModels: String(env.DEFAULT_MODELS || ''),
    allowed,
    normalizedConnections,
  });
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
  MODEL_ATTACHMENT_CAPS_KEY,
  DEFAULT_ATTACHMENT_CAPS,
  CONNECTION_DISCOVERY_CACHE_TTL_MS,
  connectionDiscoveryCacheByEnv,
  fallbackConnectionDiscoveryCache,
};
