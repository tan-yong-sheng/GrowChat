import { error, json } from '../../utils/response.js';
import { HTTP_STATUS } from '../../shared/http-status.js';
import { logAuditEvent } from '../../utils/authorize.js';
import { createDB } from '../../db.js';
import { chunkedBatch } from '../../utils/db-helpers.js';
import { buildModelAclRuleSaveStatements, normalizeModelAclRule } from '../../utils/model-acl.js';
import { getModelAccessMap } from './models-helpers.js';
import { normalizeModelId } from '../../admin/tool-servers.js';
import {
  invalidJsonBody,
  loadValidGroupIds,
  noDatabase,
  requireModelAdmin,
} from './models-admin-access-helpers.js';

const MAX_BULK_UPDATES = 200;

function parseBody(req, body) {
  const updates = Array.isArray(body.updates) ? body.updates : [];
  return updates;
}

function validateUpdates(updates) {
  if (!updates.length) {
    return { valid: false, error: 'No model access updates provided' };
  }
  if (updates.length > MAX_BULK_UPDATES) {
    return { valid: false, error: 'Too many access updates (max 200)' };
  }
  return { valid: true };
}

function filterRulesForModel(modelId, rules, validGroupIds, invalidPrincipalTypes) {
  const filteredRules = [];
  for (const rule of Array.isArray(rules) ? rules : []) {
    const normalized = normalizeModelAclRule({ ...rule, model_id: modelId });
    if (!normalized) continue;
    if (normalized.principal_type !== 'group') {
      invalidPrincipalTypes.push(normalized.principal_type);
      continue;
    }
    if (!validGroupIds.has(normalized.principal_id)) continue;
    filteredRules.push(normalized);
  }
  return filteredRules;
}

function processSingleUpdate(db, update, { accessMap, validGroupIds, includeSchemaStatements }) {
  const modelId = normalizeModelId(update?.model_id || update?.modelId);
  if (!modelId) {
    throw Object.assign(new Error('model_id is required'), { status: HTTP_STATUS.BAD_REQUEST });
  }

  const isEnabled = accessMap.has(modelId) ? accessMap.get(modelId) : true;
  if (!isEnabled) {
    throw Object.assign(new Error('Disabled models cannot be edited'), {
      status: HTTP_STATUS.CONFLICT,
    });
  }

  const incomingRules = Array.isArray(update?.rules) ? update.rules : [];
  const filteredRules = filterRulesForModel(modelId, incomingRules, validGroupIds, []);

  const { statements: aclStatements } = buildModelAclRuleSaveStatements(
    db,
    modelId,
    filteredRules,
    { includeSchemaStatements }
  );

  return { aclStatements, modelId, filteredRules };
}

function buildUpdateStatements(db, updates, accessMap, validGroupIds) {
  let includeSchemaStatements = true;
  const statements = [];
  const normalizedUpdates = [];

  for (const update of updates) {
    const { aclStatements, modelId, filteredRules } = processSingleUpdate(db, update, {
      accessMap,
      validGroupIds,
      includeSchemaStatements,
    });
    includeSchemaStatements = false;
    statements.push(...aclStatements);
    normalizedUpdates.push({ model_id: modelId, rules: filteredRules });
  }

  return { statements, normalizedUpdates };
}

/* eslint-disable max-params -- router dispatcher needs (req, env, ctx, user, path, deps) */
/* eslint-disable max-statements -- handler orchestrates multiple steps */
export async function handleAdminModelsAccessBulkUpdate(req, env, _ctx, user, _path, { logger }) {
  const authError = await requireModelAdmin(req, env, user);
  if (authError) return authError;

  if (!env.DB) {
    return noDatabase(req);
  }

  const body = await req.json().catch(() => null);
  if (body === null) {
    return invalidJsonBody(req);
  }

  const updates = parseBody(req, body);
  const validation = validateUpdates(updates);
  if (!validation.valid) {
    return error(req, validation.error, HTTP_STATUS.BAD_REQUEST);
  }

  try {
    const db = createDB(env.DB);
    const accessMap = await getModelAccessMap(db, logger);
    const validGroupIds = await loadValidGroupIds(db);
    const { statements, normalizedUpdates } = buildUpdateStatements(
      db,
      updates,
      accessMap,
      validGroupIds
    );

    await chunkedBatch(db, statements);
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
    if (err.status) {
      return error(
        req,
        err.message,
        err.status,
        err.invalid ? { invalid: err.invalid } : undefined
      );
    }
    return error(req, 'Failed to update model access', HTTP_STATUS.INTERNAL_SERVER_ERROR);
  }
}
