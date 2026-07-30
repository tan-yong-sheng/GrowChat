/**
 * RBAC - PUT /api/admin/rbac/roles/:id
 * Updates a role (name/description only, not system roles)
 */
import { error, json } from '../utils/response.js';
import { logAuditEvent } from '../utils/authorize.js';
import { HTTP_STATUS } from '../shared/http-status.js';
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

async function validateRoleUpdateInput(db, roleId, body) {
  const role = await db.first('SELECT * FROM roles WHERE id = ?', [roleId]);
  if (!role) return { error: 'Role not found', status: HTTP_STATUS.NOT_FOUND };
  if (role.system) return { error: 'Cannot modify system role', status: HTTP_STATUS.FORBIDDEN };
  const nameResult = resolveRoleUpdateName(body, role);
  if (nameResult.error) return { error: nameResult.error, status: HTTP_STATUS.BAD_REQUEST };
  return { role, name: nameResult.name };
}

// admin dispatcher pattern (req, env, ctx, user, roleId, path, deps)
export async function handleRbacRolesUpdate({
  req,
  env,
  ctx: _ctx,
  user,
  roleId,
  path: _path,
  db,
  logger,
} = {}) {
  const body = await parseBody(req);
  if (body === null) return error(req, 'Invalid JSON', HTTP_STATUS.BAD_REQUEST);

  try {
    const validated = await validateRoleUpdateInput(db, roleId, body);
    if (validated.error) return error(req, validated.error, validated.status);
    const { role, name: newName } = validated;

    const { permissionsProvided, desiredPermissions } = resolveRoleUpdatePermissions(body);

    let resolvedPermissionRows = null;
    if (permissionsProvided) {
      resolvedPermissionRows = await resolvePermissionsByKeys(db, desiredPermissions);
      if (resolvedPermissionRows.missingKeys.length) {
        return error(
          req,
          `Unknown permissions: ${resolvedPermissionRows.missingKeys.join(', ')}`,
          HTTP_STATUS.BAD_REQUEST
        );
      }
    }

    await db.run(`UPDATE roles SET name = ? WHERE id = ? AND system = 0`, [newName, roleId]);

    const resolvedPermissionKeys = await applyRolePermissionUpdate({
      db,
      roleId,
      permissionsProvided,
      resolvedPermissionRows,
      desiredPermissions,
    });

    await logAuditEvent(env, {
      actor_id: user.sub,
      action: 'role_updated',
      resource_type: 'role',
      resource_id: roleId,
      metadata: {
        name: newName,
        old_name: role.name,
        permissions: resolvedPermissionKeys,
      },
    });

    return json(req, {
      role: buildUpdatedRole(roleId, role, newName, resolvedPermissionKeys),
    });
  } catch (err) {
    logger.error('Update role failed', { error: err?.message || err });
    return error(req, 'Failed to update role', HTTP_STATUS.INTERNAL_SERVER_ERROR);
  }
}
