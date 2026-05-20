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
 */

import { createDB } from '../db.js';
import { createLogger } from '../utils/logger.js';
import { authorize, logAuditEvent } from '../utils/authorize.js';
import { error, json } from '../utils/response.js';

function normalizePermissionsList(value) {
  if (!Array.isArray(value)) return [];
  const cleaned = value
    .map((item) => {
      if (typeof item === 'string') return item.trim();
      if (item && typeof item === 'object') return String(item.key || '').trim();
      return '';
    })
    .filter(Boolean);
  return Array.from(new Set(cleaned));
}

export async function groupsRouter(req, env, _ctx, user, path, requestId) {
  const logger = createLogger(env, requestId ? { requestId } : {});
  if (!path.startsWith('/api/admin/groups')) return null;

  const isReadOnly = req.method === 'GET';
  const requiredPermission = isReadOnly ? 'admin.user.read' : 'admin.user.write';

  const authDecision = await authorize(env, user, {
    action: requiredPermission,
  });
  if (!authDecision.allow) {
    return error(req, authDecision.reason || 'Forbidden', 403);
  }

  const db = createDB(env.DB);

  // GET /api/admin/groups - List all groups
  if (req.method === 'GET' && path === '/api/admin/groups') {
    try {
      const groups = await db.all(
        `SELECT id, name, description, is_system, created_at, updated_at
         FROM groups
         ORDER BY is_system DESC, name ASC`
      );

      const memberCounts = await db.all(
        `SELECT group_id, COUNT(*) as member_count
         FROM group_members
         GROUP BY group_id`
      );

      const memberMap = new Map(memberCounts.map((row) => [row.group_id, row.member_count]));

      const payload = groups.map((group) => ({
        ...group,
        member_count: memberMap.get(group.id) || 0,
      }));

      return json(req, { groups: payload });
    } catch (err) {
      logger.error('List groups failed', { error: err?.message || err });
      return error(req, 'Failed to list groups', 500);
    }
  }

  // POST /api/admin/groups - Create group
  if (req.method === 'POST' && path === '/api/admin/groups') {
    let body;
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
    const memberIds = normalizePermissionsList(body.member_ids);

    try {
      const existing = await db.first('SELECT id FROM groups WHERE name = ?', [name]);
      if (existing) return error(req, 'Group name already exists', 409);

      const groupId = crypto.randomUUID();
      const statements = [
        db.prepare(
          `INSERT INTO groups (id, name, description, is_system, created_at, updated_at)
           VALUES (?, ?, ?, 0, unixepoch(), unixepoch())`,
          [groupId, name, description]
        ),
        ...memberIds.map((userId) =>
          db.prepare(
            `INSERT INTO group_members (id, group_id, user_id, created_at)
           VALUES (?, ?, ?, unixepoch())`,
            [crypto.randomUUID(), groupId, userId]
          )
        ),
      ];
      await db.batch(statements);

      await logAuditEvent(env, {
        actor_id: user.sub,
        action: 'group_created',
        resource_type: 'group',
        resource_id: groupId,
        metadata: { name, member_ids: memberIds },
      });

      return json(
        req,
        {
          group: {
            id: groupId,
            name,
            description,
            is_system: 0,
            member_count: memberIds.length,
          },
        },
        201
      );
    } catch (err) {
      logger.error('Create group failed', { error: err?.message || err });
      return error(req, 'Failed to create group', 500);
    }
  }

  // GET /api/admin/groups/:id
  const groupMatch = path.match(/^\/api\/admin\/groups\/([^/]+)$/);
  if (groupMatch && req.method === 'GET') {
    const groupId = groupMatch[1];
    try {
      const group = await db.first(
        `SELECT id, name, description, is_system, created_at, updated_at
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

      return json(req, {
        group,
        members,
      });
    } catch (err) {
      logger.error('Get group failed', { error: err?.message || err });
      return error(req, 'Failed to fetch group', 500);
    }
  }

  // PUT /api/admin/groups/:id
  if (groupMatch && req.method === 'PUT') {
    const groupId = groupMatch[1];
    let body;
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

      const description =
        body.description !== undefined ? String(body.description).trim() : group.description;
      if (description && description.length > 500) {
        return error(req, 'Description too long (max 500 chars)', 400);
      }
      const hasMemberIds = Object.prototype.hasOwnProperty.call(body, 'member_ids');
      const memberIds = hasMemberIds ? normalizePermissionsList(body.member_ids) : null;

      const statements = [
        db.prepare(
          `UPDATE groups
           SET name = ?, description = ?, updated_at = unixepoch()
           WHERE id = ?`,
          [name, description || null, groupId]
        ),
      ];
      if (hasMemberIds) {
        statements.push(
          db.prepare('DELETE FROM group_members WHERE group_id = ?', [groupId]),
          ...memberIds.map((userId) =>
            db.prepare(
              `INSERT INTO group_members (id, group_id, user_id, created_at)
             VALUES (?, ?, ?, unixepoch())`,
              [crypto.randomUUID(), groupId, userId]
            )
          )
        );
      }

      await db.batch(statements);

      await logAuditEvent(env, {
        actor_id: user.sub,
        action: 'group_updated',
        resource_type: 'group',
        resource_id: groupId,
        metadata: {
          name,
          ...(hasMemberIds ? { member_ids: memberIds } : {}),
        },
      });

      return json(req, {
        group: {
          id: groupId,
          name,
          description: description || null,
          is_system: group.is_system || 0,
          ...(hasMemberIds ? { member_count: memberIds.length } : {}),
        },
      });
    } catch (err) {
      logger.error('Update group failed', { error: err?.message || err });
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
      logger.error('Delete group failed', { error: err?.message || err });
      return error(req, 'Failed to delete group', 500);
    }
  }

  // POST /api/admin/groups/:id/users
  const groupUsersMatch = path.match(/^\/api\/admin\/groups\/([^/]+)\/users$/);
  if (groupUsersMatch && req.method === 'POST') {
    const groupId = groupUsersMatch[1];
    let body;
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
      logger.error('Add group members failed', { error: err?.message || err });
      return error(req, 'Failed to add group members', 500);
    }
  }

  // DELETE /api/admin/groups/:id/users
  if (groupUsersMatch && req.method === 'DELETE') {
    const groupId = groupUsersMatch[1];
    let body;
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
        await db.run('DELETE FROM group_members WHERE group_id = ? AND user_id = ?', [
          groupId,
          userId,
        ]);
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
      logger.error('Remove group members failed', { error: err?.message || err });
      return error(req, 'Failed to remove group members', 500);
    }
  }

  return null;
}
