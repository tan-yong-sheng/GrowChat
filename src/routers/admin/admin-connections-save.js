/**
 * Admin Connections Save Handler - PUT /api/admin/openai/connections
 */
import { authError, error, json } from '../../utils/response.js';
import { isSafeOutboundUrl } from '../../utils/validation.js';
import { HTTP_STATUS } from '../../shared/http-status.js';
import {
  getAllOpenAIConnectionConfigs,
  getConnectionApiType,
  getConnectionDefaultBaseUrl,
  isConnectionUrlRequired,
  normalizeConnectionManualModels,
} from '../../llm/connections.js';
import { normalizeProviderFamily } from '../../llm/provider-registry.js';
import { normalizeConnectionModelSelectionMode } from '../../../public/js/shared/utils/connection-model-selection.js';
import {
  ensureAdminAclAccess,
  isValidModelAccessId,
  parseJsonAndRequireAdminAcl,
} from './admin-helpers.js';
import { logAuditEvent } from '../../utils/authorize.js';
import { normalizeConnectionAclRule } from '../../utils/connection-acl.js';
import { filterAclRulesByGroup } from '../../utils/acl-rule-filter.js';
import { chunkedBatch } from '../../utils/db-helpers.js';
import { isValidHttpUrl, normalizeHeaders } from '../../admin/tool-servers.js';

const MAX_CONNECTIONS_COUNT = 100;
const MAX_API_KEY_LENGTH = 4096;
const MAX_HEADERS_LENGTH = 4096;
const MAX_CONNECTION_NAME_LENGTH = 120;
const MAX_MODEL_UPDATES_COUNT = 500;

function validateBatchCounts(connections, modelUpdatesInput, req) {
  if (connections.length > MAX_CONNECTIONS_COUNT) {
    return error(
      req,
      'Too many connections (max ' + MAX_CONNECTIONS_COUNT + ')',
      HTTP_STATUS.BAD_REQUEST
    );
  }
  if (modelUpdatesInput.length > MAX_MODEL_UPDATES_COUNT) {
    return error(
      req,
      'Too many model updates (max ' + MAX_MODEL_UPDATES_COUNT + ')',
      HTTP_STATUS.BAD_REQUEST
    );
  }
  return null;
}

async function loadCurrentConnectionMap(env) {
  const currentConnections = await getAllOpenAIConnectionConfigs(env, {
    includeDisabled: true,
  });
  return new Map(
    (Array.isArray(currentConnections) ? currentConnections : []).map((connection) => [
      String(connection.id || ''),
      connection,
    ])
  );
}

function sanitizeConnections(connections, currentConnectionMap) {
  return connections
    .filter((conn) => !conn?.readOnly)
    .map((conn) => sanitizeConnectionInput(conn, currentConnectionMap))
    .filter(Boolean);
}

function processModelUpdates(modelUpdatesInput, req) {
  const updates = modelUpdatesInput
    .map((item) => ({
      id: String(item?.id || '').trim(),
      enabled: item?.enabled !== false,
    }))
    .filter((item) => isValidModelAccessId(item.id));
  if (updates.length !== modelUpdatesInput.length) {
    return error(req, 'Invalid model id in updates', HTTP_STATUS.BAD_REQUEST);
  }
  return updates;
}

function validateAccessUpdateEntry(connectionId, currentConnection, req) {
  if (!connectionId || !currentConnection) {
    return error(req, 'Invalid connection_id in access_updates', HTTP_STATUS.BAD_REQUEST);
  }
  if (currentConnection.enabled === false) {
    return error(req, 'Disabled connections cannot be edited', HTTP_STATUS.CONFLICT);
  }
  return null;
}

function filterAccessRulesForEntry(entry, connectionId, validGroupIds, req) {
  try {
    return filterAclRulesByGroup({
      rules: entry?.rules,
      resourceId: connectionId,
      resourceIdKey: 'connection_id',
      normalizeRule: normalizeConnectionAclRule,
      validGroupIds,
      invalidTypeMessage: 'Invalid principal_type for connection access',
    });
  } catch (err) {
    if (err.status === HTTP_STATUS.BAD_REQUEST) {
      return error(req, err.message, HTTP_STATUS.BAD_REQUEST, { invalid: err.invalid });
    }
    throw err;
  }
}

