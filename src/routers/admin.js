/**
 * Admin Panel Router
 *
 * Admin configuration and tool management endpoints
 * All endpoints require admin authorization
 */

import { createDB } from '../db.js';
import { error, getConnectionTestFailureMessage, json } from '../utils/response.js';
import { authorize, logAuditEvent, getAuditLog } from '../utils/authorize.js';
import { isSafeOutboundUrl } from '../utils/validation.js';
import { getConfigBool, getConfigValue, setConfigValue } from '../utils/app-config.js';
import { APP_LIMITS, APP_TTLS } from '../config/app.js';
import { ATTACHMENT_CAP_TYPES, MODEL_ATTACHMENT_CAPS_KEY } from '../chat/attachments.js';
import {
  buildConnectionHeaders,
  discoverConnectionModels,
  ensureConnectionId,
  extractConnectionModelId,
  getAllOpenAIConnectionConfigs,
  getConnectionApiType,
  getConnectionDefaultBaseUrl,
  isConnectionUrlRequired,
  normalizeConnectionManualModels,
} from '../llm/connections.js';
import {
  buildConnectionAclRuleSaveStatements,
  loadConnectionAclRules,
  normalizeConnectionAclRule,
  saveConnectionAclRulesForConnection,
} from '../utils/connection-acl.js';
import { normalizeProviderFamily } from '../llm/provider-registry.js';
import { MCP_PROTOCOL_VERSION } from '../mcp/client.js';
import {
  buildAuthorizationUrl,
  discoverAuthorizationMetadata,
  isValidHttpUrl,
  loadToolServers,
  mergeToolServer,
  mergeToolSpecs,
  normalizeAuthType,
  normalizeAttachmentCaps,
  normalizeBaseUrl,
  normalizeHeaders,
  normalizeModelId,
  normalizeTokenAuthMethod,
  parseHeadersForRequest,
  randomString,
  redactToolServer,
  saveToolServers,
  selectTokenAuthMethod,
  sha256Base64Url,
} from '../admin/tool-servers.js';
import { normalizeConnectionModelSelectionMode } from '../../public/js/shared/utils/connection-model-selection.js';
import { createLogger } from '../utils/logger.js';
import {
  buildToolServerAclRuleSaveStatements,
  loadToolServerAclRules,
  normalizeToolServerAclRule,
  saveToolServerAclRulesForToolServer,
} from '../utils/tool-server-acl.js';
import { mcpNotify, mcpRequest } from '../mcp/client.js';

function isValidModelAccessId(value) {
  const id = String(value || '').trim();
  if (!id) return false;
  if (id.length > 200) return false;
  if (/\s/.test(id)) return false;
  return true;
}

/**
 * Resolve required permission for an admin route.
 * Keeps the permission policy visible in one place instead of
 * scattered across sequential if-statements.
 */
function resolveAdminPermission(path, method) {
  // Read-only GET requests default to read permission.
  if (method === 'GET') return 'admin.user.read';

  // PUT on config needs write permission.
  if (path === '/api/admin/config' && method === 'PUT') return 'admin.user.write';

  // All other admin mutations (POST, DELETE, PUT) need full admin permission.
  return 'admin.rbac.admin';
}

// Keep ACL and mutation permissions explicit at the branch level so the route
// policy is visible where the write happens, not only at the top-level router.
async function ensureAdminAclAccess(env, user, resource = 'admin') {
  return authorize(env, user, {
    action: 'admin.rbac.admin',
    resource,
  });
}

async function ensureAdminMutationAccess(env, user, permission, resource = 'admin') {
  return authorize(env, user, {
    action: permission,
    resource,
  });
}

/**
 * Admin Router Handler
 */
