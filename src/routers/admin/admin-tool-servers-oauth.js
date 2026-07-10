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
  if (req.method === 'POST' && path === '/api/admin/tool-servers/oauth/start') {
    // Strip trailing slash so concatenations produce clean URLs
    const origin = (env.APP_PUBLIC_ORIGIN || '').replace(/\/$/, '');
    if (!origin) {
      return error(req, 'APP_PUBLIC_ORIGIN is not configured', HTTP_STATUS.INTERNAL_SERVER_ERROR);
    }
    const { body, error: denied } = await parseJsonAndRequireAdminAcl(
      req,
      env,
      user,
      'tool-server'
    );
    if (denied) return denied;

    const serverId = String(body.id || '').trim();
    if (!serverId) {
      return error(req, 'Server must be saved before OAuth connect', HTTP_STATUS.BAD_REQUEST);
    }

    const servers = await loadToolServers(db);
    const serverIndex = servers.findIndex((entry) => String(entry.id) === serverId);
    const existingServer = serverIndex === -1 ? null : servers[serverIndex];
    const serverUrl = String(body.url || existingServer?.url || '').trim();
    if (!serverUrl || !isValidHttpUrl(serverUrl)) {
      return error(req, 'Server URL must start with http:// or https://', HTTP_STATUS.BAD_REQUEST);
    }
    const oauthUrlSafety = isSafeOutboundUrl(serverUrl);
    if (!oauthUrlSafety.safe) {
      return error(req, oauthUrlSafety.reason, HTTP_STATUS.BAD_REQUEST);
    }

    if (!existingServer) {
      return error(req, 'Server must be saved before OAuth connect', HTTP_STATUS.BAD_REQUEST);
    }

    const server = existingServer;
    const oauthClientName = String(
      body.oauth_client_name || server.oauth_client_name || 'GrowChat MCP Client'
    ).trim();
    const oauthScope = String(body.oauth_scope || server.oauth_scope || '').trim();
    const authServerUrl = String(
      body.oauth_authorization_server || server.oauth_authorization_server || serverUrl
    ).trim();
    const authServerUrlSafety = isSafeOutboundUrl(authServerUrl);
    if (!authServerUrlSafety.safe) {
      return error(req, authServerUrlSafety.reason, HTTP_STATUS.BAD_REQUEST);
    }
    const redirectUri = origin + '/api/admin/tool-servers/oauth/callback';

    let metadata;
    try {
      metadata = await discoverAuthorizationMetadata(authServerUrl);
    } catch {
      metadata = null;
    }

    let clientId = String(body.oauth_client_id || server.oauth_client_id || '').trim();
    let clientSecret = String(body.oauth_client_secret || server.oauth_client_secret || '').trim();
    let registrationEndpoint =
      metadata?.registration_endpoint || server.oauth_registration_endpoint || '';

    if (registrationEndpoint) {
      const registrationEndpointSafety = isSafeOutboundUrl(registrationEndpoint);
      if (!registrationEndpointSafety.safe) {
        return error(req, registrationEndpointSafety.reason, HTTP_STATUS.BAD_REQUEST);
      }
    }

    if (!clientId) {
      if (!registrationEndpoint) {
        return error(
          req,
          'Authorization server does not support dynamic client registration',
          HTTP_STATUS.BAD_REQUEST
        );
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
          return error(req, 'Client registration failed', HTTP_STATUS.BAD_GATEWAY, {
            message: text,
          });
        }
        const registrationData = await registrationRes.json();
        clientId = String(registrationData.client_id || '').trim();
        clientSecret = String(registrationData.client_secret || '').trim();
      } catch (err) {
        return error(req, 'Client registration failed', HTTP_STATUS.BAD_GATEWAY, {
          message: err?.message || String(err),
        });
      }
    }

    if (!clientId) {
      return error(req, 'OAuth client ID is required', HTTP_STATUS.BAD_REQUEST);
    }

    const tokenAuthMethod =
      normalizeTokenAuthMethod(body.oauth_token_auth_method || server.oauth_token_auth_method) ||
      selectTokenAuthMethod(
        metadata?.token_endpoint_auth_methods_supported || [],
        Boolean(clientSecret)
      );

    const codeVerifier = randomString(OAUTH_CODE_VERIFIER_LENGTH);
    const codeChallenge = await sha256Base64Url(codeVerifier);
    const state = randomString(OAUTH_STATE_LENGTH);
    const authorizationEndpoint =
      metadata?.authorization_endpoint || new URL('/authorize', authServerUrl).toString();
    const tokenEndpoint = metadata?.token_endpoint || new URL('/token', authServerUrl).toString();
    const tokenEndpointSafety = isSafeOutboundUrl(tokenEndpoint);
    if (!tokenEndpointSafety.safe) {
      return error(req, tokenEndpointSafety.reason, HTTP_STATUS.BAD_REQUEST);
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
    // Strip trailing slash so concatenations produce clean URLs
    const origin = (env.APP_PUBLIC_ORIGIN || '').replace(/\/$/, '');
    if (!origin) {
      return error(req, 'APP_PUBLIC_ORIGIN is not configured', HTTP_STATUS.INTERNAL_SERVER_ERROR);
    }
    const url = new URL(req.url);
    const code = url.searchParams.get('code');
    const state = url.searchParams.get('state');
    const errParam = url.searchParams.get('error');
    if (errParam) {
      return new Response(`Authorization failed: ${errParam}`, {
        status: HTTP_STATUS.BAD_REQUEST,
        headers: { 'Content-Type': 'text/plain; charset=utf-8' },
      });
    }
    if (!code || !state) {
      return new Response('Missing authorization code or state', {
        status: HTTP_STATUS.BAD_REQUEST,
      });
    }

    const servers = await loadToolServers(db);
    const serverIndex = servers.findIndex((entry) => entry?.oauth_state === state);
    if (serverIndex === -1) {
      return new Response('OAuth session not found or expired', {
        status: HTTP_STATUS.BAD_REQUEST,
      });
    }

    const server = servers[serverIndex];
    const tokenEndpoint =
      server.oauth_token_endpoint ||
      new URL('/token', server.oauth_authorization_server || server.url).toString();
    const tokenEndpointSafety = isSafeOutboundUrl(tokenEndpoint);
    if (!tokenEndpointSafety.safe) {
      return new Response(`Token exchange failed: ${tokenEndpointSafety.reason}`, {
        status: HTTP_STATUS.BAD_REQUEST,
      });
    }
    const redirectUri = origin + '/api/admin/tool-servers/oauth/callback';
    const { params, headers } = buildTokenRequest(server, code, redirectUri);

    try {
      const tokenRes = await fetch(tokenEndpoint, {
        method: 'POST',
        headers,
        body: params,
      });
      if (!tokenRes.ok) {
        const text = await tokenRes.text().catch(() => '');
        return new Response(`Token exchange failed: ${text}`, { status: HTTP_STATUS.BAD_REQUEST });
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
      return new Response(`Token exchange failed: ${err?.message || String(err)}`, {
        status: HTTP_STATUS.BAD_REQUEST,
      });
    }
  }

  return null;
}