function processAccessUpdate(entry, currentConnectionMap, validGroupIds, req) {
  const connectionId = String(entry?.connection_id || entry?.connectionId || '').trim();
  const currentConnection = currentConnectionMap.get(connectionId);
  const validationError = validateAccessUpdateEntry(connectionId, currentConnection, req);
  if (validationError) return validationError;
  const filteredRules = filterAccessRulesForEntry(entry, connectionId, validGroupIds, req);
  if (filteredRules instanceof Response) return filteredRules;
  return { connection_id: connectionId, rules: filteredRules };
}

async function checkAccessUpdatesAcl(normalizedAccessUpdates, env, user, req) {
  if (normalizedAccessUpdates.length === 0) return null;
  const aclDecision = await ensureAdminAclAccess({ env, user, resource: 'connection' });
  if (!aclDecision.allow) return authError(req, aclDecision);
  return null;
}

function buildModelAccessStatements(db, modelUpdates) {
  const statements = [];
  for (const update of modelUpdates) {
    statements.push(
      db.prepare(
        `INSERT INTO model_access (model_id, is_enabled, updated_at)
         VALUES (?, ?, unixepoch())
         ON CONFLICT(model_id) DO UPDATE SET is_enabled = excluded.is_enabled, updated_at = unixepoch()`,
        [update.id, update.enabled ? 1 : 0]
      )
    );
  }
  return statements;
}

function buildAccessRuleStatements(db, normalizedAccessUpdates) {
  const statements = [];
  for (const entry of normalizedAccessUpdates) {
    statements.push(
      db.prepare('DELETE FROM connection_acl_rules WHERE connection_id = ?', [entry.connection_id])
    );
    for (const rule of entry.rules) {
      statements.push(
        db.prepare(
          `INSERT INTO connection_acl_rules (id, connection_id, principal_type, principal_id, effect, action, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, unixepoch(), unixepoch())`,
          [
            crypto.randomUUID(),
            rule.connection_id,
            rule.principal_type,
            rule.principal_id,
            rule.effect,
            rule.action,
          ]
        )
      );
    }
  }
  return statements;
}

function buildCoreSchemaStatements(db, sanitized, enabled) {
  return [
    db.prepare(
      `CREATE TABLE IF NOT EXISTS model_access (
        model_id TEXT PRIMARY KEY,
        is_enabled INTEGER NOT NULL DEFAULT 1,
        updated_at INTEGER NOT NULL DEFAULT (unixepoch())
      )`
    ),
    db.prepare('CREATE INDEX IF NOT EXISTS idx_model_access_enabled ON model_access (is_enabled)'),
    db.prepare(
      `CREATE TABLE IF NOT EXISTS connection_acl_rules (
        id TEXT PRIMARY KEY,
        connection_id TEXT NOT NULL,
        principal_type TEXT NOT NULL CHECK (principal_type IN ('user', 'group')),
        principal_id TEXT NOT NULL,
        effect TEXT NOT NULL CHECK (effect IN ('allow', 'deny')),
        action TEXT NOT NULL DEFAULT 'use',
        created_at INTEGER NOT NULL DEFAULT (unixepoch()),
        updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
        UNIQUE(connection_id, principal_type, principal_id, effect, action)
      )`
    ),
    db.prepare(
      'CREATE INDEX IF NOT EXISTS idx_connection_acl_rules_connection_id ON connection_acl_rules(connection_id)'
    ),
    db.prepare(
      'CREATE INDEX IF NOT EXISTS idx_connection_acl_rules_principal ON connection_acl_rules(principal_type, principal_id)'
    ),
    db.prepare(
      'INSERT INTO app_config (key, value, updated_at) VALUES (?, ?, unixepoch()) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = unixepoch()',
      ['openai_connections', JSON.stringify(sanitized)]
    ),
    db.prepare(
      'INSERT INTO app_config (key, value, updated_at) VALUES (?, ?, unixepoch()) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = unixepoch()',
      ['openai_enabled', enabled ? 'true' : 'false']
    ),
  ];
}

