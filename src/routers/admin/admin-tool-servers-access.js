/**
 * Admin Tool Servers Access Handlers - /api/admin/tool-servers/access/*
 */
import { error, json } from '../../utils/response.js';
import { logAuditEvent } from '../../utils/authorize.js';
import { HTTP_STATUS } from '../../shared/http-status.js';
import { validateAndFilterAclRules } from './admin-acl-filter-access-shared.js';
import {
  parseIdsFromUrl,
  loadGroups,
  getValidGroupIds,
  extractResourceIdFromPath,
  projectRuleAuditFields,
} from './admin-acl-groups-shared.js';
import {
  buildToolServerAclRuleSaveStatements,
  loadToolServerAclRules,
  normalizeToolServerAclRule,
  saveToolServerAclRulesForToolServer,
} from '../../utils/tool-server-acl.js';
import { parseJsonAndRequireAdminAcl } from './admin-helpers.js';
import { loadToolServers } from '../../admin/tool-servers.js';
import { chunkedBatch } from '../../utils/db-helpers.js';

const MAX_ACCESS_UPDATES = 200;

/**
 * Find an enabled tool server by ID, or return an error response.
 * @param {string} toolServerId
 * @param {Array|ArrayLike} servers
 * @param {Request} req
 * @returns {{ server: object } | { error: Response }}
 */
function findEnabledServer(toolServerId, servers, req) {
  const currentServer = (Array.isArray(servers) ? servers : []).find(
    (srv) => String(srv.id || '') === String(toolServerId)
  );
  if (!currentServer || currentServer.enabled === false) {
    return { error: error(req, 'Disabled MCP servers cannot be edited', HTTP_STATUS.CONFLICT) };
  }
  return { server: currentServer };
}

async function handleToolServersAccessList(req, db, logger) {
  try {
    const ids = parseIdsFromUrl(new URL(req.url));
    const groups = await loadGroups(db);
    const rules = await loadToolServerAclRules(db, null, ids.length ? ids : null);
    return json(req, { tool_server_ids: ids, groups, rules });
  } catch (err) {
    logger.error('Load tool server access failed', { error: err?.message || err });
    return error(req, 'Failed to load MCP server access', HTTP_STATUS.INTERNAL_SERVER_ERROR);
  }
}

function resolveToolServerId(update, req) {
  const toolServerId = String(update?.tool_server_id || update?.toolServerId || '').trim();
  if (!toolServerId) {
    return { error: error(req, 'tool_server_id is required', HTTP_STATUS.BAD_REQUEST) };
  }
  return { toolServerId };
}

function requireEditableServer(toolServerId, servers, req) {
  const { server: currentServer } = findEnabledServer(toolServerId, servers, req);
  if (!currentServer || currentServer.enabled === false) {
    return {
      error: error(req, 'Disabled MCP servers cannot be edited', HTTP_STATUS.CONFLICT),
    };
  }
  return {};
}

function validateServerRules(update, toolServerId, validGroupIds, req) {
  const { result: filteredRules, error: errResp } = validateAndFilterAclRules({
    rules: update?.rules,
    resourceId: toolServerId,
    resourceIdKey: 'tool_server_id',
    normalizeRule: normalizeToolServerAclRule,
    validGroupIds,
    invalidTypeMessage: 'Invalid principal_type for MCP server access',
    req,
  });
  if (errResp) return { error: errResp };
  return { filteredRules };
}

function buildBulkServerAclStatements(db, updates, servers, validGroupIds, req) {
  const statements = [];
  const normalizedUpdates = [];
  let includeSchemaStatements = true;

  for (const update of updates) {
    const { toolServerId, error: idError } = resolveToolServerId(update, req);
    if (idError) return { error: idError };

    const { error: serverError } = requireEditableServer(toolServerId, servers, req);
    if (serverError) return { error: serverError };

    const { filteredRules, error: rulesError } = validateServerRules(
      update,
      toolServerId,
      validGroupIds,
      req
    );
    if (rulesError) return { error: rulesError };

    const { statements: aclStatements } = buildToolServerAclRuleSaveStatements(
      db,
      toolServerId,
      filteredRules,
      { includeSchemaStatements }
    );
    includeSchemaStatements = false;
    statements.push(...aclStatements);
    normalizedUpdates.push({ tool_server_id: toolServerId, rules: filteredRules });
  }

  return { statements, normalizedUpdates };
}

