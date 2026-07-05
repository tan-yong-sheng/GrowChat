/**
 * Groups - POST /api/admin/groups
 * Creates a new group
 */
import { error, json } from '../utils/response.js';
import { logAuditEvent } from '../utils/authorize.js';
import { normalizePermissionsList } from './groups-helpers.js';

export async function handleGroupsCreate(req, env, _ctx, user, path, { db, logger } = {}) {
  if (path !== '/api/admin/groups') return null;

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
