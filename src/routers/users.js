import { createDB } from '../db.js';
import { error, json } from '../utils/response.js';
import { authorize, logAuditEvent, isLastOwnerOfRole, resolvePermissions, getUserRoles } from '../utils/authorize.js';
import { getConfigValue } from '../utils/app-config.js';
import { hashPassword } from '../shared/auth.js';
import {
  createUserOpenAIConnection,
  deleteUserOpenAIConnection,
  getAllOpenAIConnectionConfigs,
  loadUserOpenAIConnectionConfigs,
  updateUserOpenAIConnection,
} from '../llm/connections.js';
import { loadModelAclRules } from '../utils/model-acl.js';
import { loadConnectionAclRules } from '../utils/connection-acl.js';
import { loadToolServerAclRules } from '../utils/tool-server-acl.js';
import {
  createUserToolServer,
  deleteUserToolServer,
  loadToolServers,
  loadUserToolServers,
  testToolServerConnection,
  updateUserToolServer,
} from '../admin/tool-servers.js';
import { parsePagination, requirePlainObject, requireString, validateEmail } from '../validation/request.js';
import { isValidEmail } from '../utils/rbac.js';
import { loadPrimaryRole, normalizePublicRole } from '../utils/user-role.js';
import { ValidationError } from '../errors/http-errors.js';
import { buildSelfProfileUpdate, buildUserProfileResponse } from './user-profile.js';

function normalizeAccountStatus(value, fallback = 'active') {
  const status = String(value || fallback).trim().toLowerCase();
  return status === 'pending' ? 'pending' : 'active';
}

function normalizeRole(value) {
  return normalizePublicRole(value);
}

async function syncGlobalRoleBinding(db, userId, role, accountStatus) {
  try {
    await db.run('DELETE FROM user_roles WHERE user_id = ?', [userId]);

    if (normalizeAccountStatus(accountStatus) !== 'active') return;
    const mappedRole = normalizeRole(role);
    await db.run(
      `INSERT OR IGNORE INTO user_roles (id, user_id, role_id, created_at)
       SELECT ?, ?, r.id, unixepoch()
       FROM roles r
       WHERE r.name = ?`,
      [crypto.randomUUID(), userId, mappedRole]
    );
  } catch (err) {
    if (/no such table:\s*(user_roles|roles)/i.test(String(err?.message || ''))) {
      console.warn('RBAC role binding skipped: run migrations/001_initial.sql');
      return;
    }
    throw err;
  }
}

async function loadModelEnabledMap(db) {
  try {
    await db.run(
      `CREATE TABLE IF NOT EXISTS model_access (
        model_id TEXT PRIMARY KEY,
        is_enabled INTEGER NOT NULL DEFAULT 1,
        updated_at INTEGER NOT NULL DEFAULT (unixepoch())
      )`
    );
    const rows = await db.all('SELECT model_id, is_enabled FROM model_access');
    return new Map((Array.isArray(rows) ? rows : []).map((row) => [String(row.model_id || ''), row.is_enabled === 1]));
  } catch (err) {
    console.warn('Failed to read model access map:', err?.message || err);
    return new Map();
  }
}

function toPersonalConnectionSummary(connection) {
  return {
    id: connection.id,
    name: connection.name || connection.id,
    typeLabel: 'Connection',
    access_label: 'Personal',
    access_variant: 'personal',
    note: connection.baseUrl || connection.url || connection.providerFamily || connection.providerType || '',
    provider_type: connection.providerType || connection.provider_type || '',
    provider_family: connection.providerFamily || connection.provider_family || '',
    base_url: connection.baseUrl || connection.url || '',
    enabled: connection.enabled !== false,
  };
}

function toAccessibleConnectionSummary(connection, accessVariant = 'admin') {
  return {
    id: connection.id,
    name: connection.name || connection.id,
    typeLabel: 'Connection',
    access_label: accessVariant === 'shared' ? 'Shared' : 'Admin',
    access_variant: accessVariant,
    note: connection.baseUrl || connection.url || connection.providerFamily || connection.providerType || '',
  };
}

function toPersonalToolServerSummary(server) {
  return {
    id: server.id,
    name: server.name || server.id,
    typeLabel: 'MCP',
    access_label: 'Personal',
    access_variant: 'personal',
    note: server.url || '',
    url: server.url || '',
    enabled: server.enabled !== false,
  };
}

function toAccessibleToolServerSummary(server) {
  return {
    id: server.id,
    name: server.name || server.id,
    typeLabel: 'MCP',
    access_label: server.access_label || (server.source === 'user' ? 'Personal' : 'Admin'),
    access_variant: server.access_variant || (server.source === 'user' ? 'personal' : 'admin'),
    note: server.tools?.length ? `${server.tools.length} tools available` : (server.url || ''),
  };
}

