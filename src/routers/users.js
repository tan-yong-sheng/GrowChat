import { createDB } from '../db.js';
import { error, getConnectionTestFailureMessage, json } from '../utils/response.js';
import { escapeHtml, stripHtml } from '../utils/sanitize.js';
import {
  authorize,
  logAuditEvent,
  isLastOwnerOfRole,
  resolvePermissions,
  getUserRoles,
} from '../utils/authorize.js';
import { isSafeOutboundUrl } from '../utils/validation.js';
import { getConfigValue } from '../utils/app-config.js';
import { hashPassword } from '../shared/auth.js';
import {
  createUserOpenAIConnection,
  deleteUserOpenAIConnection,
  discoverConnectionModels,
  getAllOpenAIConnectionConfigs,
  buildConnectionHeaders,
  getUserOpenAIConnectionConfig,
  getConnectionDefaultBaseUrl,
  isConnectionUrlRequired,
  updateUserOpenAIConnection,
} from '../llm/connections.js';
import { loadModelAclRules } from '../utils/model-acl.js';
import { loadConnectionAclRules } from '../utils/connection-acl.js';
import { loadToolServerAclRules } from '../utils/tool-server-acl.js';
import {
  buildAuthorizationUrl,
  discoverAuthorizationMetadata,
  createUserToolServer,
  deleteUserToolServer,
  loadToolServers,
  loadUserToolServers,
  normalizeTokenAuthMethod,
  randomString,
  selectTokenAuthMethod,
  sha256Base64Url,
  testToolServerConnection,
  updateUserToolServer,
} from '../admin/tool-servers.js';
import {
  parsePagination,
  requirePlainObject,
  requireString,
  isValidEmail,
  validateEmail,
} from '../validation/request.js';
import { loadPrimaryRole, normalizePublicRole } from '../utils/user-role.js';
import { ValidationError } from '../errors/http-errors.js';
import { buildSelfProfileUpdate, buildUserProfileResponse } from './user-profile.js';
import {
  loadWorkspaceConnectionsPayload,
  loadWorkspaceToolServersPayload,
  toPersonalConnectionSummary,
  toPersonalToolServerSummary,
} from '../services/workspace-settings.js';
import { loadUserResourceOverrides } from '../../public/js/shared/utils/user-resource-overrides.js';
import { createLogger, createRootLogger } from '../utils/logger.js';
const rootLogger = createRootLogger({});

function normalizeAccountStatus(value, fallback = 'active') {
  const status = String(value || fallback)
    .trim()
    .toLowerCase();
  return status === 'pending' ? 'pending' : 'active';
}

function normalizeRole(value) {
  return String(value || '').trim();
}

async function resolveRequestedRole(db, requestedRole) {
  const roleName = normalizeRole(requestedRole);
  if (!roleName) return null;

  try {
    const role = await db.first('SELECT name FROM roles WHERE LOWER(name) = LOWER(?)', [roleName]);
    if (role?.name) return String(role.name).trim();
  } catch (err) {
    if (/no such table:\s*roles/i.test(String(err?.message || ''))) {
      const fallbackRole = roleName.toLowerCase();
      return ['member', 'admin'].includes(fallbackRole) ? fallbackRole : null;
    }
    throw err;
  }

  const fallbackRole = roleName.toLowerCase();
  return ['member', 'admin'].includes(fallbackRole) ? fallbackRole : null;
}