function buildAccessUpdateResponse(normalizedAccessUpdates) {
  return normalizedAccessUpdates.map((entry) => ({
    connection_id: entry.connection_id,
    rules: entry.rules.map((rule) => ({
      principal_type: rule.principal_type,
      principal_id: rule.principal_id,
      effect: rule.effect,
      action: rule.action,
    })),
  }));
}

async function executeAndAudit(
  db,
  statements,
  env,
  user,
  sanitized,
  modelUpdates,
  normalizedAccessUpdates,
  logger,
  req
) {
  try {
    await chunkedBatch(db, statements);
    await logAuditEvent(
      env,
      {
        actor_id: user.sub,
        action: 'openai_connections_updated',
        resource_type: 'admin',
        resource_id: 'openai-connections',
        metadata: {
          connections: sanitized.length,
          model_updates: modelUpdates.length,
          access_updates: normalizedAccessUpdates.length,
        },
      },
      logger
    );
    return json(req, {
      ok: true,
      model_updates: modelUpdates.length,
      access_updates: buildAccessUpdateResponse(normalizedAccessUpdates),
    });
  } catch (err) {
    logger.error('OpenAI connections update failed', { error: err?.message || err });
    return error(req, 'Failed to update connections', HTTP_STATUS.INTERNAL_SERVER_ERROR);
  }
}

function processAccessUpdates(accessUpdatesInput, currentConnectionMap, validGroupIds, req) {
  const normalizedAccessUpdates = [];
  for (const entry of accessUpdatesInput) {
    const result = processAccessUpdate(entry, currentConnectionMap, validGroupIds, req);
    if (result instanceof Response) return result;
    normalizedAccessUpdates.push(result);
  }
  return normalizedAccessUpdates;
}

/**
 * Handle handleAdminConnectionsSave routes.
 * Returns Response if handled, null if path doesn't match.
 */
export async function handleAdminConnectionsSave(req, env, ctx, user, path, deps) {
  if (!(req.method === 'PUT' && path === '/api/admin/openai/connections')) {
    return null;
  }
  const { db, logger } = deps;
  const { body, error: denied } = await parseJsonAndRequireAdminAcl(req, env, user, 'connection');
  if (denied) return denied;

  const enabled = typeof body.enabled === 'boolean' ? body.enabled : true;
  const connections = Array.isArray(body.connections) ? body.connections : [];
  const modelUpdatesInput = Array.isArray(body.model_updates) ? body.model_updates : [];
  const accessUpdatesInput = Array.isArray(body.access_updates) ? body.access_updates : [];

  const countError = validateBatchCounts(connections, modelUpdatesInput, req);
  if (countError) return countError;

  let currentConnectionMap;
  let sanitized;
  try {
    currentConnectionMap = await loadCurrentConnectionMap(env);
    sanitized = sanitizeConnections(connections, currentConnectionMap);
  } catch (err) {
    return error(req, err.message || 'Invalid connection data', HTTP_STATUS.BAD_REQUEST);
  }

  const modelUpdatesOrError = processModelUpdates(modelUpdatesInput, req);
  if (modelUpdatesOrError instanceof Response) return modelUpdatesOrError;
  const modelUpdates = modelUpdatesOrError;

  let normalizedAccessUpdates;
  try {
    const groups = await db.all('SELECT id FROM groups');
    const validGroupIds = new Set(groups.map((group) => group.id));
    normalizedAccessUpdates = processAccessUpdates(
      accessUpdatesInput,
      currentConnectionMap,
      validGroupIds,
      req
    );
  } catch (err) {
    logger.error('OpenAI connections update failed', { error: err?.message || err });
    return error(req, 'Failed to update connections', HTTP_STATUS.INTERNAL_SERVER_ERROR);
  }
  if (normalizedAccessUpdates instanceof Response) return normalizedAccessUpdates;

  const aclError = await checkAccessUpdatesAcl(normalizedAccessUpdates, env, user, req);
  if (aclError) return aclError;

  const statements = [
    ...buildCoreSchemaStatements(db, sanitized, enabled),
    ...buildModelAccessStatements(db, modelUpdates),
    ...buildAccessRuleStatements(db, normalizedAccessUpdates),
  ];

  return executeAndAudit(
    db,
    statements,
    env,
    user,
    sanitized,
    modelUpdates,
    normalizedAccessUpdates,
    logger,
    req
  );
}

