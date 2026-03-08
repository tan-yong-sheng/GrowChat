/**
 * RBAC Admin Management Router
 *
 * Handles role, permission, and user-role binding management
 * All endpoints require admin authorization
 * Routes:
 *   GET    /api/admin/rbac/roles               - List all roles
 *   POST   /api/admin/rbac/roles               - Create new role
 *   PUT    /api/admin/rbac/roles/:id           - Update role
 *   GET    /api/admin/rbac/permissions         - List all permissions
 *   POST   /api/admin/rbac/bindings            - Create role-permission binding
 *   GET    /api/admin/audit                    - List audit log entries (paginated)
 */

import { createDB } from '../db.js';
import { error, json } from '../utils/response.js';
import { authorize, getAuditLog, logAuditEvent } from '../utils/authorize.js';

/**
 * RBAC Admin Router Handler
 */
export async function rbacRouter(req, env, _ctx, user, path) {
  // Route guard: only match RBAC admin paths
  const isRbacPath = path.startsWith('/api/admin/rbac/') || path === '/api/admin/audit';
  if (!isRbacPath) return null;

  const requiredPermission = path === '/api/admin/audit'
    ? 'admin.audit.read'
    : 'admin.rbac.admin';
  const authDecision = await authorize(env, user, { action: requiredPermission });

  if (!authDecision.allow) {
    return error(req, authDecision.reason || 'Forbidden', 403);
  }

  const db = createDB(env.DB);

  // GET /api/admin/rbac/roles - List all roles
  if (req.method === 'GET' && path === '/api/admin/rbac/roles') {
    try {
      const roles = await db.all(
        `SELECT id, name, system, created_at
         FROM roles
         ORDER BY system DESC, name ASC`
      );

      return json(req, { roles });
    } catch (err) {
      console.error('List roles failed:', err);
      return error(req, 'Failed to list roles', 500);
    }
  }

  // POST /api/admin/rbac/roles - Create new role (custom roles only)
  if (req.method === 'POST' && path === '/api/admin/rbac/roles') {
    let body = {};
    try {
      body = await req.json();
    } catch {
      return error(req, 'Invalid JSON', 400);
    }

    const name = (body.name || '').trim();
    if (!name || name.length > 100) {
      return error(req, 'Name required (1-100 chars)', 400);
    }

    try {
      const roleId = crypto.randomUUID();
      await db.run(
        `INSERT INTO roles (id, name, system, created_at)
         VALUES (?, ?, 0, unixepoch())`,
        [roleId, name]
      );

      // Log audit event
      await logAuditEvent(env, {
        actor_id: user.sub,
        action: 'role_created',
        resource_type: 'role',
        resource_id: roleId,
        metadata: { name, system: 0 }
      });

      const role = await db.first('SELECT * FROM roles WHERE id = ?', [roleId]);
      return json(req, { role }, 201);
    } catch (err) {
      console.error('Create role failed:', err);
      return error(req, 'Failed to create role', 500);
    }
  }

  // PUT /api/admin/rbac/roles/:id - Update role (name/description only, not system roles)
  const roleUpdateMatch = path.match(/^\/api\/admin\/rbac\/roles\/([^/]+)$/);
  if (roleUpdateMatch && req.method === 'PUT') {
    const roleId = roleUpdateMatch[1];
    let body = {};
    try {
      body = await req.json();
    } catch {
      return error(req, 'Invalid JSON', 400);
    }

    try {
      const role = await db.first('SELECT * FROM roles WHERE id = ?', [roleId]);
      if (!role) return error(req, 'Role not found', 404);

      // Prevent modification of system roles
      if (role.system) {
        return error(req, 'Cannot modify system role', 403);
      }

      const name = body.name !== undefined ? String(body.name).trim() : role.name;

      if (!name || name.length > 100) {
        return error(req, 'Name required (1-100 chars)', 400);
      }

      await db.run(
        `UPDATE roles SET name = ?
         WHERE id = ? AND system = 0`,
        [name, roleId]
      );

      // Log audit event
      await logAuditEvent(env, {
        actor_id: user.sub,
        action: 'role_updated',
        resource_type: 'role',
        resource_id: roleId,
        metadata: { name, old_name: role.name }
      });

      const updated = await db.first('SELECT * FROM roles WHERE id = ?', [roleId]);
      return json(req, { role: updated });
    } catch (err) {
      console.error('Update role failed:', err);
      return error(req, 'Failed to update role', 500);
    }
  }

  // GET /api/admin/rbac/permissions - List all permissions
  if (req.method === 'GET' && path === '/api/admin/rbac/permissions') {
    try {
      const permissions = await db.all(
        `SELECT id, key, description, created_at
         FROM permissions
         ORDER BY key ASC`
      );

      // Group by category for better organization
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
      console.error('List permissions failed:', err);
      return error(req, 'Failed to list permissions', 500);
    }
  }

  // POST /api/admin/rbac/bindings - Create role-permission binding
  if (req.method === 'POST' && path === '/api/admin/rbac/bindings') {
    let body = {};
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
      // Verify role exists and is not system role
      const role = await db.first('SELECT * FROM roles WHERE id = ?', [roleId]);
      if (!role) return error(req, 'Role not found', 404);

      if (role.system) {
        return error(req, 'Cannot modify system role permissions', 403);
      }

      // Verify permission exists
      const permission = await db.first('SELECT * FROM permissions WHERE id = ?', [permissionId]);
      if (!permission) return error(req, 'Permission not found', 404);

      // Create binding (insert or ignore if exists)
      try {
        await db.run(
          `INSERT INTO role_permissions (id, role_id, permission_id, created_at)
           VALUES (?, ?, ?, unixepoch())`,
          [crypto.randomUUID(), roleId, permissionId]
        );
      } catch (err) {
        // Ignore duplicate constraint errors
        if (!/unique constraint/i.test(String(err))) throw err;
      }

      // Log audit event
      await logAuditEvent(env, {
        actor_id: user.sub,
        action: 'role_permission_added',
        resource_type: 'role',
        resource_id: roleId,
        metadata: { permission_id: permissionId, permission_key: permission.key }
      });

      return json(req, {
        binding: {
          role_id: roleId,
          permission_id: permissionId,
          role_name: role.name,
          permission_key: permission.key
        }
      }, 201);
    } catch (err) {
      console.error('Create binding failed:', err);
      return error(req, 'Failed to create role-permission binding', 500);
    }
  }

  // GET /api/admin/audit - List audit log entries (paginated)
  if (req.method === 'GET' && path === '/api/admin/audit') {
    const url = new URL(req.url);
    const limit = Math.min(parseInt(url.searchParams.get('limit') || '50'), 500);
    const offset = Math.max(parseInt(url.searchParams.get('offset') || '0'), 0);
    const actorId = url.searchParams.get('actor_id') || '';
    const resourceType = url.searchParams.get('resource_type') || '';
    const action = url.searchParams.get('action') || '';

    try {
      const result = await getAuditLog(env, {
        actor_id: actorId && actorId.length <= 255 ? actorId : undefined,
        resource_type: resourceType && resourceType.length <= 100 ? resourceType : undefined,
        action: action && action.length <= 100 ? action : undefined,
        limit,
        offset,
      });

      return json(req, {
        audit_log: result.entries,
        total: result.total,
        limit: result.limit,
        offset: result.offset,
        filters: { actor_id: actorId, resource_type: resourceType, action }
      });
    } catch (err) {
      console.error('Audit log query failed:', err);
      return error(req, 'Failed to fetch audit log', 500);
    }
  }

  return null;
}
