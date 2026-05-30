/**
 * Admin Models Access Handler - /api/admin/models/access
 */
import { error, json } from '../../utils/response.js';
import { authorize, logAuditEvent } from '../../utils/authorize.js';
import { createDB } from '../../db.js';
import {
  buildModelAclRuleSaveStatements,
  loadModelAclRules,
  normalizeModelAclRule,
  saveModelAclRulesForModel,
} from '../../utils/model-acl.js';
import { getModelAccessMap } from './models-helpers.js';
import { normalizeModelId } from '../../admin/tool-servers.js';

/**
 * Handle handleAdminModelsAccess routes.
 * Returns Response if handled, null if path doesn't match.
 */
export async function handleAdminModelsAccess(
  req,
  env,
  ctx,
  user,
  path,
  { _db, logger, _requestContext }
) {
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

  return null;
}
