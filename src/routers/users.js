/**
 * Users Router
 *
 * Handles user profile, connections, MCP servers, and admin user management.
 *
 * Route handlers are extracted into domain-specific sub-modules:
 *   - users-me.js             → /api/users/me profile/permissions/roles
 *   - users-connections.js    → /api/users/me/resources/connections
 *   - users-mcp.js            → /api/users/me/resources/mcp-servers
 *   - users-admin-list.js     → GET /api/admin/users
 *   - users-admin-access.js   → /api/admin/users/:id/access
 *   - users-admin-crud.js     → POST create/import admin users
 *   - users-admin-by-id.js    → GET/PUT/DELETE /api/admin/users/:id
 *   - users-helpers.js        → shared utility functions
 */
import { createRouterDeps } from './router-deps.js';

import { handleUsersMe } from './users/users-me.js';
import { handleUsersConnections } from './users/users-connections.js';
import { handleUsersMcp } from './users/users-mcp.js';
import { handleUsersAdminList } from './users/users-admin-list.js';
import { handleUsersAdminAccess } from './users/users-admin-access.js';
import { handleUsersAdminCrud } from './users/users-admin-crud.js';
import { handleUsersAdminById } from './users/users-admin-by-id.js';

/**
 * Users Router Handler
 */
export async function usersRouter({
  req,
  env,
  ctx,
  user,
  path,
  requestId,
  logger: providedLogger,
} = {}) {
  const deps = createRouterDeps(env, { requestId, logger: providedLogger });

  // Delegate to domain-specific sub-handlers.
  const handlers = [
    () => handleUsersMcp(req, env, ctx, user, path, deps),
    () => handleUsersMe(req, env, ctx, user, path, deps),
    () => handleUsersConnections(req, env, ctx, user, path, deps),
    () => handleUsersAdminList(req, env, ctx, user, path, deps),
    () => handleUsersAdminAccess({ req, env, user, path, deps }),
    () => handleUsersAdminCrud(req, env, ctx, user, path, deps),
    () => handleUsersAdminById(req, env, ctx, user, path, deps),
  ];

  for (const handler of handlers) {
    const result = await handler();
    if (result !== null) return result;
  }

  return null;
}
