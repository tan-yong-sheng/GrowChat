/**
 * Admin Connections Access Handlers - /api/admin/openai/connections/access/*
 */
import { error, json } from '../../utils/response.js';
import { logAuditEvent } from '../../utils/authorize.js';
import { filterAclRulesByGroup } from '../../utils/acl-rule-filter.js';
import {
  buildConnectionAclRuleSaveStatements,
  loadConnectionAclRules,
  normalizeConnectionAclRule,
  saveConnectionAclRulesForConnection,
} from '../../utils/connection-acl.js';
import { parseJsonAndRequireAdminAcl } from './admin-helpers.js';
import { getAllOpenAIConnectionConfigs } from '../../llm/connections.js';
import { chunkedBatch } from '../../utils/db-helpers.js';

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
      const rules = await loadConnectionAclRules(db, null, ids.length ? ids : null);
      return json(req, {
        connection_ids: ids,
        groups,
        rules,
      });
    } catch (err) {
      logger.error('Load connection access failed', { error: err?.message || err });
      return error(req, 'Failed to load connection access', 500);
    }
  }

  if (req.method === 'PUT' && path === '/api/admin/openai/connections/access') {
    const { body, error: denied } = await parseJsonAndRequireAdminAcl(req, env, user, 'connection');
    if (denied) return denied;

    const updates = Array.isArray(body.updates) ? body.updates : [];
    if (!updates.length) {
      return error(req, 'No connection access updates provided', 400);
    }
    if (updates.length > 200) {
      return error(req, 'Too many access updates (max 200)', 400);
    }

    try {
      const allConnections = await getAllOpenAIConnectionConfigs(env, {
        includeDisabled: true,
      });
      const groups = await db.all('SELECT id FROM groups');
      const validGroupIds = new Set(groups.map((group) => group.id));
      const statements = [];
      const normalizedUpdates = [];
      let includeSchemaStatements = true;

      for (const update of updates) {
        const connectionId = String(update?.connection_id || update?.connectionId || '').trim();
        if (!connectionId) {
          return error(req, 'connection_id is required', 400);
        }
        const currentConnection = (Array.isArray(allConnections) ? allConnections : []).find(
          (conn) => String(conn.id || '') === String(connectionId)
        );
        if (!currentConnection || currentConnection.enabled === false) {
          return error(req, 'Disabled connections cannot be edited', 409);
        }
        let filteredRules;
        try {
          filteredRules = filterAclRulesByGroup({
            rules: update?.rules,
            resourceId: connectionId,
            resourceIdKey: 'connection_id',
            normalizeRule: normalizeConnectionAclRule,
            validGroupIds,
            invalidTypeMessage: 'Invalid principal_type for connection access',
          });
        } catch (err) {
          if (err.status === 400) {
            return error(req, err.message, 400, { invalid: err.invalid });
          }
          throw err;
        }
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
      return error(req, 'Failed to update connection access', 500);
    }
  }

  const connectionAccessMatch = path.match(/^\/api\/admin\/openai\/connections\/([^/]+)\/access$/);
  if (connectionAccessMatch) {
    const connectionId = (() => {
      try {
        return decodeURIComponent(connectionAccessMatch[1]);
      } catch {
        return connectionAccessMatch[1];
      }
    })();

    if (req.method === 'GET') {
      try {
        const groups = await db.all(
          `SELECT id, name, description, is_system, created_at, updated_at
           FROM groups
           ORDER BY is_system DESC, name ASC`
        );
        const rules = await loadConnectionAclRules(db, connectionId);
        return json(req, {
          connection_id: connectionId,
          groups,
          rules,
        });
      } catch (err) {
        logger.error('Load connection access failed', { error: err?.message || err });
        return error(req, 'Failed to load connection access', 500);
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
        const currentConnection = (Array.isArray(allConnections) ? allConnections : []).find(
          (conn) => String(conn.id || '') === String(connectionId)
        );
        if (!currentConnection || currentConnection.enabled === false) {
          return error(req, 'Disabled connections cannot be edited', 409);
        }
        const groups = await db.all('SELECT id FROM groups');
        const validGroupIds = new Set(groups.map((group) => group.id));
        let filteredRules;
        try {
          filteredRules = filterAclRulesByGroup({
            rules: body.rules,
            resourceId: connectionId,
            resourceIdKey: 'connection_id',
            normalizeRule: normalizeConnectionAclRule,
            validGroupIds,
            invalidTypeMessage: 'Invalid principal_type for connection access',
          });
        } catch (err) {
          if (err.status === 400) {
            return error(req, err.message, 400, { invalid: err.invalid });
          }
          throw err;
        }

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
              rules: savedRules.map((rule) => ({
                principal_type: rule.principal_type,
                principal_id: rule.principal_id,
                effect: rule.effect,
                action: rule.action,
              })),
            },
          },
          logger
        );

        return json(req, {
          connection_id: connectionId,
          rules: savedRules.map((rule) => ({
            principal_type: rule.principal_type,
            principal_id: rule.principal_id,
            effect: rule.effect,
            action: rule.action,
          })),
        });
      } catch (err) {
        logger.error('Update connection access failed', { error: err?.message || err });
        return error(req, 'Failed to update connection access', 500);
      }
    }

    return error(req, 'Method not allowed', 405);
  }

  return null;
}
