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
import { createDB } from '../../db.js';
import { error, json } from '../../utils/response.js';
import { handleOauthCallback, handleOauthStart } from './mcp-oauth.js';
import { handleListMcpServers } from './mcp-list-servers.js';
import { handleCreateMcpServer } from './mcp-create-server.js';
import { handleTestMcpServer } from './mcp-test-server.js';
import { handleUpdateMcpServer, handleDeleteMcpServer } from './mcp-update-delete-server.js';

/**
 * Users MCP dispatcher — routes to per-handler services.
 * Returns Response if handled, null if path doesn't match.
 */
export async function handleUsersMcp(req, env, ctx, user, path, { _db, logger, _requestContext }) {
  const origin = (env.APP_PUBLIC_ORIGIN || '').replace(/\/$/, '');

  // OAuth callback (unauthenticated — no user check)
  if (req.method === 'GET' && path === '/api/users/me/resources/mcp-servers/oauth/callback') {
    if (!origin) return error(req, 'APP_PUBLIC_ORIGIN is not configured', 500);
    return handleOauthCallback(req, env, origin);
  }
  if (!user) return error(req, 'Unauthorized', 401);

  // Account status check
  if (user.account_status && user.account_status !== 'active') {
    return error(req, 'Account pending approval.', 403);
  }

  // List MCP servers
  if (req.method === 'GET' && path === '/api/users/me/resources/mcp-servers') {
    return handleListMcpServers(req, env, user.sub, logger);
  }

  // Create MCP server
  if (req.method === 'POST' && path === '/api/users/me/resources/mcp-servers') {
    return handleCreateMcpServer(req, env, user.sub);
  }

  // Test MCP server
  if (req.method === 'POST' && path === '/api/users/me/resources/mcp-servers/test') {
    return handleTestMcpServer(req);
  }

  // Start OAuth flow
  if (req.method === 'POST' && path === '/api/users/me/resources/mcp-servers/oauth/start') {
    if (!origin) return error(req, 'APP_PUBLIC_ORIGIN is not configured', 500);
    return handleOauthStart(req, env, user, origin);
  }

  // Update/delete by ID
  const mcpMatch = path.match(/^\/api\/users\/me\/resources\/mcp-servers\/([^/]+)$/);
  if (mcpMatch) {
    const serverId = mcpMatch[1];
    if (req.method === 'PUT') return handleUpdateMcpServer(req, env, user.sub, serverId);
    if (req.method === 'DELETE') return handleDeleteMcpServer(req, env, user.sub, serverId);
    return error(req, 'Method not allowed', 405);
  }

  return null;
}
