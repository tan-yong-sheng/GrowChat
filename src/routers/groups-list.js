/**
 * Groups - GET /api/admin/groups
 * Lists all groups
 */
import { error, json } from '../utils/response.js';
import { HTTP_STATUS } from '../shared/http-status.js';
export async function handleGroupsList({
  req,
  env: _env,
  ctx: _ctx,
  user: _user,
  path,
  db,
  logger,
} = {}) {
  if (path !== '/api/admin/groups') return null;

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
    return error(req, 'Failed to list groups', HTTP_STATUS.INTERNAL_SERVER_ERROR);
  }
}
