/**
 * Admin Config Router - dispatcher
 * Routes requests to per-route handlers based on method + path
 */
import { error, json } from '../../utils/response.js';
import { handleAdminAuditLogs } from './admin-config-audit-logs.js';
import { handleAdminConfigGet } from './admin-config-config-get.js';
import { handleAdminConfigSet } from './admin-config-config-set.js';
import { handleAdminAttachmentCapsGet } from './admin-config-attachment-caps-get.js';
import { handleAdminAttachmentCapsSet } from './admin-config-attachment-caps-set.js';

const ROUTE_MAP = [
  { method: 'GET', path: '/api/admin/audit-logs', handler: handleAdminAuditLogs },
  { method: 'GET', path: '/api/admin/config', handler: handleAdminConfigGet },
  { method: 'PUT', path: '/api/admin/config', handler: handleAdminConfigSet },
  {
    method: 'GET',
    path: '/api/admin/model-attachment-caps',
    handler: handleAdminAttachmentCapsGet,
  },
  {
    method: 'PUT',
    path: '/api/admin/model-attachment-caps',
    handler: handleAdminAttachmentCapsSet,
  },
];

/**
 * Handle admin config routes - delegates to per-route handlers
 */
export async function handleAdminConfig({
  req,
  env,
  ctx,
  user,
  path,
  db,
  logger,
  requestContext: _requestContext,
} = {}) {
  for (const route of ROUTE_MAP) {
    if (route.method === req.method && route.path === path) {
      return route.handler({ req, env, ctx, user, path, db, logger });
    }
  }
  return null;
}
