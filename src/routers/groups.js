/**
 * Groups Router
 *
 * Group-based permissions for admin management.
 * Routes:
 *   GET    /api/admin/groups
 *   POST   /api/admin/groups
 *   GET    /api/admin/groups/:id
 *   PUT    /api/admin/groups/:id
 *   DELETE /api/admin/groups/:id
 *   POST   /api/admin/groups/:id/users
 *   DELETE /api/admin/groups/:id/users
 *   GET    /api/admin/groups/:id/models
 *   PUT    /api/admin/groups/:id/models
 *   GET    /api/admin/groups/default-permissions
 *   PUT    /api/admin/groups/default-permissions
 */

import { createDB } from '../db.js';
import { authorize, logAuditEvent } from '../utils/authorize.js';
import { getConfigValue, setConfigValue } from '../utils/app-config.js';
import { ensureGroupModelAccessTables, loadGroupModelAccessForGroup, normalizeModelIdList } from '../utils/group-model-access.js';
import { error, json } from '../utils/response.js';

const DEFAULT_PERMISSIONS_KEY = 'rbac.groups.default_permissions';
const SHARE_POLICIES = new Set(['none', 'members', 'anyone']);

function normalizeSharePolicy(value) {
  if (!value) return 'members';
  const normalized = String(value).toLowerCase().trim();
  if (normalized === 'no_one') return 'none';
  if (SHARE_POLICIES.has(normalized)) return normalized;
  return 'members';
}

function normalizePermissionsList(value) {
  if (!Array.isArray(value)) return [];
  const cleaned = value
    .map((item) => (typeof item === 'string' ? item.trim() : ''))
    .filter(Boolean);
  return Array.from(new Set(cleaned));
}

async function resolvePermissionIds(db, permissionKeys) {
  if (!permissionKeys.length) return { permissionIds: [], invalid: [] };
  const placeholders = permissionKeys.map(() => '?').join(', ');
  const rows = await db.all(
    `SELECT id, key FROM permissions WHERE key IN (${placeholders})`,
    permissionKeys
  );
  const foundKeys = new Set(rows.map((row) => row.key));
  const invalid = permissionKeys.filter((key) => !foundKeys.has(key));
  return {
    permissionIds: rows.map((row) => row.id),
    invalid,
  };
}

async function loadDefaultGroupPermissions(db) {
  const raw = await getConfigValue(db, DEFAULT_PERMISSIONS_KEY, '[]');
  try {
    const parsed = JSON.parse(raw);
    return normalizePermissionsList(parsed);
  } catch {
    return [];
  }
}