export async function adminRouter(req, env, ctx, user, path, requestContext = {}) {
  const logger =
    requestContext.logger || createLogger(env, { requestId: requestContext.requestId });
  if (!path.startsWith('/api/admin/')) return null;

  const requiredPermission = resolveAdminPermission(path, req.method);
  const skipAuth = path === '/api/admin/tool-servers/oauth/callback';
  if (!skipAuth) {
    const authDecision = await authorize(env, user, {
      action: requiredPermission,
    });
    if (!authDecision.allow) {
      return error(req, authDecision.reason || 'Forbidden', 403);
    }
  }

  const db = createDB(env.DB);

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
    let body;
    try {
      body = await req.json();
    } catch {
      return error(req, 'Invalid JSON body', 400);
    }

    const aclDecision = await ensureAdminAclAccess(env, user, 'connection');
    if (!aclDecision.allow) {
      return error(req, aclDecision.reason || 'Forbidden', 403);
    }

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
        const incomingRules = Array.isArray(update?.rules) ? update.rules : [];
        const filteredRules = [];
        const invalidPrincipalTypes = [];
        for (const rule of incomingRules) {
          const normalized = normalizeConnectionAclRule({
            ...rule,
            connection_id: connectionId,
          });
          if (!normalized) continue;
          if (normalized.principal_type !== 'group') {
            invalidPrincipalTypes.push(normalized.principal_type);
            continue;
          }
          if (!validGroupIds.has(normalized.principal_id)) continue;
          filteredRules.push(normalized);
        }
        if (invalidPrincipalTypes.length) {
          return error(req, 'Invalid principal_type for connection access', 400, {
            invalid: Array.from(new Set(invalidPrincipalTypes)),
          });
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

      await db.batch(statements);
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
      let body;
      try {
        body = await req.json();
      } catch {
        return error(req, 'Invalid JSON body', 400);
      }

      // Connection access writes are ACL-sensitive and must stay explicit here.
      const aclDecision = await ensureAdminAclAccess(env, user, 'connection');
      if (!aclDecision.allow) {
        return error(req, aclDecision.reason || 'Forbidden', 403);
      }

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
        const incomingRules = Array.isArray(body.rules) ? body.rules : [];
        const filteredRules = [];
        const invalidPrincipalTypes = [];
        for (const rule of incomingRules) {
          const normalized = normalizeConnectionAclRule({
            ...rule,
            connection_id: connectionId,
          });
          if (!normalized) continue;
          if (normalized.principal_type !== 'group') {
            invalidPrincipalTypes.push(normalized.principal_type);
            continue;
          }
          if (!validGroupIds.has(normalized.principal_id)) continue;
          filteredRules.push(normalized);
        }
        if (invalidPrincipalTypes.length) {
          return error(req, 'Invalid principal_type for connection access', 400, {
            invalid: Array.from(new Set(invalidPrincipalTypes)),
          });
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
      return error(req, 'Failed to load MCP server access', 500);
    }
  }

  if (req.method === 'PUT' && path === '/api/admin/tool-servers/access') {
    let body;
    try {
      body = await req.json();
    } catch {
      return error(req, 'Invalid JSON body', 400);
    }

    const aclDecision = await ensureAdminAclAccess(env, user, 'tool-server');
    if (!aclDecision.allow) {
      return error(req, aclDecision.reason || 'Forbidden', 403);
    }

    const updates = Array.isArray(body.updates) ? body.updates : [];
    if (!updates.length) {
      return error(req, 'No tool server access updates provided', 400);
    }
    if (updates.length > 200) {
      return error(req, 'Too many access updates (max 200)', 400);
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
          return error(req, 'tool_server_id is required', 400);
        }
        const currentServer = (Array.isArray(servers) ? servers : []).find(
          (server) => String(server.id || '') === String(toolServerId)
        );
        if (!currentServer || currentServer.enabled === false) {
          return error(req, 'Disabled MCP servers cannot be edited', 409);
        }
        const incomingRules = Array.isArray(update?.rules) ? update.rules : [];
        const filteredRules = [];
        const invalidPrincipalTypes = [];
        for (const rule of incomingRules) {
          const normalized = normalizeToolServerAclRule({
            ...rule,
            tool_server_id: toolServerId,
          });
          if (!normalized) continue;
          if (normalized.principal_type !== 'group') {
            invalidPrincipalTypes.push(normalized.principal_type);
            continue;
          }
          if (!validGroupIds.has(normalized.principal_id)) continue;
          filteredRules.push(normalized);
        }
        if (invalidPrincipalTypes.length) {
          return error(req, 'Invalid principal_type for MCP server access', 400, {
            invalid: Array.from(new Set(invalidPrincipalTypes)),
          });
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

      await db.batch(statements);
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
      return error(req, 'Failed to update MCP server access', 500);
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
        return error(req, 'Failed to load MCP server access', 500);
      }
    }

    if (req.method === 'PUT') {
      let body;
      try {
        body = await req.json();
      } catch {
        return error(req, 'Invalid JSON body', 400);
      }

      const aclDecision = await ensureAdminAclAccess(env, user, 'tool-server');
      if (!aclDecision.allow) {
        return error(req, aclDecision.reason || 'Forbidden', 403);
      }

      try {
        const servers = await loadToolServers(db);
        const currentServer = (Array.isArray(servers) ? servers : []).find(
          (server) => String(server.id || '') === String(toolServerId)
        );
        if (!currentServer || currentServer.enabled === false) {
          return error(req, 'Disabled MCP servers cannot be edited', 409);
        }
        const groups = await db.all('SELECT id FROM groups');
        const validGroupIds = new Set(groups.map((group) => group.id));
        const incomingRules = Array.isArray(body.rules) ? body.rules : [];
        const filteredRules = [];
        const invalidPrincipalTypes = [];
        for (const rule of incomingRules) {
          const normalized = normalizeToolServerAclRule({
            ...rule,
            tool_server_id: toolServerId,
            action: 'use',
          });
          if (!normalized) continue;
          if (normalized.principal_type !== 'group') {
            invalidPrincipalTypes.push(normalized.principal_type);
            continue;
          }
          if (!validGroupIds.has(normalized.principal_id)) continue;
          filteredRules.push(normalized);
        }
        if (invalidPrincipalTypes.length) {
          return error(req, 'Invalid principal_type for MCP server access', 400, {
            invalid: Array.from(new Set(invalidPrincipalTypes)),
          });
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
        return error(req, 'Failed to update MCP server access', 500);
      }
    }

    return error(req, 'Method not allowed', 405);
  }

  // GET /api/admin/audit-logs - List audit logs
  if (req.method === 'GET' && path === '/api/admin/audit-logs') {
    try {
      const url = new URL(req.url);
      const actor_id = url.searchParams.get('userId') || undefined;
      const action = url.searchParams.get('action') || undefined;
      const limit = parseInt(url.searchParams.get('limit') || '50', 10);
      const offset = parseInt(url.searchParams.get('offset') || '0', 10);

      const result = await getAuditLog(env, {
        actor_id,
        action,
        limit,
        offset,
      });
      // Map column names for frontend compatibility
      const mappedLogs = (result.entries || []).map((entry) => ({
        ...entry,
        user_id: entry.actor_id,
        user_email: null, // Not stored in audit_log
        details: entry.metadata,
      }));
      return json(req, {
        logs: mappedLogs,
        total: result.total || mappedLogs.length,
      });
    } catch (err) {
      logger.error('Audit logs fetch failed', { error: err?.message || err });
      return error(req, 'Failed to fetch audit logs', 500);
    }
  }

  // GET /api/admin/config - Fetch admin configuration
  if (req.method === 'GET' && path === '/api/admin/config') {
    try {
      const publicRegistration = await getConfigBool(db, 'public_registration', true);
      const registrationStatusRaw = await getConfigValue(
        db,
        'public_registration_status',
        'pending'
      );
      const defaultModelIdRaw = await getConfigValue(db, 'default_model_id', null);
      const registrationStatus =
        String(registrationStatusRaw || 'pending')
          .trim()
          .toLowerCase() === 'active'
          ? 'active'
          : 'pending';
      const defaultModelId = defaultModelIdRaw ? String(defaultModelIdRaw).trim() : null;
      return json(req, {
        public_registration: publicRegistration,
        public_registration_status: registrationStatus,
        default_model_id: defaultModelId || null,
      });
    } catch (err) {
      logger.error('Admin config fetch failed', { error: err?.message || err });
      return error(req, 'Failed to fetch admin config', 500);
    }
  }

  // PUT /api/admin/config - Update admin configuration
  if (req.method === 'PUT' && path === '/api/admin/config') {
    let body;
    try {
      body = await req.json();
    } catch {
      return error(req, 'Invalid JSON body', 400);
    }

    const writeDecision = await ensureAdminMutationAccess(env, user, 'admin.user.write', 'admin');
    if (!writeDecision.allow) {
      return error(req, writeDecision.reason || 'Forbidden', 403);
    }

    const hasPublicRegistration = body.public_registration !== undefined;
    const hasRegistrationStatus = body.public_registration_status !== undefined;
    const hasDefaultModel = body.default_model_id !== undefined;

    if (!hasPublicRegistration && !hasRegistrationStatus && !hasDefaultModel) {
      return error(req, 'No config changes provided', 400);
    }

    if (hasPublicRegistration && typeof body.public_registration !== 'boolean') {
      return error(req, 'public_registration must be a boolean', 400);
    }

    let normalizedRegistrationStatus = null;
    if (hasRegistrationStatus) {
      if (typeof body.public_registration_status !== 'string') {
        return error(req, 'public_registration_status must be a string', 400);
      }
      normalizedRegistrationStatus = String(body.public_registration_status).trim().toLowerCase();
      if (!['active', 'pending'].includes(normalizedRegistrationStatus)) {
        return error(req, 'public_registration_status must be "active" or "pending"', 400);
      }
    }

    let normalizedDefaultModel = null;
    if (hasDefaultModel) {
      if (body.default_model_id === null || body.default_model_id === '') {
        normalizedDefaultModel = '';
      } else if (typeof body.default_model_id !== 'string') {
        return error(req, 'default_model_id must be a string or null', 400);
      } else {
        normalizedDefaultModel = String(body.default_model_id).trim();
        if (!normalizedDefaultModel) normalizedDefaultModel = '';
        if (normalizedDefaultModel.length > 200 || /\s/.test(normalizedDefaultModel)) {
          return error(req, 'default_model_id is invalid', 400);
        }
      }
    }

    try {
      if (hasPublicRegistration) {
        await setConfigValue(
          db,
          'public_registration',
          body.public_registration ? 'true' : 'false'
        );
      }
      if (hasRegistrationStatus) {
        await setConfigValue(db, 'public_registration_status', normalizedRegistrationStatus);
      }
      if (hasDefaultModel) {
        await setConfigValue(db, 'default_model_id', normalizedDefaultModel);
      }
      await logAuditEvent(
        env,
        {
          actor_id: user.sub,
          action: 'admin_config_updated',
          resource_type: 'admin',
          resource_id: 'config',
        },
        logger
      );
      return json(req, {
        public_registration: hasPublicRegistration ? body.public_registration : undefined,
        public_registration_status: hasRegistrationStatus
          ? normalizedRegistrationStatus
          : undefined,
        default_model_id: hasDefaultModel ? normalizedDefaultModel || null : undefined,
      });
    } catch (err) {
      logger.error('Admin config update failed', { error: err?.message || err });
      return error(req, 'Failed to update admin config', 500);
    }
  }

  // GET /api/admin/model-attachment-caps - Fetch per-model attachment capabilities
  if (req.method === 'GET' && path === '/api/admin/model-attachment-caps') {
    try {
      const raw = await getConfigValue(db, MODEL_ATTACHMENT_CAPS_KEY, '{}');
      let caps = {};
      try {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
          caps = parsed;
        }
      } catch {
        caps = {};
      }
      return json(req, {
        caps,
        supported_types: ATTACHMENT_CAP_TYPES,
      });
    } catch (err) {
      logger.error('Attachment caps fetch failed', { error: err?.message || err });
      return error(req, 'Failed to fetch attachment caps', 500);
    }
  }

  // PUT /api/admin/model-attachment-caps - Update per-model attachment capabilities
  if (req.method === 'PUT' && path === '/api/admin/model-attachment-caps') {
    let body;
    try {
      body = await req.json();
    } catch {
      return error(req, 'Invalid JSON body', 400);
    }

    const aclDecision = await ensureAdminAclAccess(env, user, 'model');
    if (!aclDecision.allow) {
      return error(req, aclDecision.reason || 'Forbidden', 403);
    }

    const replaceCaps = body.caps && typeof body.caps === 'object' && !Array.isArray(body.caps);
    const updates = Array.isArray(body.updates) ? body.updates : [];
    const remove = Array.isArray(body.remove) ? body.remove : [];

    if (!replaceCaps && !updates.length && !remove.length) {
      return error(req, 'No attachment cap changes provided', 400);
    }

    try {
      if (replaceCaps) {
        const nextCaps = {};
        for (const [modelId, entry] of Object.entries(body.caps)) {
          const normalizedId = normalizeModelId(modelId);
          if (!normalizedId) continue;
          const attachmentsInput = entry?.attachments ?? entry;
          const attachments = normalizeAttachmentCaps(attachmentsInput);
          nextCaps[normalizedId] = {
            ...(entry && typeof entry === 'object' && !Array.isArray(entry) ? entry : {}),
            attachments,
            updated_at: Date.now(),
          };
        }
        await setConfigValue(db, MODEL_ATTACHMENT_CAPS_KEY, JSON.stringify(nextCaps));
        await logAuditEvent(
          env,
          {
            actor_id: user.sub,
            action: 'attachment_caps_replaced',
            resource_type: 'admin',
            resource_id: 'model-attachment-caps',
          },
          logger
        );
        return json(req, { caps: nextCaps });
      }

      const raw = await getConfigValue(db, MODEL_ATTACHMENT_CAPS_KEY, '{}');
      let caps = {};
      try {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
          caps = parsed;
        }
      } catch {
        caps = {};
      }

      for (const update of updates) {
        const modelId = normalizeModelId(update?.model_id);
        if (!modelId) {
          throw new Error('model_id is required');
        }
        const patch = normalizeAttachmentCaps(update?.attachments, {
          allowNull: true,
        });
        const current = caps[modelId] && typeof caps[modelId] === 'object' ? caps[modelId] : {};
        const nextAttachments = { ...(current.attachments || {}) };
        for (const [key, value] of Object.entries(patch)) {
          if (value === null) {
            delete nextAttachments[key];
          } else {
            nextAttachments[key] = value;
          }
        }
        caps[modelId] = {
          ...current,
          attachments: nextAttachments,
          updated_at: Date.now(),
        };
      }

      for (const id of remove) {
        const normalizedId = normalizeModelId(id);
        if (!normalizedId) continue;
        delete caps[normalizedId];
      }

      await setConfigValue(db, MODEL_ATTACHMENT_CAPS_KEY, JSON.stringify(caps));
      await logAuditEvent(
        env,
        {
          actor_id: user.sub,
          action: 'attachment_caps_updated',
          resource_type: 'admin',
          resource_id: 'model-attachment-caps',
        },
        logger
      );

      return json(req, { caps });
    } catch (err) {
      return error(req, err?.message || 'Invalid attachment cap data', 400);
    }
  }

  // GET /api/admin/openai/connections - List OpenAI connections
  if (req.method === 'GET' && path === '/api/admin/openai/connections') {
    try {
      const url = new URL(req.url);
      const includeDisabled = ['1', 'true', 'yes'].includes(
        String(url.searchParams.get('include_disabled') || '').toLowerCase()
      );
      let manualConnections = [];
      const raw = await getConfigValue(db, 'openai_connections', '[]');
      try {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          manualConnections = parsed.map((conn, index) => ({
            ...conn,
            id: ensureConnectionId(conn, index),
            providerType: String(conn?.providerType || 'openai-compatible').toLowerCase(),
            providerFamily:
              normalizeProviderFamily(conn?.providerType || conn?.providerFamily) || 'openai',
            hasKey: Boolean(conn?.key || conn?.keyMasked || conn?.hasKey || conn?.has_key),
            keyMasked: conn?.keyMasked || (conn?.key ? `••••${String(conn.key).slice(-4)}` : ''),
            key: undefined,
            readOnly: false,
            source: 'config',
            enabled: conn?.enabled !== false,
          }));
        }
      } catch {
        manualConnections = [];
      }
      const enabledRaw = await getConfigValue(db, 'openai_enabled', 'true');
      const enabled = String(enabledRaw).toLowerCase() !== 'false';

      return json(req, {
        enabled,
        connections: includeDisabled
          ? manualConnections
          : manualConnections.filter((connection) => connection.enabled !== false),
      });
    } catch (err) {
      logger.error('OpenAI connections fetch failed', { error: err?.message || err });
      return error(req, 'Failed to fetch connections', 500);
    }
  }

  // POST /api/admin/openai/connections/test - Test OpenAI connection
  if (req.method === 'POST' && path === '/api/admin/openai/connections/test') {
    let body;
    try {
      body = await req.json();
    } catch {
      return error(req, 'Invalid JSON body', 400);
    }

    const aclDecision = await ensureAdminAclAccess(env, user, 'connection');
    if (!aclDecision.allow) {
      return error(req, aclDecision.reason || 'Forbidden', 403);
    }

    const providerType = String(body.providerType || 'openai').toLowerCase();
    const providerFamily =
      normalizeProviderFamily(body.providerType || body.providerFamily) || 'openai';
    const url = String(body.url || '').trim();
    const connectionId = String(body.id || body.connectionId || '').trim();
    const requiresUrl = isConnectionUrlRequired(providerType);
    const baseUrl = url || getConnectionDefaultBaseUrl(providerType || providerFamily);
    if (requiresUrl && !url) {
      return error(req, 'Connection URL is required for compatible providers', 400);
    }
    if (!isValidHttpUrl(baseUrl)) {
      return error(req, 'Connection URL must start with http:// or https://', 400);
    }
    const urlSafety = isSafeOutboundUrl(baseUrl);
    if (!urlSafety.safe) {
      return error(req, urlSafety.reason, 400);
    }

    const key = String(body.key || '').trim();
    let headers = {};
    try {
      headers = parseHeadersForRequest(body.headers);
    } catch (err) {
      return error(req, err.message || 'Headers must be valid JSON', 400);
    }

    try {
      let existingConnection = null;
      if (connectionId) {
        const existingConnections = await getAllOpenAIConnectionConfigs(env, {
          includeDisabled: true,
        });
        existingConnection =
          (Array.isArray(existingConnections) ? existingConnections : []).find(
            (connection) => String(connection.id || '') === connectionId
          ) || null;
      }
      const rawAuthType = String(
        body.authType ||
          body.auth_type ||
          existingConnection?.authType ||
          existingConnection?.auth_type ||
          ''
      )
        .trim()
        .toLowerCase();
      const authType = ['bearer', 'x-api-key', 'x-goog-api-key', 'api-key'].includes(rawAuthType)
        ? rawAuthType
        : '';
      const testConnection = {
        providerType,
        providerFamily,
        authType,
        key: key || String(existingConnection?.key || '').trim(),
        headers,
        baseUrl: normalizeBaseUrl(baseUrl),
      };
      const discovery = await discoverConnectionModels(testConnection, {
        headers: buildConnectionHeaders(testConnection),
      });
      if (!discovery.items.length) {
        const upstreamMessage = discovery.error?.message || 'No models discovered';
        const upstreamStatus = discovery.error?.status;
        logger.warn('Connection test failed', {
          status: upstreamStatus,
          url: discovery.error?.url,
          upstreamMessage,
        });
        const safeReason = getConnectionTestFailureMessage(upstreamStatus);
        return error(req, 'Connection failed', 502, {
          message: safeReason,
        });
      }

      return json(req, {
        ok: true,
        message: 'Connection successful',
        discovery_url: discovery.url,
        models: discovery.items
          .map((item) => {
            const rawId = extractConnectionModelId(item);
            const displayName = String(
              item?.displayName || item?.display_name || item?.name || item?.id || rawId || ''
            ).trim();
            return {
              id: rawId,
              name: displayName.startsWith('models/')
                ? displayName.slice('models/'.length)
                : displayName,
            };
          })
          .filter((item) => Boolean(item.id)),
      });
    } catch (err) {
      return error(req, 'Connection failed', 502, {
        message: err?.message || String(err),
      });
    }
  }

  // GET /api/admin/tool-servers - List tool servers
  if (req.method === 'GET' && path === '/api/admin/tool-servers') {
    try {
      const url = new URL(req.url);
      const includeDisabled = ['1', 'true', 'yes'].includes(
        String(url.searchParams.get('include_disabled') || '').toLowerCase()
      );
      const servers = await loadToolServers(db);
      const filtered = includeDisabled
        ? servers
        : servers.filter((server) => server.enabled !== false);
      return json(req, { servers: filtered.map(redactToolServer) });
    } catch (err) {
      logger.error('Tool servers fetch failed', { error: err?.message || err });
      return error(req, 'Failed to fetch tool servers', 500);
    }
  }

  // POST /api/admin/tool-servers/test - Test MCP tool server connection + list tools
  if (req.method === 'POST' && path === '/api/admin/tool-servers/test') {
    let body;
    try {
      body = await req.json();
    } catch {
      return error(req, 'Invalid JSON body', 400);
    }

    const aclDecision = await ensureAdminAclAccess(env, user, 'tool-server');
    if (!aclDecision.allow) {
      return error(req, aclDecision.reason || 'Forbidden', 403);
    }

    const url = String(body.url || '').trim();
    if (!url || !isValidHttpUrl(url)) {
      return error(req, 'Server URL must start with http:// or https://', 400);
    }
    const serverUrlSafety = isSafeOutboundUrl(url);
    if (!serverUrlSafety.safe) {
      return error(req, serverUrlSafety.reason, 400);
    }

    let headers = {};
    try {
      headers = parseHeadersForRequest(body.headers);
    } catch (err) {
      return error(req, err.message || 'Headers must be valid JSON', 400);
    }

    const authType = normalizeAuthType(body.auth_type);
    if (authType === 'bearer') {
      const token = String(body.auth_bearer_token || '').trim();
      if (token && !headers.Authorization) {
        headers.Authorization = `Bearer ${token}`;
      }
    }

    if (authType === 'basic') {
      const user = String(body.auth_basic_username || '').trim();
      const pass = String(body.auth_basic_password || '');
      if (user && !headers.Authorization) {
        headers.Authorization = `Basic ${btoa(`${user}:${pass}`)}`;
      }
    }

    if (authType === 'oauth') {
      const serverId = String(body.id || '').trim();
      if (!serverId) {
        return error(req, 'Server must be saved before OAuth verification', 400);
      }
      const servers = await loadToolServers(db);
      const server = servers.find((entry) => String(entry.id) === serverId);
      const accessToken = server?.oauth_tokens?.access_token;
      if (!accessToken) {
        return error(req, 'OAuth not connected yet. Click Connect OAuth first.', 400);
      }
      headers.Authorization = `Bearer ${accessToken}`;
    }

    try {
      let sessionId;
      const init = await mcpRequest({
        url,
        headers,
        sessionId,
        id: 0,
        method: 'initialize',
        params: {
          protocolVersion: MCP_PROTOCOL_VERSION,
          capabilities: {},
          clientInfo: { name: 'GrowChat', version: '1.0.0' },
        },
      });
      sessionId = init.sessionId;

      const notified = await mcpNotify({
        url,
        headers,
        sessionId,
        method: 'notifications/initialized',
      });
      sessionId = notified.sessionId;

      const toolsResult = await mcpRequest({
        url,
        headers,
        sessionId,
        id: 2,
        method: 'tools/list',
      });

      const tools = Array.isArray(toolsResult.result?.tools) ? toolsResult.result.tools : [];
      const toolSummaries = tools
        .map((tool) => {
          const parameters =
            tool?.inputSchema && typeof tool.inputSchema === 'object'
              ? tool.inputSchema
              : tool?.parameters && typeof tool.parameters === 'object'
                ? tool.parameters
                : {};
          return {
            name: String(tool?.name || '').trim(),
            title: String(tool?.title || '').trim(),
            description: String(tool?.description || '').trim(),
            parameters,
          };
        })
        .filter((tool) => tool.name);
      let mergedTools = toolSummaries;

      if (body.id) {
        const servers = await loadToolServers(db);
        const index = servers.findIndex((entry) => String(entry.id) === String(body.id));
        if (index !== -1) {
          mergedTools = mergeToolSpecs(servers[index].tools, toolSummaries);
          servers[index] = {
            ...servers[index],
            tools: mergedTools,
            tools_error: '',
            tools_verified_at: new Date().toISOString(),
          };
          await saveToolServers(db, servers);
        }
      }

      return json(req, {
        ok: true,
        message: 'Connection successful',
        tools: mergedTools,
      });
    } catch (err) {
      if (body?.id) {
        try {
          const servers = await loadToolServers(db);
          const index = servers.findIndex((entry) => String(entry.id) === String(body.id));
          if (index !== -1) {
            servers[index] = {
              ...servers[index],
              tools_error: err?.message || 'Connection failed',
              tools_verified_at: new Date().toISOString(),
            };
            await saveToolServers(db, servers);
          }
        } catch (persistErr) {
          logger.warn('Failed to persist tool server error', {
            error: persistErr?.message || persistErr,
          });
        }
      }
      return error(req, 'Connection failed', 502, {
        message: err?.message || String(err),
      });
    }
  }

  // POST /api/admin/tool-servers/oauth/start - Begin OAuth flow for MCP server
  if (req.method === 'POST' && path === '/api/admin/tool-servers/oauth/start') {
    let body;
    try {
      body = await req.json();
    } catch {
      return error(req, 'Invalid JSON body', 400);
    }

    const aclDecision = await ensureAdminAclAccess(env, user, 'tool-server');
    if (!aclDecision.allow) {
      return error(req, aclDecision.reason || 'Forbidden', 403);
    }

    const serverId = String(body.id || '').trim();
    if (!serverId) {
      return error(req, 'Server must be saved before OAuth connect', 400);
    }

    const servers = await loadToolServers(db);
    const serverIndex = servers.findIndex((entry) => String(entry.id) === serverId);
    const existingServer = serverIndex === -1 ? null : servers[serverIndex];
    const serverUrl = String(body.url || existingServer?.url || '').trim();
    if (!serverUrl || !isValidHttpUrl(serverUrl)) {
      return error(req, 'Server URL must start with http:// or https://', 400);
    }
    const oauthUrlSafety = isSafeOutboundUrl(serverUrl);
    if (!oauthUrlSafety.safe) {
      return error(req, oauthUrlSafety.reason, 400);
    }

    if (!existingServer) {
      return error(req, 'Server must be saved before OAuth connect', 400);
    }

    const server = existingServer;
    const oauthClientName = String(
      body.oauth_client_name || server.oauth_client_name || 'GrowChat MCP Client'
    ).trim();
    const oauthScope = String(body.oauth_scope || server.oauth_scope || '').trim();
    const authServerUrl = String(
      body.oauth_authorization_server || server.oauth_authorization_server || serverUrl
    ).trim();

    const redirectUri = new URL(req.url).origin + '/api/admin/tool-servers/oauth/callback';

    let metadata = null;
    try {
      metadata = await discoverAuthorizationMetadata(authServerUrl);
    } catch {
      metadata = null;
    }

    let clientId = String(body.oauth_client_id || server.oauth_client_id || '').trim();
    let clientSecret = String(body.oauth_client_secret || server.oauth_client_secret || '').trim();
    let registrationEndpoint =
      metadata?.registration_endpoint || server.oauth_registration_endpoint || '';

    if (!clientId) {
      if (!registrationEndpoint) {
        return error(req, 'Authorization server does not support dynamic client registration', 400);
      }
      try {
        const registrationPayload = {
          client_name: oauthClientName,
          redirect_uris: [redirectUri],
          grant_types: ['authorization_code', 'refresh_token'],
          response_types: ['code'],
        };
        const registrationRes = await fetch(registrationEndpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(registrationPayload),
        });
        if (!registrationRes.ok) {
          const text = await registrationRes.text().catch(() => '');
          return error(req, 'Client registration failed', 502, {
            message: text,
          });
        }
        const registrationData = await registrationRes.json();
        clientId = String(registrationData.client_id || '').trim();
        clientSecret = String(registrationData.client_secret || '').trim();
      } catch (err) {
        return error(req, 'Client registration failed', 502, {
          message: err?.message || String(err),
        });
      }
    }

    if (!clientId) {
      return error(req, 'OAuth client ID is required', 400);
    }

    const tokenAuthMethod =
      normalizeTokenAuthMethod(body.oauth_token_auth_method || server.oauth_token_auth_method) ||
      selectTokenAuthMethod(
        metadata?.token_endpoint_auth_methods_supported || [],
        Boolean(clientSecret)
      );

    const codeVerifier = randomString(64);
    const codeChallenge = await sha256Base64Url(codeVerifier);
    const state = randomString(32);
    const authorizationEndpoint =
      metadata?.authorization_endpoint || new URL('/authorize', authServerUrl).toString();
    const tokenEndpoint = metadata?.token_endpoint || new URL('/token', authServerUrl).toString();

    const authorizationUrl = buildAuthorizationUrl({
      authorizationEndpoint,
      clientId,
      redirectUri,
      scope: oauthScope,
      state,
      codeChallenge,
    });

    const persistedServer = {
      ...server,
      auth_type: 'oauth',
      oauth_client_name: oauthClientName,
      oauth_scope: oauthScope,
      oauth_client_id: clientId,
      oauth_client_secret: clientSecret,
      oauth_authorization_server: authServerUrl,
      oauth_token_endpoint: tokenEndpoint,
      oauth_registration_endpoint: registrationEndpoint,
      oauth_token_auth_method: tokenAuthMethod,
      oauth_state: state,
      oauth_code_verifier: codeVerifier,
    };

    servers[serverIndex] = persistedServer;

    await saveToolServers(db, servers);

    return json(req, {
      ok: true,
      authorization_url: authorizationUrl.toString(),
    });
  }

  // GET /api/admin/tool-servers/oauth/callback - OAuth redirect handler
  if (req.method === 'GET' && path === '/api/admin/tool-servers/oauth/callback') {
    const url = new URL(req.url);
    const code = url.searchParams.get('code');
    const state = url.searchParams.get('state');
    const errParam = url.searchParams.get('error');
    if (errParam) {
      return new Response(`Authorization failed: ${errParam}`, { status: 400 });
    }
    if (!code || !state) {
      return new Response('Missing authorization code or state', {
        status: 400,
      });
    }

    const servers = await loadToolServers(db);
    const serverIndex = servers.findIndex((entry) => entry?.oauth_state === state);
    if (serverIndex === -1) {
      return new Response('OAuth session not found or expired', {
        status: 400,
      });
    }

    const server = servers[serverIndex];
    const tokenEndpoint =
      server.oauth_token_endpoint ||
      new URL('/token', server.oauth_authorization_server || server.url).toString();
    const clientId = server.oauth_client_id;
    const clientSecret = server.oauth_client_secret;
    const codeVerifier = server.oauth_code_verifier;
    const tokenAuthMethod =
      normalizeTokenAuthMethod(server.oauth_token_auth_method) || 'client_secret_post';

    const params = new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      code_verifier: codeVerifier,
      redirect_uri: new URL(req.url).origin + '/api/admin/tool-servers/oauth/callback',
      client_id: clientId,
    });

    const headers = new Headers({
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/json',
    });

    if (tokenAuthMethod === 'client_secret_basic' && clientSecret) {
      headers.set('Authorization', `Basic ${btoa(`${clientId}:${clientSecret}`)}`);
      params.delete('client_id');
    } else if (tokenAuthMethod === 'client_secret_post' && clientSecret) {
      params.set('client_secret', clientSecret);
    }

    try {
      const tokenRes = await fetch(tokenEndpoint, {
        method: 'POST',
        headers,
        body: params,
      });
      if (!tokenRes.ok) {
        const text = await tokenRes.text().catch(() => '');
        return new Response(`Token exchange failed: ${text}`, { status: 400 });
      }
      const tokenData = await tokenRes.json();

      servers[serverIndex] = {
        ...server,
        oauth_tokens: {
          ...tokenData,
          connected_at: new Date().toISOString(),
        },
        oauth_connected_at: new Date().toISOString(),
        oauth_state: null,
        oauth_code_verifier: null,
      };

      await saveToolServers(db, servers);

      return new Response(
        '<html><body><h2>OAuth connected.</h2><p>You can return to GrowChat and click Verify.</p></body></html>',
        { headers: { 'Content-Type': 'text/html' } }
      );
    } catch (err) {
      return new Response(`Token exchange failed: ${err?.message || String(err)}`, { status: 400 });
    }
  }

  // PUT /api/admin/tool-servers - Update tool servers
  if (req.method === 'PUT' && path === '/api/admin/tool-servers') {
    let body;
    try {
      body = await req.json();
    } catch {
      return error(req, 'Invalid JSON body', 400);
    }

    const aclDecision = await ensureAdminAclAccess(env, user, 'tool-server');
    if (!aclDecision.allow) {
      return error(req, aclDecision.reason || 'Forbidden', 403);
    }

    const servers = Array.isArray(body.servers) ? body.servers : [];
    const existing = await loadToolServers(db);
    const existingById = new Map(existing.map((entry) => [String(entry.id), entry]));
    const sanitized = servers
      .map((server) => {
        const merged = mergeToolServer(existingById.get(String(server.id)), server);
        return merged;
      })
      .filter((server) => server.url);

    try {
      await saveToolServers(db, sanitized);
      await logAuditEvent(
        env,
        {
          actor_id: user.sub,
          action: 'tool_servers_updated',
          resource_type: 'admin',
          resource_id: 'tool-servers',
        },
        logger
      );
      return json(req, { ok: true, servers: sanitized.map(redactToolServer) });
    } catch (err) {
      logger.error('Tool servers update failed', { error: err?.message || err });
      return error(req, 'Failed to update tool servers', 500);
    }
  }

  // PUT /api/admin/openai/connections - Update OpenAI connections
  if (req.method === 'PUT' && path === '/api/admin/openai/connections') {
    let body;
    try {
      body = await req.json();
    } catch {
      return error(req, 'Invalid JSON body', 400);
    }

    const aclDecision = await ensureAdminAclAccess(env, user, 'connection');
    if (!aclDecision.allow) {
      return error(req, aclDecision.reason || 'Forbidden', 403);
    }

    const enabled = typeof body.enabled === 'boolean' ? body.enabled : true;
    const connections = Array.isArray(body.connections) ? body.connections : [];
    const modelUpdatesInput = Array.isArray(body.model_updates) ? body.model_updates : [];
    const accessUpdatesInput = Array.isArray(body.access_updates) ? body.access_updates : [];

    if (connections.length > 100) {
      return error(req, 'Too many connections (max 100)', 400);
    }
    if (modelUpdatesInput.length > 500) {
      return error(req, 'Too many model updates (max 500)', 400);
    }

    let currentConnectionMap = new Map();
    let sanitized;
    try {
      const currentConnections = await getAllOpenAIConnectionConfigs(env, {
        includeDisabled: true,
      });
      currentConnectionMap = new Map(
        (Array.isArray(currentConnections) ? currentConnections : []).map((connection) => [
          String(connection.id || ''),
          connection,
        ])
      );

      sanitized = connections
        .filter((conn) => !conn?.readOnly)
        .map((conn) => {
          const existingConnection = currentConnectionMap.get(String(conn.id || ''));
          const providerType = String(conn.providerType || 'openai').toLowerCase();
          if (
            ![
              'openai',
              'openai-compatible',
              'google',
              'gemini-compatible',
              'anthropic',
              'claude-compatible',
            ].includes(providerType)
          ) {
            throw new Error(
              'Provider type must be one of: openai, openai-compatible, google, gemini-compatible, anthropic, claude-compatible'
            );
          }
          const providerFamily =
            normalizeProviderFamily(providerType || conn.providerFamily) || 'openai';
          const rawUrl = String(conn.url || '').trim();
          const requiresUrl = isConnectionUrlRequired(providerType);
          const url = rawUrl || getConnectionDefaultBaseUrl(providerType || providerFamily);
          if (requiresUrl && !rawUrl) {
            throw new Error('Connection URL is required for compatible providers');
          }
          if (!isValidHttpUrl(url)) {
            throw new Error('Connection URL must start with http:// or https://');
          }
          const bulkUrlSafety = isSafeOutboundUrl(url);
          if (!bulkUrlSafety.safe) {
            throw new Error(bulkUrlSafety.reason);
          }
          const keyRaw = conn.key !== undefined ? String(conn.key || '').trim() : '';
          const key =
            keyRaw ||
            (existingConnection?.key && String(existingConnection.key).trim()
              ? String(existingConnection.key).trim()
              : '');
          if (key.length > 4096) {
            throw new Error('API key is too long');
          }
          const headers = normalizeHeaders(conn.headers);
          if (headers.length > 4096) {
            throw new Error('Headers are too long');
          }
          const defaultName =
            providerFamily === 'google'
              ? 'Gemini Compatible'
              : providerFamily === 'anthropic'
                ? 'Claude Compatible'
                : 'OpenAI Compatible';
          return {
            id: conn.id || crypto.randomUUID(),
            name: String(conn.name || defaultName).slice(0, 120),
            url,
            key,
            headers,
            providerType,
            providerFamily,
            apiType: getConnectionApiType(providerType),
            enabled: conn.enabled !== false,
            manualModels: normalizeConnectionManualModels(conn.manualModels),
            manualModelsMode:
              normalizeConnectionModelSelectionMode(
                conn.manualModelsMode || conn.manual_models_mode
              ) || 'all',
          };
        })
        .filter(Boolean);
    } catch (err) {
      return error(req, err.message || 'Invalid connection data', 400);
    }

    const modelUpdates = modelUpdatesInput
      .map((item) => ({
        id: String(item?.id || '').trim(),
        enabled: item?.enabled !== false,
      }))
      .filter((item) => isValidModelAccessId(item.id));
    if (modelUpdates.length !== modelUpdatesInput.length) {
      return error(req, 'Invalid model id in updates', 400);
    }

    try {
      const groups = await db.all('SELECT id FROM groups');
      const validGroupIds = new Set(groups.map((group) => group.id));
      const normalizedAccessUpdates = [];
      for (const entry of accessUpdatesInput) {
        const connectionId = String(entry?.connection_id || entry?.connectionId || '').trim();
        const currentConnection = currentConnectionMap.get(connectionId);
        if (!connectionId || !currentConnection) {
          return error(req, 'Invalid connection_id in access_updates', 400);
        }
        if (currentConnection.enabled === false) {
          return error(req, 'Disabled connections cannot be edited', 409);
        }
        const incomingRules = Array.isArray(entry?.rules) ? entry.rules : [];
        const filteredRules = [];
        const invalidPrincipalTypes = [];
        for (const rule of incomingRules) {
          const normalized = normalizeConnectionAclRule({
            ...rule,
            connection_id: connectionId,
          });
          if (!normalized) continue;
          if (normalized.principal_type !== 'group') {
            invalidPrincipalTypes.push(normalized.principal_type);
            continue;
          }
          if (!validGroupIds.has(normalized.principal_id)) continue;
          filteredRules.push(normalized);
        }
        if (invalidPrincipalTypes.length) {
          return error(req, 'Invalid principal_type for connection access', 400, {
            invalid: Array.from(new Set(invalidPrincipalTypes)),
          });
        }
        normalizedAccessUpdates.push({
          connection_id: connectionId,
          rules: filteredRules,
        });
      }

      if (normalizedAccessUpdates.length > 0) {
        const aclDecision = await ensureAdminAclAccess(env, user, 'connection');
        if (!aclDecision.allow) {
          return error(req, aclDecision.reason || 'Forbidden', 403);
        }
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

      for (const entry of normalizedAccessUpdates) {
        statements.push(
          db.prepare('DELETE FROM connection_acl_rules WHERE connection_id = ?', [
            entry.connection_id,
          ])
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

      await db.batch(statements);
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
        access_updates: normalizedAccessUpdates.map((entry) => ({
          connection_id: entry.connection_id,
          rules: entry.rules.map((rule) => ({
            principal_type: rule.principal_type,
            principal_id: rule.principal_id,
            effect: rule.effect,
            action: rule.action,
          })),
        })),
      });
    } catch (err) {
      logger.error('OpenAI connections update failed', { error: err?.message || err });
      return error(req, 'Failed to update connections', 500);
    }
  }

  // GET /api/admin/email-config - Fetch email configuration
  if (req.method === 'GET' && path === '/api/admin/email-config') {
    try {
      const resendApiKeyConfigured = await getConfigValue(db, 'resend_api_key', null);
      return json(req, {
        email_provider: 'resend',
        resend_api_key_configured: !!resendApiKeyConfigured,
      });
    } catch (err) {
      logger.error('Email config fetch failed', { error: err?.message || err });
      return error(req, 'Failed to fetch email config', 500);
    }
  }

  // PUT /api/admin/email-config - Update email configuration
  if (req.method === 'PUT' && path === '/api/admin/email-config') {
    let body;
    try {
      body = await req.json();
    } catch {
      return error(req, 'Invalid JSON body', 400);
    }

    const writeDecision = await ensureAdminMutationAccess(
      env,
      user,
      'admin.rbac.admin',
      'email-config'
    );
    if (!writeDecision.allow) {
      return error(req, writeDecision.reason || 'Forbidden', 403);
    }

    if (!body.resend_api_key) {
      return error(req, 'resend_api_key is required', 400);
    }

    const apiKey = String(body.resend_api_key).trim();
    if (!apiKey) {
      return error(req, 'resend_api_key cannot be empty', 400);
    }

    try {
      await setConfigValue(db, 'resend_api_key', apiKey);
      await logAuditEvent(
        env,
        {
          actor_id: user.sub,
          action: 'email_config_updated',
          resource_type: 'admin',
          resource_id: 'email-config',
        },
        logger
      );
      return json(req, {
        message: 'Email configuration updated',
      });
    } catch (err) {
      logger.error('Email config update failed', { error: err?.message || err });
      return error(req, 'Failed to update email config', 500);
    }
  }

  // POST /api/admin/email-config/test - Send test email
  if (req.method === 'POST' && path === '/api/admin/email-config/test') {
    let body;
    try {
      body = await req.json();
    } catch {
      return error(req, 'Invalid JSON body', 400);
    }

    if (!body.email) {
      return error(req, 'email is required', 400);
    }

    const testEmail = String(body.email).trim().toLowerCase();
    if (!testEmail.includes('@') || !testEmail.includes('.')) {
      return error(req, 'Invalid email address', 400);
    }

    try {
      const resendApiKey = await getConfigValue(db, 'resend_api_key', null);
      if (!resendApiKey) {
        return error(req, 'Resend API key not configured', 400);
      }

      // Send test email via Resend API
      const response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${resendApiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: 'noreply@growchat.app',
          to: testEmail,
          subject: 'GrowChat Email Configuration Test',
          html: '<p>This is a test email from GrowChat. Your email configuration is working correctly.</p>',
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        logger.error('Resend API error', {
          status: response.status,
          code: errorData.code || errorData.name,
          message: errorData.message,
        });
        return error(req, 'Failed to send test email', 400);
      }

      await logAuditEvent(
        env,
        {
          actor_id: user.sub,
          action: 'email_config_test_sent',
          resource_type: 'admin',
          resource_id: 'email-config',
          metadata: { test_email: testEmail },
        },
        logger
      );

      return json(req, {
        message: 'Test email sent',
      });
    } catch (err) {
      logger.error('Email test failed', { error: err?.message || err });
      return error(req, 'Failed to send test email', 500);
    }
  }

  // GET /api/admin/security-config - Fetch operational security configuration (read-only)
  if (req.method === 'GET' && path === '/api/admin/security-config') {
    try {
      const formatTTL = (seconds) => {
        if (seconds >= 86400) {
          const days = Math.round(seconds / 86400);
          return `${days} day${days !== 1 ? 's' : ''}`;
        }
        if (seconds >= 3600) {
          const hours = Math.round(seconds / 3600);
          return `${hours} hour${hours !== 1 ? 's' : ''}`;
        }
        const minutes = Math.round(seconds / 60);
        return `${minutes} minute${minutes !== 1 ? 's' : ''}`;
      };

      return json(req, {
        rate_limits: {
          chat_messages_per_minute: APP_LIMITS.maxChatSendPerMinute,
          login_attempts_per_10min: APP_LIMITS.maxLoginPerTenMinutes,
          registrations_per_10min: APP_LIMITS.maxRegisterPerTenMinutes,
          file_uploads_per_hour: APP_LIMITS.maxFileUploadPerHour,
        },
        token_ttls: {
          access_token_seconds: APP_TTLS.accessTokenSeconds,
          refresh_token_seconds: APP_TTLS.refreshTokenSeconds,
          access_token_display: formatTTL(APP_TTLS.accessTokenSeconds),
          refresh_token_display: formatTTL(APP_TTLS.refreshTokenSeconds),
        },
      });
    } catch (err) {
      logger.error('Security config fetch failed', { error: err?.message || err });
      return error(req, 'Failed to fetch security config', 500);
    }
  }

  return null;
}
