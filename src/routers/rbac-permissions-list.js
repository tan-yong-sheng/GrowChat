/**
 * RBAC - GET /api/admin/rbac/permissions
 * Lists all available permissions
 */
import { error, json } from '../utils/response.js';
import { HTTP_STATUS } from '../shared/http-status.js';
export async function handleRbacPermissionsList({
  req,
  env: _env,
  ctx: _ctx,
  user: _user,
  path: _path,
  db,
  logger,
} = {}) {
  try {
    const permissions = await db.all(
      `SELECT id, key, description, created_at
       FROM permissions
       ORDER BY key ASC`
    );

    const grouped = {};
    for (const perm of permissions) {
      const category = String(perm.key || '').split('.')[0] || 'misc';
      if (!grouped[category]) {
        grouped[category] = [];
      }
      grouped[category].push(perm);
    }

    return json(req, { permissions, grouped_by_category: grouped });
  } catch (err) {
    logger.error('List permissions failed', { error: err?.message || err });
    return error(req, 'Failed to list permissions', HTTP_STATUS.INTERNAL_SERVER_ERROR);
  }
}
