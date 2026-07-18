/**
 * Groups - DELETE /api/admin/groups/:id/users
 * Removes users from a group
 */

import { handleGroupMemberOperation } from './groups-helpers.js';
export async function handleGroupsRemoveUsers(
  req,
  env,
  _ctx,
  user,
  groupId,
  path,
  { db, logger } = {}
) {
  return handleGroupMemberOperation(
    { req, env, user },
    groupId,
    { db, logger, action: 'remove' },
    async (db, groupId, userIds) => {
      for (const userId of userIds) {
        await db.run('DELETE FROM group_members WHERE group_id = ? AND user_id = ?', [
          groupId,
          userId,
        ]);
      }
    }
  );
}
