/**
 * MCP OAuth flow handlers — extracted from handleUsersMcp.
 * Handles the OAuth authorization code exchange and OAuth start flow.
 */
import { HTTP_STATUS } from '../../shared/http-status.js';
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
import { buildTokenRequest } from '../oauth-shared.js';
import { isSafeOutboundUrl } from '../../utils/validation.js';
import { json, error } from '../../utils/response.js';

/* -------------------------------------------------------------------------- */
/* OAuth callback helpers                                                     */
/* -------------------------------------------------------------------------- */

function parseCallbackQuery(req) {
  const url = new URL(req.url);
  return {
    code: url.searchParams.get('code'),
    state: url.searchParams.get('state'),
    error: url.searchParams.get('error'),
  };
}

function oauthCallbackError(message, status = HTTP_STATUS.BAD_REQUEST) {
  return new Response(message, { status });
}

async function loadCallbackServer(db, state) {
  const server = await findUserToolServerByOauthState(db, state);
  if (!server) return null;
  const ownerRow = await db.first('SELECT account_status FROM users WHERE id = ?', [
    server.user_id,
  ]);
  if (ownerRow?.account_status && ownerRow.account_status !== 'active') {
    return { blocked: true };
  }
  return { server };
}

async function exchangeCodeForTokens(tokenEndpoint, params, headers) {
  // URL is validated via isSafeOutboundUrl before this helper is called.
  const tokenRes = await fetch(tokenEndpoint, { method: 'POST', headers, body: params });
  if (!tokenRes.ok) {
    const text = await tokenRes.text().catch(() => '');
    throw new Error(`Token exchange failed: ${text}`);
  }
  return tokenRes.json();
}

async function persistConnectedServer(db, server, tokenData) {
  const connectedAt = new Date().toISOString();
  const updatedServer = {
    ...server,
    oauth_tokens: { ...tokenData, connected_at: connectedAt },
    oauth_connected_at: connectedAt,
    oauth_state: null,
    oauth_code_verifier: null,
  };
  await saveUserToolServerJson(db, server.user_id, server.id, updatedServer);
}

/* -------------------------------------------------------------------------- */
/* OAuth start helpers                                                        */
/* -------------------------------------------------------------------------- */

async function parseJsonBody(req) {
  try {
    return await req.json();
  } catch {
    return null;
  }
}

function resolveServerId(body) {
  const serverId = String(body?.id || '').trim();
  return serverId || null;
}

async function loadExistingServer(db, userSub, serverId) {
  const servers = await loadUserToolServers(db, userSub);
  return servers.find((entry) => String(entry.id) === serverId);
}

