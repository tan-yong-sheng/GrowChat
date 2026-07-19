/**
 * Admin Tool Servers OAuth Callback Handlers
 * Extracted from admin-tool-servers-oauth.js to reduce file length
 */
import { HTTP_STATUS } from '../../shared/http-status.js';
import { isSafeOutboundUrl } from '../../utils/validation.js';
import { loadToolServers, saveToolServers } from '../../admin/tool-servers.js';
import { buildTokenRequest } from '../oauth-shared.js';

const OAUTH_CALLBACK_PATH = '/api/admin/tool-servers/oauth/callback';

export function parseCallbackParams(req) {
  const url = new URL(req.url);
  return {
    code: url.searchParams.get('code'),
    state: url.searchParams.get('state'),
    errorParam: url.searchParams.get('error'),
  };
}

export function callbackError(message, status = HTTP_STATUS.BAD_REQUEST) {
  return new Response(message, { status });
}

export function handleCallbackErrorParam(errorParam) {
  if (!errorParam) return null;
  return callbackError(`Authorization failed: ${errorParam}`);
}

export function handleMissingCallbackCode(code, state) {
  if (code && state) return null;
  return callbackError('Missing authorization code or state');
}

export function findServerByState(servers, state) {
  const index = servers.findIndex((entry) => entry?.oauth_state === state);
  return { index, server: index === -1 ? null : servers[index] };
}

export function handleMissingServerState(index) {
  if (index !== -1) return null;
  return callbackError('OAuth session not found or expired');
}

export function resolveCallbackTokenEndpoint(server) {
  return (
    server.oauth_token_endpoint ||
    new URL('/token', server.oauth_authorization_server || server.url).toString()
  );
}

export function handleUnsafeCallbackTokenEndpoint(tokenEndpoint) {
  const safety = isSafeOutboundUrl(tokenEndpoint);
  if (safety.safe) return null;
  return callbackError(`Token exchange failed: ${safety.reason}`);
}

export async function exchangeToken(tokenEndpoint, params, headers) {
  return fetch(tokenEndpoint, {
    method: 'POST',
    headers,
    body: params,
  });
}

export async function handleFailedTokenExchange(tokenRes) {
  if (tokenRes.ok) return null;
  const text = await tokenRes.text().catch(() => '');
  return callbackError(`Token exchange failed: ${text}`);
}

export function buildConnectedServer(server, tokenData) {
  const now = new Date().toISOString();
  return {
    ...server,
    oauth_tokens: { ...tokenData, connected_at: now },
    oauth_connected_at: now,
    oauth_state: null,
    oauth_code_verifier: null,
  };
}

export function handleCallbackException(err) {
  return callbackError(`Token exchange failed: ${err?.message || String(err)}`);
}

export function buildConnectedResponse() {
  return new Response(
    '<html><body><h2>OAuth connected.</h2><p>You can return to GrowChat and click Verify.</p></body></html>',
    { headers: { 'Content-Type': 'text/html' } }
  );
}

export async function exchangeAndPersistToken({
  tokenEndpoint,
  server,
  code,
  redirectUri,
  servers,
  serverIndex,
  db,
}) {
  const { params, headers } = buildTokenRequest(server, code, redirectUri);
  const tokenRes = await exchangeToken(tokenEndpoint, params, headers);
  const failedExchange = await handleFailedTokenExchange(tokenRes);
  if (failedExchange) return failedExchange;
  const tokenData = await tokenRes.json();
  servers[serverIndex] = buildConnectedServer(server, tokenData);
  await saveToolServers(db, servers);
  return buildConnectedResponse();
}

export { OAUTH_CALLBACK_PATH };

export async function handleOAuthCallback(req, env, db) {
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
  try {
    return await exchangeAndPersistToken({
      tokenEndpoint,
      server,
      code,
      redirectUri,
      servers,
      serverIndex,
      db,
    });
  } catch (err) {
    return handleCallbackException(err);
  }
}

// Inlined requireOrigin to avoid pulling more dependencies into this module
function getOrigin(env) {
  return env?.APP_PUBLIC_ORIGIN || env?.OAUTH_REDIRECT_ORIGIN || null;
}

function requireOrigin(req, env) {
  const origin = getOrigin(env);
  if (!origin) {
    return new Response('APP_PUBLIC_ORIGIN is not configured', {
      status: HTTP_STATUS.INTERNAL_SERVER_ERROR,
    });
  }
  return origin;
}
