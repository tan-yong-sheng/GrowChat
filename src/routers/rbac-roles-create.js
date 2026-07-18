/**
 * RBAC - POST /api/admin/rbac/roles
 * Creates a new custom role with permissions
 */
import { error, json } from '../utils/response.js';
import { logAuditEvent } from '../utils/authorize.js';
import { HTTP_STATUS } from '../shared/http-status.js';
import {
  normalizeStringList,
  serializeRoleWithPermissions,
  resolvePermissionsByKeys,
} from './rbac-helpers.js';

async function parseCreateRoleBody(req) {
  try {
    return await req.json();
  } catch {
    return { error: 'Invalid JSON' };
  }
}

async function validateCreateRoleInput(body) {
  const name = (body.name || '').trim();
  if (!name || name.length > 100) {
    return { error: 'Name required (1-100 chars)' };
  }
  return { name, desiredPermissions: normalizeStringList(body.permissions) };
}
export async function handleRbacRolesCreate(req, env, _ctx, user, path, { db, logger } = {}) {
  const body = await parseCreateRoleBody(req);
  if (body.error) {
    return error(req, body.error, HTTP_STATUS.BAD_REQUEST);
  }

  const input = await validateCreateRoleInput(body);
  if (input.error) {
    return error(req, input.error, HTTP_STATUS.BAD_REQUEST);
  }
  const { name, desiredPermissions } = input;

  try {
    const permissionSync = await resolvePermissionsByKeys(db, desiredPermissions);
    if (permissionSync.missingKeys.length) {
      return error(
        req,
        `Unknown permissions: ${permissionSync.missingKeys.join(', ')}`,
        HTTP_STATUS.BAD_REQUEST
      );
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
    return json(req, { role }, HTTP_STATUS.CREATED);
  } catch (err) {
    logger.error('Create role failed', { error: err?.message || err });
    return error(req, 'Failed to create role', HTTP_STATUS.INTERNAL_SERVER_ERROR);
  }
}
