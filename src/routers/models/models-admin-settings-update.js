import { error, json } from '../../utils/response.js';
import { HTTP_STATUS } from '../../shared/http-status.js';
import { createDB } from '../../db.js';
import { getConfigValue } from '../../utils/app-config.js';
import { authorize, logAuditEvent } from '../../utils/authorize.js';
import { chunkedBatch } from '../../utils/db-helpers.js';
import { normalizeAttachmentCaps, normalizeModelId } from '../../admin/tool-servers.js';
import { buildModelAclRuleSaveStatements } from '../../utils/model-acl.js';
import {
  applyAttachmentCapsPatch,
  buildModelAttachmentCapSaveStatement,
  getModelAccessMap,
  isValidModelId,
  loadAttachmentCapsFromRaw,
  MODEL_ATTACHMENT_CAPS_KEY,
} from './models-helpers.js';
import { requireModelAdmin } from './models-admin-settings-helpers.js';
import { filterModelRulesByGroup } from './models-admin-access-helpers.js';

const MAX_UPDATES = 500;

function parseBody(body) {
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
  return { updatesInput, attachmentUpdatesInput, accessUpdatesInput };
}

function validateUpdateCounts(updatesInput, attachmentUpdatesInput, accessUpdatesInput) {
  return (
    updatesInput.length <= MAX_UPDATES &&
    attachmentUpdatesInput.length <= MAX_UPDATES &&
    accessUpdatesInput.length <= MAX_UPDATES
  );
}

function sanitizeEnabledUpdates(updatesInput) {
  const sanitized = updatesInput
    .map((item) => ({
      id: String(item?.id || '').trim(),
      enabled: item?.enabled !== false,
    }))
    .filter((item) => isValidModelId(item.id));
  return sanitized;
}

async function prepareAttachmentCaps(db, attachmentUpdatesInput) {
  if (!attachmentUpdatesInput.length) {
    return { attachmentCaps: null, sanitizedAttachmentUpdates: [] };
  }
  const rawCaps = await getConfigValue(db, MODEL_ATTACHMENT_CAPS_KEY, '{}');
  const attachmentCaps = loadAttachmentCapsFromRaw(rawCaps);
  const sanitizedAttachmentUpdates = [];
  for (const update of attachmentUpdatesInput) {
    applyAttachmentCapsPatch(attachmentCaps, update);
    sanitizedAttachmentUpdates.push({
      model_id: normalizeModelId(update?.model_id || update?.modelId),
      attachments: normalizeAttachmentCaps(update?.attachments, { allowNull: true }),
    });
  }
  return { attachmentCaps, sanitizedAttachmentUpdates };
}

function sanitizeAccessUpdates(accessUpdatesInput) {
  const sanitizedAccessUpdates = [];
  for (const update of accessUpdatesInput) {
    const modelId = normalizeModelId(update?.model_id || update?.modelId);
    if (!modelId) {
      throw Object.assign(new Error('model_id is required'), { status: HTTP_STATUS.BAD_REQUEST });
    }
    const rules = Array.isArray(update?.rules) ? update.rules : [];
    sanitizedAccessUpdates.push({ model_id: modelId, rules });
  }
  return sanitizedAccessUpdates;
}

async function requireAclAccess(req, env, user) {
  const aclDecision = await authorize(env, user, {
    action: 'admin.rbac.admin',
    resource: 'model',
  });
  if (aclDecision.allow) return null;
  const statusCodeMap = {
    server_error: HTTP_STATUS.INTERNAL_SERVER_ERROR,
    unauthorized: HTTP_STATUS.UNAUTHORIZED,
    not_found: HTTP_STATUS.NOT_FOUND,
  };
  const statusCode = statusCodeMap[aclDecision.code] || HTTP_STATUS.FORBIDDEN;
  return error(req, aclDecision.reason || 'Forbidden', statusCode);
}

function buildBaseStatements(db) {
  return [
    db.prepare(
      `CREATE TABLE IF NOT EXISTS model_access (
        model_id TEXT PRIMARY KEY,
        is_enabled INTEGER NOT NULL DEFAULT 1,
        updated_at INTEGER NOT NULL DEFAULT (unixepoch())
      )`
    ),
    db.prepare('CREATE INDEX IF NOT EXISTS idx_model_access_enabled ON model_access (is_enabled)'),
  ];
}

function buildEnabledUpdateStatements(db, sanitizedUpdates) {
  return sanitizedUpdates.map((update) =>
    db.prepare(
      `INSERT INTO model_access (model_id, is_enabled, updated_at)
       VALUES (?, ?, unixepoch())
       ON CONFLICT(model_id) DO UPDATE SET is_enabled = excluded.is_enabled, updated_at = unixepoch()`,
      [update.id, update.enabled ? 1 : 0]
    )
  );
}

