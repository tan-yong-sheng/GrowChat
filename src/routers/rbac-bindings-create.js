/**
 * RBAC - POST /api/admin/rbac/bindings
 * Creates a role-permission binding
 */
import { error, json } from '../utils/response.js';
import { logAuditEvent } from '../utils/authorize.js';

export async function handleRbacBindingsCreate(req, env, _ctx, user, path, { db, logger } = {}) {
  let body;
  try {
    body = await req.json();
  } catch {
    return error(req, 'Invalid JSON', 400);
  }

  const roleId = (body.role_id || '').trim();
  const permissionId = (body.permission_id || '').trim();

  if (!roleId || !permissionId) {
    return error(req, 'role_id and permission_id required', 400);
  }

  try {
    const role = await db.first('SELECT * FROM roles WHERE id = ?', [roleId]);
    if (!role) return error(req, 'Role not found', 404);

    if (role.system) {
      return error(req, 'Cannot modify system role permissions', 403);
    }

    const permission = await db.first('SELECT * FROM permissions WHERE id = ?', [permissionId]);
    if (!permission) return error(req, 'Permission not found', 404);

    try {
      await db.run(
        `INSERT INTO role_permissions (id, role_id, permission_id, created_at)
         VALUES (?, ?, ?, unixepoch())`,
        [crypto.randomUUID(), roleId, permissionId]
      );
    } catch (err) {
      if (!/unique constraint/i.test(String(err))) throw err;
    }

    await logAuditEvent(env, {
      actor_id: user.sub,
      action: 'role_permission_added',
      resource_type: 'role',
      resource_id: roleId,
      metadata: {
        permission_id: permissionId,
        permission_key: permission.key,
      },
    });

    return json(
      req,
      {
        binding: {
          role_id: roleId,
          permission_id: permissionId,
          role_name: role.name,
          permission_key: permission.key,
        },
      },
      201
    );
  } catch (err) {
    logger.error('Create binding failed', { error: err?.message || err });
    return error(req, 'Failed to create role-permission binding', 500);
  }
}