const ALLOWED_PROVIDER_TYPES = [
  'openai',
  'openai-compatible',
  'google',
  'gemini-compatible',
  'anthropic',
  'claude-compatible',
];

function validateProviderType(providerType) {
  if (!ALLOWED_PROVIDER_TYPES.includes(providerType)) {
    throw new Error(`Provider type must be one of: ${ALLOWED_PROVIDER_TYPES.join(', ')}`);
  }
}

function resolveAndValidateUrl(rawUrl, providerType, providerFamily) {
  const requiresUrl = isConnectionUrlRequired(providerType);
  if (requiresUrl && !rawUrl) {
    throw new Error('Connection URL is required for compatible providers');
  }
  const url = rawUrl || getConnectionDefaultBaseUrl(providerType || providerFamily);
  if (!isValidHttpUrl(url)) {
    throw new Error('Connection URL must start with http:// or https://');
  }
  const bulkUrlSafety = isSafeOutboundUrl(url);
  if (!bulkUrlSafety.safe) {
    throw new Error(bulkUrlSafety.reason);
  }
  return url;
}

function resolveConnectionApiKey(conn, existingConnection) {
  const keyRaw = conn.key !== undefined ? String(conn.key || '').trim() : '';
  if (keyRaw) return keyRaw;
  if (existingConnection?.key && String(existingConnection.key).trim()) {
    return String(existingConnection.key).trim();
  }
  return '';
}

function defaultConnectionName(providerFamily) {
  if (providerFamily === 'google') return 'Gemini Compatible';
  if (providerFamily === 'anthropic') return 'Claude Compatible';
  return 'OpenAI Compatible';
}

function validateConnectionKey(key) {
  if (key.length > MAX_API_KEY_LENGTH) {
    throw new Error('API key is too long');
  }
}

function validateConnectionHeaders(headers) {
  if (headers.length > MAX_HEADERS_LENGTH) {
    throw new Error('Headers are too long');
  }
}

function resolveConnectionProviderType(conn) {
  return String(conn.providerType || 'openai').toLowerCase();
}

function resolveConnectionProviderFamily(providerType, conn) {
  return normalizeProviderFamily(providerType || conn.providerFamily) || 'openai';
}

function resolveConnectionName(conn, providerFamily) {
  return String(conn.name || defaultConnectionName(providerFamily)).slice(
    0,
    MAX_CONNECTION_NAME_LENGTH
  );
}

function resolveManualModelsMode(conn) {
  return (
    normalizeConnectionModelSelectionMode(conn.manualModelsMode || conn.manual_models_mode) || 'all'
  );
}

function sanitizeConnectionInput(conn, currentConnectionMap) {
  const existingConnection = currentConnectionMap.get(String(conn.id || ''));
  const providerType = resolveConnectionProviderType(conn);
  validateProviderType(providerType);
  const providerFamily = resolveConnectionProviderFamily(providerType, conn);
  const rawUrl = String(conn.url || '').trim();
  const url = resolveAndValidateUrl(rawUrl, providerType, providerFamily);
  const key = resolveConnectionApiKey(conn, existingConnection);
  validateConnectionKey(key);
  const headers = normalizeHeaders(conn.headers);
  validateConnectionHeaders(headers);
  return {
    id: conn.id || crypto.randomUUID(),
    name: resolveConnectionName(conn, providerFamily),
    url,
    key,
    headers,
    providerType,
    providerFamily,
    apiType: getConnectionApiType(providerType),
    enabled: conn.enabled !== false,
    manualModels: normalizeConnectionManualModels(conn.manualModels),
    manualModelsMode: resolveManualModelsMode(conn),
  };
}
