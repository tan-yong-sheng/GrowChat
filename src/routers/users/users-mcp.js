/**
 * Users Mcp Handler
 */
import {
  buildAuthorizationUrl,
  createUserToolServer,
  deleteUserToolServer,
  discoverAuthorizationMetadata,
  loadUserToolServers,
  normalizeTokenAuthMethod,
  randomString,
  selectTokenAuthMethod,
  sha256Base64Url,
  testToolServerConnection,
  updateUserToolServer,
} from '../../admin/tool-servers.js';
import { createDB } from '../../db.js';
import {
  loadWorkspaceToolServersPayload,
  toPersonalToolServerSummary,
} from '../../services/workspace-settings.js';
import { logAuditEvent } from '../../utils/authorize.js';
import { error, json } from '../../utils/response.js';
import { isSafeOutboundUrl } from '../../utils/validation.js';
import { findUserToolServerByOauthState, saveUserToolServerJson } from './users-helpers.js';

/**
 * Handle users/mcp routes.
 * Returns Response if handled, null if path doesn't match.
 */
export async function handleUsersMcp(req, env, ctx, user, path, { _db, logger, _requestContext }) {
  if (req.method === 'GET' && path === '/api/users/me/resources/mcp-servers/oauth/callback') {
    const origin = (env.APP_PUBLIC_ORIGIN || '').replace(/\/$/, '');
    if (!origin) {
      return error(req, 'APP_PUBLIC_ORIGIN is not configured', 500);
    }
    const db = createDB(env.DB);
    const url = new URL(req.url);
    const code = url.searchParams.get('code');
    const state = url.searchParams.get('state');
    const errParam = url.searchParams.get('error');
    if (errParam) {
      return new Response(`Authorization failed: ${errParam}`, {
        status: 400,
        headers: { 'Content-Type': 'text/plain; charset=utf-8' },
      });
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
    const tokenEndpointSafety = isSafeOutboundUrl(tokenEndpoint);
    if (!tokenEndpointSafety.safe) {
      return new Response(`Token exchange failed: ${tokenEndpointSafety.reason}`, { status: 400 });
    }
    const clientId = String(server.oauth_client_id || '').trim();
    const clientSecret = String(server.oauth_client_secret || '').trim();
    const codeVerifier = String(server.oauth_code_verifier || '').trim();
    const tokenAuthMethod =
      normalizeTokenAuthMethod(server.oauth_token_auth_method) || 'client_secret_post';
    const redirectUri = origin + '/api/users/me/resources/mcp-servers/oauth/callback';

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

  if (req.method === 'GET' && path === '/api/users/me/resources/mcp-servers') {
    if (user.account_status && user.account_status !== 'active') {
      return error(req, 'Account pending approval.', 403);
    }
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
    if (user.account_status && user.account_status !== 'active') {
      return error(req, 'Account pending approval.', 403);
    }
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
    if (user.account_status && user.account_status !== 'active') {
      return error(req, 'Account pending approval.', 403);
    }
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
    if (user.account_status && user.account_status !== 'active') {
      return error(req, 'Account pending approval.', 403);
    }
    const origin = (env.APP_PUBLIC_ORIGIN || '').replace(/\/$/, '');
    if (!origin) {
      return error(req, 'APP_PUBLIC_ORIGIN is not configured', 500);
    }

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
    const authServerUrlSafety = isSafeOutboundUrl(authServerUrl);
    if (!authServerUrlSafety.safe) {
      return error(req, authServerUrlSafety.reason, 400);
    }

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
    const redirectUri = origin + '/api/users/me/resources/mcp-servers/oauth/callback';

    if (registrationEndpoint) {
      const registrationEndpointSafety = isSafeOutboundUrl(registrationEndpoint);
      if (!registrationEndpointSafety.safe) {
        return error(req, registrationEndpointSafety.reason, 400);
      }
    }

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
    const tokenEndpointSafety = isSafeOutboundUrl(tokenEndpoint);
    if (!tokenEndpointSafety.safe) {
      return error(req, tokenEndpointSafety.reason, 400);
    }

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
      if (user.account_status && user.account_status !== 'active') {
        return error(req, 'Account pending approval.', 403);
      }
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
      if (user.account_status && user.account_status !== 'active') {
        return error(req, 'Account pending approval.', 403);
      }
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

  return null;
}
