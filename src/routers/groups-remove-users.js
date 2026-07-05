/**
 * Groups - DELETE /api/admin/groups/:id/users
 * Removes users from a group
 */
import { error, json } from '../utils/response.js';
import { logAuditEvent } from '../utils/authorize.js';
import { parseGroupUserIds } from './groups-helpers.js';

export async function handleGroupsRemoveUsers(
  req,
  env,
  _ctx,
  user,
  groupId,
  path,
  { db, logger } = {}
) {
  const parsed = await parseGroupUserIds(req);
  if (parsed.error) return parsed.error;
  const { userIds } = parsed;

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
