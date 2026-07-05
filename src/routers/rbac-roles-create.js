/**
 * RBAC - POST /api/admin/rbac/roles
 * Creates a new custom role with permissions
 */
import { error, json } from '../utils/response.js';
import { logAuditEvent } from '../utils/authorize.js';
import {
  normalizeStringList,
  serializeRoleWithPermissions,
  resolvePermissionsByKeys,
} from './rbac-helpers.js';

export async function handleRbacRolesCreate(req, env, _ctx, user, path, { db, logger } = {}) {
  let body;
  try {
    body = await req.json();
  } catch {
    return error(req, 'Invalid JSON', 400);
  }

  const name = (body.name || '').trim();
  if (!name || name.length > 100) {
    return error(req, 'Name required (1-100 chars)', 400);
  }
  const desiredPermissions = normalizeStringList(body.permissions);

  try {
    const permissionSync = await resolvePermissionsByKeys(db, desiredPermissions);
    if (permissionSync.missingKeys.length) {
      return error(req, `Unknown permissions: ${permissionSync.missingKeys.join(', ')}`, 400);
    }

    const roleId = crypto.randomUUID();
    await db.run(
      `INSERT INTO roles (id, name, system, created_at)
       VALUES (?, ?, 0, unixepoch())`,
      [roleId, name]
    );

    for (const permission of permissionSync.permissions) {
      await db.run(
        `INSERT INTO role_permissions (id, role_id, permission_id, created_at)
         VALUES (?, ?, ?, unixepoch())`,
        [crypto.randomUUID(), roleId, permission.id]
      );
    }

    await logAuditEvent(env, {
      actor_id: user.sub,
      action: 'role_created',
      resource_type: 'role',
      resource_id: roleId,
      metadata: { name, system: 0, permissions: desiredPermissions },
    });

    const role = serializeRoleWithPermissions(
      {
        id: roleId,
        name,
        system: 0,
        created_at: Math.floor(Date.now() / 1000),
      },
      desiredPermissions
    );
    return json(req, { role }, 201);
  } catch (err) {
    logger.error('Create role failed', { error: err?.message || err });
    return error(req, 'Failed to create role', 500);
  }
}
