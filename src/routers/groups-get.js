/**
 * Groups - GET /api/admin/groups/:id
 * Fetches a single group with its members
 */
import { error, json } from '../utils/response.js';

export async function handleGroupsGet(req, env, _ctx, user, groupId, path, { db, logger } = {}) {
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
