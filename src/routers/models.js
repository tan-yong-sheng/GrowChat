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
import { filterModelsByAllowlist, loadGroupModelAccessForUser } from '../utils/group-model-access.js';
import { dedupeConnectionConfigs, discoverConnectionModels, extractConnectionModelId, getAllOpenAIConnectionConfigs, normalizeConnectionManualModels } from '../llm/connections.js';
import { countEnabledModels, sortModelsByActiveThenName } from '../llm/model-state.js';
import { buildProviderId, formatModelId, normalizeProviderFamily } from '../llm/provider-registry.js';

const MODEL_ATTACHMENT_CAPS_KEY = 'model_attachment_caps_v1';
const DEFAULT_ATTACHMENT_CAPS = { text: true };

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
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    return parsed;
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

async function ensureModelAccessTable(db) {
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
    console.warn('Failed to ensure model_access table:', err.message);
  }
}

async function getDisabledModelSet(db) {
  try {
    await ensureModelAccessTable(db);
    const rows = await db.all('SELECT model_id FROM model_access WHERE is_enabled = 0');
    return new Set(rows.map((row) => row.model_id));
  } catch (err) {
    console.warn('Failed to read model_access disabled set:', err.message);
    return new Set();
  }
}

async function getModelAccessMap(db) {
  try {
    await ensureModelAccessTable(db);
    const rows = await db.all('SELECT model_id, is_enabled FROM model_access');
    const map = new Map();
    rows.forEach((row) => {
      map.set(row.model_id, row.is_enabled === 1);
    });
    return map;
  } catch (err) {
    console.warn('Failed to read model_access map:', err.message);
    return new Map();
  }
}

async function upsertModelAccess(db, updates) {
  if (!updates.length) return;
  await ensureModelAccessTable(db);
  const stmt = db.prepare(
    `INSERT INTO model_access (model_id, is_enabled, updated_at)
     VALUES (?, ?, unixepoch())
     ON CONFLICT(model_id) DO UPDATE SET is_enabled = excluded.is_enabled, updated_at = unixepoch()`
  );
  const batch = updates.map((item) => stmt.bind(item.id, item.enabled ? 1 : 0));
  await db.batch(batch);
}

function splitModelList(value) {
  if (!value) return [];
  return String(value)
    .split(/[;,]/)
    .map((v) => v.trim())
    .filter(Boolean);
}

async function fetchBaseModelsFromOpenAI(env, connections = []) {
  const allowedFromEnv = splitModelList(env.OPENAI_MODELS || env.OPENAI_API_MODELS);
  const allowSet = allowedFromEnv.length > 0 ? new Set(allowedFromEnv) : null;
  const discovered = [];
  const discoveredIds = new Set();
  const uniqueConnections = dedupeConnectionConfigs(connections);

  for (const conn of uniqueConnections) {
    try {
      const providerId = buildProviderId(conn);
      const discovery = await discoverConnectionModels(conn);
      if (!discovery.items.length) {
        const errorLabel = discovery.error?.status ? `${discovery.error.status}` : 'no models';
        console.warn(`Model discovery failed for ${conn.baseUrl}: ${errorLabel}`);
        continue;
      }

      for (const item of discovery.items) {
        const rawId = extractConnectionModelId(item);
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
          provider_family: normalizeProviderFamily(conn.providerFamily || conn.providerType) || 'openai',
          provider_id: providerId,
          connection_id: conn.id,
          connection_name: conn.name || null,
          free: false,
          description: `Model discovered from ${discovery.url || conn.baseUrl}`,
        });
      }
    } catch (err) {
      console.warn(`Model discovery error for ${conn.baseUrl}:`, err?.message || err);
    }
  }

  if (allowSet && uniqueConnections.length > 0) {
    for (const conn of uniqueConnections) {
      const providerId = buildProviderId(conn);
      for (const rawId of allowSet) {
        const fullId = formatModelId(providerId, rawId);
        if (discoveredIds.has(fullId)) continue;
        discoveredIds.add(fullId);
        discovered.push({
          id: fullId,
          name: rawId,
          provider: normalizeProviderFamily(conn.providerFamily || conn.providerType) || 'openai',
          provider_type: String(conn.providerType || conn.providerFamily || 'openai').toLowerCase(),
          provider_family: normalizeProviderFamily(conn.providerFamily || conn.providerType) || 'openai',
          provider_id: providerId,
          connection_id: conn.id,
          connection_name: conn.name || null,
          free: false,
          description: 'Configured via OPENAI_MODELS',
        });
      }
    }
  }

  for (const conn of uniqueConnections) {
    const providerId = buildProviderId(conn);
    const manualModels = normalizeConnectionManualModels(conn.manualModels);
    for (const manual of manualModels) {
      const fullId = formatModelId(providerId, manual.modelId);
      if (discoveredIds.has(fullId)) continue;
      discoveredIds.add(fullId);
      discovered.push({
        id: fullId,
        name: manual.name || manual.modelId,
        provider: normalizeProviderFamily(conn.providerFamily || conn.providerType) || 'openai',
        provider_type: String(conn.providerType || conn.providerFamily || 'openai').toLowerCase(),
        provider_family: normalizeProviderFamily(conn.providerFamily || conn.providerType) || 'openai',
        provider_id: providerId,
        connection_id: conn.id,
        connection_name: conn.name || null,
        free: false,
        description: 'Manually added to this connection',
        manual: true,
        manual_model_id: manual.modelId,
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
        provider: normalizeProviderFamily(uniqueConnections[0].providerFamily || uniqueConnections[0].providerType) || 'openai',
        provider_type: String(uniqueConnections[0].providerType || uniqueConnections[0].providerFamily || 'openai').toLowerCase(),
        provider_family: normalizeProviderFamily(uniqueConnections[0].providerFamily || uniqueConnections[0].providerType) || 'openai',
        provider_id: providerId,
        connection_id: uniqueConnections[0].id,
        connection_name: uniqueConnections[0].name || null,
        free: false,
        description: 'Configured via DEFAULT_MODELS environment variable',
      });
    }
  }

  return discovered;
}

