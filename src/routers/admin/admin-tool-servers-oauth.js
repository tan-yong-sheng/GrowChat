/**
 * Admin Tool Servers OAuth Handlers - /api/admin/tool-servers/oauth/*
 */
import { error, json } from '../../utils/response.js';
import { buildTokenRequest } from '../oauth-shared.js';
import { HTTP_STATUS } from '../../shared/http-status.js';
import {
  buildAuthorizationUrl,
  discoverAuthorizationMetadata,
  isValidHttpUrl,
  loadToolServers,
  normalizeTokenAuthMethod,
  randomString,
  saveToolServers,
  selectTokenAuthMethod,
  sha256Base64Url,
} from '../../admin/tool-servers.js';
import { parseJsonAndRequireAdminAcl } from './admin-helpers.js';
import { isSafeOutboundUrl } from '../../utils/validation.js';

const MAX_SERVER_NAME_LENGTH = 200;
const OAUTH_CODE_VERIFIER_LENGTH = 64;
const OAUTH_STATE_LENGTH = 32;

const OAUTH_START_PATH = '/api/admin/tool-servers/oauth/start';
const OAUTH_CALLBACK_PATH = '/api/admin/tool-servers/oauth/callback';

const OAUTH_GRANT_TYPES = ['authorization_code', 'refresh_token'];
const OAUTH_RESPONSE_TYPES = ['code'];
const DEFAULT_OAUTH_CLIENT_NAME = 'GrowChat MCP Client';

const REGISTRATION_PAYLOAD_TEMPLATE = {
  grant_types: OAUTH_GRANT_TYPES,
  response_types: OAUTH_RESPONSE_TYPES,
};

/* -------------------------------------------------------------------------- */
/* Origin helper                                                                */
/* -------------------------------------------------------------------------- */

function getOrigin(env) {
  return (env.APP_PUBLIC_ORIGIN || '').replace(/\/$/, '') || null;
}

/* -------------------------------------------------------------------------- */
/* URL safety check                                                            */
/* -------------------------------------------------------------------------- */

function safeUrlOrError(req, url) {
  const safety = isSafeOutboundUrl(url);
  if (!safety.safe) return error(req, safety.reason, HTTP_STATUS.BAD_REQUEST);
  return null;
}

/* -------------------------------------------------------------------------- */
/* Server field extraction                                                    */
/* -------------------------------------------------------------------------- */

function extractField(body, server, key, defaultValue = '') {
  return String(body[key] || server[key] || defaultValue).trim();
}

function findServerById(servers, serverId) {
  const index = servers.findIndex((entry) => String(entry.id) === serverId);
  return { index, server: index === -1 ? null : servers[index] };
}

/* -------------------------------------------------------------------------- */
/* OAuth start helpers                                                         */
/* -------------------------------------------------------------------------- */

function requireOrigin(req, env) {
  const origin = getOrigin(env);
  if (!origin) {
    return error(req, 'APP_PUBLIC_ORIGIN is not configured', HTTP_STATUS.INTERNAL_SERVER_ERROR);
  }
  return origin;
}

async function prepareOAuthStartContext(req, env, user) {
  const origin = requireOrigin(req, env);
  if (typeof origin !== 'string') return { error: origin };
  const { body, error: denied } = await parseJsonAndRequireAdminAcl(req, env, user, 'tool-server');
  if (denied) return { error: denied };
  return { origin, body };
}

function requireSavedServer(req, serverId) {
  if (serverId) return null;
  return error(req, 'Server must be saved before OAuth connect', HTTP_STATUS.BAD_REQUEST);
}

function validateServerUrl(req, serverUrl) {
  if (!serverUrl || !isValidHttpUrl(serverUrl)) {
    return error(req, 'Server URL must start with http:// or https://', HTTP_STATUS.BAD_REQUEST);
  }
  return safeUrlOrError(req, serverUrl);
}

async function loadAndValidateServer(req, db, body) {
  const serverId = extractField(body, {}, 'id');
  const missingServer = requireSavedServer(req, serverId);
  if (missingServer) return { error: missingServer };

  const servers = await loadToolServers(db);
  const { index, server: existingServer } = findServerById(servers, serverId);
  const notSaved = requireSavedServer(req, existingServer);
  if (notSaved) return { error: notSaved };

  const serverUrl = extractField(body, existingServer, 'url');
  const invalidUrl = validateServerUrl(req, serverUrl);
  if (invalidUrl) return { error: invalidUrl };

  return { servers, serverIndex: index, server: existingServer, serverUrl };
}