function resolveServerUrl(body, existingServer) {
  const url = String(body?.url || existingServer?.url || '').trim();
  if (!url || !/^https?:\/\//i.test(url)) return null;
  return url;
}

function resolveOAuthString(body, existingServer, key) {
  return String(body?.[key] || existingServer?.[key] || '').trim();
}

function resolveClientCredentials(body, existingServer, metadata) {
  return {
    clientId: resolveOAuthString(body, existingServer, 'oauth_client_id'),
    clientSecret: resolveOAuthString(body, existingServer, 'oauth_client_secret'),
    registrationEndpoint: metadata?.registration_endpoint || '',
  };
}

async function registerOAuthClient(registrationEndpoint, redirectUri, body) {
  const payload = buildRegistrationPayload(body, redirectUri);
  // URL is validated via isSafeOutboundUrl before dynamic registration is attempted.
  const res = await fetch(registrationEndpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error('Client registration failed');
  const data = await res.json();
  return parseRegistrationResponse(data);
}

function buildRegistrationPayload(body, redirectUri) {
  return {
    client_name: body?.oauth_client_name || 'GrowChat MCP Client',
    redirect_uris: [redirectUri],
    grant_types: ['authorization_code', 'refresh_token'],
    response_types: ['code'],
  };
}

function parseRegistrationResponse(data) {
  return {
    clientId: String(data.client_id || '').trim(),
    clientSecret: String(data.client_secret || '').trim(),
  };
}
async function ensureClientCredentials(
  body,
  existingServer,
  metadata,
  registrationEndpoint,
  redirectUri
) {
  const { clientId, clientSecret } = resolveClientCredentials(body, existingServer, metadata);
  if (clientId) return { clientId, clientSecret };
  if (!registrationEndpoint) {
    throw new Error('Authorization server does not support dynamic client registration');
  }
  return registerOAuthClient(registrationEndpoint, redirectUri, body);
}

function resolveTokenAuthMethod(body, existingServer, metadata, clientSecret) {
  return (
    normalizeTokenAuthMethod(
      body?.oauth_token_auth_method || existingServer?.oauth_token_auth_method
    ) ||
    selectTokenAuthMethod(
      metadata?.token_endpoint_auth_methods_supported || [],
      Boolean(clientSecret)
    )
  );
}

async function discoverOauthMetadata(serverUrl) {
  try {
    return await discoverAuthorizationMetadata(serverUrl);
  } catch {
    return null;
  }
}

async function parseAndValidateBody(req) {
  const body = await parseJsonBody(req);
  if (body === null) return { error: error(req, 'Invalid JSON body', HTTP_STATUS.BAD_REQUEST) };
  return { body };
}

function validateServerId(req, body) {
  const serverId = resolveServerId(body);
  if (!serverId) {
    return {
      error: error(req, 'Server must be saved before OAuth connect', HTTP_STATUS.BAD_REQUEST),
    };
  }
  return { serverId };
}

async function loadAndValidateServer(req, env, user, serverId) {
  const db = createDB(env.DB);
  const existingServer = await loadExistingServer(db, user.sub, serverId);
  if (!existingServer) {
    return {
      error: error(req, 'Server must be saved before OAuth connect', HTTP_STATUS.BAD_REQUEST),
    };
  }
  return { db, existingServer };
}

function validateServerUrl(req, body, existingServer) {
  const serverUrl = resolveServerUrl(body, existingServer);
  if (!serverUrl) {
    return {
      error: error(req, 'Server URL must start with http:// or https://', HTTP_STATUS.BAD_REQUEST),
    };
  }
  return { serverUrl };
}

async function discoverAndValidateRegistration(req, serverUrl, existingServer) {
  const metadata = await discoverOauthMetadata(serverUrl);
  const registrationEndpoint =
    metadata?.registration_endpoint || existingServer.oauth_registration_endpoint || '';
  if (registrationEndpoint) {
    const regSafety = isSafeOutboundUrl(registrationEndpoint);
    if (!regSafety.safe) return { error: error(req, regSafety.reason, HTTP_STATUS.BAD_REQUEST) };
  }
  return { metadata, registrationEndpoint };
}

async function validateOauthStartRequest(req, env, user) {
  const steps = [
    () => parseAndValidateBody(req),
    (ctx) => validateServerId(req, ctx.body),
    (ctx) => loadAndValidateServer(req, env, user, ctx.serverId),
    (ctx) => validateServerUrl(req, ctx.body, ctx.existingServer),
    (ctx) => discoverAndValidateRegistration(req, ctx.serverUrl, ctx.existingServer),
  ];

  let ctx = {};
  for (const step of steps) {
    const result = await step(ctx);
    if (result.error) return result;
    ctx = { ...ctx, ...result };
  }

  return ctx;
}

const PKCE_VERIFIER_LENGTH = 64;
const PKCE_STATE_LENGTH = 32;

function resolveClientRegistrationError(req, err) {
  const status = err?.message?.includes('does not support')
    ? HTTP_STATUS.BAD_REQUEST
    : HTTP_STATUS.BAD_GATEWAY;
  return error(req, err?.message || 'OAuth client registration failed', status);
}

async function generatePkceState() {
  const codeVerifier = randomString(PKCE_VERIFIER_LENGTH);
  const codeChallenge = await sha256Base64Url(codeVerifier);
  return { codeVerifier, codeChallenge, state: randomString(PKCE_STATE_LENGTH) };
}
function buildPersistedServer(
  existingServer,
  body,
  serverUrl,
  clientId,
  clientSecret,
  metadata,
  registrationEndpoint,
  tokenAuthMethod,
  state,
  codeVerifier
) {
  return {
    ...existingServer,
    auth_type: 'oauth',
    ...buildOauthBodyFields(body),
    oauth_client_id: clientId,
    oauth_client_secret: clientSecret,
    oauth_authorization_server: serverUrl,
    oauth_token_endpoint: metadata?.token_endpoint || '/token',
    oauth_registration_endpoint: registrationEndpoint,
    oauth_token_auth_method: tokenAuthMethod,
    oauth_state: state,
    oauth_code_verifier: codeVerifier,
  };
}

function buildOauthBodyFields(body) {
  const OAUTH_BODY_FIELDS = ['oauth_client_name', 'oauth_scope'];
  const acc = {};
  OAUTH_BODY_FIELDS.forEach((field) => {
    acc[field] = bodyFieldToString(body, field);
  });
  return acc;
}

function bodyFieldToString(body, field) {
  return String(body?.[field] || '');
}

/* -------------------------------------------------------------------------- */
/* Handlers                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * Handle OAuth authorization_code token exchange (callback).
 * Called from handleUsersMcp when path matches /oauth/callback.
 */
export async function handleOauthCallback(req, env, origin) {
  const db = createDB(env.DB);
  const { code, state, error: errParam } = parseCallbackQuery(req);

  if (errParam) return oauthCallbackError(`Authorization failed: ${errParam}`);
  if (!code || !state) return oauthCallbackError('Missing authorization code or state');

  const serverLookup = await loadCallbackServer(db, state);
  if (!serverLookup) return oauthCallbackError('OAuth session not found or expired');
  if (serverLookup.blocked)
    return oauthCallbackError('Account pending approval.', HTTP_STATUS.FORBIDDEN);

  const server = serverLookup.server;
  const { tokenEndpoint, params, headers } = buildTokenRequest(server, code, origin);

  const tokenEndpointSafety = isSafeOutboundUrl(tokenEndpoint);
  if (!tokenEndpointSafety.safe) {
    return oauthCallbackError(`Token exchange failed: ${tokenEndpointSafety.reason}`);
  }

  try {
    const tokenData = await exchangeCodeForTokens(tokenEndpoint, params, headers);
    await persistConnectedServer(db, server, tokenData);
    return new Response(
      '<html><body><h2>OAuth connected.</h2><p>You can return to GrowChat and click Verify.</p></body></html>',
      { headers: { 'Content-Type': 'text/html' } }
    );
  } catch (err) {
    return oauthCallbackError(`Token exchange failed: ${err?.message || String(err)}`);
  }
}

/**
 * Handle OAuth start flow — discover metadata, register client, build auth URL.
 * Called from handleUsersMcp when path matches /oauth/start.
 */
export async function handleOauthStart(req, env, user, origin) {
  const startCtx = await validateOauthStartRequest(req, env, user);
  if (startCtx.error) return startCtx.error;

  const redirectUri = origin + '/api/users/me/resources/mcp-servers/oauth/callback';

  let clientId;
  let clientSecret;
  try {
    ({ clientId, clientSecret } = await ensureClientCredentials(
      startCtx.body,
      startCtx.existingServer,
      startCtx.metadata,
      startCtx.registrationEndpoint,
      redirectUri
    ));
  } catch (err) {
    return resolveClientRegistrationError(req, err);
  }

  if (!clientId) return error(req, 'OAuth client ID is required', HTTP_STATUS.BAD_REQUEST);

  const tokenAuthMethod = resolveTokenAuthMethod(
    startCtx.body,
    startCtx.existingServer,
    startCtx.metadata,
    Boolean(clientSecret)
  );
  const tokenEndpoint = startCtx.metadata?.token_endpoint || '/token';
  const tokenEndpointSafety = isSafeOutboundUrl(tokenEndpoint);
  if (!tokenEndpointSafety.safe)
    return error(req, tokenEndpointSafety.reason, HTTP_STATUS.BAD_REQUEST);

  const { codeVerifier, codeChallenge, state } = await generatePkceState();
  const authorizationEndpoint = startCtx.metadata?.authorization_endpoint || '/authorize';
  const authorizationUrl = buildAuthorizationUrl({
    authorizationEndpoint,
    clientId,
    redirectUri,
    scope: startCtx.body.oauth_scope || '',
    state,
    codeChallenge,
  });

  const persistedServer = buildPersistedServer(
    startCtx.existingServer,
    startCtx.body,
    startCtx.serverUrl,
    clientId,
    clientSecret,
    startCtx.metadata,
    startCtx.registrationEndpoint,
    tokenAuthMethod,
    state,
    codeVerifier
  );
  await saveUserToolServerJson(startCtx.db, user.sub, startCtx.serverId, persistedServer);

  return json(req, { ok: true, authorization_url: authorizationUrl.toString() });
}
