/**
 * RBAC Admin Management Router - dispatcher
 *
 * Routes requests to per-route handlers based on method + path
 */
import { authError } from '../utils/response.js';
import { createDB } from '../db.js';
import { createLogger } from '../utils/logger.js';
import { authorize } from '../utils/authorize.js';
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
  // DELETE /api/admin/rbac/roles/:id is handled by PATH_PATTERN_MAP below
  // No exact DELETE /api/admin/rbac/roles — would be "delete all roles" which doesn't exist
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

const AUDIT_PATH = '/api/admin/audit';
const RBAC_PATH_PREFIX = '/api/admin/rbac/';
const PERMISSION_AUDIT_READ = 'admin.audit.read';
const PERMISSION_RBAC_ADMIN = 'admin.rbac.admin';

function isRbacPath(path) {
  return path.startsWith(RBAC_PATH_PREFIX) || path === AUDIT_PATH;
}

function requiredPermissionFor(path) {
  return path === AUDIT_PATH ? PERMISSION_AUDIT_READ : PERMISSION_RBAC_ADMIN;
}

function buildLogger(env, requestContext) {
  return requestContext.logger || createLogger(env, { requestId: requestContext.requestId });
}

async function checkAuth({ env, user, path, req }) {
  const authDecision = await authorize(env, user, { action: requiredPermissionFor(path) });
  if (!authDecision.allow) return authError(req, authDecision);
  return null;
}

function dispatchExact(req, path, ctx) {
  for (const route of ROUTE_MAP) {
    if (route.method === req.method && route.path === path) return route.handler(ctx);
  }
  return null;
}

function dispatchPattern(req, path, ctx) {
  for (const route of PATH_PATTERN_MAP) {
    const match = path.match(route.pattern);
    if (match && req.method === route.method) {
      return route.handler({ ...ctx, roleId: match[1] });
    }
  }
  return null;
}

/* eslint-disable-next-line max-params */
export async function rbacRouter(req, env, _ctx, user, path, requestContext = {}) {
  if (!isRbacPath(path)) return null;

  const logger = buildLogger(env, requestContext);
  const authFail = await checkAuth({ env, user, path, req });
  if (authFail) return authFail;

  const db = createDB(env.DB);
  const dispatchCtx = { req, env, ctx: _ctx, user, path, db, logger };

  return dispatchExact(req, path, dispatchCtx) || dispatchPattern(req, path, dispatchCtx);
}