export async function groupsRouter(req, env, _ctx, user, path) {
  if (!path.startsWith('/api/admin/groups')) return null;

  const groupModelsMatch = path.match(/^\/api\/admin\/groups\/([^/]+)\/models$/);
  const isDefaultPermissions = path === '/api/admin/groups/default-permissions';
  const isReadOnly = req.method === 'GET';
  const requiredPermission = (isDefaultPermissions || groupModelsMatch)
    ? 'admin.rbac.admin'
    : isReadOnly
      ? 'admin.user.read'
      : 'admin.user.write';

  const authDecision = await authorize(env, user, { action: requiredPermission });
  if (!authDecision.allow) {
    return error(req, authDecision.reason || 'Forbidden', 403);
  }

  const db = createDB(env.DB);

  if (isDefaultPermissions && req.method === 'GET') {
    const permissions = await loadDefaultGroupPermissions(db);
    return json(req, { permissions });
  }

  if (isDefaultPermissions && req.method === 'PUT') {
    let body = {};
    try {
      body = await req.json();
    } catch {
      return error(req, 'Invalid JSON', 400);
    }

    const permissions = normalizePermissionsList(body.permissions);
    const { invalid } = await resolvePermissionIds(db, permissions);
    if (invalid.length) {
      return error(req, 'Invalid permissions', 400, { invalid });
    }

    await setConfigValue(db, DEFAULT_PERMISSIONS_KEY, JSON.stringify(permissions));
    return json(req, { permissions });
  }

  // GET /api/admin/groups/:id/models
  if (groupModelsMatch && req.method === 'GET') {
    const groupId = groupModelsMatch[1];
    try {
      const group = await db.first('SELECT id FROM groups WHERE id = ?', [groupId]);
      if (!group) return error(req, 'Group not found', 404);
      const model_ids = await loadGroupModelAccessForGroup(db, groupId);
      return json(req, { group_id: groupId, model_ids });
    } catch (err) {
      console.error('List group models failed:', err);
      return error(req, 'Failed to fetch group models', 500);
    }
  }

  // PUT /api/admin/groups/:id/models
  if (groupModelsMatch && req.method === 'PUT') {
    const groupId = groupModelsMatch[1];
    let body = {};
    try {
      body = await req.json();
    } catch {
      return error(req, 'Invalid JSON', 400);
    }

    const { ids: modelIds, invalid } = normalizeModelIdList(body.model_ids || []);
    if (invalid.length) {
      return error(req, 'Invalid model_ids', 400, { invalid });
    }

    try {
      const group = await db.first('SELECT id FROM groups WHERE id = ?', [groupId]);
      if (!group) return error(req, 'Group not found', 404);

      await ensureGroupModelAccessTables(db);
      await db.run('DELETE FROM group_model_access WHERE group_id = ?', [groupId]);
      for (const modelId of modelIds) {
        await db.run(
          `INSERT INTO group_model_access (id, group_id, model_id, created_at)
           VALUES (?, ?, ?, unixepoch())`,
          [crypto.randomUUID(), groupId, modelId]
        );
      }

      await logAuditEvent(env, {
        actor_id: user.sub,
        action: 'group_models_updated',
        resource_type: 'group',
        resource_id: groupId,
        metadata: { model_ids: modelIds },
      });

      return json(req, { group_id: groupId, model_ids: modelIds });
    } catch (err) {
      console.error('Update group models failed:', err);
      return error(req, 'Failed to update group models', 500);
    }
  }

  // GET /api/admin/groups - List all groups
  if (req.method === 'GET' && path === '/api/admin/groups') {
    try {
      const groups = await db.all(
        `SELECT id, name, description, share_policy, is_system, created_at, updated_at
         FROM groups
         ORDER BY is_system DESC, name ASC`
      );

      const memberCounts = await db.all(
        `SELECT group_id, COUNT(*) as member_count
         FROM group_members
         GROUP BY group_id`
      );

      const permissionRows = await db.all(
        `SELECT gp.group_id, p.key
         FROM group_permissions gp
         INNER JOIN permissions p ON p.id = gp.permission_id`
      );

      const memberMap = new Map(memberCounts.map((row) => [row.group_id, row.member_count]));
      const permissionsMap = new Map();
      for (const row of permissionRows) {
        if (!permissionsMap.has(row.group_id)) permissionsMap.set(row.group_id, []);
        permissionsMap.get(row.group_id).push(row.key);
      }

      const payload = groups.map((group) => ({
        ...group,
        member_count: memberMap.get(group.id) || 0,
        permissions: permissionsMap.get(group.id) || [],
      }));

      return json(req, { groups: payload });
    } catch (err) {
      console.error('List groups failed:', err);
      return error(req, 'Failed to list groups', 500);
    }
  }

  // POST /api/admin/groups - Create group
  if (req.method === 'POST' && path === '/api/admin/groups') {
    let body = {};
    try {
      body = await req.json();
    } catch {
      return error(req, 'Invalid JSON', 400);
    }

    const name = String(body.name || '').trim();
    if (!name || name.length > 100) {
      return error(req, 'Name required (1-100 chars)', 400);
    }

    const description = body.description ? String(body.description).trim() : null;
    if (description && description.length > 500) {
      return error(req, 'Description too long (max 500 chars)', 400);
    }

    const sharePolicy = normalizeSharePolicy(body.share_policy);
    let permissions = normalizePermissionsList(body.permissions);
    if (!permissions.length) {
      permissions = await loadDefaultGroupPermissions(db);
    }

    const { permissionIds, invalid } = await resolvePermissionIds(db, permissions);
    if (invalid.length) {
      return error(req, 'Invalid permissions', 400, { invalid });
    }

    try {
      const existing = await db.first('SELECT id FROM groups WHERE name = ?', [name]);
      if (existing) return error(req, 'Group name already exists', 409);

      const groupId = crypto.randomUUID();
      await db.run(
        `INSERT INTO groups (id, name, description, share_policy, is_system, created_at, updated_at)
         VALUES (?, ?, ?, ?, 0, unixepoch(), unixepoch())`,
        [groupId, name, description, sharePolicy]
      );

      for (const permissionId of permissionIds) {
        await db.run(
          `INSERT INTO group_permissions (id, group_id, permission_id, created_at)
           VALUES (?, ?, ?, unixepoch())`,
          [crypto.randomUUID(), groupId, permissionId]
        );
      }

      await logAuditEvent(env, {
        actor_id: user.sub,
        action: 'group_created',
        resource_type: 'group',
        resource_id: groupId,
        metadata: { name },
      });

      return json(
        req,
        {
          group: {
            id: groupId,
            name,
            description,
            share_policy: sharePolicy,
            is_system: 0,
          },
          permissions,
        },
        201
      );
    } catch (err) {
      console.error('Create group failed:', err);
      return error(req, 'Failed to create group', 500);
    }
  }

  // GET /api/admin/groups/:id
  const groupMatch = path.match(/^\/api\/admin\/groups\/([^/]+)$/);
  if (groupMatch && req.method === 'GET') {
    const groupId = groupMatch[1];
    try {
      const group = await db.first(
        `SELECT id, name, description, share_policy, is_system, created_at, updated_at
         FROM groups
         WHERE id = ?`,
        [groupId]
      );
      if (!group) return error(req, 'Group not found', 404);

      const members = await db.all(
        `SELECT u.id, u.name, u.email, u.avatar, u.avatar_emoji, gm.created_at as joined_at
         FROM group_members gm
         INNER JOIN users u ON u.id = gm.user_id
         WHERE gm.group_id = ?
         ORDER BY u.name ASC`,
        [groupId]
      );

      const permissions = await db.all(
        `SELECT p.key
         FROM group_permissions gp
         INNER JOIN permissions p ON p.id = gp.permission_id
         WHERE gp.group_id = ?
         ORDER BY p.key ASC`,
        [groupId]
      );

      return json(req, {
        group: {
          ...group,
          permissions: permissions.map((row) => row.key),
        },
        members,
      });
    } catch (err) {
      console.error('Get group failed:', err);
      return error(req, 'Failed to fetch group', 500);
    }
  }

  // PUT /api/admin/groups/:id
  if (groupMatch && req.method === 'PUT') {
    const groupId = groupMatch[1];
    let body = {};
    try {
      body = await req.json();
    } catch {
      return error(req, 'Invalid JSON', 400);
    }

    try {
      const group = await db.first('SELECT * FROM groups WHERE id = ?', [groupId]);
      if (!group) return error(req, 'Group not found', 404);
      if (group.is_system) return error(req, 'Cannot modify system group', 403);

      const name = body.name !== undefined ? String(body.name).trim() : group.name;
      if (!name || name.length > 100) {
        return error(req, 'Name required (1-100 chars)', 400);
      }

      const description = body.description !== undefined
        ? String(body.description).trim()
        : group.description;
      if (description && description.length > 500) {
        return error(req, 'Description too long (max 500 chars)', 400);
      }

      const sharePolicy = body.share_policy !== undefined
        ? normalizeSharePolicy(body.share_policy)
        : group.share_policy;

      await db.run(
        `UPDATE groups
         SET name = ?, description = ?, share_policy = ?, updated_at = unixepoch()
         WHERE id = ?`,
        [name, description || null, sharePolicy, groupId]
      );

      let permissions = null;
      if (body.permissions !== undefined) {
        permissions = normalizePermissionsList(body.permissions);
        const { permissionIds, invalid } = await resolvePermissionIds(db, permissions);
        if (invalid.length) {
          return error(req, 'Invalid permissions', 400, { invalid });
        }

        await db.run('DELETE FROM group_permissions WHERE group_id = ?', [groupId]);
        for (const permissionId of permissionIds) {
          await db.run(
            `INSERT INTO group_permissions (id, group_id, permission_id, created_at)
             VALUES (?, ?, ?, unixepoch())`,
            [crypto.randomUUID(), groupId, permissionId]
          );
        }
      }

      await logAuditEvent(env, {
        actor_id: user.sub,
        action: 'group_updated',
        resource_type: 'group',
        resource_id: groupId,
        metadata: { name },
      });

      return json(req, {
        group: {
          id: groupId,
          name,
          description: description || null,
          share_policy: sharePolicy,
          is_system: group.is_system || 0,
        },
        permissions,
      });
    } catch (err) {
      console.error('Update group failed:', err);
      return error(req, 'Failed to update group', 500);
    }
  }

  // DELETE /api/admin/groups/:id
  if (groupMatch && req.method === 'DELETE') {
    const groupId = groupMatch[1];
    try {
      const group = await db.first('SELECT * FROM groups WHERE id = ?', [groupId]);
      if (!group) return error(req, 'Group not found', 404);
      if (group.is_system) return error(req, 'Cannot delete system group', 403);

      await db.run('DELETE FROM groups WHERE id = ?', [groupId]);

      await logAuditEvent(env, {
        actor_id: user.sub,
        action: 'group_deleted',
        resource_type: 'group',
        resource_id: groupId,
        metadata: { name: group.name },
      });

      return new Response(null, { status: 204 });
    } catch (err) {
      console.error('Delete group failed:', err);
      return error(req, 'Failed to delete group', 500);
    }
  }

  // POST /api/admin/groups/:id/users
  const groupUsersMatch = path.match(/^\/api\/admin\/groups\/([^/]+)\/users$/);
  if (groupUsersMatch && req.method === 'POST') {
    const groupId = groupUsersMatch[1];
    let body = {};
    try {
      body = await req.json();
    } catch {
      return error(req, 'Invalid JSON', 400);
    }

    const userIds = normalizePermissionsList(body.user_ids || (body.user_id ? [body.user_id] : []));
    if (!userIds.length) return error(req, 'user_id required', 400);

    try {
      const group = await db.first('SELECT id FROM groups WHERE id = ?', [groupId]);
      if (!group) return error(req, 'Group not found', 404);

      for (const userId of userIds) {
        try {
          await db.run(
            `INSERT INTO group_members (id, group_id, user_id, created_at)
             VALUES (?, ?, ?, unixepoch())`,
            [crypto.randomUUID(), groupId, userId]
          );
        } catch (err) {
          if (!/unique constraint/i.test(String(err))) throw err;
        }
      }

      await logAuditEvent(env, {
        actor_id: user.sub,
        action: 'group_members_added',
        resource_type: 'group',
        resource_id: groupId,
        metadata: { user_ids: userIds },
      });

      return json(req, { group_id: groupId, user_ids: userIds }, 201);
    } catch (err) {
      console.error('Add group members failed:', err);
      return error(req, 'Failed to add group members', 500);
    }
  }

  // DELETE /api/admin/groups/:id/users
  if (groupUsersMatch && req.method === 'DELETE') {
    const groupId = groupUsersMatch[1];
    let body = {};
    try {
      body = await req.json();
    } catch {
      return error(req, 'Invalid JSON', 400);
    }

    const userIds = normalizePermissionsList(body.user_ids || (body.user_id ? [body.user_id] : []));
    if (!userIds.length) return error(req, 'user_id required', 400);

    try {
      const group = await db.first('SELECT id FROM groups WHERE id = ?', [groupId]);
      if (!group) return error(req, 'Group not found', 404);

      for (const userId of userIds) {
        await db.run(
          'DELETE FROM group_members WHERE group_id = ? AND user_id = ?',
          [groupId, userId]
        );
      }

      await logAuditEvent(env, {
        actor_id: user.sub,
        action: 'group_members_removed',
        resource_type: 'group',
        resource_id: groupId,
        metadata: { user_ids: userIds },
      });

      return json(req, { group_id: groupId, user_ids: userIds });
    } catch (err) {
      console.error('Remove group members failed:', err);
      return error(req, 'Failed to remove group members', 500);
    }
  }

  return null;
}