async function handleToolServersAccessBulkPut(req, env, user, db, logger) {
  const { body, error: denied } = await parseJsonAndRequireAdminAcl(req, env, user, 'tool-server');
  if (denied) return denied;

  const updates = Array.isArray(body.updates) ? body.updates : [];
  if (!updates.length) {
    return error(req, 'No tool server access updates provided', HTTP_STATUS.BAD_REQUEST);
  }
  if (updates.length > MAX_ACCESS_UPDATES) {
    return error(
      req,
      'Too many access updates (max ' + MAX_ACCESS_UPDATES + ')',
      HTTP_STATUS.BAD_REQUEST
    );
  }

  try {
    const servers = await loadToolServers(db);
    const validGroupIds = await getValidGroupIds(db);
    const {
      statements,
      normalizedUpdates,
      error: buildError,
    } = buildBulkServerAclStatements(db, updates, servers, validGroupIds, req);
    if (buildError) return buildError;

    await chunkedBatch(db, statements);
    await logAuditEvent(
      env,
      {
        actor_id: user.sub,
        action: 'tool_server_access_updated',
        resource_type: 'tool-server',
        resource_id: 'tool-server-access',
        metadata: { updates: normalizedUpdates.length },
      },
      logger
    );
    return json(req, { ok: true, updates: normalizedUpdates });
  } catch (err) {
    logger.error('Bulk tool server access update failed', { error: err?.message || err });
    return error(req, 'Failed to update MCP server access', HTTP_STATUS.INTERNAL_SERVER_ERROR);
  }
}

async function handleToolServerAccessGet(req, db, toolServerId, logger) {
  try {
    const groups = await loadGroups(db);
    const rules = await loadToolServerAclRules(db, toolServerId);
    return json(req, { tool_server_id: toolServerId, groups, rules });
  } catch (err) {
    logger.error('Load tool server access failed', { error: err?.message || err });
    return error(req, 'Failed to load MCP server access', HTTP_STATUS.INTERNAL_SERVER_ERROR);
  }
}

async function handleToolServerAccessPut(req, env, user, db, toolServerId, logger) {
  const { body, error: denied } = await parseJsonAndRequireAdminAcl(req, env, user, 'tool-server');
  if (denied) return denied;

  try {
    const servers = await loadToolServers(db);
    const { server: currentServer } = findEnabledServer(toolServerId, servers, req);
    if (!currentServer || currentServer.enabled === false) {
      return error(req, 'Disabled MCP servers cannot be edited', HTTP_STATUS.CONFLICT);
    }
    const validGroupIds = await getValidGroupIds(db);
    const { result: filteredRules, error: errResp } = validateAndFilterAclRules({
      rules: body.rules,
      resourceId: toolServerId,
      resourceIdKey: 'tool_server_id',
      normalizeRule: normalizeToolServerAclRule,
      validGroupIds,
      invalidTypeMessage: 'Invalid principal_type for MCP server access',
      extraRuleFields: { action: 'use' },
      req,
    });
    if (errResp) return errResp;

    const savedRules = await saveToolServerAclRulesForToolServer(db, toolServerId, filteredRules);
    const auditFields = savedRules.map(projectRuleAuditFields);
    await logAuditEvent(
      env,
      {
        actor_id: user.sub,
        action: 'tool_server_access_updated',
        resource_type: 'tool-server',
        resource_id: toolServerId,
        metadata: { rules: auditFields },
      },
      logger
    );
    return json(req, { tool_server_id: toolServerId, rules: auditFields });
  } catch (err) {
    logger.error('Update tool server access failed', { error: err?.message || err });
    return error(req, 'Failed to update MCP server access', HTTP_STATUS.INTERNAL_SERVER_ERROR);
  }
}

/**
 * Handle handleAdminToolServersAccess routes.
 * Returns Response if handled, null if path doesn't match.
 */
export async function handleAdminToolServersAccess(
  req,
  env,
  ctx,
  user,
  path,
  { db, logger, _requestContext }
) {
  if (req.method === 'GET' && path === '/api/admin/tool-servers/access') {
    return handleToolServersAccessList(req, db, logger);
  }

  if (req.method === 'PUT' && path === '/api/admin/tool-servers/access') {
    return handleToolServersAccessBulkPut(req, env, user, db, logger);
  }

  const toolServerAccessMatch = path.match(/^\/api\/admin\/tool-servers\/([^/]+)\/access$/);
  if (toolServerAccessMatch) {
    const toolServerId = extractResourceIdFromPath(toolServerAccessMatch);
    if (req.method === 'GET') {
      return handleToolServerAccessGet(req, db, toolServerId, logger);
    }
    if (req.method === 'PUT') {
      return handleToolServerAccessPut(req, env, user, db, toolServerId, logger);
    }
    return error(req, 'Method not allowed', HTTP_STATUS.METHOD_NOT_ALLOWED);
  }

  return null;
}