async function loadValidGroupIds(db) {
  const groups = await db.all('SELECT id FROM groups');
  return new Set((Array.isArray(groups) ? groups : []).map((group) => group.id).filter(Boolean));
}

// eslint-disable-next-line max-params -- helper needs all context parameters
function processAccessUpdate(db, update, nextAccessMap, validGroupIds, includeSchemaStatements) {
  const modelId = update.model_id;
  const isEnabled = nextAccessMap.has(modelId) ? nextAccessMap.get(modelId) : true;
  if (!isEnabled) {
    throw Object.assign(new Error('Disabled models cannot be edited'), {
      status: HTTP_STATUS.CONFLICT,
    });
  }

  const { filteredRules, invalidPrincipalTypes } = filterModelRulesByGroup(
    modelId,
    update.rules,
    validGroupIds
  );
  if (invalidPrincipalTypes.length) {
    throw Object.assign(new Error('Invalid principal_type for model access'), {
      status: HTTP_STATUS.BAD_REQUEST,
      invalid: Array.from(new Set(invalidPrincipalTypes)),
    });
  }

  const { statements: aclStatements } = buildModelAclRuleSaveStatements(
    db,
    modelId,
    filteredRules,
    { includeSchemaStatements }
  );
  return {
    statements: aclStatements,
    normalizedUpdate: { model_id: modelId, rules: filteredRules },
  };
}

async function buildAccessUpdateStatements(db, sanitizedAccessUpdates, nextAccessMap, _logger) {
  const validGroupIds = await loadValidGroupIds(db);
  let includeSchemaStatements = true;
  const normalizedAccessUpdates = [];
  const statements = [];

  for (const update of sanitizedAccessUpdates) {
    const { statements: aclStatements, normalizedUpdate } = processAccessUpdate(
      db,
      update,
      nextAccessMap,
      validGroupIds,
      includeSchemaStatements
    );
    includeSchemaStatements = false;
    statements.push(...aclStatements);
    normalizedAccessUpdates.push(normalizedUpdate);
  }

  return { statements, normalizedAccessUpdates };
}

// eslint-disable-next-line max-params -- helper consolidates duplicate audit targets
async function execStatementsAndLog(
  db,
  statements,
  env,
  user,
  updatesCount,
  attachmentUpdatesCount,
  accessUpdatesCount
) {
  await chunkedBatch(db, statements);
  await logAuditEvent(env, {
    actor_id: user.sub,
    action: 'model_settings_updated',
    resource_type: 'model',
    resource_id: 'model-settings',
    metadata: {
      updates: updatesCount,
      attachment_updates: attachmentUpdatesCount,
      access_updates: accessUpdatesCount,
    },
  });
}

/* eslint-disable max-params -- multiple context parameters */
/* eslint-disable no-unused-vars -- kept for consistency with other save functions */
async function saveSettings(
  db,
  env,
  user,
  sanitizedUpdates,
  sanitizedAttachmentUpdates,
  attachmentCaps,
  normalizedAccessUpdates
) {
  const statements = [
    ...buildBaseStatements(db),
    ...buildEnabledUpdateStatements(db, sanitizedUpdates),
  ];

  if (sanitizedAttachmentUpdates.length > 0 && attachmentCaps) {
    statements.push(buildModelAttachmentCapSaveStatement(db, attachmentCaps));
  }

  await execStatementsAndLog(
    db,
    statements,
    env,
    user,
    sanitizedUpdates.length,
    sanitizedAttachmentUpdates.length,
    normalizedAccessUpdates.length
  );
}

async function parseRequestBody(req) {
  try {
    return await req.json();
  } catch {
    return null;
  }
}

async function prepareAttachmentAndAccessUpdates(db, attachmentUpdatesInput, accessUpdatesInput) {
  let attachmentCaps;
  let sanitizedAttachmentUpdates;
  try {
    ({ attachmentCaps, sanitizedAttachmentUpdates } = await prepareAttachmentCaps(
      db,
      attachmentUpdatesInput
    ));
  } catch (err) {
    return { error: err?.message || 'Invalid attachment cap data' };
  }

  let sanitizedAccessUpdates;
  try {
    sanitizedAccessUpdates = sanitizeAccessUpdates(accessUpdatesInput);
  } catch (err) {
    return { error: err?.message || 'Invalid model access data' };
  }

  return { attachmentCaps, sanitizedAttachmentUpdates, sanitizedAccessUpdates };
}