function resolveAuthServerUrl(body, server, serverUrl) {
  return extractField(body, server, 'oauth_authorization_server') || serverUrl;
}

async function discoverMetadata(authServerUrl) {
  try {
    return await discoverAuthorizationMetadata(authServerUrl);
  } catch {
    return null;
  }
}

function resolveRegistrationEndpoint(body, server, metadata) {
  return metadata?.registration_endpoint || server.oauth_registration_endpoint || '';
}

async function resolveOAuthMetadata(req, body, server, serverUrl) {
  const authServerUrl = resolveAuthServerUrl(body, server, serverUrl);
  const unsafeAuthUrl = safeUrlOrError(req, authServerUrl);
  if (unsafeAuthUrl) return { error: unsafeAuthUrl };

  const metadata = await discoverMetadata(authServerUrl);
  const registrationEndpoint = resolveRegistrationEndpoint(body, server, metadata);

  if (registrationEndpoint) {
    const unsafeReg = safeUrlOrError(req, registrationEndpoint);
    if (unsafeReg) return { error: unsafeReg };
  }

  return { authServerUrl, metadata, registrationEndpoint };
}

function buildRegistrationPayload(clientName, redirectUri) {
  return {
    ...REGISTRATION_PAYLOAD_TEMPLATE,
    client_name: clientName,
    redirect_uris: [redirectUri],
  };
}

