/**
 * Admin Connections Access Handlers - /api/admin/openai/connections/access/*
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
  buildConnectionAclRuleSaveStatements,
  loadConnectionAclRules,
  normalizeConnectionAclRule,
  saveConnectionAclRulesForConnection,
} from '../../utils/connection-acl.js';
import { parseJsonAndRequireAdminAcl } from './admin-helpers.js';
import { getAllOpenAIConnectionConfigs } from '../../llm/connections.js';
import { chunkedBatch } from '../../utils/db-helpers.js';

const MAX_ACCESS_UPDATES = 200;

/**
 * Find an enabled connection by ID, or return an error response.
 * @param {string} connectionId
 * @param {Array|ArrayLike} allConnections
 * @param {Request} req
 * @returns {{ connection: object } | { error: Response }}
 */
function findEnabledConnection(connectionId, allConnections, req) {
  const currentConnection = (Array.isArray(allConnections) ? allConnections : []).find(
    (conn) => String(conn.id || '') === String(connectionId)
  );
  if (!currentConnection || currentConnection.enabled === false) {
    return { error: error(req, 'Disabled connections cannot be edited', HTTP_STATUS.CONFLICT) };
  }
  return { connection: currentConnection };
}

/**
 * Handle handleAdminConnectionsAccess routes.
 * Returns Response if handled, null if path doesn't match.
 */
export async function handleAdminConnectionsAccess(
  req,
  env,
  ctx,
  user,
  path,
  { db, logger, _requestContext }
) {
  if (req.method === 'GET' && path === '/api/admin/openai/connections/access') {
    try {
      const ids = parseIdsFromUrl(new URL(req.url));
      const groups = await loadGroups(db);
      const rules = await loadConnectionAclRules(db, null, ids.length ? ids : null);
      return json(req, {
        connection_ids: ids,
        groups,
        rules,
      });
    } catch (err) {
      logger.error('Load connection access failed', { error: err?.message || err });
      return error(req, 'Failed to load connection access', HTTP_STATUS.INTERNAL_SERVER_ERROR);
    }
  }

  if (req.method === 'PUT' && path === '/api/admin/openai/connections/access') {
    const { body, error: denied } = await parseJsonAndRequireAdminAcl(req, env, user, 'connection');
    if (denied) return denied;

    const updates = Array.isArray(body.updates) ? body.updates : [];
    if (!updates.length) {
      return error(req, 'No connection access updates provided', HTTP_STATUS.BAD_REQUEST);
    }
    if (updates.length > MAX_ACCESS_UPDATES) {
      return error(
        req,
        'Too many access updates (max ' + MAX_ACCESS_UPDATES + ')',
        HTTP_STATUS.BAD_REQUEST
      );
    }

    try {
      const allConnections = await getAllOpenAIConnectionConfigs(env, {
        includeDisabled: true,
      });
      const validGroupIds = await getValidGroupIds(db);
      const statements = [];
      const normalizedUpdates = [];
      let includeSchemaStatements = true;

      for (const update of updates) {
        const connectionId = String(update?.connection_id || update?.connectionId || '').trim();
        if (!connectionId) {
          return error(req, 'connection_id is required', HTTP_STATUS.BAD_REQUEST);
        }
        const { connection: currentConnection } = findEnabledConnection(
          connectionId,
          allConnections,
          req
        );
        if (!currentConnection || currentConnection.enabled === false) {
          return error(req, 'Disabled connections cannot be edited', HTTP_STATUS.CONFLICT);
        }
        const { result: filteredRules, error: errResp } = validateAndFilterAclRules({
          rules: update?.rules,
          resourceId: connectionId,
          resourceIdKey: 'connection_id',
          normalizeRule: normalizeConnectionAclRule,
          validGroupIds,
          invalidTypeMessage: 'Invalid principal_type for connection access',
          req,
        });
        if (errResp) return errResp;
        const { statements: aclStatements } = buildConnectionAclRuleSaveStatements(
          db,
          connectionId,
          filteredRules,
          { includeSchemaStatements }
        );
        includeSchemaStatements = false;
        statements.push(...aclStatements);
        normalizedUpdates.push({
          connection_id: connectionId,
          rules: filteredRules,
        });
      }

      await chunkedBatch(db, statements);
      await logAuditEvent(
        env,
        {
          actor_id: user.sub,
          action: 'connection_access_updated',
          resource_type: 'connection',
          resource_id: 'connection-access',
          metadata: { updates: normalizedUpdates.length },
        },
        logger
      );
      return json(req, {
        ok: true,
        updates: normalizedUpdates,
      });
    } catch (err) {
      logger.error('Bulk connection access update failed', { error: err?.message || err });
      return error(req, 'Failed to update connection access', HTTP_STATUS.INTERNAL_SERVER_ERROR);
    }
  }

  const connectionAccessMatch = path.match(/^\/api\/admin\/openai\/connections\/([^/]+)\/access$/);
  if (connectionAccessMatch) {
    const connectionId = extractResourceIdFromPath(connectionAccessMatch);

    if (req.method === 'GET') {
      try {
        const groups = await loadGroups(db);
        const rules = await loadConnectionAclRules(db, connectionId);
        return json(req, {
          connection_id: connectionId,
          groups,
          rules,
        });
      } catch (err) {
        logger.error('Load connection access failed', { error: err?.message || err });
        return error(req, 'Failed to load connection access', HTTP_STATUS.INTERNAL_SERVER_ERROR);
      }
    }

    if (req.method === 'PUT') {
      const { body, error: denied } = await parseJsonAndRequireAdminAcl(
        req,
        env,
        user,
        'connection'
      );
      if (denied) return denied;

      try {
        const allConnections = await getAllOpenAIConnectionConfigs(env, {
          includeDisabled: true,
        });
        const { connection: currentConnection } = findEnabledConnection(
          connectionId,
          allConnections,
          req
        );
        if (!currentConnection || currentConnection.enabled === false) {
          return error(req, 'Disabled connections cannot be edited', HTTP_STATUS.CONFLICT);
        }
        const validGroupIds = await getValidGroupIds(db);
        const { result: filteredRules, error: errResp } = validateAndFilterAclRules({
          rules: body.rules,
          resourceId: connectionId,
          resourceIdKey: 'connection_id',
          normalizeRule: normalizeConnectionAclRule,
          validGroupIds,
          invalidTypeMessage: 'Invalid principal_type for connection access',
          req,
        });
        if (errResp) return errResp;

        const savedRules = await saveConnectionAclRulesForConnection(
          db,
          connectionId,
          filteredRules
        );

        await logAuditEvent(
          env,
          {
            actor_id: user.sub,
            action: 'connection_access_updated',
            resource_type: 'connection',
            resource_id: connectionId,
            metadata: {
              rules: savedRules.map(projectRuleAuditFields),
            },
          },
          logger
        );

        return json(req, {
          connection_id: connectionId,
          rules: savedRules.map(projectRuleAuditFields),
        });
      } catch (err) {
        logger.error('Update connection access failed', { error: err?.message || err });
        return error(req, 'Failed to update connection access', HTTP_STATUS.INTERNAL_SERVER_ERROR);
      }
    }

    return error(req, 'Method not allowed', HTTP_STATUS.METHOD_NOT_ALLOWED);
  }

  return null;
}
