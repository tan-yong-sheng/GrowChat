// fallow-ignore-file code-duplication
/**
 * Model Discovery and Formatting Helpers
 *
 * Functions for fetching models from OpenAI-compatible APIs,
 * public model formatting, and provider statistics.
 */
import { createRootLogger } from '../../utils/logger.js';
import { createDB } from '../../db.js';
import {
  dedupeConnectionConfigs,
  discoverConnectionModels,
  extractConnectionModelId,
  normalizeConnectionManualModels,
} from '../../llm/connections.js';
import {
  buildProviderId,
  formatModelId,
  normalizeConnectionModelId,
  normalizeProviderFamily,
} from '../../llm/provider-registry.js';
import { normalizeConnectionModelSelectionMode } from '../../../public/js/shared/utils/connection-model-selection.js';
import {
  CONNECTION_DISCOVERY_CACHE_TTL_MS,
  createConnectionDiscoveryCacheKey,
  getConnectionDiscoveryCache,
  pruneExpiredConnectionDiscoveryCache,
  shouldSuppressDiscoveryWarning,
  splitModelList,
} from './models-helpers.js';

const rootLogger = createRootLogger({});

function buildConnectionModelContext(conn) {
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
  return { providerId, manualModels, manualModelIds, selectionMode };
}

function isModelEnabled({ selectionMode, manualModelIds, rawId }) {
  if (selectionMode === 'none') return false;
  if (selectionMode === 'some') return manualModelIds.has(rawId);
  return true;
}

function buildDiscoveredModel(conn, providerId, rawId, description, context, overrides = {}) {
  return {
    id: formatModelId(providerId, rawId),
    name: overrides.name || rawId,
    provider: normalizeProviderFamily(conn.providerFamily || conn.providerType) || 'openai',
    provider_type: String(conn.providerType || conn.providerFamily || 'openai').toLowerCase(),
    provider_family: normalizeProviderFamily(conn.providerFamily || conn.providerType) || 'openai',
    provider_id: providerId,
    connection_id: conn.id,
    connection_name: conn.name || null,
    connection_source: conn.source || null,
    free: false,
    description,
    enabled: isModelEnabled({
      selectionMode: context.selectionMode,
      manualModelIds: context.manualModelIds,
      rawId,
    }),
    ...overrides,
  };
}

// fallow-ignore-next-line complexity
export async function fetchBaseModelsFromOpenAI(env, connections = [], _logger = rootLogger) {
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
      const context = buildConnectionModelContext(conn);
      const { providerId } = context;
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
        discovered.push(
          buildDiscoveredModel(
            conn,
            providerId,
            rawId,
            `Model discovered from ${discovery.url || conn.baseUrl}`,
            context
          )
        );
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
      const context = buildConnectionModelContext(conn);
      const { providerId } = context;
      for (const rawId of allowSet) {
        const fullId = formatModelId(providerId, rawId);
        if (discoveredIds.has(fullId)) continue;
        discoveredIds.add(fullId);
        discovered.push(
          buildDiscoveredModel(conn, providerId, rawId, 'Configured via OPENAI_MODELS', context)
        );
      }
    }
  }

  for (const conn of uniqueConnections) {
    const context = buildConnectionModelContext(conn);
    const { providerId, manualModels } = context;
    for (const manual of manualModels) {
      const normalizedManualId = normalizeConnectionModelId(providerId, manual.modelId);
      const fullId = formatModelId(providerId, normalizedManualId);
      if (discoveredIds.has(fullId)) continue;
      discoveredIds.add(fullId);
      discovered.push(
        buildDiscoveredModel(
          conn,
          providerId,
          normalizedManualId,
          'Manually added to this connection',
          context,
          {
            name: manual.name || normalizedManualId,
            manual: true,
            manual_model_id: normalizedManualId,
          }
        )
      );
    }
  }

  if (discovered.length === 0 && env.DEFAULT_MODELS && uniqueConnections.length > 0) {
    const defaults = splitModelList(env.DEFAULT_MODELS);
    const fallbackModel = defaults[0];
    if (fallbackModel) {
      const conn = uniqueConnections[0];
      const context = buildConnectionModelContext(conn);
      const { providerId } = context;
      discovered.push(
        buildDiscoveredModel(
          conn,
          providerId,
          fallbackModel,
          'Configured via DEFAULT_MODELS environment variable',
          context,
          { name: fallbackModel }
        )
      );
    }
  }

  connectionDiscoveryCache.set(cacheKey, {
    expiresAt: Date.now() + CONNECTION_DISCOVERY_CACHE_TTL_MS,
    models: discovered.map((model) => ({ ...model })),
  });

  return discovered;
}

export function toPublicModel(model) {
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

export function splitModelScopeByUserVisibility(models = [], hiddenModelIds = new Set()) {
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

export function isOpenAIProvider(model) {
  return (
    normalizeProviderFamily(model?.provider_family || model?.provider_type || model?.provider) ===
    'openai'
  );
}

// fallow-ignore-next-line complexity
export function getProviderKey(model) {
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

// fallow-ignore-next-line complexity
export function getProviderLabel(model) {
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

export function buildProviderStats(models = []) {
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

export async function loadCustomModels(env) {
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
