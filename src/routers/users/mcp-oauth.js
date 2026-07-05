/**
 * MCP OAuth flow handlers — extracted from handleUsersMcp.
 * Handles the OAuth authorization code exchange and OAuth start flow.
 *
 * handleOauthCallback:  Lines 32-130 of old file (98 lines, ~25 cyclomatic)
 *   Exchanges authorization_code for tokens and updates the server record.
 * handleOauthStart:     Lines 218-290 of old file (72 lines, ~30 cyclomatic)
 *   Initiates OAuth flow by discovering metadata and building authorization URL.
 */
import { createDB } from '../../db.js';
import {
  buildAuthorizationUrl,
  discoverAuthorizationMetadata,
  loadUserToolServers,
  normalizeTokenAuthMethod,
  randomString,
  selectTokenAuthMethod,
  sha256Base64Url,
} from '../../admin/tool-servers.js';
import { findUserToolServerByOauthState, saveUserToolServerJson } from './users-helpers.js';
import { isSafeOutboundUrl } from '../../utils/validation.js';
import { json, error } from '../../utils/response.js';

/**
 * Handle OAuth authorization_code token exchange (callback).
 * Called from handleUsersMcp when path matches /oauth/callback.
 */
export async function handleOauthCallback(req, env, origin) {
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
    return new Response('Missing authorization code or state', { status: 400 });
  }

  const server = await findUserToolServerByOauthState(db, state);
  if (!server) {
    return new Response('OAuth session not found or expired', { status: 400 });
  }

  const ownerRow = await db.first('SELECT account_status FROM users WHERE id = ?', server.user_id);
  if (ownerRow?.account_status && ownerRow.account_status !== 'active') {
    return new Response('Account pending approval.', { status: 403 });
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
      oauth_tokens: { ...tokenData, connected_at: connectedAt },
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

/**
 * Handle OAuth start flow — discover metadata, register client, build auth URL.
 * Called from handleUsersMcp when path matches /oauth/start.
 */
export async function handleOauthStart(req, env, user, origin) {
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
  const existingServer = servers.find((entry) => String(entry.id) === serverId);
  if (!existingServer) {
    return error(req, 'Server must be saved before OAuth connect', 400);
  }

  const serverUrl = String(body.url || existingServer?.url || '').trim();
  if (!serverUrl || !/^https?:\/\//i.test(serverUrl)) {
    return error(req, 'Server URL must start with http:// or https://', 400);
  }

  let metadata;
  try {
    metadata = await discoverAuthorizationMetadata(serverUrl);
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

  // Validate registration endpoint before dynamic client registration
  if (registrationEndpoint) {
    const regSafety = isSafeOutboundUrl(registrationEndpoint);
    if (!regSafety.safe) return error(req, regSafety.reason, 400);
  }

  if (!clientId) {
    if (!registrationEndpoint) {
      return error(req, 'Authorization server does not support dynamic client registration', 400);
    }
    // Dynamic client registration
    const registrationPayload = {
      client_name: body.oauth_client_name || 'GrowChat MCP Client',
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
      return error(req, 'Client registration failed', 502);
    }
    const registrationData = await registrationRes.json();
    clientId = String(registrationData.client_id || '').trim();
    clientSecret = String(registrationData.client_secret || '').trim();
  }

  if (!clientId) return error(req, 'OAuth client ID is required', 400);

  const tokenAuthMethod =
    normalizeTokenAuthMethod(
      body.oauth_token_auth_method || existingServer.oauth_token_auth_method
    ) ||
    selectTokenAuthMethod(
      metadata?.token_endpoint_auth_methods_supported || [],
      Boolean(clientSecret)
    );

  // Validate token endpoint before building auth URL
  const tokenEndpoint = metadata?.token_endpoint || '/token';
  const tokenEndpointSafety = isSafeOutboundUrl(tokenEndpoint);
  if (!tokenEndpointSafety.safe) return error(req, tokenEndpointSafety.reason, 400);

  const codeVerifier = randomString(64);
  const codeChallenge = await sha256Base64Url(codeVerifier);
  const state = randomString(32);
  const authorizationEndpoint = metadata?.authorization_endpoint || '/authorize';

  const authorizationUrl = buildAuthorizationUrl({
    authorizationEndpoint,
    clientId,
    redirectUri,
    scope: body.oauth_scope || '',
    state,
    codeChallenge,
  });

  const persistedServer = {
    ...existingServer,
    auth_type: 'oauth',
    oauth_client_name: body.oauth_client_name || '',
    oauth_scope: body.oauth_scope || '',
    oauth_client_id: clientId,
    oauth_client_secret: clientSecret,
    oauth_authorization_server: serverUrl,
    oauth_token_endpoint: tokenEndpoint,
    oauth_registration_endpoint: registrationEndpoint,
    oauth_token_auth_method: tokenAuthMethod,
    oauth_state: state,
    oauth_code_verifier: codeVerifier,
  };

  await saveUserToolServerJson(db, user.sub, serverId, persistedServer);

  return json(req, { ok: true, authorization_url: authorizationUrl.toString() });
}
