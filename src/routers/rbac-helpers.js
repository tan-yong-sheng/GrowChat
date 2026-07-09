import { logAuditEvent } from '../utils/authorize.js';

/**
 * RBAC shared helpers for role-permission management
 */
export function normalizeStringList(value) {
  return Array.from(
    new Set(
      (Array.isArray(value) ? value : []).map((item) => String(item || '').trim()).filter(Boolean)
    )
  );
}

export function serializeRoleWithPermissions(role, permissionKeys = []) {
  return {
    id: role.id,
    name: role.name,
    system: Boolean(role.system),
    created_at: role.created_at,
    permissions: Array.isArray(permissionKeys) ? permissionKeys : [],
  };
}

export async function loadRolesWithPermissions(db) {
  const rows = await db.all(
    `SELECT r.id, r.name, r.system, r.created_at, p.key AS permission_key
     FROM roles r
     LEFT JOIN role_permissions rp ON rp.role_id = r.id
     LEFT JOIN permissions p ON p.id = rp.permission_id
     ORDER BY r.system DESC, r.name ASC, p.key ASC`
  );

  const grouped = new Map();
  for (const row of rows) {
    if (!grouped.has(row.id)) {
      grouped.set(row.id, {
        id: row.id,
        name: row.name,
        system: Boolean(row.system),
        created_at: row.created_at,
        permissions: [],
      });
    }
    if (row.permission_key) {
      grouped.get(row.id).permissions.push(row.permission_key);
    }
  }

  return Array.from(grouped.values());
}

export async function resolvePermissionsByKeys(db, permissionKeys) {
  const uniqueKeys = normalizeStringList(permissionKeys);
  if (!uniqueKeys.length) {
    return { permissions: [], missingKeys: [] };
  }

  const placeholders = uniqueKeys.map(() => '?').join(', ');
  const permissions = await db.all(
    `SELECT id, key
     FROM permissions
     WHERE key IN (${placeholders})
     ORDER BY key ASC`,
    uniqueKeys
  );
  const found = new Map(permissions.map((permission) => [permission.key, permission]));
  const missingKeys = uniqueKeys.filter((key) => !found.has(key));
  return { permissions, missingKeys };
}

export async function loadRolePermissionKeys(db, roleId) {
  const rows = await db.all(
    `SELECT p.key
     FROM role_permissions rp
     INNER JOIN permissions p ON p.id = rp.permission_id
     WHERE rp.role_id = ?
     ORDER BY p.key ASC`,
    [roleId]
  );
  return rows.map((row) => row.key);
}

export function resolveRoleUpdateName(body, role) {
  const name = body.name !== undefined ? String(body.name).trim() : role.name;
  if (!name || name.length > 100) return { error: 'Name required (1-100 chars)' };
  return { name };
}

export function resolveRoleUpdatePermissions(body) {
  const permissionsProvided = Object.prototype.hasOwnProperty.call(body, 'permissions');
  const desiredPermissions = permissionsProvided ? normalizeStringList(body.permissions) : null;
  return { permissionsProvided, desiredPermissions };
}

export async function applyRolePermissionUpdate({
  db,
  roleId,
  permissionsProvided,
  resolvedPermissionRows,
  desiredPermissions,
}) {
  if (!permissionsProvided) {
    return loadRolePermissionKeys(db, roleId);
  }

  await db.run('DELETE FROM role_permissions WHERE role_id = ?', [roleId]);
  for (const permission of resolvedPermissionRows.permissions) {
    await db.run(
      `INSERT INTO role_permissions (id, role_id, permission_id, created_at)
       VALUES (?, ?, ?, unixepoch())`,
      [crypto.randomUUID(), roleId, permission.id]
    );
  }
  return desiredPermissions;
}

export function buildUpdatedRole(roleId, role, name, resolvedPermissionKeys) {
  return {
    id: roleId,
    name,
    system: 0,
    created_at: role.created_at,
    permissions: Array.isArray(resolvedPermissionKeys) ? resolvedPermissionKeys : [],
  };
}

export async function parseBindingBody(req) {
  let body;
  try {
    body = await req.json();
  } catch {
    return { error: 'Invalid JSON' };
  }

  const roleId = (body.role_id || '').trim();
  const permissionId = (body.permission_id || '').trim();

  if (!roleId || !permissionId) {
    return { error: 'role_id and permission_id required' };
  }

  return { roleId, permissionId };
}

export async function resolveRoleForBinding(db, roleId) {
  const role = await db.first('SELECT * FROM roles WHERE id = ?', [roleId]);
  if (!role) {
    return { error: 'Role not found' };
  }
  if (role.system) {
    return { error: 'Cannot modify system role permissions' };
  }
  return { role };
}

export async function resolvePermissionForBinding(db, permissionId) {
  const permission = await db.first('SELECT * FROM permissions WHERE id = ?', [permissionId]);
  if (!permission) {
    return { error: 'Permission not found' };
  }
  return { permission };
}

export async function insertRolePermissionBinding(db, roleId, permissionId) {
  try {
    await db.run(
      `INSERT INTO role_permissions (id, role_id, permission_id, created_at)
       VALUES (?, ?, ?, unixepoch())`,
      [crypto.randomUUID(), roleId, permissionId]
    );
  } catch (err) {
    if (!/unique constraint/i.test(String(err))) {
      throw err;
    }
  }
}

export async function logBindingAuditEvent(env, user, roleId, permission) {
  await logAuditEvent(env, {
    actor_id: user.sub,
    action: 'role_permission_added',
    resource_type: 'role',
    resource_id: roleId,
    metadata: {
      permission_id: permission.id,
      permission_key: permission.key,
    },
  });
}

export function buildBindingResponse(roleId, permissionId, role, permission) {
  return {
    binding: {
      role_id: roleId,
      permission_id: permissionId,
      role_name: role.name,
      permission_key: permission.key,
    },
  };
}
