/**
 * RBAC - DELETE /api/admin/rbac/roles/:id
 * Deletes a custom role (not system roles)
 */
import { error } from '../utils/response.js';
import { logAuditEvent } from '../utils/authorize.js';
import { HTTP_STATUS } from '../shared/http-status.js';

// admin dispatcher pattern (req, env, ctx, user, roleId, path, deps)
export async function handleRbacRolesDelete(
  req,
  env,
  _ctx,
  user,
  roleId,
  path,
  { db, logger } = {}
) {
  try {
    const role = await db.first('SELECT * FROM roles WHERE id = ?', [roleId]);
    if (!role) return error(req, 'Role not found', HTTP_STATUS.NOT_FOUND);

    if (role.system) {
      return error(req, 'Cannot delete system role', HTTP_STATUS.FORBIDDEN);
    }

    await db.run('DELETE FROM roles WHERE id = ?', [roleId]);

    await logAuditEvent(env, {
      actor_id: user.sub,
      action: 'role_deleted',
      resource_type: 'role',
      resource_id: roleId,
      metadata: { name: role.name, system: 0 },
    });

    return new Response(null, { status: HTTP_STATUS.NO_CONTENT });
  } catch (err) {
    logger.error('Delete role failed', { error: err?.message || err });
    return error(req, 'Failed to delete role', HTTP_STATUS.INTERNAL_SERVER_ERROR);
  }
}