function toPublicModel(model) {
  const providerFamily = normalizeProviderFamily(model.provider_family || model.provider_type || model.provider) || 'openai';
  return {
    id: model.id,
    name: model.name,
    provider: providerFamily,
    provider_type: String(model.provider_type || model.provider || providerFamily).toLowerCase(),
    provider_family: providerFamily,
    provider_id: model.provider_id,
    connection_id: model.connection_id,
    connection_name: model.connection_name,
    free: Boolean(model.free),
    description: model.description || '',
    suggestion_prompts: Array.isArray(model.suggestion_prompts) ? model.suggestion_prompts : [],
    max_tokens: model.max_tokens ?? 4096,
    temperature: model.temperature ?? 0.7,
    created_at: model.created_at,
    manual: Boolean(model.manual),
    manual_model_id: model.manual_model_id || null,
  };
}

function isOpenAIProvider(model) {
  return normalizeProviderFamily(model?.provider_family || model?.provider_type || model?.provider) === 'openai';
}

function getProviderKey(model) {
  const raw = model?.connection_name
    || model?.connectionName
    || model?.provider_id
    || model?.providerId
    || model?.provider_family
    || model?.providerFamily
    || model?.provider_type
    || model?.providerType
    || model?.provider
    || '';
  const normalized = String(raw || '').trim().toLowerCase();
  return normalized || 'unknown';
}

