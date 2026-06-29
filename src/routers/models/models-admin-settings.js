/**
 * Admin Models Settings Handler - GET/PUT /api/admin/models
 */
import { error, json } from '../../utils/response.js';
import { authorize, logAuditEvent } from '../../utils/authorize.js';
import { createDB } from '../../db.js';
import { chunkedBatch } from '../../utils/db-helpers.js';
import { getConfigBool, getConfigValue } from '../../utils/app-config.js';
import { normalizeAttachmentCaps, normalizeModelId } from '../../admin/tool-servers.js';
import { buildModelAclRuleSaveStatements, normalizeModelAclRule } from '../../utils/model-acl.js';
import { getAllOpenAIConnectionConfigs } from '../../llm/connections.js';
import { countEnabledModels, sortModelsByActiveThenName } from '../../llm/model-state.js';
import {
  getModelAccessMap,
  loadModelAttachmentCaps,
  getModelAttachmentCapsEntry,
  loadAttachmentCapsFromRaw,
  applyAttachmentCapsPatch,
  buildModelAttachmentCapSaveStatement,
  MODEL_ATTACHMENT_CAPS_KEY,
  isValidModelId,
} from './models-helpers.js';
import {
  fetchBaseModelsFromOpenAI,
  toPublicModel,
  isOpenAIProvider,
  buildProviderStats,
  loadCustomModels,
  getProviderKey,
} from './models-discovery.js';

/**
 * Handle handleAdminModelsSettings routes.
 * Returns Response if handled, null if path doesn't match.
 */
export async function handleAdminModelsSettings(
  req,
  env,
  ctx,
  user,
  path,
  { _db, logger, _requestContext }
) {
  if (req.method === 'GET' && path === '/api/admin/models') {
    const authDecision = await authorize(env, user, {
      action: 'model.admin',
      resource: 'model',
    });

    if (!authDecision.allow) {
      const statusCodeMap = {
        server_error: 500,
        unauthorized: 401,
        not_found: 404,
      };
      const statusCode = statusCodeMap[authDecision.code] || 403;
      return error(req, authDecision.reason || 'Forbidden', statusCode);
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
      const statusCodeMap = {
        server_error: 500,
        unauthorized: 401,
        not_found: 404,
      };
      const statusCode = statusCodeMap[authDecision.code] || 403;
      return error(req, authDecision.reason || 'Forbidden', statusCode);
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
        const statusCodeMap = {
          server_error: 500,
          unauthorized: 401,
          not_found: 404,
        };
        const statusCode = statusCodeMap[aclDecision.code] || 403;
        return error(req, aclDecision.reason || 'Forbidden', statusCode);
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

        await chunkedBatch(db, statements);
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

      await chunkedBatch(db, statements);
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

  return null;
}
