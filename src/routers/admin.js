/**
 * Admin Panel Router
 *
 * Admin configuration and tool management endpoints.
 * All endpoints require admin authorization.
 *
 * Route handlers are extracted into domain-specific sub-modules:
 *   - admin-connections-access.js  → /api/admin/openai/connections/access/*
 *   - admin-connections-list.js    → GET/POST /api/admin/openai/connections
 *   - admin-connections-save.js    → PUT /api/admin/openai/connections
 *   - admin-tool-servers-access.js → /api/admin/tool-servers/access/*
 *   - admin-tool-servers-crud.js   → GET/POST/PUT /api/admin/tool-servers
 *   - admin-tool-servers-oauth.js  → /api/admin/tool-servers/oauth/*
 *   - admin-config.js              → audit-logs, config, model-attachment-caps
 *   - admin-email-security.js      → email-config, security-config
 */
import { createDB } from '../db.js';
import { error } from '../utils/response.js';
import { authorize } from '../utils/authorize.js';
import { createLogger } from '../utils/logger.js';

import { handleAdminConnectionsAccess } from './admin/admin-connections-access.js';
import { handleAdminConnectionsList } from './admin/admin-connections-list.js';
import { handleAdminConnectionsSave } from './admin/admin-connections-save.js';
import { handleAdminToolServersAccess } from './admin/admin-tool-servers-access.js';
import { handleAdminToolServersCrud } from './admin/admin-tool-servers-crud.js';
import { handleAdminToolServersOAuth } from './admin/admin-tool-servers-oauth.js';
import { handleAdminConfig } from './admin/admin-config.js';
import { handleAdminEmailSecurity } from './admin/admin-email-security.js';

/**
 * Resolve required permission for an admin route.
 * Keeps the permission policy visible in one place instead of
 * scattered across sequential if-statements.
 */
function resolveAdminPermission(path, method) {
  // Read-only GET requests default to read permission.
  if (method === 'GET') return 'admin.user.read';

  // PUT on config needs write permission.
  if (path === '/api/admin/config' && method === 'PUT') return 'admin.user.write';

  // All other admin mutations (POST, DELETE, PUT) need full admin permission.
  return 'admin.rbac.admin';
}

/**
 * Admin Router Handler
 */
export async function adminRouter(req, env, ctx, user, path, requestContext = {}) {
  const logger =
    requestContext.logger || createLogger(env, { requestId: requestContext.requestId });

  if (!path.startsWith('/api/admin/')) return null;

  const requiredPermission = resolveAdminPermission(path, req.method);
  const skipAuth = path === '/api/admin/tool-servers/oauth/callback';

  if (!skipAuth) {
    const authDecision = await authorize(env, user, {
      action: requiredPermission,
    });
    if (!authDecision.allow) {
      return error(req, authDecision.reason || 'Forbidden', 403);
    }
  }

  const db = createDB(env.DB);
  const deps = { db, logger, requestContext };

  // Delegate to domain-specific sub-handlers.
  // Each returns a Response if it handles the route, or null otherwise.
  const handlers = [
    () => handleAdminConnectionsAccess(req, env, ctx, user, path, deps),
    () => handleAdminConnectionsList(req, env, ctx, user, path, deps),
    () => handleAdminConnectionsSave(req, env, ctx, user, path, deps),
    () => handleAdminToolServersAccess(req, env, ctx, user, path, deps),
    () => handleAdminToolServersCrud(req, env, ctx, user, path, deps),
    () => handleAdminToolServersOAuth(req, env, ctx, user, path, deps),
    () => handleAdminConfig(req, env, ctx, user, path, deps),
    () => handleAdminEmailSecurity(req, env, ctx, user, path, deps),
  ];

  for (const handler of handlers) {
    const result = await handler();
    if (result !== null) return result;
  }

  return null;
}