async function syncGlobalRoleBinding(db, userId, role, accountStatus) {
  try {
    await db.run('DELETE FROM user_roles WHERE user_id = ?', [userId]);

    if (normalizeAccountStatus(accountStatus) !== 'active') return;
    const mappedRole = normalizeRole(role);
    if (!mappedRole) return;
    await db.run(
      `INSERT OR IGNORE INTO user_roles (id, user_id, role_id, created_at)
       SELECT ?, ?, r.id, unixepoch()
       FROM roles r
       WHERE LOWER(r.name) = LOWER(?)`,
      [crypto.randomUUID(), userId, mappedRole]
    );
  } catch (err) {
    if (/no such table:\s*(user_roles|roles)/i.test(String(err?.message || ''))) {
      rootLogger.warn('RBAC role binding skipped: run migrations/001_initial.sql');
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
    return new Map(
      (Array.isArray(rows) ? rows : []).map((row) => [
        String(row.model_id || ''),
        row.is_enabled === 1,
      ])
    );
  } catch (err) {
    rootLogger.warn('Failed to read model access map', { error: err?.message || err });
    return new Map();
  }
}

function parseJsonObject(raw) {
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) return raw;
  try {
    const parsed = JSON.parse(String(raw));
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

async function saveUserToolServerJson(db, userId, serverId, server) {
  await db.run(
    `UPDATE user_tool_servers
     SET server_json = ?, updated_at = unixepoch()
     WHERE user_id = ? AND id = ?`,
    [JSON.stringify(server), userId, serverId]
  );
}

async function findUserToolServerByOauthState(db, state) {
  if (!db || !state) return null;
  await loadUserToolServers(db, '__oauth__');
  const rows = await db.all('SELECT id, user_id, server_json FROM user_tool_servers');
  for (const row of Array.isArray(rows) ? rows : []) {
    const server = parseJsonObject(row.server_json);
    if (server?.oauth_state !== state) continue;
    return {
      ...server,
      id: row.id,
      user_id: row.user_id,
    };
  }
  return null;
}

export async function usersRouter(req, env, _ctx, user, path) {
  const logger = createLogger(env);
  const isUsersPath =
    path === '/api/users/me' ||
    path === '/api/users/me/update' ||
    path === '/api/users/me/permissions' ||
    path === '/api/users/me/roles' ||
    path === '/api/users/me/resources/connections' ||
    /^\/api\/users\/me\/resources\/connections\/[^/]+$/.test(path) ||
    path === '/api/users/me/resources/mcp-servers' ||
    path === '/api/users/me/resources/mcp-servers/test' ||
    path === '/api/users/me/resources/mcp-servers/oauth/start' ||
    path === '/api/users/me/resources/mcp-servers/oauth/callback' ||
    /^\/api\/users\/me\/resources\/mcp-servers\/[^/]+$/.test(path) ||
    path === '/api/admin/users' ||
    path === '/api/admin/users/import' ||
    /^\/api\/admin\/users\/[^/]+\/access$/.test(path) ||
    /^\/api\/admin\/users\/[^/]+$/.test(path);

  if (!isUsersPath) return null;
  if (req.method === 'GET' && path === '/api/users/me/resources/mcp-servers/oauth/callback') {
    const db = createDB(env.DB);
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

    const server = await findUserToolServerByOauthState(db, state);
    if (!server) {
      return new Response('OAuth session not found or expired', {
        status: 400,
      });
    }

    const tokenEndpoint =
      server.oauth_token_endpoint ||
      new URL('/token', server.oauth_authorization_server || server.url).toString();
    const clientId = String(server.oauth_client_id || '').trim();
    const clientSecret = String(server.oauth_client_secret || '').trim();
    const codeVerifier = String(server.oauth_code_verifier || '').trim();
    const tokenAuthMethod =
      normalizeTokenAuthMethod(server.oauth_token_auth_method) || 'client_secret_post';
    const redirectUri =
      new URL(req.url).origin + '/api/users/me/resources/mcp-servers/oauth/callback';

    const params = new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      code_verifier: codeVerifier,
      redirect_uri: redirectUri,
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
      const connectedAt = new Date().toISOString();
      const updatedServer = {
        ...server,
        oauth_tokens: {
          ...tokenData,
          connected_at: connectedAt,
        },
        oauth_connected_at: connectedAt,
        oauth_state: null,
        oauth_code_verifier: null,
      };
      await saveUserToolServerJson(db, server.user_id, server.id, updatedServer);
      return new Response(
        '<html><body><h2>OAuth connected.</h2><p>You can return to GrowChat and click Verify.</p></body></html>',
        { headers: { 'Content-Type': 'text/html' } }
      );
    } catch (err) {
      return new Response(`Token exchange failed: ${err?.message || String(err)}`, { status: 400 });
    }
  }
  if (!user) return error(req, 'Unauthorized', 401);

  if (req.method === 'GET' && path === '/api/users/me/permissions') {
    const db = createDB(env.DB);
    const permissions = await resolvePermissions(db, user);
    return json(req, { permissions });
  }

  if (req.method === 'GET' && path === '/api/users/me/roles') {
    const db = createDB(env.DB);
    const roles = await getUserRoles(db, user.sub);
    return json(req, { roles });
  }

  if (req.method === 'GET' && path === '/api/users/me/resources/connections') {
    const db = createDB(env.DB);
    try {
      const payload = await loadWorkspaceConnectionsPayload({
        db,
        env,
        userId: user.sub,
        primaryRole: normalizeRole(user.primary_role),
        includeDisabled: true,
        includeHiddenForUser: true,
      });
      return json(req, {
        connections: payload.connections,
        my_connections: payload.my_connections,
      });
    } catch (err) {
      logger.error('Load user connections failed', { error: err?.message || err });
      return error(req, 'Failed to load resources', 500);
    }
  }

  const personalConnectionMatch = path.match(
    /^\/api\/users\/me\/resources\/connections\/(?!test$)([^/]+)$/
  );
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

  if (req.method === 'POST' && path === '/api/users/me/resources/connections/test') {
    let body;
    try {
      body = await req.json();
    } catch {
      return error(req, 'Invalid JSON body', 400);
    }

    const connectionId = String(body.id || body.connection_id || '').trim();
    const db = createDB(env.DB);
    let existingConnection = null;
    if (connectionId) {
      existingConnection = await getUserOpenAIConnectionConfig(db, user.sub, connectionId);
    }

    const providerType =
      String(
        body.provider_type ||
          body.providerType ||
          existingConnection?.providerType ||
          'openai-compatible'
      )
        .trim()
        .toLowerCase() || 'openai-compatible';
    const baseUrlRaw = String(
      body.base_url || body.baseUrl || existingConnection?.baseUrl || ''
    ).trim();
    const baseUrl = baseUrlRaw || getConnectionDefaultBaseUrl(providerType);
    if (isConnectionUrlRequired(providerType) && !baseUrlRaw) {
      return error(req, 'Connection URL is required for compatible providers', 400);
    }
    if (!/^https?:\/\//i.test(baseUrl)) {
      return error(req, 'Connection URL must start with http:// or https://', 400);
    }
    const urlSafety = isSafeOutboundUrl(baseUrl);
    if (!urlSafety.safe) {
      return error(req, urlSafety.reason, 400);
    }

    let headers = {};
    try {
      if (typeof body.headers === 'string' && body.headers.trim()) {
        const parsed = JSON.parse(body.headers);
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
          throw new Error('Headers must be a JSON object');
        }
        headers = parsed;
      } else if (body.headers && typeof body.headers === 'object' && !Array.isArray(body.headers)) {
        headers = body.headers;
      }
    } catch (err) {
      return error(req, err?.message || 'Headers must be valid JSON', 400);
    }

    const connection = {
      providerType,
      providerFamily: providerType,
      baseUrl,
      key: String(body.key || existingConnection?.key || '').trim(),
      headers: Object.keys(headers).length ? headers : existingConnection?.headers || {},
      authType: String(body.auth_type || body.authType || existingConnection?.authType || '')
        .trim()
        .toLowerCase(),
    };

    try {
      const discovery = await discoverConnectionModels(connection, {
        headers: buildConnectionHeaders(connection),
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
            const rawId = String(
              item?.id || item?.modelId || item?.model_id || item?.name || ''
            ).trim();
            const displayName = String(
              item?.displayName || item?.display_name || item?.name || rawId || ''
            ).trim();
            return {
              id: rawId.startsWith('models/') ? rawId.slice('models/'.length) : rawId,
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

  if (req.method === 'GET' && path === '/api/users/me/resources/mcp-servers') {
    const db = createDB(env.DB);
    try {
      const payload = await loadWorkspaceToolServersPayload({
        db,
        userId: user.sub,
      });
      return json(req, payload);
    } catch (err) {
      logger.error('Load user MCP servers failed', { error: err?.message || err });
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
    const mcpUrlSafety = isSafeOutboundUrl(url);
    if (!mcpUrlSafety.safe) {
      return error(req, mcpUrlSafety.reason, 400);
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

  if (req.method === 'POST' && path === '/api/users/me/resources/mcp-servers/oauth/start') {
    let body;
    try {
      body = await req.json();
    } catch {
      return error(req, 'Invalid JSON body', 400);
    }

    const serverId = String(body.id || '').trim();
    if (!serverId) {
      return error(req, 'Server must be saved before OAuth connect', 400);
    }

    const db = createDB(env.DB);
    const servers = await loadUserToolServers(db, user.sub);
    const serverIndex = servers.findIndex((entry) => String(entry.id) === serverId);
    const existingServer = serverIndex === -1 ? null : servers[serverIndex];
    if (!existingServer) {
      return error(req, 'Server must be saved before OAuth connect', 400);
    }

    const serverUrl = String(body.url || existingServer?.url || '').trim();
    if (!serverUrl || !/^https?:\/\//i.test(serverUrl)) {
      return error(req, 'Server URL must start with http:// or https://', 400);
    }
    const userOauthUrlSafety = isSafeOutboundUrl(serverUrl);
    if (!userOauthUrlSafety.safe) {
      return error(req, userOauthUrlSafety.reason, 400);
    }

    const oauthClientName = String(
      body.oauth_client_name || existingServer.oauth_client_name || 'GrowChat MCP Client'
    ).trim();
    const oauthScope = String(body.oauth_scope || existingServer.oauth_scope || '').trim();
    const authServerUrl = String(
      body.oauth_authorization_server || existingServer.oauth_authorization_server || serverUrl
    ).trim();

    let metadata;
    try {
      metadata = await discoverAuthorizationMetadata(authServerUrl);
    } catch {
      metadata = null;
    }

    let clientId = String(body.oauth_client_id || existingServer.oauth_client_id || '').trim();
    let clientSecret = String(
      body.oauth_client_secret || existingServer.oauth_client_secret || ''
    ).trim();
    const registrationEndpoint =
      metadata?.registration_endpoint || existingServer.oauth_registration_endpoint || '';
    const redirectUri =
      new URL(req.url).origin + '/api/users/me/resources/mcp-servers/oauth/callback';

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
      normalizeTokenAuthMethod(
        body.oauth_token_auth_method || existingServer.oauth_token_auth_method
      ) ||
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
      ...existingServer,
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

    await saveUserToolServerJson(db, user.sub, serverId, persistedServer);

    return json(req, {
      ok: true,
      authorization_url: authorizationUrl.toString(),
    });
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
    const include = new Set(
      includeParam
        .split(',')
        .map((val) => val.trim())
        .filter(Boolean)
    );
    const includePermissions = include.has('permissions') || include.has('all');
    const includeRoles = include.has('roles') || include.has('all');

    const row = await db.first(
      'SELECT id, email, name, primary_role, account_status, settings, avatar, avatar_emoji, status, preferences, created_at, updated_at, last_active_at FROM users WHERE id = ?',
      [user.sub]
    );

    if (!row) return error(req, 'User not found', 404);
    const fallbackPrimaryRole = normalizePublicRole(row.primary_role);
    const primaryRolePromise = includeRoles
      ? loadPrimaryRole(db, user.sub)
      : Promise.resolve(fallbackPrimaryRole);
    const globalDefaultModelIdPromise = getConfigValue(db, 'default_model_id', null)
      .then((rawDefault) => (rawDefault ? String(rawDefault).trim() : null))
      .catch(() => null);
    const rolesPromise = includeRoles ? getUserRoles(db, user.sub) : Promise.resolve([]);
    const permissionsPromise = includePermissions
      ? resolvePermissions(db, user)
      : Promise.resolve([]);

    const [primaryRoleRaw, globalDefaultModelId, roles, permissions] = await Promise.all([
      primaryRolePromise,
      globalDefaultModelIdPromise,
      rolesPromise,
      permissionsPromise,
    ]);
    const primaryRole = normalizePublicRole(primaryRoleRaw || fallbackPrimaryRole);

    const payload = buildUserProfileResponse(row, {
      defaultModelId: globalDefaultModelId,
      primaryRole,
    });

    if (includePermissions) {
      payload.permissions = permissions;
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

      await db.run(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`, values);

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

      await db.run(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`, values);

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
      resource: 'users',
    });

    if (!authDecision.allow) {
      return error(req, authDecision.reason || 'Forbidden', 403);
    }

    const db = createDB(env.DB);
    const url = new URL(req.url);
    const { limit, offset } = parsePagination(url, {
      defaultLimit: 20,
      maxLimit: 100,
      defaultOffset: 0,
    });
    const query = (url.searchParams.get('q') || '').trim();

    try {
      let countSql = 'SELECT COUNT(*) as count FROM users';
      let dataSql = `SELECT
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
         FROM users u`;

      const params = [];
      const countParams = [];

      if (query) {
        const likeQuery = `%${query}%`;
        const whereClause = ' WHERE u.email LIKE ? OR u.name LIKE ?';
        countSql += whereClause;
        dataSql += whereClause;
        countParams.push(likeQuery, likeQuery);
        params.push(likeQuery, likeQuery);
      }

      dataSql += `
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
         LIMIT ? OFFSET ?`;

      params.push(limit, offset);

      const totalRow = await db.first(countSql, countParams);
      const users = await db.all(dataSql, params);

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
        metadata: { limit, offset, count: parsedUsers.length },
      });

      return json(req, {
        users: parsedUsers,
        total: totalRow?.count || 0,
        limit,
        offset,
      });
    } catch (err) {
      logger.error('List users failed', { error: err?.message || err });
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
      const groupIds = new Set(
        (Array.isArray(groupRows) ? groupRows : []).map((group) => group.id).filter(Boolean)
      );
      const groupMap = new Map(
        (Array.isArray(groupRows) ? groupRows : []).map((group) => [group.id, group.name])
      );
      const userPermissions = await resolvePermissions(db, {
        sub: userId,
        role: primaryRole,
      });
      const modelEnabledMap = await loadModelEnabledMap(db);
      const connectionEnabledMap = new Map(
        (
          await getAllOpenAIConnectionConfigs(env, {
            includeDisabled: true,
            includeHiddenForUser: true,
          })
        ).map((connection) => [String(connection.id || ''), connection.enabled !== false])
      );
      const toolServerEnabledMap = new Map(
        (await loadToolServers(db, { includeHiddenForUser: true })).map((server) => [
          String(server.id || ''),
          server.enabled !== false,
        ])
      );
      const userResourceOverrides = await loadUserResourceOverrides(db, userId);
      const hiddenConnectionIds = new Set(userResourceOverrides?.connections?.hidden_ids || []);
      const hiddenModelIds = new Set(userResourceOverrides?.models?.hidden_ids || []);
      const hiddenToolServerIds = new Set(userResourceOverrides?.tool_servers?.hidden_ids || []);

      const decorateRules = (
        rules = [],
        familyLabel,
        enabledMap = new Map(),
        hiddenIds = new Set()
      ) =>
        (Array.isArray(rules) ? rules : [])
          .filter((rule) => {
            if (rule?.principal_type === 'user') {
              return String(rule.principal_id || '') === String(userId || '');
            }
            return groupIds.has(String(rule.principal_id || ''));
          })
          .map((rule) => {
            const resourceId =
              rule.resource_id || rule.model_id || rule.connection_id || rule.tool_server_id || '';
            const resourceEnabled = enabledMap.has(resourceId) ? enabledMap.get(resourceId) : true;
            const hiddenForUser = hiddenIds.has(resourceId);
            const effect = String(rule.effect || 'allow')
              .trim()
              .toLowerCase();
            const accessState = !resourceEnabled
              ? 'disabled'
              : hiddenForUser
                ? 'hidden_for_user'
                : effect === 'deny'
                  ? 'revoked'
                  : rule.principal_type === 'group'
                    ? 'shared'
                    : 'personal';
            return {
              family: familyLabel,
              resource_id: resourceId,
              resource_enabled: resourceEnabled,
              visible_for_user: !hiddenForUser && resourceEnabled,
              hidden_for_user: hiddenForUser,
              access_state: accessState,
              principal_type: rule.principal_type,
              principal_id: rule.principal_id,
              principal_label:
                rule.principal_type === 'group'
                  ? `Group: ${groupMap.get(rule.principal_id) || rule.principal_id}`
                  : 'Direct user',
              effect,
              action: rule.action,
            };
          });

      const modelRules = decorateRules(
        await loadModelAclRules(db),
        'model',
        modelEnabledMap,
        hiddenModelIds
      );
      const connectionRules = decorateRules(
        await loadConnectionAclRules(db),
        'connection',
        connectionEnabledMap,
        hiddenConnectionIds
      );
      const toolServerRules = decorateRules(
        await loadToolServerAclRules(db),
        'mcp_server',
        toolServerEnabledMap,
        hiddenToolServerIds
      );

      return json(req, {
        user: {
          id: targetUser.id,
          email: targetUser.email,
          name: targetUser.name,
          account_status: normalizeAccountStatus(targetUser.account_status),
          primary_role: primaryRole,
        },
        groups: Array.from(groupMap.entries()).map(([id, name]) => ({
          id,
          name,
        })),
        role_permissions: userPermissions,
        access: {
          models: modelRules,
          connections: connectionRules,
          mcp_servers: toolServerRules,
        },
      });
    } catch (err) {
      logger.error('Inspect user access failed', { error: err?.message || err });
      return error(req, 'Failed to inspect user access', 500);
    }
  }

  // POST /api/admin/users - Create user (admin only)
  if (req.method === 'POST' && path === '/api/admin/users') {
    const authDecision = await authorize(env, user, {
      action: 'admin.user.write',
      resource: 'users',
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
      email = validateEmail(
        requireString(body.email, 'email, name, and password are required').toLowerCase()
      );
      name = requireString(body.name, 'email, name, and password are required');
      password = requireString(body.password, 'email, name, and password are required', {
        trim: false,
      });
    } catch (err) {
      if (err instanceof ValidationError) {
        return error(req, err.message, 400);
      }
      throw err;
    }
    const requestedRole = String(body.primary_role || 'member').trim();
    const role = await resolveRequestedRole(db, requestedRole);
    const accountStatus = normalizeAccountStatus(body.account_status, 'active');

    if (password.length < 8) {
      return error(req, 'Password must be at least 8 characters', 400);
    }

    if (!role) {
      return error(req, 'primary_role must match an existing role', 400);
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
      metadata: { email, primary_role: role },
    });

    return json(
      req,
      {
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
      },
      201
    );
  }

  // POST /api/admin/users/import - Bulk import users from CSV (admin only)
  if (req.method === 'POST' && path === '/api/admin/users/import') {
    const authDecision = await authorize(env, user, {
      action: 'admin.user.write',
      resource: 'users',
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
      const role = await resolveRequestedRole(db, requestedRole);
      const accountStatus = normalizeAccountStatus(accountStatusRaw, 'active');

      if (!name || !email || !password || !requestedRole) {
        results.push({
          row: rowNumber,
          ok: false,
          error: 'Each row must include name, email, password, primary_role',
        });
        continue;
      }

      if (!isValidEmail(email)) {
        results.push({
          row: rowNumber,
          ok: false,
          error: 'Invalid email format',
        });
        continue;
      }

      if (!role) {
        results.push({
          row: rowNumber,
          ok: false,
          error: 'primary_role must match an existing role',
        });
        continue;
      }

      if (password.length < 8) {
        results.push({
          row: rowNumber,
          ok: false,
          error: 'Password must be at least 8 characters',
        });
        continue;
      }

      const existing = await db.first('SELECT id FROM users WHERE email = ?', [email]);
      if (existing) {
        results.push({
          row: rowNumber,
          ok: false,
          error: 'Email already registered',
        });
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
      results.push({
        row: rowNumber,
        ok: true,
        email,
        primary_role: role,
        account_status: accountStatus,
      });
      created += 1;
    }

    await logAuditEvent(env, {
      actor_id: user.sub,
      action: 'user_imported',
      resource_type: 'users',
      resource_id: null,
      metadata: { created, attempted: results.length },
    });

    return json(
      req,
      {
        ok: true,
        created,
        results,
      },
      201
    );
  }

  // GET /api/admin/users/:id - Get specific user (admin only)
  if (req.method === 'GET' && path.match(/^\/api\/admin\/users\/[^/]+$/)) {
    // Check authorization
    const userId = path.split('/').pop();
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
        resource_id: userId,
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
      logger.error('Get user failed', { error: err?.message || err });
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
      resourceId: userId,
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
    const existing = await db.first(
      'SELECT id, account_status, email, name FROM users WHERE id = ?',
      [userId]
    );
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
    let roleChanged = false;

    // Allow updating primary role (for admin promotion/demotion)
    if (body.primary_role !== undefined) {
      const requestedRole = String(body.primary_role || '').trim();
      const resolvedRole = await resolveRequestedRole(db, requestedRole);
      if (!resolvedRole) {
        return error(req, 'primary_role must match an existing role', 400);
      }
      newRole = resolvedRole;
      roleChanged = newRole !== oldRole;
      // Check last-owner protection for admin role or admin account disablement
      if (oldRole === 'admin' && (newRole !== 'admin' || newAccountStatus !== 'active')) {
        const isLastAdmin = await isLastOwnerOfRole(env, userId, 'admin');
        if (isLastAdmin) {
          return error(req, 'Cannot demote last admin', 409);
        }
      }
      updatedFields.push('primary_role');
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
      const name = stripHtml(body.name);
      if (!name) {
        return error(req, 'Name cannot be empty after removing invalid characters', 400);
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

      const duplicate = await db.first('SELECT id FROM users WHERE email = ? AND id != ?', [
        email,
        userId,
      ]);
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

    if (updates.length === 0 && !roleChanged) {
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
          },
        });
      }

      // Log generic user update
      await logAuditEvent(env, {
        actor_id: user.sub,
        action: 'user_updated',
        resource_type: 'user',
        resource_id: userId,
        metadata: { fields_updated: updatedFields },
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
          name: escapeHtml(String(updated.name || '')),
          primary_role: newRole,
          account_status: normalizeAccountStatus(updated.account_status),
          settings: parseSettings(updated.settings),
          created_at: updated.created_at,
          updated_at: updated.updated_at,
        },
      });
    } catch (err) {
      logger.error('Update user failed', { error: err?.message || err });
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
      resourceId: userId,
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
      const existing = await db.first('SELECT id, account_status FROM users WHERE id = ?', [
        userId,
      ]);
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
        metadata: {
          previous_primary_role: oldRole,
          previous_account_status: oldAccountStatus,
        },
      });

      return json(req, { success: true, message: 'User deleted successfully' });
    } catch (err) {
      logger.error('Delete user failed', { error: err?.message || err });
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
