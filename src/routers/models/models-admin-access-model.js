import { error, json } from '../../utils/response.js';
import { HTTP_STATUS } from '../../shared/http-status.js';
import { logAuditEvent } from '../../utils/authorize.js';
import { createDB } from '../../db.js';
import { filterAclRulesByGroup } from '../../utils/acl-rule-filter.js';
import {
  loadModelAclRules,
  normalizeModelAclRule,
  saveModelAclRulesForModel,
} from '../../utils/model-acl.js';
import { getModelAccessMap } from './models-helpers.js';
import {
  handleStatusError,
  invalidJsonBody,
  requireModelAdmin,
} from './models-public-crud-helpers.js';
import {
  extractModelIdFromAccessPath,
  loadGroups,
  loadValidGroupIds,
} from './models-admin-access-helpers.js';

function filterRulesForModel(modelId, rules, validGroupIds) {
  return filterAclRulesByGroup({
    rules,
    resourceId: modelId,
    resourceIdKey: 'model_id',
    normalizeRule: normalizeModelAclRule,
    validGroupIds,
    invalidTypeMessage: 'Invalid principal_type for model access',
  });
}

// eslint-disable-next-line max-params -- helper needs all context parameters
async function handleModelAccessGet(req, env, _ctx, user, path, { logger }) {
  try {
    const db = createDB(env.DB);
    const groups = await loadGroups(db);
    const modelId = extractModelIdFromAccessPath(path);
    const rules = await loadModelAclRules(db, modelId);
    return json(req, {
      model_id: modelId,
      groups,
      rules,
    });
  } catch (err) {
    logger.error('Load model access failed', { error: err?.message || err });
    return error(req, 'Failed to load model access', HTTP_STATUS.INTERNAL_SERVER_ERROR);
  }
}

// eslint-disable-next-line max-params -- helper needs all context parameters
async function handleModelAccessPut(req, env, _ctx, user, path, { logger }) {
  let body;
  try {
    body = JSON.parse(await req.text());
  } catch {
    return invalidJsonBody(req);
  }

  try {
    const db = createDB(env.DB);
    const modelId = extractModelIdFromAccessPath(path);
    const accessMap = await getModelAccessMap(db, logger);
    const isEnabled = accessMap.has(modelId) ? accessMap.get(modelId) : true;
    if (!isEnabled) {
      return error(req, 'Disabled models cannot be edited', HTTP_STATUS.CONFLICT);
    }

    const validGroupIds = await loadValidGroupIds(db);
    const filteredRules = filterRulesForModel(modelId, body.rules, validGroupIds);
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

    const responseRules = savedRules.map((rule) => ({
      principal_type: rule.principal_type,
      principal_id: rule.principal_id,
      effect: rule.effect,
      action: rule.action,
    }));

    return json(req, {
      model_id: modelId,
      rules: responseRules,
    });
  } catch (err) {
    logger.error('Update model access failed', { error: err?.message || err });
    return handleStatusError(
      req,
      err,
      'Failed to update model access',
      HTTP_STATUS.INTERNAL_SERVER_ERROR
    );
  }
}

// eslint-disable-next-line max-params -- router dispatcher pattern
export async function handleAdminModelsAccessByModel(req, env, ctx, user, path, deps) {
  const authError = await requireModelAdmin(req, env, user, extractModelIdFromAccessPath(path));
  if (authError) return authError;

  if (req.method === 'GET') {
    return handleModelAccessGet(req, env, ctx, user, path, deps);
  }

  if (req.method === 'PUT') {
    return handleModelAccessPut(req, env, ctx, user, path, deps);
  }

  return error(req, 'Method not allowed', HTTP_STATUS.METHOD_NOT_ALLOWED);
}
