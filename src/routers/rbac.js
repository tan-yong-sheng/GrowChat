/**
 * RBAC Admin Management Router - dispatcher
 *
 * Routes requests to per-route handlers based on method + path
 */
import { error, authError } from '../utils/response.js';
import { createDB } from '../db.js';
import { createLogger } from '../utils/logger.js';
import { authorize, getAuditLog, logAuditEvent } from '../utils/authorize.js';
import { handleRbacRolesList } from './rbac-roles-list.js';
import { handleRbacRolesCreate } from './rbac-roles-create.js';
import { handleRbacRolesUpdate } from './rbac-roles-update.js';
import { handleRbacRolesDelete } from './rbac-roles-delete.js';
import { handleRbacPermissionsList } from './rbac-permissions-list.js';
import { handleRbacBindingsCreate } from './rbac-bindings-create.js';
import { handleRbacAuditList } from './rbac-audit-list.js';

const ROUTE_MAP = [
  { method: 'GET', path: '/api/admin/rbac/roles', handler: handleRbacRolesList },
  { method: 'POST', path: '/api/admin/rbac/roles', handler: handleRbacRolesCreate },
  { method: 'DELETE', path: '/api/admin/rbac/roles', handler: handleRbacRolesDelete },
  { method: 'GET', path: '/api/admin/rbac/permissions', handler: handleRbacPermissionsList },
  { method: 'POST', path: '/api/admin/rbac/bindings', handler: handleRbacBindingsCreate },
  { method: 'GET', path: '/api/admin/audit', handler: handleRbacAuditList },
];

const PATH_PATTERN_MAP = [
  {
    method: 'PUT',
    pattern: /^\/api\/admin\/rbac\/roles\/([^/]+)$/,
    handler: handleRbacRolesUpdate,
  },
  {
    method: 'DELETE',
    pattern: /^\/api\/admin\/rbac\/roles\/([^/]+)$/,
    handler: handleRbacRolesDelete,
  },
];

export async function rbacRouter(req, env, _ctx, user, path, requestContext = {}) {
  const logger =
    requestContext.logger || createLogger(env, { requestId: requestContext.requestId });

  const isRbacPath = path.startsWith('/api/admin/rbac/') || path === '/api/admin/audit';
  if (!isRbacPath) return null;

  const requiredPermission = path === '/api/admin/audit' ? 'admin.audit.read' : 'admin.rbac.admin';
  const authDecision = await authorize(env, user, {
    action: requiredPermission,
  });

  if (!authDecision.allow) {
    return authError(req, authDecision);
  }

  const db = createDB(env.DB);

  // Exact path match
  for (const route of ROUTE_MAP) {
    if (route.method === req.method && route.path === path) {
      return route.handler(req, env, _ctx, user, path, { db, logger });
    }
  }

  // Pattern match (PUT /roles/:id, DELETE /roles/:id)
  for (const route of PATH_PATTERN_MAP) {
    const match = path.match(route.pattern);
    if (match && req.method === route.method) {
      return route.handler(req, env, _ctx, user, match[1], path, { db, logger });
    }
  }

  return null;
}
