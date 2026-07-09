/**
 * Admin Tool Servers Access Handlers - /api/admin/tool-servers/access/*
 */
import { error, json } from '../../utils/response.js';
import { logAuditEvent } from '../../utils/authorize.js';
import { HTTP_STATUS } from '../../shared/http-status.js';
import { filterAclRulesByGroup } from '../../utils/acl-rule-filter.js';
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
      const rules = await loadToolServerAclRules(db, null, ids.length ? ids : null);
      return json(req, {
        tool_server_ids: ids,
        groups,
        rules,
      });
    } catch (err) {
      logger.error('Load tool server access failed', { error: err?.message || err });
      return error(req, 'Failed to load MCP server access', HTTP_STATUS.INTERNAL_SERVER_ERROR);
    }
  }

  if (req.method === 'PUT' && path === '/api/admin/tool-servers/access') {
    const { body, error: denied } = await parseJsonAndRequireAdminAcl(
      req,
      env,
      user,
      'tool-server'
    );
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
      const groups = await db.all('SELECT id FROM groups');
      const validGroupIds = new Set(groups.map((group) => group.id));
      const statements = [];
      const normalizedUpdates = [];
      let includeSchemaStatements = true;

      for (const update of updates) {
        const toolServerId = String(update?.tool_server_id || update?.toolServerId || '').trim();
        if (!toolServerId) {
          return error(req, 'tool_server_id is required', HTTP_STATUS.BAD_REQUEST);
        }
        const currentServer = (Array.isArray(servers) ? servers : []).find(
          (server) => String(server.id || '') === String(toolServerId)
        );
        if (!currentServer || currentServer.enabled === false) {
          return error(req, 'Disabled MCP servers cannot be edited', HTTP_STATUS.CONFLICT);
        }
        let filteredRules;
        try {
          filteredRules = filterAclRulesByGroup({
            rules: update?.rules,
            resourceId: toolServerId,
            resourceIdKey: 'tool_server_id',
            normalizeRule: normalizeToolServerAclRule,
            validGroupIds,
            invalidTypeMessage: 'Invalid principal_type for MCP server access',
          });
        } catch (err) {
          if (err.status === HTTP_STATUS.BAD_REQUEST) {
            return error(req, err.message, HTTP_STATUS.BAD_REQUEST, { invalid: err.invalid });
          }
          throw err;
        }
        const { statements: aclStatements } = buildToolServerAclRuleSaveStatements(
          db,
          toolServerId,
          filteredRules,
          { includeSchemaStatements }
        );
        includeSchemaStatements = false;
        statements.push(...aclStatements);
        normalizedUpdates.push({
          tool_server_id: toolServerId,
          rules: filteredRules,
        });
      }

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
      return json(req, {
        ok: true,
        updates: normalizedUpdates,
      });
    } catch (err) {
      logger.error('Bulk tool server access update failed', { error: err?.message || err });
      return error(req, 'Failed to update MCP server access', HTTP_STATUS.INTERNAL_SERVER_ERROR);
    }
  }

  const toolServerAccessMatch = path.match(/^\/api\/admin\/tool-servers\/([^/]+)\/access$/);
  if (toolServerAccessMatch) {
    const toolServerId = (() => {
      try {
        return decodeURIComponent(toolServerAccessMatch[1]);
      } catch {
        return toolServerAccessMatch[1];
      }
    })();

    if (req.method === 'GET') {
      try {
        const groups = await db.all(
          `SELECT id, name, description, is_system, created_at, updated_at
           FROM groups
           ORDER BY is_system DESC, name ASC`
        );
        const rules = await loadToolServerAclRules(db, toolServerId);
        return json(req, {
          tool_server_id: toolServerId,
          groups,
          rules,
        });
      } catch (err) {
        logger.error('Load tool server access failed', { error: err?.message || err });
        return error(req, 'Failed to load MCP server access', HTTP_STATUS.INTERNAL_SERVER_ERROR);
      }
    }

    if (req.method === 'PUT') {
      const { body, error: denied } = await parseJsonAndRequireAdminAcl(
        req,
        env,
        user,
        'tool-server'
      );
      if (denied) return denied;

      try {
        const servers = await loadToolServers(db);
        const currentServer = (Array.isArray(servers) ? servers : []).find(
          (server) => String(server.id || '') === String(toolServerId)
        );
        if (!currentServer || currentServer.enabled === false) {
          return error(req, 'Disabled MCP servers cannot be edited', HTTP_STATUS.CONFLICT);
        }
        const groups = await db.all('SELECT id FROM groups');
        const validGroupIds = new Set(groups.map((group) => group.id));
        let filteredRules;
        try {
          filteredRules = filterAclRulesByGroup({
            rules: body.rules,
            resourceId: toolServerId,
            resourceIdKey: 'tool_server_id',
            normalizeRule: normalizeToolServerAclRule,
            validGroupIds,
            invalidTypeMessage: 'Invalid principal_type for MCP server access',
            extraRuleFields: { action: 'use' },
          });
        } catch (err) {
          if (err.status === HTTP_STATUS.BAD_REQUEST) {
            return error(req, err.message, HTTP_STATUS.BAD_REQUEST, { invalid: err.invalid });
          }
          throw err;
        }

        const savedRules = await saveToolServerAclRulesForToolServer(
          db,
          toolServerId,
          filteredRules
        );

        await logAuditEvent(
          env,
          {
            actor_id: user.sub,
            action: 'tool_server_access_updated',
            resource_type: 'tool-server',
            resource_id: toolServerId,
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
          tool_server_id: toolServerId,
          rules: savedRules.map((rule) => ({
            principal_type: rule.principal_type,
            principal_id: rule.principal_id,
            effect: rule.effect,
            action: rule.action,
          })),
        });
      } catch (err) {
        logger.error('Update tool server access failed', { error: err?.message || err });
        return error(req, 'Failed to update MCP server access', HTTP_STATUS.INTERNAL_SERVER_ERROR);
      }
    }

    return error(req, 'Method not allowed', HTTP_STATUS.METHOD_NOT_ALLOWED);
  }

  // GET /api/admin/audit-logs - List audit logs

  return null;
}