export async function usersRouter(req, env, _ctx, user, path) {
  const isUsersPath =
    path === '/api/users/me' ||
    path === '/api/users/me/update' ||
    path === '/api/users/me/permissions' ||
    path === '/api/users/me/roles' ||
    path === '/api/users/me/resources/connections' ||
    path === '/api/users/me/resources/mcp-servers' ||
    path === '/api/users/me/resources/mcp-servers/test' ||
    /^\/api\/users\/me\/resources\/mcp-servers\/[^/]+$/.test(path) ||
    path === '/api/admin/users' ||
    path === '/api/admin/users/import' ||
    /^\/api\/admin\/users\/[^/]+\/access$/.test(path) ||
    /^\/api\/admin\/users\/[^/]+$/.test(path);

  if (!isUsersPath) return null;
  if (!user) return error(req, 'Unauthorized', 401);

  if (req.method === 'GET' && path === '/api/users/me/permissions') {
    const permissions = await resolvePermissions(env, user);
    return json(req, { permissions });
  }

  if (req.method === 'GET' && path === '/api/users/me/roles') {
    const roles = await getUserRoles(env, user.sub);
    return json(req, { roles });
  }

  if (req.method === 'GET' && path === '/api/users/me/resources/connections') {
    const db = createDB(env.DB);
    try {
      const ownConnections = await loadUserOpenAIConnectionConfigs(db, user.sub, { includeDisabled: true });
      const connections = await getAllOpenAIConnectionConfigs(env, {
        userId: user.sub,
        userRole: normalizeRole(user.primary_role),
        includeDisabled: true,
      });
      const accessible = connections
        .filter((connection) => connection.source !== 'user')
        .map((connection) => {
          const accessVariant = connection.access_variant || 'admin';
          return toAccessibleConnectionSummary(connection, accessVariant);
        });

      return json(req, {
        connections: accessible,
        my_connections: ownConnections.map(toPersonalConnectionSummary),
      });
    } catch (err) {
      console.error('Load user connections failed:', err);
      return error(req, 'Failed to load resources', 500);
    }
  }

  const personalConnectionMatch = path.match(/^\/api\/users\/me\/resources\/connections\/([^/]+)$/);
  if (personalConnectionMatch) {
    const connectionId = personalConnectionMatch[1];

    if (req.method === 'PUT') {
      let body;
      try {
        body = await req.json();
      } catch {
        return error(req, 'Invalid JSON body', 400);
      }

      try {
        const db = createDB(env.DB);
        const updated = await updateUserOpenAIConnection(db, user.sub, connectionId, body);
        if (!updated) return error(req, 'Connection not found', 404);
        await logAuditEvent(env, {
          actor_id: user.sub,
          action: 'user_connection_updated',
          resource_type: 'connection',
          resource_id: connectionId,
          metadata: { connection_id: connectionId },
        });
        return json(req, { connection: toPersonalConnectionSummary(updated) });
      } catch (err) {
        if (err instanceof ValidationError) {
          return error(req, err.message, 400);
        }
        return error(req, err?.message || 'Failed to update connection', 400);
      }
    }

    if (req.method === 'DELETE') {
      try {
        const db = createDB(env.DB);
        const deleted = await deleteUserOpenAIConnection(db, user.sub, connectionId);
        if (!deleted) return error(req, 'Connection not found', 404);
        await logAuditEvent(env, {
          actor_id: user.sub,
          action: 'user_connection_deleted',
          resource_type: 'connection',
          resource_id: connectionId,
          metadata: { connection_id: connectionId },
        });
        return json(req, { success: true });
      } catch (err) {
        return error(req, err?.message || 'Failed to delete connection', 400);
      }
    }

    return error(req, 'Method not allowed', 405);
  }

  if (req.method === 'POST' && path === '/api/users/me/resources/connections') {
    let body;
    try {
      body = await req.json();
    } catch {
      return error(req, 'Invalid JSON body', 400);
    }

    try {
      const db = createDB(env.DB);
      const created = await createUserOpenAIConnection(db, user.sub, body);
      await logAuditEvent(env, {
        actor_id: user.sub,
        action: 'user_connection_created',
        resource_type: 'connection',
        resource_id: created?.id || null,
        metadata: { connection_id: created?.id || null },
      });
      return json(req, { connection: toPersonalConnectionSummary(created) }, 201);
    } catch (err) {
      if (err instanceof ValidationError) {
        return error(req, err.message, 400);
      }
      return error(req, err?.message || 'Failed to create connection', 400);
    }
  }

  if (req.method === 'GET' && path === '/api/users/me/resources/mcp-servers') {
    const db = createDB(env.DB);
    try {
      const servers = await loadUserToolServers(db, user.sub);
      return json(req, {
        servers: servers.map(toPersonalToolServerSummary),
      });
    } catch (err) {
      console.error('Load user MCP servers failed:', err);
      return error(req, 'Failed to load MCP servers', 500);
    }
  }

  if (req.method === 'POST' && path === '/api/users/me/resources/mcp-servers') {
    let body;
    try {
      body = await req.json();
    } catch {
      return error(req, 'Invalid JSON body', 400);
    }

    try {
      const db = createDB(env.DB);
      const created = await createUserToolServer(db, user.sub, body);
      await logAuditEvent(env, {
        actor_id: user.sub,
        action: 'user_tool_server_created',
        resource_type: 'tool-server',
        resource_id: created?.id || null,
        metadata: { server_id: created?.id || null },
      });
      return json(req, { server: toPersonalToolServerSummary(created) }, 201);
    } catch (err) {
      return error(req, err?.message || 'Failed to create MCP server', 400);
    }
  }

  if (req.method === 'POST' && path === '/api/users/me/resources/mcp-servers/test') {
    let body;
    try {
      body = await req.json();
    } catch {
      return error(req, 'Invalid JSON body', 400);
    }

    const url = String(body.url || '').trim();
    if (!url || !/^https?:\/\//i.test(url)) {
      return error(req, 'Server URL must start with http:// or https://', 400);
    }

    try {
      const result = await testToolServerConnection({
        name: body.name,
        url,
        headers: body.headers,
        auth_type: body.auth_type,
        auth_bearer_token: body.auth_bearer_token,
        auth_basic_username: body.auth_basic_username,
        auth_basic_password: body.auth_basic_password,
      });
      return json(req, { tools: result.tools });
    } catch (err) {
      return error(req, err?.message || 'Failed to test MCP server', 400);
    }
  }

  const personalMcpMatch = path.match(/^\/api\/users\/me\/resources\/mcp-servers\/([^/]+)$/);
  if (personalMcpMatch) {
    const serverId = personalMcpMatch[1];

    if (req.method === 'PUT') {
      let body;
      try {
        body = await req.json();
      } catch {
        return error(req, 'Invalid JSON body', 400);
      }

      try {
        const db = createDB(env.DB);
        const updated = await updateUserToolServer(db, user.sub, serverId, body);
        if (!updated) return error(req, 'MCP server not found', 404);
        await logAuditEvent(env, {
          actor_id: user.sub,
          action: 'user_tool_server_updated',
          resource_type: 'tool-server',
          resource_id: serverId,
          metadata: { server_id: serverId },
        });
        return json(req, { server: toPersonalToolServerSummary(updated) });
      } catch (err) {
        return error(req, err?.message || 'Failed to update MCP server', 400);
      }
    }

    if (req.method === 'DELETE') {
      try {
        const db = createDB(env.DB);
        const deleted = await deleteUserToolServer(db, user.sub, serverId);
        if (!deleted) return error(req, 'MCP server not found', 404);
        await logAuditEvent(env, {
          actor_id: user.sub,
          action: 'user_tool_server_deleted',
          resource_type: 'tool-server',
          resource_id: serverId,
          metadata: { server_id: serverId },
        });
        return json(req, { success: true });
      } catch (err) {
        return error(req, err?.message || 'Failed to delete MCP server', 400);
      }
    }

    return error(req, 'Method not allowed', 405);
  }

  if (req.method === 'GET' && path === '/api/users/me') {
    const db = createDB(env.DB);
    const url = new URL(req.url);
    const includeParam = url.searchParams.get('include') || '';
    const include = new Set(includeParam.split(',').map((val) => val.trim()).filter(Boolean));
    const includePermissions = include.has('permissions') || include.has('all');
    const includeRoles = include.has('roles') || include.has('all');

    const row = await db.first(
      'SELECT id, email, name, account_status, settings, avatar, avatar_emoji, status, preferences, created_at, updated_at, last_active_at FROM users WHERE id = ?',
      [user.sub]
    );

    if (!row) return error(req, 'User not found', 404);
    const primaryRole = (await loadPrimaryRole(db, user.sub)) || 'member';
    const roles = await getUserRoles(env, user.sub);
    let globalDefaultModelId = null;
    try {
      const rawDefault = await getConfigValue(db, 'default_model_id', null);
      globalDefaultModelId = rawDefault ? String(rawDefault).trim() : null;
    } catch {
      globalDefaultModelId = null;
    }

    const payload = buildUserProfileResponse(row, { defaultModelId: globalDefaultModelId, primaryRole });

    if (includePermissions) {
      payload.permissions = await resolvePermissions(env, user);
    }
    if (includeRoles) {
      payload.roles = roles;
    }

    return json(req, payload);
  }

  if (req.method === 'PUT' && path === '/api/users/me') {
    const db = createDB(env.DB);

    let body;
    try {
      body = await req.json();
    } catch {
      return error(req, 'Invalid JSON body', 400);
    }

    try {
      const update = buildSelfProfileUpdate(body, { allowSettings: true });
      const { updates, values } = update;

      updates.push('updated_at = unixepoch()');
      values.push(user.sub);

      await db.run(
        `UPDATE users SET ${updates.join(', ')} WHERE id = ?`,
        values
      );

      const row = await db.first(
        'SELECT id, email, name, account_status, settings, avatar, avatar_emoji, status, preferences, created_at, updated_at FROM users WHERE id = ?',
        [user.sub]
      );
      if (!row) return error(req, 'User not found', 404);

      const primaryRole = (await loadPrimaryRole(db, user.sub)) || 'member';
      return json(req, buildUserProfileResponse(row, { primaryRole }));
    } catch (err) {
      if (err instanceof ValidationError) {
        return error(req, err.message, 400);
      }
      throw err;
    }
  }

  if (req.method === 'POST' && path === '/api/users/me/update') {
    const db = createDB(env.DB);

    let body;
    try {
      body = await req.json();
    } catch {
      return error(req, 'Invalid JSON body', 400);
    }

    try {
      const update = buildSelfProfileUpdate(body, { allowSettings: false });
      const { updates, values } = update;

      updates.push('updated_at = unixepoch()');
      values.push(user.sub);

      await db.run(
        `UPDATE users SET ${updates.join(', ')} WHERE id = ?`,
        values
      );

      const row = await db.first(
        'SELECT id, email, name, account_status, settings, avatar, avatar_emoji, status, preferences, created_at, updated_at FROM users WHERE id = ?',
        [user.sub]
      );
      if (!row) return error(req, 'User not found', 404);

      const primaryRole = (await loadPrimaryRole(db, user.sub)) || 'member';
      return json(req, buildUserProfileResponse(row, { primaryRole }));
    } catch (err) {
      if (err instanceof ValidationError) {
        return error(req, err.message, 400);
      }
      throw err;
    }
  }

  // GET /api/admin/users - List all users (admin only)
  if (req.method === 'GET' && path === '/api/admin/users') {
    // Check authorization
    const authDecision = await authorize(env, user, {
      action: 'admin.user.read',
      resource: 'users'
    });

    if (!authDecision.allow) {
      return error(req, authDecision.reason || 'Forbidden', 403);
    }

    const db = createDB(env.DB);
    const { limit, offset } = parsePagination(new URL(req.url), { defaultLimit: 20, maxLimit: 100, defaultOffset: 0 });

    try {
      const totalRow = await db.first('SELECT COUNT(*) as count FROM users');
      const users = await db.all(
        `SELECT
           u.id,
           u.email,
           u.name,
           u.account_status,
           u.settings,
           u.created_at,
           u.updated_at,
           u.last_active_at,
           COALESCE((
             SELECT r.name
             FROM user_roles ur
             INNER JOIN roles r ON r.id = ur.role_id
             WHERE ur.user_id = u.id
             ORDER BY r.name ASC
             LIMIT 1
           ), 'member') AS primary_role
         FROM users u
         ORDER BY
           CASE COALESCE((
             SELECT r.name
             FROM user_roles ur
             INNER JOIN roles r ON r.id = ur.role_id
             WHERE ur.user_id = u.id
             ORDER BY r.name ASC
             LIMIT 1
           ), 'member')
             WHEN 'admin' THEN 0
             WHEN 'member' THEN 1
             ELSE 2
           END,
           CASE COALESCE(account_status, 'active')
             WHEN 'active' THEN 0
             WHEN 'pending' THEN 1
             ELSE 2
           END,
           LOWER(COALESCE(name, '')) ASC,
           LOWER(email) ASC
         LIMIT ? OFFSET ?`,
        [limit, offset]
      );

      // Parse settings JSON
      const parsedUsers = users.map((u) => ({
        id: u.id,
        email: u.email,
        name: u.name,
        primary_role: normalizeRole(u.primary_role),
        account_status: normalizeAccountStatus(u.account_status),
        settings: parseSettings(u.settings),
        created_at: u.created_at,
        last_active_at: u.last_active_at || null,
        updated_at: u.updated_at,
      }));

      // Log audit event
      await logAuditEvent(env, {
        actor_id: user.sub,
        action: 'user_list_accessed',
        resource_type: 'users',
        resource_id: null,
        metadata: { limit, offset, count: parsedUsers.length }
      });

      return json(req, {
        users: parsedUsers,
        total: totalRow?.count || 0,
        limit,
        offset,
      });
    } catch (err) {
      console.error('List users failed:', err);
      return error(req, 'Failed to list users', 500);
    }
  }

  // GET /api/admin/users/:id/access - Inspect effective ACL access (admin only)
  if (req.method === 'GET' && path.match(/^\/api\/admin\/users\/[^/]+\/access$/)) {
    const userId = path.split('/').slice(-2, -1)[0];
    const authDecision = await authorize(env, user, {
      action: 'admin.user.read',
      resource: 'user',
      resourceId: userId,
    });

    if (!authDecision.allow) {
      return error(req, authDecision.reason || 'Forbidden', 403);
    }

    const db = createDB(env.DB);
    try {
      const targetUser = await db.first(
        'SELECT id, email, name, account_status FROM users WHERE id = ?',
        [userId]
      );
      if (!targetUser) {
        return error(req, 'User not found', 404);
      }
      const primaryRole = (await loadPrimaryRole(db, userId)) || 'member';

      const groupRows = await db.all(
        `SELECT g.id, g.name, g.description, g.is_system
         FROM group_members gm
         INNER JOIN groups g ON g.id = gm.group_id
         WHERE gm.user_id = ?
         ORDER BY g.is_system DESC, g.name ASC`,
        [userId]
      );
      const groupIds = new Set((Array.isArray(groupRows) ? groupRows : []).map((group) => group.id).filter(Boolean));
      const groupMap = new Map((Array.isArray(groupRows) ? groupRows : []).map((group) => [group.id, group.name]));
      const userPermissions = await resolvePermissions(env, { sub: userId, role: primaryRole });
      const modelEnabledMap = await loadModelEnabledMap(db);
      const connectionEnabledMap = new Map(
        (await getAllOpenAIConnectionConfigs(env, { includeDisabled: true }))
          .map((connection) => [String(connection.id || ''), connection.enabled !== false])
      );
      const toolServerEnabledMap = new Map(
        (await loadToolServers(db))
          .map((server) => [String(server.id || ''), server.enabled !== false])
      );

      const decorateRules = (rules = [], familyLabel, enabledMap = new Map()) => (Array.isArray(rules) ? rules : [])
        .filter((rule) => {
          if (rule?.principal_type === 'user') {
            return String(rule.principal_id || '') === String(userId || '');
          }
          return groupIds.has(String(rule.principal_id || ''));
        })
        .map((rule) => ({
          family: familyLabel,
          resource_id: rule.resource_id || rule.model_id || rule.connection_id || rule.tool_server_id || '',
          resource_enabled: enabledMap.has(rule.resource_id || rule.model_id || rule.connection_id || rule.tool_server_id || '')
            ? enabledMap.get(rule.resource_id || rule.model_id || rule.connection_id || rule.tool_server_id || '')
            : true,
          principal_type: rule.principal_type,
          principal_id: rule.principal_id,
          principal_label: rule.principal_type === 'group'
            ? `Group: ${groupMap.get(rule.principal_id) || rule.principal_id}`
            : 'Direct user',
          effect: rule.effect,
          action: rule.action,
        }));

      const modelRules = decorateRules(await loadModelAclRules(db), 'model', modelEnabledMap);
      const connectionRules = decorateRules(await loadConnectionAclRules(db), 'connection', connectionEnabledMap);
      const toolServerRules = decorateRules(await loadToolServerAclRules(db), 'mcp_server', toolServerEnabledMap);

      return json(req, {
        user: {
          id: targetUser.id,
          email: targetUser.email,
          name: targetUser.name,
          account_status: normalizeAccountStatus(targetUser.account_status),
          primary_role: primaryRole,
        },
        groups: Array.from(groupMap.entries()).map(([id, name]) => ({ id, name })),
        role_permissions: userPermissions,
        access: {
          models: modelRules,
          connections: connectionRules,
          mcp_servers: toolServerRules,
        },
      });
    } catch (err) {
      console.error('Inspect user access failed:', err);
      return error(req, 'Failed to inspect user access', 500);
    }
  }

  // POST /api/admin/users - Create user (admin only)
  if (req.method === 'POST' && path === '/api/admin/users') {
    const authDecision = await authorize(env, user, {
      action: 'admin.user.write',
      resource: 'users'
    });

    if (!authDecision.allow) {
      return error(req, authDecision.reason || 'Forbidden', 403);
    }

    const db = createDB(env.DB);

    let body;
    try {
      body = await req.json();
    } catch {
      return error(req, 'Invalid JSON body', 400);
    }

    let email;
    let name;
    let password;
    try {
      email = validateEmail(requireString(body.email, 'email, name, and password are required').toLowerCase());
      name = requireString(body.name, 'email, name, and password are required');
      password = requireString(body.password, 'email, name, and password are required', { trim: false });
    } catch (err) {
      if (err instanceof ValidationError) {
        return error(req, err.message, 400);
      }
      throw err;
    }
    const requestedRole = String(body.primary_role || 'member').trim().toLowerCase();
    const role = normalizeRole(requestedRole);
    const accountStatus = normalizeAccountStatus(body.account_status, 'active');

    if (password.length < 8) {
      return error(req, 'Password must be at least 8 characters', 400);
    }

    if (!['member', 'admin'].includes(requestedRole)) {
      return error(req, 'primary_role must be "member" or "admin"', 400);
    }

    const existing = await db.first('SELECT id FROM users WHERE email = ?', [email]);
    if (existing) {
      return error(req, 'Email already registered', 409);
    }

    const id = crypto.randomUUID();
    const passwordHash = await hashPassword(password);

    await db.run(
      `INSERT INTO users (
        id, email, password_hash, name, account_status, settings, preferences,
        created_at, updated_at, last_active_at
      ) VALUES (?, ?, ?, ?, ?, '{}', '{}', unixepoch(), unixepoch(), unixepoch())`,
      [id, email, passwordHash, name, accountStatus]
    );

    await syncGlobalRoleBinding(db, id, role, accountStatus);

    const createdUser = await db.first(
      'SELECT id, email, name, account_status, settings, created_at, updated_at, last_active_at FROM users WHERE id = ?',
      [id]
    );

    await logAuditEvent(env, {
      actor_id: user.sub,
      action: 'user_created',
      resource_type: 'user',
      resource_id: id,
      metadata: { email, primary_role: role }
    });

    return json(req, {
      user: {
        id: createdUser.id,
        email: createdUser.email,
        name: createdUser.name,
        primary_role: role,
        account_status: normalizeAccountStatus(createdUser.account_status, accountStatus),
        settings: parseSettings(createdUser.settings),
        created_at: createdUser.created_at,
        updated_at: createdUser.updated_at,
        last_active_at: createdUser.last_active_at || null,
      },
    }, 201);
  }

  // POST /api/admin/users/import - Bulk import users from CSV (admin only)
  if (req.method === 'POST' && path === '/api/admin/users/import') {
    const authDecision = await authorize(env, user, {
      action: 'admin.user.write',
      resource: 'users'
    });

    if (!authDecision.allow) {
      return error(req, authDecision.reason || 'Forbidden', 403);
    }

    let body;
    try {
      body = await req.json();
    } catch {
      return error(req, 'Invalid JSON body', 400);
    }

    const csv = String(body.csv || '');
    if (!csv.trim()) {
      return error(req, 'csv is required', 400);
    }

    const rows = csv
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);

    if (rows.length === 0) {
      return error(req, 'CSV is empty', 400);
    }

    const db = createDB(env.DB);
    const results = [];
    let created = 0;

    const parseRow = (line) => line.split(',').map((value) => value.trim());

    for (let index = 0; index < rows.length; index += 1) {
      const line = rows[index];
      const rowNumber = index + 1;

      if (index === 0 && /^name\s*,\s*email\s*,\s*password\s*,\s*primary_role$/i.test(line)) {
        continue;
      }

      const [name, emailRaw, password, roleRaw, accountStatusRaw] = parseRow(line);
      const email = String(emailRaw || '').toLowerCase();
      const requestedRole = String(roleRaw || 'member').toLowerCase();
      const role = normalizeRole(requestedRole);
      const accountStatus = normalizeAccountStatus(accountStatusRaw, 'active');

      if (!name || !email || !password || !requestedRole) {
        results.push({ row: rowNumber, ok: false, error: 'Each row must include name, email, password, primary_role' });
        continue;
      }

      if (!isValidEmail(email)) {
        results.push({ row: rowNumber, ok: false, error: 'Invalid email format' });
        continue;
      }

      if (!['member', 'admin'].includes(requestedRole)) {
        results.push({ row: rowNumber, ok: false, error: 'primary_role must be "member" or "admin"' });
        continue;
      }

      if (password.length < 8) {
        results.push({ row: rowNumber, ok: false, error: 'Password must be at least 8 characters' });
        continue;
      }

      const existing = await db.first('SELECT id FROM users WHERE email = ?', [email]);
      if (existing) {
        results.push({ row: rowNumber, ok: false, error: 'Email already registered' });
        continue;
      }

      const id = crypto.randomUUID();
      const passwordHash = await hashPassword(password);
      await db.run(
        `INSERT INTO users (
          id, email, password_hash, name, account_status, settings, preferences,
          created_at, updated_at, last_active_at
        ) VALUES (?, ?, ?, ?, ?, '{}', '{}', unixepoch(), unixepoch(), unixepoch())`,
        [id, email, passwordHash, name, accountStatus]
      );
      await syncGlobalRoleBinding(db, id, role, accountStatus);
      results.push({ row: rowNumber, ok: true, email, primary_role: role, account_status: accountStatus });
      created += 1;
    }

    await logAuditEvent(env, {
      actor_id: user.sub,
      action: 'user_imported',
      resource_type: 'users',
      resource_id: null,
      metadata: { created, attempted: results.length }
    });

    return json(req, {
      ok: true,
      created,
      results,
    }, 201);
  }

  // GET /api/admin/users/:id - Get specific user (admin only)
  if (req.method === 'GET' && path.match(/^\/api\/admin\/users\/[^/]+$/)) {
    // Check authorization
    const userId = path.split('/').pop();
    const authDecision = await authorize(env, user, {
      action: 'admin.user.read',
      resource: 'user',
      resourceId: userId
    });

    if (!authDecision.allow) {
      return error(req, authDecision.reason || 'Forbidden', 403);
    }

    const db = createDB(env.DB);

    try {
      const userData = await db.first(
        'SELECT id, email, name, account_status, settings, created_at, updated_at FROM users WHERE id = ?',
        [userId]
      );

      if (!userData) {
        return error(req, 'User not found', 404);
      }

      // Log audit event
      await logAuditEvent(env, {
        actor_id: user.sub,
        action: 'user_read',
        resource_type: 'user',
        resource_id: userId
      });

      return json(req, {
        user: {
          id: userData.id,
          email: userData.email,
          name: userData.name,
          primary_role: (await loadPrimaryRole(db, userId)) || 'member',
          account_status: normalizeAccountStatus(userData.account_status),
          settings: parseSettings(userData.settings),
          created_at: userData.created_at,
          updated_at: userData.updated_at,
        },
      });
    } catch (err) {
      console.error('Get user failed:', err);
      return error(req, 'Failed to fetch user', 500);
    }
  }

  // PUT /api/admin/users/:id - Update user fields (admin only)
  if (req.method === 'PUT' && path.match(/^\/api\/admin\/users\/[^/]+$/)) {
    const userId = path.split('/').pop();

    // Check authorization
    const authDecision = await authorize(env, user, {
      action: 'admin.user.write',
      resource: 'user',
      resourceId: userId
    });

    if (!authDecision.allow) {
      return error(req, authDecision.reason || 'Forbidden', 403);
    }

    const db = createDB(env.DB);

    let body;
    try {
      body = await req.json();
    } catch {
      return error(req, 'Invalid JSON body', 400);
    }

    // Verify user exists
    const existing = await db.first('SELECT id, account_status, email, name FROM users WHERE id = ?', [userId]);
    if (!existing) {
      return error(req, 'User not found', 404);
    }

    const updates = [];
    const values = [];
    const updatedFields = [];
    let oldRole = (await loadPrimaryRole(db, userId)) || 'member';
    let oldAccountStatus = normalizeAccountStatus(existing.account_status);
    let newRole = oldRole;
    let newAccountStatus = oldAccountStatus;

    // Allow updating primary role (for admin promotion/demotion)
    if (body.primary_role !== undefined) {
      const requestedRole = String(body.primary_role).toLowerCase();
      if (requestedRole === 'member' || requestedRole === 'admin') {
        newRole = normalizeRole(requestedRole);
        // Check last-owner protection for admin role or admin account disablement
        if (oldRole === 'admin' && (newRole !== 'admin' || newAccountStatus !== 'active')) {
          const isLastAdmin = await isLastOwnerOfRole(env, userId, 'admin');
          if (isLastAdmin) {
            return error(req, 'Cannot demote last admin', 409);
          }
        }
        updatedFields.push('primary_role');
      } else {
        return error(req, 'primary_role must be "member" or "admin"', 400);
      }
    }

    if (body.account_status !== undefined) {
      newAccountStatus = normalizeAccountStatus(body.account_status, newAccountStatus);
      if (oldRole === 'admin' && (newRole !== 'admin' || newAccountStatus !== 'active')) {
        const isLastAdmin = await isLastOwnerOfRole(env, userId, 'admin');
        if (isLastAdmin) {
          return error(req, 'Cannot deactivate last admin', 409);
        }
      }
      updates.push('account_status = ?');
      values.push(newAccountStatus);
      updatedFields.push('account_status');
    }

    // Can update name
    if (body.name !== undefined) {
      const name = String(body.name).trim();
      if (!name) {
        return error(req, 'Name cannot be empty', 400);
      }
      updates.push('name = ?');
      values.push(name);
      updatedFields.push('name');
    }

    // Can update email
    if (body.email !== undefined) {
      let email;
      try {
        email = validateEmail(String(body.email).trim().toLowerCase());
      } catch (err) {
        if (err instanceof ValidationError) {
          return error(req, err.message, 400);
        }
        throw err;
      }

      const duplicate = await db.first('SELECT id FROM users WHERE email = ? AND id != ?', [email, userId]);
      if (duplicate) {
        return error(req, 'Email already in use', 409);
      }

      updates.push('email = ?');
      values.push(email);
      updatedFields.push('email');
    }

    // Can update password
    if (body.password !== undefined) {
      const password = String(body.password);
      if (password.length < 8) {
        return error(req, 'Password must be at least 8 characters', 400);
      }
      updates.push('password_hash = ?');
      values.push(await hashPassword(password));
      updatedFields.push('password');
    }

    // Can reset settings
    if (body.settings !== undefined) {
      let settings;
      try {
        settings = requirePlainObject(body.settings, 'Settings must be an object');
      } catch (err) {
        if (err instanceof ValidationError) {
          return error(req, err.message, 400);
        }
        throw err;
      }
      updates.push('settings = ?');
      values.push(JSON.stringify(settings));
      updatedFields.push('settings');
    }

    if (updates.length === 0) {
      return error(req, 'No valid fields to update', 400);
    }

    updates.push('updated_at = unixepoch()');
    values.push(userId);

    try {
      await db.run(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`, values);
      if (oldRole !== newRole || oldAccountStatus !== newAccountStatus) {
        await syncGlobalRoleBinding(db, userId, newRole, newAccountStatus);
      }

      // Log audit event for role change
      if (oldRole !== newRole || oldAccountStatus !== newAccountStatus) {
        await logAuditEvent(env, {
          actor_id: user.sub,
          action: 'account_state_change',
          resource_type: 'user',
          resource_id: userId,
          metadata: {
            old_primary_role: oldRole,
            new_primary_role: newRole,
            old_account_status: oldAccountStatus,
            new_account_status: newAccountStatus,
          }
        });
      }

      // Log generic user update
      await logAuditEvent(env, {
          actor_id: user.sub,
          action: 'user_updated',
          resource_type: 'user',
          resource_id: userId,
        metadata: { fields_updated: updatedFields }
      });

      // Return updated user
      const updated = await db.first(
        'SELECT id, email, name, account_status, settings, created_at, updated_at FROM users WHERE id = ?',
        [userId]
      );

      return json(req, {
        user: {
          id: updated.id,
          email: updated.email,
          name: updated.name,
          primary_role: newRole,
          account_status: normalizeAccountStatus(updated.account_status),
          settings: parseSettings(updated.settings),
          created_at: updated.created_at,
          updated_at: updated.updated_at,
        },
      });
    } catch (err) {
      console.error('Update user failed:', err);
      return error(req, 'Failed to update user', 500);
    }
  }

  // DELETE /api/admin/users/:id - Delete user record (admin only)
  if (req.method === 'DELETE' && path.match(/^\/api\/admin\/users\/[^/]+$/)) {
    const userId = path.split('/').pop();

    // Check authorization
    const authDecision = await authorize(env, user, {
      action: 'admin.user.write',
      resource: 'user',
      resourceId: userId
    });

    if (!authDecision.allow) {
      return error(req, authDecision.reason || 'Forbidden', 403);
    }

    const db = createDB(env.DB);

    try {
      // Cannot delete yourself
      if (userId === user.sub) {
        return error(req, 'Cannot delete your own account', 400);
      }

      // Verify user exists
      const existing = await db.first('SELECT id, account_status FROM users WHERE id = ?', [userId]);
      if (!existing) {
        return error(req, 'User not found', 404);
      }

      // Cannot delete the only admin
      const isLastAdmin = await isLastOwnerOfRole(env, userId, 'admin');
      if ((await loadPrimaryRole(db, userId)) === 'admin' && isLastAdmin) {
        return error(req, 'Cannot delete the last admin', 400);
      }

      const oldRole = (await loadPrimaryRole(db, userId)) || 'member';
      const oldAccountStatus = normalizeAccountStatus(existing.account_status);
      await db.run('DELETE FROM users WHERE id = ?', [userId]);

      // Log audit event
      await logAuditEvent(env, {
        actor_id: user.sub,
        action: 'user_deleted',
        resource_type: 'user',
        resource_id: userId,
        metadata: { previous_primary_role: oldRole, previous_account_status: oldAccountStatus }
      });

      return json(req, { success: true, message: 'User deleted successfully' });
    } catch (err) {
      console.error('Delete user failed:', err);
      return error(req, 'Failed to delete user', 500);
    }
  }

  return null;
}

function parseSettings(raw) {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}
