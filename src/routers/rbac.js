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
import { authorize, logAuditEvent } from '../utils/authorize.js';

/**
 * RBAC Admin Router Handler
 */
export async function rbacRouter(req, env, _ctx, user, path) {
  // Route guard: only match RBAC admin paths
  const isRbacPath = path.startsWith('/api/admin/rbac/') || path === '/api/admin/audit';
  if (!isRbacPath) return null;

  // All RBAC admin endpoints require admin authorization
  const authDecision = await authorize(env, user, {
    action: 'admin.user.read',
    resource: 'admin'
  });

  if (!authDecision.allow) {
    return error(req, authDecision.reason || 'Forbidden', 403);
  }

  const db = createDB(env.DB);

  // GET /api/admin/rbac/roles - List all roles
  if (req.method === 'GET' && path === '/api/admin/rbac/roles') {
    try {
      const roles = await db.all(
        `SELECT id, name, description, is_system, created_at, updated_at
         FROM roles
         ORDER BY is_system DESC, name ASC`
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
    const description = (body.description || '').trim().slice(0, 500);

    if (!name || name.length > 100) {
      return error(req, 'Name required (1-100 chars)', 400);
    }

    try {
      const roleId = crypto.randomUUID();
      await db.run(
        `INSERT INTO roles (id, name, description, is_system, created_at, updated_at)
         VALUES (?, ?, ?, 0, unixepoch(), unixepoch())`,
        [roleId, name, description]
      );

      // Log audit event
      await logAuditEvent(env, {
        actor_id: user.sub,
        action: 'role_created',
        resource_type: 'role',
        resource_id: roleId,
        metadata: { name, is_system: 0 }
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
      if (role.is_system) {
        return error(req, 'Cannot modify system role', 403);
      }

      const name = body.name !== undefined ? String(body.name).trim() : role.name;
      const description = body.description !== undefined
        ? String(body.description).trim().slice(0, 500)
        : role.description;

      if (!name || name.length > 100) {
        return error(req, 'Name required (1-100 chars)', 400);
      }

      await db.run(
        `UPDATE roles SET name = ?, description = ?, updated_at = unixepoch()
         WHERE id = ? AND is_system = 0`,
        [name, description, roleId]
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
        `SELECT id, action, resource, description, category, created_at
         FROM permissions
         ORDER BY category ASC, action ASC`
      );

      // Group by category for better organization
      const grouped = {};
      for (const perm of permissions) {
        if (!grouped[perm.category]) {
          grouped[perm.category] = [];
        }
        grouped[perm.category].push(perm);
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

      if (role.is_system) {
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
        metadata: { permission_id: permissionId, permission_action: permission.action }
      });

      return json(req, {
        binding: {
          role_id: roleId,
          permission_id: permissionId,
          role_name: role.name,
          permission_action: permission.action
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
      let query = 'SELECT * FROM audit_log WHERE 1=1';
      const params = [];

      if (actorId && actorId.length <= 255) {
        query += ' AND actor_id = ?';
        params.push(actorId);
      }

      if (resourceType && resourceType.length <= 100) {
        query += ' AND resource_type = ?';
        params.push(resourceType);
      }

      if (action && action.length <= 100) {
        query += ' AND action = ?';
        params.push(action);
      }

      query += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
      params.push(limit, offset);

      const entries = await db.all(query, params);

      // Get total count (without limit/offset)
      let countQuery = 'SELECT COUNT(*) as count FROM audit_log WHERE 1=1';
      const countParams = [];

      if (actorId && actorId.length <= 255) {
        countQuery += ' AND actor_id = ?';
        countParams.push(actorId);
      }

      if (resourceType && resourceType.length <= 100) {
        countQuery += ' AND resource_type = ?';
        countParams.push(resourceType);
      }

      if (action && action.length <= 100) {
        countQuery += ' AND action = ?';
        countParams.push(action);
      }

      const countResult = await db.first(countQuery, countParams);
      const total = countResult?.count || 0;

      return json(req, {
        audit_log: entries,
        total,
        limit,
        offset,
        filters: { actor_id: actorId, resource_type: resourceType, action }
      });
    } catch (err) {
      console.error('Audit log query failed:', err);
      return error(req, 'Failed to fetch audit log', 500);
    }
  }

  return null;
}
