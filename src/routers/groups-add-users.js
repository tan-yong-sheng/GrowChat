/**
 * Groups - POST /api/admin/groups/:id/users
 * Adds users to a group
 */
import { HTTP_STATUS } from '../shared/http-status.js';
import { handleGroupMemberOperation } from './groups-helpers.js';

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
  return handleGroupMemberOperation(
    { req, env, user },
    groupId,
    { db, logger, action: 'add', statusCode: HTTP_STATUS.CREATED },
    async (db, groupId, userIds) => {
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
    }
  );
}
