/**
 * Model Configuration Router
 *
 * Handles LLM model management and custom endpoint configuration
 * Model configuration endpoints require admin authorization
 */

import { createDB } from '../db.js';
import { error, json, jsonCached, createWeakEtag } from '../utils/response.js';
import { authorize, logAuditEvent } from '../utils/authorize.js';
import { getConfigBool, getConfigValue } from '../utils/app-config.js';
import { normalizeAttachmentCaps, normalizeModelId } from '../admin/tool-servers.js';
import {
  buildModelAclIndex,
  buildModelAclRuleSaveStatements,
  evaluateModelAclAccess,
  loadModelAclRules,
  normalizeModelAclRule,
  saveModelAclRulesForModel,
} from '../utils/model-acl.js';
import {
  dedupeConnectionConfigs,
  discoverConnectionModels,
  extractConnectionModelId,
  getAllOpenAIConnectionConfigs,
  normalizeConnectionManualModels,
} from '../llm/connections.js';
import { countEnabledModels, sortModelsByActiveThenName } from '../llm/model-state.js';
import {
  buildProviderId,
  formatModelId,
  normalizeConnectionModelId,
  normalizeProviderFamily,
} from '../llm/provider-registry.js';
import { loadUserResourceOverrides } from '../../public/js/shared/utils/user-resource-overrides.js';
import { normalizeConnectionModelSelectionMode } from '../../public/js/shared/utils/connection-model-selection.js';
import { createLogger, createRootLogger } from '../utils/logger.js';
const rootLogger = createRootLogger({});

const MODEL_ATTACHMENT_CAPS_KEY = 'model_attachment_caps_v1';
const DEFAULT_ATTACHMENT_CAPS = { text: true };
const CONNECTION_DISCOVERY_CACHE_TTL_MS = 60 * 1000;
const connectionDiscoveryCacheByEnv = new WeakMap();
const fallbackConnectionDiscoveryCache = new Map();

function isValidModelId(value) {
  const id = String(value || '').trim();
  if (!id) return false;
  if (id.length > 200) return false;
  if (/\s/.test(id)) return false;
  return true;
}

async function loadModelAttachmentCaps(db) {
  if (!db) return {};
  try {
    const raw = await getConfigValue(db, MODEL_ATTACHMENT_CAPS_KEY, '{}');
    return loadAttachmentCapsFromRaw(raw);
  } catch {
    return {};
  }
}

function applyAttachmentDefaults(attachments) {
  const caps = attachments && typeof attachments === 'object' ? { ...attachments } : {};
  caps.text = DEFAULT_ATTACHMENT_CAPS.text;
  return caps;
}

function getModelAttachmentCapsEntry(caps, modelId) {
  const entry = caps?.[modelId];
  if (!entry || typeof entry !== 'object') return applyAttachmentDefaults(null);
  const attachments = entry.attachments;
  if (!attachments || typeof attachments !== 'object') return applyAttachmentDefaults(null);
  return applyAttachmentDefaults(attachments);
}

