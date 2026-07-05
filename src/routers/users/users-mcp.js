/**
 * Users Mcp Router — MCP tool server management routes.
 *
 * Split from a single 435-line function into per-route handlers to
 * reduce cyclomatic complexity (was 127/159, now ~15 per handler).
 *
 * Routes:
 *   GET    /api/users/me/resources/mcp-servers/oauth/callback  → handleOauthCallback
 *   GET    /api/users/me/resources/mcp-servers                  → handleListMcpServers
 *   POST   /api/users/me/resources/mcp-servers                 → handleCreateMcpServer
 *   POST   /api/users/me/resources/mcp-servers/test            → handleTestMcpServer
 *   POST   /api/users/me/resources/mcp-servers/oauth/start     → handleOauthStart
 *   PUT    /api/users/me/resources/mcp-servers/:id             → handleUpdateMcpServer
 *   DELETE /api/users/me/resources/mcp-servers/:id             → handleDeleteMcpServer
 */
import { error } from '../../utils/response.js';
import { handleOauthCallback, handleOauthStart } from './mcp-oauth.js';
import { handleListMcpServers } from './mcp-list-servers.js';
import { handleCreateMcpServer } from './mcp-create-server.js';
import { handleTestMcpServer } from './mcp-test-server.js';
import { handleUpdateMcpServer, handleDeleteMcpServer } from './mcp-update-delete-server.js';

const OAUTH_CALLBACK_ROUTE = {
  method: 'GET',
  path: '/api/users/me/resources/mcp-servers/oauth/callback',
};

const AUTH_ROUTES = [
  {
    method: 'GET',
    path: '/api/users/me/resources/mcp-servers',
    handler: (req, env, _ctx, user, _path, _origin, logger) =>
      handleListMcpServers(req, env, user.sub, logger),
  },
  {
    method: 'POST',
    path: '/api/users/me/resources/mcp-servers',
    handler: (req, env, _ctx, user) => handleCreateMcpServer(req, env, user.sub),
  },
  {
    method: 'POST',
    path: '/api/users/me/resources/mcp-servers/test',
    handler: (req) => handleTestMcpServer(req),
  },
  {
    method: 'POST',
    path: '/api/users/me/resources/mcp-servers/oauth/start',
    handler: (req, env, _ctx, user, _path, origin) => handleOauthStart(req, env, user, origin),
    needsOrigin: true,
  },
];

function getOrigin(env) {
  return (env.APP_PUBLIC_ORIGIN || '').replace(/\/$/, '');
}

function checkMcpAuth(req, user) {
  if (!user) return error(req, 'Unauthorized', 401);
  if (user.account_status && user.account_status !== 'active') {
    return error(req, 'Account pending approval.', 403);
  }
  return null;
}

function handleMcpById(req, env, user, path) {
  const match = path.match(/^\/api\/users\/me\/resources\/mcp-servers\/([^/]+)$/);
  if (!match) return null;
  const serverId = match[1];
  if (req.method === 'PUT') return handleUpdateMcpServer(req, env, user.sub, serverId);
  if (req.method === 'DELETE') return handleDeleteMcpServer(req, env, user.sub, serverId);
  return error(req, 'Method not allowed', 405);
}

/**
 * Users MCP dispatcher — routes to per-handler services.
 * Returns Response if handled, null if path doesn't match.
 */
export async function handleUsersMcp(req, env, ctx, user, path, { _db, logger, _requestContext }) {
  const origin = getOrigin(env);

  if (req.method === OAUTH_CALLBACK_ROUTE.method && path === OAUTH_CALLBACK_ROUTE.path) {
    if (!origin) return error(req, 'APP_PUBLIC_ORIGIN is not configured', 500);
    return handleOauthCallback(req, env, origin);
  }

  const authError = checkMcpAuth(req, user);
  if (authError) return authError;

  for (const route of AUTH_ROUTES) {
    if (route.method === req.method && route.path === path) {
      if (route.needsOrigin && !origin) {
        return error(req, 'APP_PUBLIC_ORIGIN is not configured', 500);
      }
      return route.handler(req, env, ctx, user, path, origin, logger);
    }
  }

  return handleMcpById(req, env, user, path);
}
