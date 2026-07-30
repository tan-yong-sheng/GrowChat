/**
 * Shared OAuth helpers used by both user-facing MCP OAuth and admin tool-server OAuth flows.
 * Extracted to reduce duplication between mcp-oauth.js and admin-tool-servers-oauth.js.
 *
 * @module oauth-shared
 */
import { normalizeTokenAuthMethod } from '../admin/tool-servers.js';

/* -------------------------------------------------------------------------- */
/* Token request building                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Resolve the token endpoint for an OAuth server.
 * Falls back to constructing from authorization_server or server.url.
 *
 * @param {object} server
 * @returns {string}
 */
export function resolveTokenEndpoint(server) {
  return (
    server.oauth_token_endpoint ||
    new URL('/token', server.oauth_authorization_server || server.url).toString()
  );
}

/**
 * Build token request params, headers, and token endpoint for an OAuth code exchange.
 * Handles client_secret_basic and client_secret_post auth methods.
 *
 * @param {object} server - OAuth server config with oauth_client_id, oauth_client_secret, etc.
 * @param {string} code - Authorization code
 * @param {string} redirectUri - Redirect URI
 * @returns {{ tokenEndpoint: string, params: URLSearchParams, headers: Headers }}
 */
export function buildTokenRequest(server, code, redirectUri) {
  const clientId = String(server.oauth_client_id || '').trim();
  const clientSecret = String(server.oauth_client_secret || '').trim();
  const codeVerifier = String(server.oauth_code_verifier || '').trim();
  const tokenAuthMethod =
    normalizeTokenAuthMethod(server.oauth_token_auth_method) || 'client_secret_post';

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

  return { tokenEndpoint: resolveTokenEndpoint(server), params, headers };
}