/* eslint-disable max-params -- multiple context parameters needed */
async function buildAndExecuteStatements(
  db,
  env,
  user,
  logger,
  sanitizedUpdates,
  sanitizedAttachmentUpdates,
  attachmentCaps,
  sanitizedAccessUpdates
) {
  const currentAccessMap = await getModelAccessMap(db, logger);
  const nextAccessMap = new Map(currentAccessMap);
  for (const update of sanitizedUpdates) {
    nextAccessMap.set(update.id, update.enabled);
  }

  const { statements: accessStatements, normalizedAccessUpdates } =
    sanitizedAccessUpdates.length > 0
      ? await buildAccessUpdateStatements(db, sanitizedAccessUpdates, nextAccessMap, logger)
      : { statements: [], normalizedAccessUpdates: [] };

  const statements = [
    ...buildBaseStatements(db),
    ...buildEnabledUpdateStatements(db, sanitizedUpdates),
    ...accessStatements,
  ];

  if (sanitizedAttachmentUpdates.length > 0 && attachmentCaps) {
    statements.push(buildModelAttachmentCapSaveStatement(db, attachmentCaps));
  }

  await execStatementsAndLog(
    db,
    statements,
    env,
    user,
    sanitizedUpdates.length,
    sanitizedAttachmentUpdates.length,
    normalizedAccessUpdates.length
  );

  return {
    ok: true,
    updates: sanitizedUpdates.length,
    attachment_updates: sanitizedAttachmentUpdates.length,
    access_updates: normalizedAccessUpdates,
  };
}

/* eslint-disable max-statements */
/* eslint-disable complexity */
async function validateUpdateRequest(req, env, user) {
  const authError = await requireModelAdmin(req, env, user);
  if (authError) return { error: authError };

  if (!env.DB) {
    return { error: error(req, 'Database unavailable', HTTP_STATUS.INTERNAL_SERVER_ERROR) };
  }

  const db = createDB(env.DB);
  const body = await parseRequestBody(req);
  if (body === null) {
    return { error: error(req, 'Invalid JSON body', HTTP_STATUS.BAD_REQUEST) };
  }

  const { updatesInput, attachmentUpdatesInput, accessUpdatesInput } = parseBody(body);

  if (!validateUpdateCounts(updatesInput, attachmentUpdatesInput, accessUpdatesInput)) {
    return { error: error(req, 'Too many updates (max 500)', HTTP_STATUS.BAD_REQUEST) };
  }

  const sanitizedUpdates = sanitizeEnabledUpdates(updatesInput);
  if (sanitizedUpdates.length !== updatesInput.length) {
    return { error: error(req, 'Invalid model id in updates', HTTP_STATUS.BAD_REQUEST) };
  }

  const prepared = await prepareAttachmentAndAccessUpdates(
    db,
    attachmentUpdatesInput,
    accessUpdatesInput
  );
  if (prepared.error) {
    return { error: error(req, prepared.error, HTTP_STATUS.BAD_REQUEST) };
  }
  const { attachmentCaps, sanitizedAttachmentUpdates, sanitizedAccessUpdates } = prepared;

  if (sanitizedAccessUpdates.length > 0) {
    const aclError = await requireAclAccess(req, env, user);
    if (aclError) return { error: aclError };
  }

  if (
    !sanitizedUpdates.length &&
    !sanitizedAttachmentUpdates.length &&
    !sanitizedAccessUpdates.length
  ) {
    return { error: error(req, 'No model changes provided', HTTP_STATUS.BAD_REQUEST) };
  }

  return {
    db,
    sanitizedUpdates,
    sanitizedAttachmentUpdates,
    attachmentCaps,
    sanitizedAccessUpdates,
  };
}

/* eslint-disable max-params -- handler orchestrates multiple steps */
export async function handleAdminModelsSettingsUpdate(req, env, _ctx, user, _path, { logger }) {
  const validation = await validateUpdateRequest(req, env, user);
  if (validation.error) return validation.error;

  const {
    db,
    sanitizedUpdates,
    sanitizedAttachmentUpdates,
    attachmentCaps,
    sanitizedAccessUpdates,
  } = validation;

  try {
    const result = await buildAndExecuteStatements(
      db,
      env,
      user,
      logger,
      sanitizedUpdates,
      sanitizedAttachmentUpdates,
      attachmentCaps,
      sanitizedAccessUpdates
    );
    return json(req, result);
  } catch (err) {
    logger.error('Model settings update failed', { error: err?.message || err });
    if (err.status) {
      return error(
        req,
        err.message,
        err.status,
        err.invalid ? { invalid: err.invalid } : undefined
      );
    }
    return error(req, 'Failed to update model settings', HTTP_STATUS.INTERNAL_SERVER_ERROR);
  }
}
