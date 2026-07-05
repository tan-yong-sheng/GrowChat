/**
 * RBAC - PUT /api/admin/rbac/roles/:id
 * Updates a role (name/description only, not system roles)
 */
import { error, json } from '../utils/response.js';
import { logAuditEvent } from '../utils/authorize.js';
import {
  applyRolePermissionUpdate,
  buildUpdatedRole,
  resolvePermissionsByKeys,
  resolveRoleUpdateName,
  resolveRoleUpdatePermissions,
} from './rbac-helpers.js';

async function parseBody(req) {
  try {
    return await req.json();
  } catch {
    return null;
  }
}

export async function handleRbacRolesUpdate(
  req,
  env,
  _ctx,
  user,
  roleId,
  path,
  { db, logger } = {}
) {
  const body = await parseBody(req);
  if (body === null) return error(req, 'Invalid JSON', 400);

  try {
    const role = await db.first('SELECT * FROM roles WHERE id = ?', [roleId]);
    if (!role) return error(req, 'Role not found', 404);
    if (role.system) return error(req, 'Cannot modify system role', 403);

    const nameResult = resolveRoleUpdateName(body, role);
    if (nameResult.error) return error(req, nameResult.error, 400);

    const { permissionsProvided, desiredPermissions } = resolveRoleUpdatePermissions(body);

    let resolvedPermissionRows = null;
    if (permissionsProvided) {
      resolvedPermissionRows = await resolvePermissionsByKeys(db, desiredPermissions);
      if (resolvedPermissionRows.missingKeys.length) {
        return error(
          req,
          `Unknown permissions: ${resolvedPermissionRows.missingKeys.join(', ')}`,
          400
        );
      }
    }

    await db.run(`UPDATE roles SET name = ? WHERE id = ? AND system = 0`, [
      nameResult.name,
      roleId,
    ]);

    const resolvedPermissionKeys = await applyRolePermissionUpdate(
      db,
      roleId,
      permissionsProvided,
      resolvedPermissionRows,
      desiredPermissions
    );

    await logAuditEvent(env, {
      actor_id: user.sub,
      action: 'role_updated',
      resource_type: 'role',
      resource_id: roleId,
      metadata: {
        name: nameResult.name,
        old_name: role.name,
        permissions: resolvedPermissionKeys,
      },
    });

    return json(req, {
      role: buildUpdatedRole(roleId, role, nameResult.name, resolvedPermissionKeys),
    });
  } catch (err) {
    logger.error('Update role failed', { error: err?.message || err });
    return error(req, 'Failed to update role', 500);
  }
}
