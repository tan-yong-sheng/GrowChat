/**
 * Groups - POST /api/admin/groups/:id/users
 * Adds users to a group
 */
import { error, json } from '../utils/response.js';
import { HTTP_STATUS } from '../shared/http-status.js';
import { logAuditEvent } from '../utils/authorize.js';
import { parseGroupUserIds } from './groups-helpers.js';

// eslint-disable-next-line max-params -- router dispatcher pattern (req, env, ctx, user, groupId, path, deps)
export async function handleGroupsAddUsers(
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
    if (!group) return error(req, 'Group not found', HTTP_STATUS.NOT_FOUND);

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

    return json(req, { group_id: groupId, user_ids: userIds }, HTTP_STATUS.CREATED);
  } catch (err) {
    logger.error('Add group members failed', { error: err?.message || err });
    return error(req, 'Failed to add group members', HTTP_STATUS.INTERNAL_SERVER_ERROR);
  }
}