async function ensureModelAccessTable(db, logger = rootLogger) {
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

async function getDisabledModelSet(db, logger = rootLogger) {
  try {
    await ensureModelAccessTable(db, logger);
    const rows = await db.all('SELECT model_id FROM model_access WHERE is_enabled = 0');
    return new Set(rows.map((row) => row.model_id));
  } catch (err) {
    rootLogger.warn('Failed to read model_access disabled set', { error: err.message });
    return new Set();
  }
}

async function getModelAccessMap(db, logger = rootLogger) {
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

function loadAttachmentCapsFromRaw(raw = '{}') {
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    return parsed;
  } catch {
    return {};
  }
}

function applyAttachmentCapsPatch(caps, update) {
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

function buildModelAttachmentCapSaveStatement(db, caps) {
  return db.prepare(
    'INSERT INTO app_config (key, value, updated_at) VALUES (?, ?, unixepoch()) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = unixepoch()',
    [MODEL_ATTACHMENT_CAPS_KEY, JSON.stringify(caps || {})]
  );
}

function splitModelList(value) {
  if (!value) return [];
  return String(value)
    .split(/[;,]/)
    .map((v) => v.trim())
    .filter(Boolean);
}

function hasConnectionAuthCredentials(connection = {}) {
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

function shouldSuppressDiscoveryWarning(connection = {}, discovery = {}) {
  const status = Number(discovery?.error?.status || 0);
  if (status !== 401) return false;
  return !hasConnectionAuthCredentials(connection);
}

function createConnectionDiscoveryCacheKey(env, uniqueConnections = [], allowSet = null) {
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

function getConnectionDiscoveryCache(env) {
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

function pruneExpiredConnectionDiscoveryCache(cache, now = Date.now()) {
  for (const [key, entry] of cache.entries()) {
    if (!entry || entry.expiresAt <= now) {
      cache.delete(key);
    }
  }
}

async function fetchBaseModelsFromOpenAI(env, connections = [], logger = rootLogger) {
  const allowedFromEnv = splitModelList(env.OPENAI_MODELS || env.OPENAI_API_MODELS);
  const allowSet = allowedFromEnv.length > 0 ? new Set(allowedFromEnv) : null;
  const discovered = [];
  const discoveredIds = new Set();
  const uniqueConnections = dedupeConnectionConfigs(connections);

  const now = Date.now();
  const connectionDiscoveryCache = getConnectionDiscoveryCache(env);
  pruneExpiredConnectionDiscoveryCache(connectionDiscoveryCache, now);
  const cacheKey = createConnectionDiscoveryCacheKey(env, uniqueConnections, allowSet);
  const cached = connectionDiscoveryCache.get(cacheKey);
  if (cached && cached.expiresAt > now && Array.isArray(cached.models)) {
    return cached.models.map((model) => ({ ...model }));
  }

  for (const conn of uniqueConnections) {
    try {
      const providerId = buildProviderId(conn);
      const manualModels = normalizeConnectionManualModels(conn.manualModels);
      const manualModelIds = new Set(
        manualModels
          .map((model) => normalizeConnectionModelId(providerId, model?.modelId || ''))
          .filter(Boolean)
      );
      const selectionMode =
        normalizeConnectionModelSelectionMode(conn.manualModelsMode || conn.manual_models_mode) ||
        'all';
      const discovery = await discoverConnectionModels(conn);
      if (!discovery.items.length) {
        const errorLabel = discovery.error?.status ? `${discovery.error.status}` : 'no models';
        if (!shouldSuppressDiscoveryWarning(conn, discovery)) {
          rootLogger.warn('Model discovery failed', { baseUrl: conn.baseUrl, errorLabel });
        }
        continue;
      }

      for (const item of discovery.items) {
        const rawId = normalizeConnectionModelId(providerId, extractConnectionModelId(item));
        if (!rawId) continue;
        if (allowSet && !allowSet.has(rawId)) continue;
        const fullId = formatModelId(providerId, rawId);
        if (discoveredIds.has(fullId)) continue;
        discoveredIds.add(fullId);
        discovered.push({
          id: fullId,
          name: rawId,
          provider: normalizeProviderFamily(conn.providerFamily || conn.providerType) || 'openai',
          provider_type: String(conn.providerType || conn.providerFamily || 'openai').toLowerCase(),
          provider_family:
            normalizeProviderFamily(conn.providerFamily || conn.providerType) || 'openai',
          provider_id: providerId,
          connection_id: conn.id,
          connection_name: conn.name || null,
          connection_source: conn.source || null,
          free: false,
          description: `Model discovered from ${discovery.url || conn.baseUrl}`,
          enabled:
            selectionMode === 'none'
              ? false
              : selectionMode === 'some'
                ? manualModelIds.has(rawId)
                : true,
        });
      }
    } catch (err) {
      rootLogger.warn('Model discovery error', {
        baseUrl: conn.baseUrl,
        error: err?.message || err,
      });
    }
  }

  if (allowSet && uniqueConnections.length > 0) {
    for (const conn of uniqueConnections) {
      const providerId = buildProviderId(conn);
      const manualModels = normalizeConnectionManualModels(conn.manualModels);
      const manualModelIds = new Set(
        manualModels
          .map((model) => normalizeConnectionModelId(providerId, model?.modelId || ''))
          .filter(Boolean)
      );
      const selectionMode =
        normalizeConnectionModelSelectionMode(conn.manualModelsMode || conn.manual_models_mode) ||
        'all';
      for (const rawId of allowSet) {
        const fullId = formatModelId(providerId, rawId);
        if (discoveredIds.has(fullId)) continue;
        discoveredIds.add(fullId);
        discovered.push({
          id: fullId,
          name: rawId,
          provider: normalizeProviderFamily(conn.providerFamily || conn.providerType) || 'openai',
          provider_type: String(conn.providerType || conn.providerFamily || 'openai').toLowerCase(),
          provider_family:
            normalizeProviderFamily(conn.providerFamily || conn.providerType) || 'openai',
          provider_id: providerId,
          connection_id: conn.id,
          connection_name: conn.name || null,
          connection_source: conn.source || null,
          free: false,
          description: 'Configured via OPENAI_MODELS',
          enabled:
            selectionMode === 'none'
              ? false
              : selectionMode === 'some'
                ? manualModelIds.has(rawId)
                : true,
        });
      }
    }
  }

  for (const conn of uniqueConnections) {
    const providerId = buildProviderId(conn);
    const manualModels = normalizeConnectionManualModels(conn.manualModels);
    const manualModelIds = new Set(
      manualModels
        .map((model) => normalizeConnectionModelId(providerId, model?.modelId || ''))
        .filter(Boolean)
    );
    const selectionMode =
      normalizeConnectionModelSelectionMode(conn.manualModelsMode || conn.manual_models_mode) ||
      'all';
    for (const manual of manualModels) {
      const normalizedManualId = normalizeConnectionModelId(providerId, manual.modelId);
      const fullId = formatModelId(providerId, normalizedManualId);
      if (discoveredIds.has(fullId)) continue;
      discoveredIds.add(fullId);
      discovered.push({
        id: fullId,
        name: manual.name || normalizedManualId,
        provider: normalizeProviderFamily(conn.providerFamily || conn.providerType) || 'openai',
        provider_type: String(conn.providerType || conn.providerFamily || 'openai').toLowerCase(),
        provider_family:
          normalizeProviderFamily(conn.providerFamily || conn.providerType) || 'openai',
        provider_id: providerId,
        connection_id: conn.id,
        connection_name: conn.name || null,
        connection_source: conn.source || null,
        free: false,
        description: 'Manually added to this connection',
        manual: true,
        manual_model_id: normalizedManualId,
        enabled:
          selectionMode === 'none'
            ? false
            : selectionMode === 'some'
              ? manualModelIds.has(normalizedManualId)
              : true,
      });
    }
  }

  if (discovered.length === 0 && env.DEFAULT_MODELS && uniqueConnections.length > 0) {
    const defaults = splitModelList(env.DEFAULT_MODELS);
    const fallbackModel = defaults[0];
    if (fallbackModel) {
      const providerId = buildProviderId(uniqueConnections[0]);
      discovered.push({
        id: formatModelId(providerId, fallbackModel),
        name: fallbackModel,
        provider:
          normalizeProviderFamily(
            uniqueConnections[0].providerFamily || uniqueConnections[0].providerType
          ) || 'openai',
        provider_type: String(
          uniqueConnections[0].providerType || uniqueConnections[0].providerFamily || 'openai'
        ).toLowerCase(),
        provider_family:
          normalizeProviderFamily(
            uniqueConnections[0].providerFamily || uniqueConnections[0].providerType
          ) || 'openai',
        provider_id: providerId,
        connection_id: uniqueConnections[0].id,
        connection_name: uniqueConnections[0].name || null,
        free: false,
        description: 'Configured via DEFAULT_MODELS environment variable',
      });
    }
  }

  connectionDiscoveryCache.set(cacheKey, {
    expiresAt: Date.now() + CONNECTION_DISCOVERY_CACHE_TTL_MS,
    models: discovered.map((model) => ({ ...model })),
  });

  return discovered;
}

function toPublicModel(model) {
  const providerFamily =
    normalizeProviderFamily(model.provider_family || model.provider_type || model.provider) ||
    'openai';
  return {
    id: model.id,
    name: model.name,
    provider: providerFamily,
    provider_type: String(model.provider_type || model.provider || providerFamily).toLowerCase(),
    provider_family: providerFamily,
    provider_id: model.provider_id,
    connection_id: model.connection_id,
    connection_name: model.connection_name,
    connection_source: model.connection_source || null,
    free: Boolean(model.free),
    description: model.description || '',
    suggestion_prompts: Array.isArray(model.suggestion_prompts) ? model.suggestion_prompts : [],
    max_tokens: model.max_tokens ?? 4096,
    temperature: model.temperature ?? 0.7,
    created_at: model.created_at,
    manual: Boolean(model.manual),
    manual_model_id: model.manual_model_id || null,
    enabled: model.enabled !== false,
  };
}

export function applyUserModelVisibilityOverrides(models = [], hiddenModelIds = new Set()) {
  const normalizedModels = Array.isArray(models) ? models : [];

  return normalizedModels.map((model) => {
    const id = String(model?.id || '').trim();
    const hiddenForUser = hiddenModelIds instanceof Set && hiddenModelIds.has(id);
    return {
      ...model,
      visible_for_user: !hiddenForUser,
      hidden_for_user: hiddenForUser,
      enabled: model?.enabled !== false && !hiddenForUser,
    };
  });
}

function splitModelScopeByUserVisibility(models = [], hiddenModelIds = new Set()) {
  const visibleModels = [];
  const hiddenModels = [];

  (Array.isArray(models) ? models : []).forEach((model) => {
    const id = String(model?.id || '').trim();
    if (!id) return;
    const hiddenForUser = hiddenModelIds instanceof Set && hiddenModelIds.has(id);
    const nextModel = {
      ...model,
      visible_for_user: !hiddenForUser,
      hidden_for_user: hiddenForUser,
      enabled: hiddenForUser ? false : model?.enabled !== false,
    };
    if (hiddenForUser) hiddenModels.push(nextModel);
    else visibleModels.push(nextModel);
  });

  return { visibleModels, hiddenModels };
}

function isOpenAIProvider(model) {
  return (
    normalizeProviderFamily(model?.provider_family || model?.provider_type || model?.provider) ===
    'openai'
  );
}

function getProviderKey(model) {
  const raw =
    model?.connection_name ||
    model?.connectionName ||
    model?.provider_id ||
    model?.providerId ||
    model?.provider_family ||
    model?.providerFamily ||
    model?.provider_type ||
    model?.providerType ||
    model?.provider ||
    '';
  const normalized = String(raw || '')
    .trim()
    .toLowerCase();
  return normalized || 'unknown';
}

function getProviderLabel(model) {
  const raw =
    model?.connection_name ||
    model?.connectionName ||
    model?.provider_id ||
    model?.providerId ||
    model?.provider_family ||
    model?.providerFamily ||
    model?.provider_type ||
    model?.providerType ||
    model?.provider ||
    '';
  const trimmed = String(raw || '').trim();
  return trimmed || 'unknown';
}

function buildProviderStats(models = []) {
  const totals = new Map();
  const actives = new Map();
  const labels = new Map();
  (Array.isArray(models) ? models : []).forEach((model) => {
    const key = getProviderKey(model);
    if (!key || key === 'unknown') return;
    totals.set(key, (totals.get(key) || 0) + 1);
    if (model?.enabled !== false) {
      actives.set(key, (actives.get(key) || 0) + 1);
    }
    if (!labels.has(key)) {
      labels.set(key, getProviderLabel(model));
    }
  });
  return Array.from(totals.entries())
    .map(([value, total]) => ({
      value,
      label: labels.get(value) || value,
      total,
      active: actives.get(value) || 0,
    }))
    .sort((a, b) => a.label.localeCompare(b.label));
}

async function loadCustomModels(env) {
  // Prefer KV when available.
  if (env.CACHE) {
    try {
      const customRaw = await env.CACHE.get('custom_models');
      if (customRaw) {
        const parsed = JSON.parse(customRaw);
        if (Array.isArray(parsed)) return parsed;
      }
    } catch (err) {
      rootLogger.warn('Failed to fetch custom models from KV, falling back to D1', {
        error: err.message,
      });
    }
  }

  // Fallback to D1 for legacy/backfill scenarios.
  if (env.DB) {
    try {
      const db = createDB(env.DB);
      const rows = await db.all(
        'SELECT id, name, provider, base_url, description, max_tokens, temperature, created_at FROM custom_models'
      );
      if (Array.isArray(rows) && rows.length > 0) {
        return rows.map((row) => ({
          id: row.id,
          name: row.name,
          provider: row.provider,
          base_url: row.base_url,
          description: row.description,
          max_tokens: row.max_tokens,
          temperature: row.temperature,
          created_at: row.created_at,
        }));
      }
    } catch (err) {
      // Table may not exist yet in fresh installations. This is not an error condition for read operations.
      rootLogger.warn('No custom_models in D1 (table may not exist yet)', { error: err.message });
    }
  }

  return [];
}

/**
 * Model Router Handler
 * Routes:
 *   GET    /api/models          - List available models (no auth)
 *   POST   /api/models          - Add custom model config (admin only)
 *   GET    /api/models/:id      - Get model config (no auth)
 *   PUT    /api/models/:id      - Update model config (admin only)
 *   DELETE /api/models/:id      - Remove model config (admin only)
 */
export async function modelsRouter(req, env, _ctx, user, path, requestId) {
  const logger = createLogger(env, requestId ? { requestId } : {});
  // GET /api/models - List available models
  if (req.method === 'GET' && path === '/api/models') {
    // No auth required - everyone should see available models
    // Gracefully degrade: return what we can, don't fail entirely on optional binding issues
    try {
      const url = new URL(req.url);
      const limit = parseInt(url.searchParams.get('limit') || '0', 10);
      const offset = parseInt(url.searchParams.get('offset') || '0', 10);
      const rawQuery = url.searchParams.get('q') || '';
      const query = String(rawQuery).trim().toLowerCase();
      const scope = String(url.searchParams.get('scope') || '')
        .trim()
        .toLowerCase();
      const includeDisabled = ['1', 'true', 'yes'].includes(
        String(url.searchParams.get('include_disabled') || '').toLowerCase()
      );

      let customModels = [];
      let baseModels = [];
      let openaiEnabled = true;
      let db = null;
      let modelConnections = [];
      let effectiveUserGroupIds = null;

      if (env.DB) {
        try {
          db = createDB(env.DB);
          openaiEnabled = await getConfigBool(db, 'openai_enabled', true);
        } catch (err) {
          logger.warn('Failed to read openai_enabled config', { error: err.message });
        }
      }

      // Load base models from OpenAI-compatible env configuration.
      // If this fails, log but continue with baseModels = []
      try {
        if (db && scope === 'effective' && user?.sub) {
          const userGroupRows = await db.all(
            'SELECT group_id FROM group_members WHERE user_id = ?',
            [user.sub]
          );
          effectiveUserGroupIds = new Set(
            (Array.isArray(userGroupRows) ? userGroupRows : [])
              .map((row) => row.group_id)
              .filter(Boolean)
          );
        }
        const connectionLoadOptions = {
          includeHiddenForUser: true,
          userId: user?.sub || '',
          userRole: user?.primary_role || 'member',
          userGroupIds: effectiveUserGroupIds ? Array.from(effectiveUserGroupIds) : undefined,
        };
        modelConnections = await getAllOpenAIConnectionConfigs(env, {
          ...connectionLoadOptions,
        });
        baseModels = await fetchBaseModelsFromOpenAI(env, modelConnections);
      } catch (err) {
        logger.warn('Failed to fetch base models from OpenAI-compatible sources', {
          error: err.message,
        });
      }

      // Load custom models. This may fail if KV or D1 is unavailable.
      // If this fails, log but continue with customModels = []
      try {
        customModels = await loadCustomModels(env);
      } catch (err) {
        logger.warn('Failed to load custom models', { error: err.message });
      }

      let allModels = [...baseModels, ...customModels];
      if (!openaiEnabled) {
        allModels = allModels.filter((model) => !isOpenAIProvider(model));
      }
      let publicModels = allModels.map(toPublicModel);
      let visibility = {
        disabled_model_ids: [],
        hidden_model_ids: [],
      };
      if (query) {
        publicModels = publicModels.filter((model) => {
          const name = String(model?.name || '').toLowerCase();
          const id = String(model?.id || '').toLowerCase();
          const connection = String(model?.connection_name || '').toLowerCase();
          const provider = String(model?.provider || '').toLowerCase();
          return (
            name.includes(query) ||
            id.includes(query) ||
            connection.includes(query) ||
            provider.includes(query)
          );
        });
      }
      if (db) {
        if (scope === 'effective' && user?.sub) {
          const [accessMap, userOverrides, aclRules] = await Promise.all([
            getModelAccessMap(db, logger),
            loadUserResourceOverrides(db, user.sub),
            loadModelAclRules(db),
          ]);
          const hiddenModelIds = new Set(userOverrides?.models?.hidden_ids || []);
          const userGroupIds = effectiveUserGroupIds || new Set();
          const aclIndex = buildModelAclIndex(aclRules);

          const scopedModels = publicModels
            .map((model) => {
              const access = evaluateModelAclAccess(model, {
                user,
                userGroupIds,
                rules: aclIndex.get(model.id) || [],
              });
              return {
                ...model,
                access_label: access.access_label,
                access_variant: access.access_variant,
                allowed: access.allowed,
                enabled: model.enabled !== false,
              };
            })
            .filter((model) => model.allowed === true && accessMap.get(model.id) !== false);
          const disabledModelIds = publicModels
            .filter((model) => accessMap.get(model.id) === false || model.enabled === false)
            .map((model) => model.id)
            .filter(Boolean);
          const eligibleModels = scopedModels.filter((model) => model.enabled !== false);
          const scopedModelIds = new Set(eligibleModels.map((model) => model.id));
          const scopedVisibility = splitModelScopeByUserVisibility(eligibleModels, hiddenModelIds);
          const visibleModels = sortModelsByActiveThenName(scopedVisibility.visibleModels);
          const hiddenModels = sortModelsByActiveThenName(scopedVisibility.hiddenModels);
          const total = visibleModels.length;
          const activeTotal = countEnabledModels(visibleModels);

          let paginatedModels = visibleModels;
          if (limit > 0) {
            paginatedModels = visibleModels.slice(offset, offset + limit);
          }
          const attachmentCaps = await loadModelAttachmentCaps(db);
          const visibleWithCaps = paginatedModels.map((model) => ({
            ...model,
            attachments: getModelAttachmentCapsEntry(attachmentCaps, model.id),
          }));
          const hiddenWithCaps = hiddenModels.map((model) => ({
            ...model,
            attachments: getModelAttachmentCapsEntry(attachmentCaps, model.id),
          }));
          const tagSource = `effective|${limit}|${offset}|${total}|${visibleWithCaps.map((model) => model.id).join('|')}`;
          const visibilityTag = `|${Array.from(hiddenModelIds).join(',')}`;
          const etag = createWeakEtag(`${tagSource}|${visibilityTag}`);

          return jsonCached(
            req,
            {
              models: visibleWithCaps,
              hidden_models: hiddenWithCaps,
              total,
              active_total: activeTotal,
              limit,
              offset,
              providers: buildProviderStats(visibleModels),
              visibility: {
                disabled_model_ids: disabledModelIds,
                hidden_model_ids: Array.from(hiddenModelIds).filter((modelId) =>
                  scopedModelIds.has(modelId)
                ),
              },
            },
            {
              etag,
              cacheControl: 'private, no-store',
            }
          );
        }

        const disabledSet = await getDisabledModelSet(db, logger);
        if (!includeDisabled && disabledSet.size > 0) {
          publicModels = publicModels.filter((model) => !disabledSet.has(model.id));
        }
        visibility = {
          disabled_model_ids: Array.from(disabledSet),
          hidden_model_ids: [],
        };
      }
      publicModels = sortModelsByActiveThenName(publicModels);
      const total = publicModels.length;
      const activeTotal = countEnabledModels(publicModels);

      let paginatedModels = publicModels;
      if (limit > 0) {
        paginatedModels = publicModels.slice(offset, offset + limit);
      }
      if (db) {
        const attachmentCaps = await loadModelAttachmentCaps(db);
        paginatedModels = paginatedModels.map((model) => ({
          ...model,
          attachments: getModelAttachmentCapsEntry(attachmentCaps, model.id),
        }));
      }

      const tagSource = `${scope === 'global' ? 'global' : 'public'}|${limit}|${offset}|${total}|${paginatedModels.map((model) => model.id).join('|')}`;
      const visibilityTag = `${visibility.disabled_model_ids.join(',')}|${visibility.hidden_model_ids.join(',')}`;
      const etag = createWeakEtag(`${tagSource}|${visibilityTag}`);

      return jsonCached(
        req,
        {
          models: paginatedModels,
          total: total,
          active_total: activeTotal,
          limit: limit,
          offset: offset,
          visibility,
        },
        {
          etag,
          cacheControl: 'private, no-store',
        }
      );
    } catch (err) {
      logger.error('Unexpected error listing models', { error: err?.message || err });
      return error(req, 'Failed to list models', 500);
    }
  }

  if (req.method === 'GET' && path === '/api/admin/models/access') {
    const authDecision = await authorize(env, user, {
      action: 'model.admin',
      resource: 'model',
    });
    if (!authDecision.allow) {
      return error(req, authDecision.reason || 'Forbidden', 403);
    }

    try {
      const db = createDB(env.DB);
      const url = new URL(req.url);
      const ids = String(url.searchParams.get('ids') || '')
        .split(',')
        .map((value) => decodeURIComponent(String(value || '').trim()))
        .filter(Boolean);
      const groups = await db.all(
        `SELECT id, name, description, is_system, created_at, updated_at
         FROM groups
         ORDER BY is_system DESC, name ASC`
      );
      const rules = await loadModelAclRules(db, null, ids.length ? ids : null);
      return json(req, {
        model_ids: ids,
        groups,
        rules,
      });
    } catch (err) {
      logger.error('Load model access failed', { error: err?.message || err });
      return error(req, 'Failed to load model access', 500);
    }
  }

  if (req.method === 'PUT' && path === '/api/admin/models/access') {
    const authDecision = await authorize(env, user, {
      action: 'model.admin',
      resource: 'model',
    });
    if (!authDecision.allow) {
      return error(req, authDecision.reason || 'Forbidden', 403);
    }
    if (!env.DB) {
      return error(req, 'Database unavailable', 500);
    }

    let body;
    try {
      body = await req.json();
    } catch {
      return error(req, 'Invalid JSON body', 400);
    }

    const updates = Array.isArray(body.updates) ? body.updates : [];
    if (!updates.length) {
      return error(req, 'No model access updates provided', 400);
    }
    if (updates.length > 200) {
      return error(req, 'Too many access updates (max 200)', 400);
    }

    try {
      const db = createDB(env.DB);
      const accessMap = await getModelAccessMap(db, logger);
      const groups = await db.all('SELECT id FROM groups');
      const validGroupIds = new Set(groups.map((group) => group.id));
      const statements = [];
      const normalizedUpdates = [];
      let includeSchemaStatements = true;

      for (const update of updates) {
        const modelId = normalizeModelId(update?.model_id || update?.modelId);
        if (!modelId) {
          return error(req, 'model_id is required', 400);
        }
        const isEnabled = accessMap.has(modelId) ? accessMap.get(modelId) : true;
        if (!isEnabled) {
          return error(req, 'Disabled models cannot be edited', 409);
        }
        const incomingRules = Array.isArray(update?.rules) ? update.rules : [];
        const filteredRules = [];
        const invalidPrincipalTypes = [];
        for (const rule of incomingRules) {
          const normalized = normalizeModelAclRule({ ...rule, model_id: modelId });
          if (!normalized) continue;
          if (normalized.principal_type !== 'group') {
            invalidPrincipalTypes.push(normalized.principal_type);
            continue;
          }
          if (!validGroupIds.has(normalized.principal_id)) continue;
          filteredRules.push(normalized);
        }
        if (invalidPrincipalTypes.length) {
          return error(req, 'Invalid principal_type for model access', 400, {
            invalid: Array.from(new Set(invalidPrincipalTypes)),
          });
        }

        const { statements: aclStatements } = buildModelAclRuleSaveStatements(
          db,
          modelId,
          filteredRules,
          { includeSchemaStatements }
        );
        includeSchemaStatements = false;
        statements.push(...aclStatements);
        normalizedUpdates.push({
          model_id: modelId,
          rules: filteredRules,
        });
      }

      await db.batch(statements);
      await logAuditEvent(env, {
        actor_id: user.sub,
        action: 'model_access_updated',
        resource_type: 'model',
        resource_id: 'model-access',
        metadata: {
          updates: normalizedUpdates.length,
        },
      });

      return json(req, {
        ok: true,
        updates: normalizedUpdates,
      });
    } catch (err) {
      logger.error('Bulk model access update failed', { error: err?.message || err });
      return error(req, 'Failed to update model access', 500);
    }
  }

  // GET /api/admin/models - List models with enabled state (admin only)
  const modelAccessMatch = path.match(/^\/api\/admin\/models\/([^/]+)\/access$/);
  if (modelAccessMatch) {
    const modelId = (() => {
      try {
        return decodeURIComponent(modelAccessMatch[1]);
      } catch {
        return modelAccessMatch[1];
      }
    })();
    const authDecision = await authorize(env, user, {
      action: 'model.admin',
      resource: 'model',
      resourceId: modelId,
    });

    if (!authDecision.allow) {
      return error(req, authDecision.reason || 'Forbidden', 403);
    }

    if (req.method === 'GET') {
      try {
        const db = createDB(env.DB);
        const groups = await db.all(
          `SELECT id, name, description, is_system, created_at, updated_at
           FROM groups
           ORDER BY is_system DESC, name ASC`
        );
        const rules = await loadModelAclRules(db, modelId);
        return json(req, {
          model_id: modelId,
          groups,
          rules,
        });
      } catch (err) {
        logger.error('Load model access failed', { error: err?.message || err });
        return error(req, 'Failed to load model access', 500);
      }
    }

    if (req.method === 'PUT') {
      let body;
      try {
        body = JSON.parse(await req.text());
      } catch {
        return error(req, 'Invalid JSON body', 400);
      }

      try {
        const db = createDB(env.DB);
        const accessMap = await getModelAccessMap(db, logger);
        const isEnabled = accessMap.has(modelId) ? accessMap.get(modelId) : true;
        if (!isEnabled) {
          return error(req, 'Disabled models cannot be edited', 409);
        }
        const groups = await db.all('SELECT id FROM groups');
        const validGroupIds = new Set(groups.map((group) => group.id));
        const incomingRules = Array.isArray(body.rules) ? body.rules : [];
        const filteredRules = [];
        const invalidPrincipalTypes = [];
        for (const rule of incomingRules) {
          const normalized = normalizeModelAclRule({ ...rule, model_id: modelId });
          if (!normalized) continue;
          if (normalized.principal_type !== 'group') {
            invalidPrincipalTypes.push(normalized.principal_type);
            continue;
          }
          if (!validGroupIds.has(normalized.principal_id)) continue;
          filteredRules.push(normalized);
        }
        if (invalidPrincipalTypes.length) {
          return error(req, 'Invalid principal_type for model access', 400, {
            invalid: Array.from(new Set(invalidPrincipalTypes)),
          });
        }

        const savedRules = await saveModelAclRulesForModel(db, modelId, filteredRules);

        await logAuditEvent(env, {
          actor_id: user.sub,
          action: 'model_access_updated',
          resource_type: 'model',
          resource_id: modelId,
          metadata: {
            rules: savedRules.map((rule) => ({
              principal_type: rule.principal_type,
              principal_id: rule.principal_id,
              effect: rule.effect,
              action: rule.action,
            })),
          },
        });

        return json(req, {
          model_id: modelId,
          rules: savedRules.map((rule) => ({
            principal_type: rule.principal_type,
            principal_id: rule.principal_id,
            effect: rule.effect,
            action: rule.action,
          })),
        });
      } catch (err) {
        logger.error('Update model access failed', { error: err?.message || err });
        return error(req, 'Failed to update model access', 500);
      }
    }

    return error(req, 'Method not allowed', 405);
  }

  if (req.method === 'GET' && path === '/api/admin/models') {
    const authDecision = await authorize(env, user, {
      action: 'model.admin',
      resource: 'model',
    });

    if (!authDecision.allow) {
      return error(req, authDecision.reason || 'Forbidden', 403);
    }

    try {
      const url = new URL(req.url);
      const limit = parseInt(url.searchParams.get('limit') || '0', 10);
      const offset = parseInt(url.searchParams.get('offset') || '0', 10);
      const rawQuery = url.searchParams.get('q') || '';
      const query = String(rawQuery).trim().toLowerCase();
      const includeDisabled = ['1', 'true', 'yes'].includes(
        String(url.searchParams.get('include_disabled') || '').toLowerCase()
      );
      const providerParam = String(url.searchParams.get('provider') || '')
        .trim()
        .toLowerCase();
      const providerFilter = providerParam && providerParam !== 'all' ? providerParam : '';

      let customModels = [];
      let baseModels = [];
      let openaiEnabled = true;
      let db = null;
      let modelConnections = [];

      if (env.DB) {
        db = createDB(env.DB);
        try {
          openaiEnabled = await getConfigBool(db, 'openai_enabled', true);
        } catch (err) {
          logger.warn('Failed to read openai_enabled config', { error: err.message });
        }
      } else {
        return error(req, 'Database unavailable', 500);
      }

      try {
        modelConnections = await getAllOpenAIConnectionConfigs(env, { includeDisabled });
        baseModels = await fetchBaseModelsFromOpenAI(env, modelConnections);
      } catch (err) {
        logger.warn('Failed to fetch base models from OpenAI-compatible sources', {
          error: err.message,
        });
      }

      try {
        customModels = await loadCustomModels(env);
      } catch (err) {
        logger.warn('Failed to load custom models', { error: err.message });
      }

      let allModels = [...baseModels, ...customModels];
      if (!openaiEnabled) {
        allModels = allModels.filter((model) => !isOpenAIProvider(model));
      }

      const accessMap = await getModelAccessMap(db, logger);
      const adminModels = allModels.map((model) => {
        const publicModel = toPublicModel(model);
        const enabled =
          publicModel.enabled !== false &&
          (accessMap.has(model.id) ? accessMap.get(model.id) : true);
        return { ...publicModel, enabled };
      });
      const providerStats = buildProviderStats(adminModels);

      let filteredModels = adminModels;
      if (query) {
        filteredModels = adminModels.filter((model) => {
          const name = String(model?.name || '').toLowerCase();
          const id = String(model?.id || '').toLowerCase();
          const connection = String(model?.connection_name || '').toLowerCase();
          const provider = String(model?.provider || '').toLowerCase();
          return (
            name.includes(query) ||
            id.includes(query) ||
            connection.includes(query) ||
            provider.includes(query)
          );
        });
      }
      if (providerFilter) {
        filteredModels = filteredModels.filter((model) => getProviderKey(model) === providerFilter);
      }

      filteredModels = sortModelsByActiveThenName(filteredModels);
      const total = filteredModels.length;
      const activeTotal = countEnabledModels(filteredModels);
      let paginatedModels = filteredModels;
      if (limit > 0) {
        paginatedModels = filteredModels.slice(offset, offset + limit);
      }
      if (db) {
        const attachmentCaps = await loadModelAttachmentCaps(db);
        paginatedModels = paginatedModels.map((model) => ({
          ...model,
          attachments: getModelAttachmentCapsEntry(attachmentCaps, model.id),
        }));
      }

      return json(req, {
        models: paginatedModels,
        total,
        active_total: activeTotal,
        limit,
        offset,
        providers: providerStats,
      });
    } catch (err) {
      logger.error('Unexpected error listing admin models', { error: err?.message || err });
      return error(req, 'Failed to list models', 500);
    }
  }

  // PUT /api/admin/models - Update model enabled state and admin model settings
  if (req.method === 'PUT' && path === '/api/admin/models') {
    const authDecision = await authorize(env, user, {
      action: 'model.admin',
      resource: 'model',
    });

    if (!authDecision.allow) {
      return error(req, authDecision.reason || 'Forbidden', 403);
    }

    if (!env.DB) {
      return error(req, 'Database unavailable', 500);
    }

    const db = createDB(env.DB);

    let body;
    try {
      body = await req.json();
    } catch {
      return error(req, 'Invalid JSON body', 400);
    }

    const updatesInput = Array.isArray(body.updates) ? body.updates : [];
    const attachmentUpdatesInput = Array.isArray(body.attachment_updates)
      ? body.attachment_updates
      : Array.isArray(body.attachmentUpdates)
        ? body.attachmentUpdates
        : [];
    const accessUpdatesInput = Array.isArray(body.access_updates)
      ? body.access_updates
      : Array.isArray(body.accessUpdates)
        ? body.accessUpdates
        : [];

    if (
      updatesInput.length > 500 ||
      attachmentUpdatesInput.length > 500 ||
      accessUpdatesInput.length > 500
    ) {
      return error(req, 'Too many updates (max 500)', 400);
    }

    const sanitizedUpdates = updatesInput
      .map((item) => ({
        id: String(item?.id || '').trim(),
        enabled: item?.enabled !== false,
      }))
      .filter((item) => isValidModelId(item.id));
    if (sanitizedUpdates.length !== updatesInput.length) {
      return error(req, 'Invalid model id in updates', 400);
    }

    let attachmentCaps = null;
    const sanitizedAttachmentUpdates = [];
    try {
      if (attachmentUpdatesInput.length) {
        const rawCaps = await getConfigValue(db, MODEL_ATTACHMENT_CAPS_KEY, '{}');
        attachmentCaps = loadAttachmentCapsFromRaw(rawCaps);
        for (const update of attachmentUpdatesInput) {
          applyAttachmentCapsPatch(attachmentCaps, update);
          sanitizedAttachmentUpdates.push({
            model_id: normalizeModelId(update?.model_id || update?.modelId),
            attachments: normalizeAttachmentCaps(update?.attachments, { allowNull: true }),
          });
        }
      }
    } catch (err) {
      return error(req, err?.message || 'Invalid attachment cap data', 400);
    }

    const sanitizedAccessUpdates = [];
    try {
      for (const update of accessUpdatesInput) {
        const modelId = normalizeModelId(update?.model_id || update?.modelId);
        if (!modelId) {
          return error(req, 'model_id is required', 400);
        }
        const rules = Array.isArray(update?.rules) ? update.rules : [];
        sanitizedAccessUpdates.push({
          model_id: modelId,
          rules,
        });
      }
    } catch (err) {
      return error(req, err?.message || 'Invalid model access data', 400);
    }

    // Model ACL writes are intentionally split from general model writes so the
    // stronger `admin.rbac.admin` boundary stays obvious in the mutation path.
    if (sanitizedAccessUpdates.length > 0) {
      const aclDecision = await authorize(env, user, {
        action: 'admin.rbac.admin',
        resource: 'model',
      });
      if (!aclDecision.allow) {
        return error(req, aclDecision.reason || 'Forbidden', 403);
      }
    }

    if (
      !sanitizedUpdates.length &&
      !sanitizedAttachmentUpdates.length &&
      !sanitizedAccessUpdates.length
    ) {
      return error(req, 'No model changes provided', 400);
    }

    try {
      const currentAccessMap = await getModelAccessMap(db, logger);
      const nextAccessMap = new Map(currentAccessMap);
      for (const update of sanitizedUpdates) {
        nextAccessMap.set(update.id, update.enabled);
      }

      const statements = [
        db.prepare(
          `CREATE TABLE IF NOT EXISTS model_access (
            model_id TEXT PRIMARY KEY,
            is_enabled INTEGER NOT NULL DEFAULT 1,
            updated_at INTEGER NOT NULL DEFAULT (unixepoch())
          )`
        ),
        db.prepare(
          'CREATE INDEX IF NOT EXISTS idx_model_access_enabled ON model_access (is_enabled)'
        ),
      ];

      for (const update of sanitizedUpdates) {
        statements.push(
          db.prepare(
            `INSERT INTO model_access (model_id, is_enabled, updated_at)
             VALUES (?, ?, unixepoch())
             ON CONFLICT(model_id) DO UPDATE SET is_enabled = excluded.is_enabled, updated_at = unixepoch()`,
            [update.id, update.enabled ? 1 : 0]
          )
        );
      }

      if (sanitizedAttachmentUpdates.length > 0 && attachmentCaps) {
        statements.push(buildModelAttachmentCapSaveStatement(db, attachmentCaps));
      }

      if (sanitizedAccessUpdates.length > 0) {
        const groups = await db.all('SELECT id FROM groups');
        const validGroupIds = new Set(
          (Array.isArray(groups) ? groups : []).map((group) => group.id).filter(Boolean)
        );
        let includeSchemaStatements = true;
        const normalizedAccessUpdates = [];

        for (const update of sanitizedAccessUpdates) {
          const modelId = update.model_id;
          const isEnabled = nextAccessMap.has(modelId) ? nextAccessMap.get(modelId) : true;
          if (!isEnabled) {
            return error(req, 'Disabled models cannot be edited', 409);
          }

          const filteredRules = [];
          const invalidPrincipalTypes = [];
          for (const rule of Array.isArray(update.rules) ? update.rules : []) {
            const normalized = normalizeModelAclRule({ ...rule, model_id: modelId });
            if (!normalized) continue;
            if (normalized.principal_type !== 'group') {
              invalidPrincipalTypes.push(normalized.principal_type);
              continue;
            }
            if (!validGroupIds.has(normalized.principal_id)) continue;
            filteredRules.push(normalized);
          }
          if (invalidPrincipalTypes.length) {
            return error(req, 'Invalid principal_type for model access', 400, {
              invalid: Array.from(new Set(invalidPrincipalTypes)),
            });
          }

          const { statements: aclStatements } = buildModelAclRuleSaveStatements(
            db,
            modelId,
            filteredRules,
            { includeSchemaStatements }
          );
          includeSchemaStatements = false;
          statements.push(...aclStatements);
          normalizedAccessUpdates.push({
            model_id: modelId,
            rules: filteredRules,
          });
        }

        await db.batch(statements);
        await logAuditEvent(env, {
          actor_id: user.sub,
          action: 'model_settings_updated',
          resource_type: 'model',
          resource_id: 'model-settings',
          metadata: {
            updates: sanitizedUpdates.length,
            attachment_updates: sanitizedAttachmentUpdates.length,
            access_updates: normalizedAccessUpdates.length,
          },
        });
        return json(req, {
          ok: true,
          updates: sanitizedUpdates.length,
          attachment_updates: sanitizedAttachmentUpdates.length,
          access_updates: normalizedAccessUpdates,
        });
      }

      await db.batch(statements);
      await logAuditEvent(env, {
        actor_id: user.sub,
        action: 'model_settings_updated',
        resource_type: 'model',
        resource_id: 'model-settings',
        metadata: {
          updates: sanitizedUpdates.length,
          attachment_updates: sanitizedAttachmentUpdates.length,
          access_updates: sanitizedAccessUpdates.length,
        },
      });
      return json(req, {
        ok: true,
        updates: sanitizedUpdates.length,
        attachment_updates: sanitizedAttachmentUpdates.length,
        access_updates: sanitizedAccessUpdates,
      });
    } catch (err) {
      logger.error('Model settings update failed', { error: err?.message || err });
      return error(req, 'Failed to update model settings', 500);
    }
  }

  // POST /api/models - Add custom model config (admin only)
  if (req.method === 'POST' && path === '/api/models') {
    // Check authorization
    const authDecision = await authorize(env, user, {
      action: 'model.admin',
      resource: 'model',
    });

    if (!authDecision.allow) {
      return error(req, authDecision.reason || 'Forbidden', 403);
    }

    let body;
    try {
      body = await req.json();
    } catch {
      return error(req, 'Invalid JSON body', 400);
    }

    // Validate required fields
    if (!body.id || !body.name || !body.provider || !body.base_url) {
      return error(req, 'id, name, provider, and base_url are required', 400);
    }

    // Validate provider
    const validProviders = [
      'openai',
      'custom',
      'openai-compatible',
      'google',
      'gemini-compatible',
      'anthropic',
      'claude-compatible',
    ];
    if (!validProviders.includes(body.provider)) {
      return error(
        req,
        'Provider must be one of: openai, custom, openai-compatible, google, gemini-compatible, anthropic, claude-compatible',
        400
      );
    }

    // Validate base_url
    if (!body.base_url.startsWith('http')) {
      return error(req, 'base_url must start with http:// or https://', 400);
    }

    // Validate description (optional)
    const description = body.description || `${body.name} - ${body.provider}`;

    try {
      // Check for CACHE binding early. This operation requires KV.
      if (!env.CACHE) {
        return error(
          req,
          'CACHE KV binding required to create custom models. Please configure CACHE in wrangler.jsonc',
          500
        );
      }

      // Store in KV with expiration (1 year)
      const customKey = 'custom_models';
      const customModels = await loadCustomModels(env);

      // Check for duplicate id
      const idExists = customModels.some((m) => m.id === body.id);
      if (idExists) {
        return error(req, 'Model with this ID already exists', 409);
      }

      // Check for duplicate name
      const nameExists = customModels.some((m) => m.name === body.name);
      if (nameExists) {
        return error(req, 'Model name already exists', 409);
      }

      // Add new model
      const newModel = {
        id: body.id,
        name: body.name,
        provider: body.provider,
        base_url: body.base_url,
        description: description,
        max_tokens: body.max_tokens || 4096,
        temperature: body.temperature || 0.7,
        created_at: Math.floor(Date.now() / 1000),
      };

      customModels.push(newModel);

      // Save back to KV
      await env.CACHE.put(customKey, JSON.stringify(customModels), { expirationTtl: 31536000 });

      // Log audit event
      await logAuditEvent(env, {
        actor_id: user.sub,
        action: 'model_created',
        resource_type: 'model',
        resource_id: body.id,
        metadata: { provider: body.provider, name: body.name },
      });

      return json(
        req,
        {
          model: newModel,
          message: 'Model configured successfully',
        },
        201
      );
    } catch (err) {
      logger.error('Add custom model failed', { error: err?.message || err });
      return error(req, 'Failed to add custom model', 500);
    }
  }

  // GET /api/models/:id - Get model config
  if (req.method === 'GET' && path.match(/^\/api\/models\/[^/]+$/)) {
    const modelId = path.split('/').pop();

    try {
      // Check base models discovered from OpenAI-compatible providers.
      // Degrade gracefully if upstream discovery is unavailable.
      let baseModels = [];
      try {
        const modelConnections = await getAllOpenAIConnectionConfigs(env);
        baseModels = await fetchBaseModelsFromOpenAI(env, modelConnections);
      } catch (err) {
        logger.warn('Failed to discover base models for GET /api/models/:id:', err?.message || err);
      }

      if (baseModels.length > 0) {
        const baseModel = baseModels.find((m) => m.id === modelId);
        if (baseModel) {
          return json(req, { model: toPublicModel(baseModel) });
        }
      }

      // Check custom models from KV with D1 fallback
      const customModels = await loadCustomModels(env);

      const customModel = customModels.find((m) => m.id === modelId);
      if (customModel) {
        return json(req, { model: toPublicModel(customModel) });
      }

      // Model not found
      return error(req, 'Model not found', 404);
    } catch (err) {
      logger.error('Get model failed', { error: err?.message || err });
      return error(req, 'Failed to fetch model', 500);
    }
  }

  // PUT /api/models/:id - Update model config (admin only)
  if (req.method === 'PUT' && path.match(/^\/api\/models\/[^/]+$/)) {
    const modelId = path.split('/').pop();

    // Check authorization
    const authDecision = await authorize(env, user, {
      action: 'model.admin',
      resource: 'model',
      resourceId: modelId,
    });

    if (!authDecision.allow) {
      return error(req, authDecision.reason || 'Forbidden', 403);
    }

    let body;
    try {
      body = await req.json();
    } catch {
      return error(req, 'Invalid JSON body', 400);
    }

    try {
      // Cannot update discovered base models.
      const modelConnections = await getAllOpenAIConnectionConfigs(env);
      const baseModels = await fetchBaseModelsFromOpenAI(env, modelConnections);
      if (baseModels.find((m) => m.id === modelId)) {
        return error(req, 'Cannot update base model', 400);
      }

      // Check for CACHE binding early. This operation requires KV.
      if (!env.CACHE) {
        return error(
          req,
          'CACHE KV binding required to update custom models. Please configure CACHE in wrangler.jsonc',
          500
        );
      }

      // Check custom models from KV
      const customKey = 'custom_models';
      let customModels = await loadCustomModels(env);
      const modelIndex = customModels.findIndex((m) => m.id === modelId);

      if (modelIndex === -1) {
        return error(req, 'Model not found', 404);
      }

      // Track changes for audit
      // Apply updates
      if (body.name !== undefined) {
        customModels[modelIndex].name = body.name;
      }

      if (body.description !== undefined) {
        customModels[modelIndex].description = body.description;
      }

      if (body.base_url !== undefined) {
        if (!body.base_url.startsWith('http')) {
          return error(req, 'base_url must start with http:// or https://', 400);
        }
        customModels[modelIndex].base_url = body.base_url;
      }

      if (body.max_tokens !== undefined) {
        customModels[modelIndex].max_tokens = parseInt(body.max_tokens, 10);
      }

      if (body.temperature !== undefined) {
        customModels[modelIndex].temperature = parseFloat(body.temperature);
      }

      // Save back to KV
      await env.CACHE.put(customKey, JSON.stringify(customModels), { expirationTtl: 31536000 });

      // Log audit event
      await logAuditEvent(env, {
        actor_id: user.sub,
        action: 'model_updated',
        resource_type: 'model',
        resource_id: modelId,
        metadata: { fields_changed: Object.keys(body) },
      });

      return json(req, {
        model: customModels[modelIndex],
        message: 'Model updated successfully',
      });
    } catch (err) {
      logger.error('Update model failed', { error: err?.message || err });
      return error(req, 'Failed to update model', 500);
    }
  }

  // DELETE /api/models/:id - Remove model config (admin only)
  if (req.method === 'DELETE' && path.match(/^\/api\/models\/[^/]+$/)) {
    const modelId = path.split('/').pop();

    // Check authorization
    const authDecision = await authorize(env, user, {
      action: 'model.admin',
      resource: 'model',
      resourceId: modelId,
    });

    if (!authDecision.allow) {
      return error(req, authDecision.reason || 'Forbidden', 403);
    }

    try {
      // Cannot delete discovered base models.
      const modelConnections = await getAllOpenAIConnectionConfigs(env);
      const baseModels = await fetchBaseModelsFromOpenAI(env, modelConnections);
      if (baseModels.find((m) => m.id === modelId)) {
        return error(req, 'Cannot delete base model', 400);
      }

      // Check for CACHE binding early. This operation requires KV.
      if (!env.CACHE) {
        return error(
          req,
          'CACHE KV binding required to delete custom models. Please configure CACHE in wrangler.jsonc',
          500
        );
      }

      // Check custom models from KV
      const customKey = 'custom_models';
      let customModels = await loadCustomModels(env);
      const modelIndex = customModels.findIndex((m) => m.id === modelId);

      if (modelIndex === -1) {
        return error(req, 'Model not found', 404);
      }

      // Track model being deleted
      const deletedModel = customModels[modelIndex];

      // Remove model
      customModels.splice(modelIndex, 1);

      // Save back to KV
      await env.CACHE.put(customKey, JSON.stringify(customModels), { expirationTtl: 31536000 });

      // Log audit event
      await logAuditEvent(env, {
        actor_id: user.sub,
        action: 'model_deleted',
        resource_type: 'model',
        resource_id: modelId,
        metadata: { provider: deletedModel.provider, name: deletedModel.name },
      });

      return json(req, { success: true, message: 'Model removed successfully' });
    } catch (err) {
      logger.error('Delete model failed', { error: err?.message || err });
      return error(req, 'Failed to remove model', 500);
    }
  }

  return null;
}
