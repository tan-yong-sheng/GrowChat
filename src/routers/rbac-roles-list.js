/**
 * RBAC - GET /api/admin/rbac/roles
 * Lists all roles with their permissions
 */
import { error, json } from '../utils/response.js';
import { HTTP_STATUS } from '../shared/http-status.js';
import { loadRolesWithPermissions } from './rbac-helpers.js';

// eslint-disable-next-line max-params -- admin dispatcher pattern (req, env, ctx, user, path, deps)
export async function handleRbacRolesList(req, env, _ctx, user, path, { db, logger } = {}) {
  try {
    const roles = await loadRolesWithPermissions(db);
    return json(req, { roles });
  } catch (err) {
    logger.error('List roles failed', { error: err?.message || err });
    return error(req, 'Failed to list roles', HTTP_STATUS.INTERNAL_SERVER_ERROR);
  }
}