async function performDynamicRegistration(registrationEndpoint, payload) {
  return fetch(registrationEndpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
}

async function registerClient(req, registrationEndpoint, clientName, redirectUri) {
  const registrationPayload = buildRegistrationPayload(clientName, redirectUri);
  const registrationRes = await performDynamicRegistration(
    registrationEndpoint,
    registrationPayload
  );
  if (!registrationRes.ok) {
    const text = await registrationRes.text().catch(() => '');
    return error(req, 'Client registration failed', HTTP_STATUS.BAD_GATEWAY, { message: text });
  }
  const data = await registrationRes.json();
  return {
    clientId: extractField(data, {}, 'client_id'),
    clientSecret: extractField(data, {}, 'client_secret'),
  };
}

async function ensureClientCredentials(req, body, server, registrationEndpoint, redirectUri) {
  let clientId = extractField(body, server, 'oauth_client_id');
  let clientSecret = extractField(body, server, 'oauth_client_secret');
  if (clientId) return { clientId, clientSecret };
  if (!registrationEndpoint) {
    return error(
      req,
      'Authorization server does not support dynamic client registration',
      HTTP_STATUS.BAD_REQUEST
    );
  }
  const clientName = extractField(body, server, 'oauth_client_name', DEFAULT_OAUTH_CLIENT_NAME);
  const result = await registerClient(req, registrationEndpoint, clientName, redirectUri);
  if (result.error) return result;
  return { clientId: result.clientId, clientSecret: result.clientSecret };
}

function resolveTokenAuthMethod(body, server, metadata, clientSecret) {
  return (
    normalizeTokenAuthMethod(extractField(body, server, 'oauth_token_auth_method')) ||
    selectTokenAuthMethod(
      metadata?.token_endpoint_auth_methods_supported || [],
      Boolean(clientSecret)
    )
  );
}

function resolveAuthorizationEndpoint(metadata, authServerUrl) {
  return metadata?.authorization_endpoint || new URL('/authorize', authServerUrl).toString();
}

function resolveTokenEndpoint(metadata, authServerUrl) {
  return metadata?.token_endpoint || new URL('/token', authServerUrl).toString();
}

function buildAuthorizationRequest(req, ctx) {
  const {
    body,
    server,
    authServerUrl,
    metadata,
    registrationEndpoint,
    redirectUri,
    clientId,
    clientSecret,
  } = ctx;

  const oauthClientName = extractField(
    body,
    server,
    'oauth_client_name',
    DEFAULT_OAUTH_CLIENT_NAME
  );
  const oauthScope = extractField(body, server, 'oauth_scope');
  const tokenAuthMethod = resolveTokenAuthMethod(body, server, metadata, clientSecret);
  const authorizationEndpoint = resolveAuthorizationEndpoint(metadata, authServerUrl);
  const tokenEndpoint = resolveTokenEndpoint(metadata, authServerUrl);

  const unsafeTokenEndpoint = safeUrlOrError(req, tokenEndpoint);
  if (unsafeTokenEndpoint) return { error: unsafeTokenEndpoint };

  return {
    oauthClientName,
    oauthScope,
    tokenAuthMethod,
    authorizationEndpoint,
    tokenEndpoint,
    registrationEndpoint,
  };
}

function buildPersistedServer(server, fields) {
  return { ...server, ...fields };
}

async function persistServers(db, servers, index, updatedServer) {
  servers[index] = updatedServer;
  await saveToolServers(db, servers);
}

async function assembleAuthorizationUrl(ctx, state, codeChallenge) {
  return buildAuthorizationUrl({
    authorizationEndpoint: ctx.authorizationEndpoint,
    clientId: ctx.clientId,
    redirectUri: ctx.redirectUri,
    scope: ctx.oauthScope,
    state,
    codeChallenge,
  });
}

async function handleOAuthStart(req, env, user, db) {
  const ctx = await prepareOAuthStartContext(req, env, user);
  if (ctx.error) return ctx.error;

  const serverCtx = await loadAndValidateServer(req, db, ctx.body);
  if (serverCtx.error) return serverCtx.error;

  const metaCtx = await resolveOAuthMetadata(req, ctx.body, serverCtx.server, serverCtx.serverUrl);
  if (metaCtx.error) return metaCtx.error;

  const redirectUri = ctx.origin + OAUTH_CALLBACK_PATH;
  const credCtx = await ensureClientCredentials(
    req,
    ctx.body,
    serverCtx.server,
    metaCtx.registrationEndpoint,
    redirectUri
  );
  if (credCtx.error) return credCtx.error;

  if (!credCtx.clientId) {
    return error(req, 'OAuth client ID is required', HTTP_STATUS.BAD_REQUEST);
  }

  const requestCtx = buildAuthorizationRequest(req, {
    body: ctx.body,
    server: serverCtx.server,
    authServerUrl: metaCtx.authServerUrl,
    metadata: metaCtx.metadata,
    registrationEndpoint: metaCtx.registrationEndpoint,
    redirectUri,
    clientId: credCtx.clientId,
    clientSecret: credCtx.clientSecret,
  });
  if (requestCtx.error) return requestCtx.error;

  const codeVerifier = randomString(OAUTH_CODE_VERIFIER_LENGTH);
  const codeChallenge = await sha256Base64Url(codeVerifier);
  const state = randomString(OAUTH_STATE_LENGTH);

  const authorizationUrl = await assembleAuthorizationUrl(
    { ...requestCtx, clientId: credCtx.clientId, redirectUri },
    state,
    codeChallenge
  );

  const persistedServer = buildPersistedServer(serverCtx.server, {
    auth_type: 'oauth',
    oauth_client_name: requestCtx.oauthClientName,
    oauth_scope: requestCtx.oauthScope,
    oauth_client_id: credCtx.clientId,
    oauth_client_secret: credCtx.clientSecret,
    oauth_authorization_server: metaCtx.authServerUrl,
    oauth_token_endpoint: requestCtx.tokenEndpoint,
    oauth_registration_endpoint: requestCtx.registrationEndpoint,
    oauth_token_auth_method: requestCtx.tokenAuthMethod,
    oauth_state: state,
    oauth_code_verifier: codeVerifier,
  });

  await persistServers(db, serverCtx.servers, serverCtx.serverIndex, persistedServer);

  return json(req, {
    ok: true,
    authorization_url: authorizationUrl.toString(),
  });
}

/* -------------------------------------------------------------------------- */
/* OAuth callback helpers                                                      */
/* -------------------------------------------------------------------------- */

function parseCallbackParams(req) {
  const url = new URL(req.url);
  return {
    code: url.searchParams.get('code'),
    state: url.searchParams.get('state'),
    errorParam: url.searchParams.get('error'),
  };
}

function callbackError(message, status = HTTP_STATUS.BAD_REQUEST) {
  return new Response(message, { status });
}

function handleCallbackErrorParam(errorParam) {
  if (!errorParam) return null;
  return callbackError(`Authorization failed: ${errorParam}`);
}

function handleMissingCallbackCode(code, state) {
  if (code && state) return null;
  return callbackError('Missing authorization code or state');
}

function findServerByState(servers, state) {
  const index = servers.findIndex((entry) => entry?.oauth_state === state);
  return { index, server: index === -1 ? null : servers[index] };
}

function handleMissingServerState(index) {
  if (index !== -1) return null;
  return callbackError('OAuth session not found or expired');
}

function resolveCallbackTokenEndpoint(server) {
  return (
    server.oauth_token_endpoint ||
    new URL('/token', server.oauth_authorization_server || server.url).toString()
  );
}

function handleUnsafeCallbackTokenEndpoint(tokenEndpoint) {
  const safety = isSafeOutboundUrl(tokenEndpoint);
  if (safety.safe) return null;
  return callbackError(`Token exchange failed: ${safety.reason}`);
}

async function exchangeToken(tokenEndpoint, params, headers) {
  return fetch(tokenEndpoint, {
    method: 'POST',
    headers,
    body: params,
  });
}

async function handleFailedTokenExchange(tokenRes) {
  if (tokenRes.ok) return null;
  const text = await tokenRes.text().catch(() => '');
  return callbackError(`Token exchange failed: ${text}`);
}

function buildConnectedServer(server, tokenData) {
  const now = new Date().toISOString();
  return {
    ...server,
    oauth_tokens: { ...tokenData, connected_at: now },
    oauth_connected_at: now,
    oauth_state: null,
    oauth_code_verifier: null,
  };
}

function handleCallbackException(err) {
  return callbackError(`Token exchange failed: ${err?.message || String(err)}`);
}

function buildConnectedResponse() {
  return new Response(
    '<html><body><h2>OAuth connected.</h2><p>You can return to GrowChat and click Verify.</p></body></html>',
    { headers: { 'Content-Type': 'text/html' } }
  );
}

async function handleOAuthCallback(req, env, db) {
  const origin = requireOrigin(req, env);
  if (typeof origin !== 'string') return origin;

  const { code, state, errorParam } = parseCallbackParams(req);
  const errResponse =
    handleCallbackErrorParam(errorParam) || handleMissingCallbackCode(code, state);
  if (errResponse) return errResponse;

  const servers = await loadToolServers(db);
  const { index: serverIndex, server } = findServerByState(servers, state);
  const missingState = handleMissingServerState(serverIndex);
  if (missingState) return missingState;

  const tokenEndpoint = resolveCallbackTokenEndpoint(server);
  const unsafeEndpoint = handleUnsafeCallbackTokenEndpoint(tokenEndpoint);
  if (unsafeEndpoint) return unsafeEndpoint;

  const redirectUri = origin + OAUTH_CALLBACK_PATH;
  const { params, headers } = buildTokenRequest(server, code, redirectUri);

  try {
    const tokenRes = await exchangeToken(tokenEndpoint, params, headers);
    const failedExchange = await handleFailedTokenExchange(tokenRes);
    if (failedExchange) return failedExchange;
    const tokenData = await tokenRes.json();

    servers[serverIndex] = buildConnectedServer(server, tokenData);
    await saveToolServers(db, servers);

    return buildConnectedResponse();
  } catch (err) {
    return handleCallbackException(err);
  }
}

/* -------------------------------------------------------------------------- */
/* Router                                                                       */
/* -------------------------------------------------------------------------- */

async function routeOAuthRequest(req, env, user, db, path) {
  if (req.method === 'POST' && path === OAUTH_START_PATH) {
    return handleOAuthStart(req, env, user, db);
  }
  if (req.method === 'GET' && path === OAUTH_CALLBACK_PATH) {
    return handleOAuthCallback(req, env, db);
  }
  return null;
}

/**
 * Handle handleAdminToolServersOAuth routes.
 * Returns Response if handled, null if path doesn't match.
 */
export async function handleAdminToolServersOAuth(
  req,
  env,
  ctx,
  user,
  path,
  { db, _logger, _requestContext }
) {
  return routeOAuthRequest(req, env, user, db, path);
}