function getProviderLabel(model) {
  const raw = model?.connection_name
    || model?.connectionName
    || model?.provider_id
    || model?.providerId
    || model?.provider_family
    || model?.providerFamily
    || model?.provider_type
    || model?.providerType
    || model?.provider
    || '';
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
      console.warn('Failed to fetch custom models from KV, falling back to D1:', err.message);
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
      console.warn('No custom_models in D1 (table may not exist yet):', err.message);
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
export async function modelsRouter(req, env, _ctx, user, path) {
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

      let customModels = [];
      let baseModels = [];
      let openaiEnabled = true;
      let db = null;
      let modelConnections = [];

      if (env.DB) {
        try {
          db = createDB(env.DB);
          openaiEnabled = await getConfigBool(db, 'openai_enabled', true);
        } catch (err) {
          console.warn('Failed to read openai_enabled config:', err.message);
        }
      }

      // Load base models from OpenAI-compatible env configuration.
      // If this fails, log but continue with baseModels = []
      try {
        modelConnections = await getAllOpenAIConnectionConfigs(env);
        baseModels = await fetchBaseModelsFromOpenAI(env, modelConnections);
      } catch (err) {
        console.warn('Failed to fetch base models from OpenAI-compatible sources:', err.message);
      }

      // Load custom models. This may fail if KV or D1 is unavailable.
      // If this fails, log but continue with customModels = []
      try {
        customModels = await loadCustomModels(env);
      } catch (err) {
        console.warn('Failed to load custom models:', err.message);
      }

      let allModels = [...baseModels, ...customModels];
      if (!openaiEnabled) {
        allModels = allModels.filter((model) => !isOpenAIProvider(model));
      }
      let publicModels = allModels.map(toPublicModel);
      if (query) {
        publicModels = publicModels.filter((model) => {
          const name = String(model?.name || '').toLowerCase();
          const id = String(model?.id || '').toLowerCase();
          const connection = String(model?.connection_name || '').toLowerCase();
          const provider = String(model?.provider || '').toLowerCase();
          return name.includes(query) || id.includes(query) || connection.includes(query) || provider.includes(query);
        });
      }
      if (db) {
        const disabledSet = await getDisabledModelSet(db);
        if (disabledSet.size > 0) {
          publicModels = publicModels.filter((model) => !disabledSet.has(model.id));
        }
        if (user?.sub) {
          const allowlist = await loadGroupModelAccessForUser(db, user.sub);
          if (allowlist.length) {
            publicModels = filterModelsByAllowlist(publicModels, allowlist);
          }
        }
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

      const tagSource = `${limit}|${offset}|${total}|${paginatedModels.map((model) => model.id).join('|')}`;
      const etag = createWeakEtag(tagSource);

      return jsonCached(req, { 
        models: paginatedModels,
        total: total,
        active_total: activeTotal,
        limit: limit,
        offset: offset
      }, {
        etag,
        cacheControl: 'public, max-age=60, stale-while-revalidate=300',
      });
    } catch (err) {
      console.error('Unexpected error listing models:', err);
      return error(req, 'Failed to list models', 500);
    }
  }

  // GET /api/admin/models - List models with enabled state (admin only)
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
      const includeDisabled = ['1', 'true', 'yes'].includes(String(url.searchParams.get('include_disabled') || '').toLowerCase());
      const providerParam = String(url.searchParams.get('provider') || '').trim().toLowerCase();
      const providerFilter = providerParam && providerParam !== 'all'
        ? providerParam
        : '';

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
          console.warn('Failed to read openai_enabled config:', err.message);
        }
      } else {
        return error(req, 'Database unavailable', 500);
      }

      try {
        modelConnections = await getAllOpenAIConnectionConfigs(env, { includeDisabled });
        baseModels = await fetchBaseModelsFromOpenAI(env, modelConnections);
      } catch (err) {
        console.warn('Failed to fetch base models from OpenAI-compatible sources:', err.message);
      }

      try {
        customModels = await loadCustomModels(env);
      } catch (err) {
        console.warn('Failed to load custom models:', err.message);
      }

      let allModels = [...baseModels, ...customModels];
      if (!openaiEnabled) {
        allModels = allModels.filter((model) => !isOpenAIProvider(model));
      }

      const accessMap = await getModelAccessMap(db);
      const adminModels = allModels.map((model) => {
        const publicModel = toPublicModel(model);
        const enabled = accessMap.has(model.id) ? accessMap.get(model.id) : true;
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
          return name.includes(query) || id.includes(query) || connection.includes(query) || provider.includes(query);
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
      console.error('Unexpected error listing admin models:', err);
      return error(req, 'Failed to list models', 500);
    }
  }

  // PUT /api/admin/models - Update model enabled state (admin only)
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

    let body;
    try {
      body = await req.json();
    } catch {
      return error(req, 'Invalid JSON body', 400);
    }

    const updates = Array.isArray(body.updates) ? body.updates : [];
    if (updates.length > 500) {
      return error(req, 'Too many updates (max 500)', 400);
    }
    const sanitized = updates
      .map((item) => ({
        id: String(item?.id || '').trim(),
        enabled: item?.enabled !== false,
      }))
      .filter((item) => isValidModelId(item.id));

    if (sanitized.length !== updates.length) {
      return error(req, 'Invalid model id in updates', 400);
    }

    try {
      const db = createDB(env.DB);
      await upsertModelAccess(db, sanitized);
      await logAuditEvent(env, {
        actor_id: user.sub,
        action: 'model_access_updated',
        resource_type: 'model',
        resource_id: 'model-access',
        metadata: { count: sanitized.length },
      });
      return json(req, { ok: true });
    } catch (err) {
      console.error('Model access update failed:', err);
      return error(req, 'Failed to update model access', 500);
    }
  }

  // POST /api/models - Add custom model config (admin only)
  if (req.method === 'POST' && path === '/api/models') {
    // Check authorization
    const authDecision = await authorize(env, user, {
      action: 'model.admin',
      resource: 'model'
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
      return error(req, 'Provider must be one of: openai, custom, openai-compatible, google, gemini-compatible, anthropic, claude-compatible', 400);
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
        return error(req, 'CACHE KV binding required to create custom models. Please configure CACHE in wrangler.jsonc', 500);
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
        metadata: { provider: body.provider, name: body.name }
      });

      return json(req, {
        model: newModel,
        message: 'Model configured successfully',
      }, 201);
    } catch (err) {
      console.error('Add custom model failed:', err);
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
        console.warn('Failed to discover base models for GET /api/models/:id:', err?.message || err);
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
      console.error('Get model failed:', err);
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
      resourceId: modelId
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
        return error(req, 'CACHE KV binding required to update custom models. Please configure CACHE in wrangler.jsonc', 500);
      }

      // Check custom models from KV
      const customKey = 'custom_models';
      let customModels = await loadCustomModels(env);
      const modelIndex = customModels.findIndex((m) => m.id === modelId);

      if (modelIndex === -1) {
        return error(req, 'Model not found', 404);
      }

      // Track changes for audit
      const oldModel = { ...customModels[modelIndex] };

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
        metadata: { fields_changed: Object.keys(body) }
      });

      return json(req, {
        model: customModels[modelIndex],
        message: 'Model updated successfully',
      });
    } catch (err) {
      console.error('Update model failed:', err);
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
      resourceId: modelId
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
        return error(req, 'CACHE KV binding required to delete custom models. Please configure CACHE in wrangler.jsonc', 500);
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
        metadata: { provider: deletedModel.provider, name: deletedModel.name }
      });

      return json(req, { success: true, message: 'Model removed successfully' });
    } catch (err) {
      console.error('Delete model failed:', err);
      return error(req, 'Failed to remove model', 500);
    }
  }

  return null;
}
