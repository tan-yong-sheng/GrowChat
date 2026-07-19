/**
 * Groups - DELETE /api/admin/groups/:id
 * Deletes a group
 */
import { error } from '../utils/response.js';
import { HTTP_STATUS } from '../shared/http-status.js';
import { logAuditEvent } from '../utils/authorize.js';
export async function handleGroupsDelete({
  req,
  env,
  ctx: _ctx,
  user,
  groupId,
  path: _path,
  db,
  logger,
} = {}) {
  try {
    const group = await db.first('SELECT * FROM groups WHERE id = ?', [groupId]);
    if (!group) return error(req, 'Group not found', HTTP_STATUS.NOT_FOUND);
    if (group.is_system) return error(req, 'Cannot delete system group', HTTP_STATUS.FORBIDDEN);

    await db.run('DELETE FROM groups WHERE id = ?', [groupId]);

    await logAuditEvent(env, {
      actor_id: user.sub,
      action: 'group_deleted',
      resource_type: 'group',
      resource_id: groupId,
      metadata: { name: group.name },
    });

    return new Response(null, { status: HTTP_STATUS.NO_CONTENT });
  } catch (err) {
    logger.error('Delete group failed', { error: err?.message || err });
    return error(req, 'Failed to delete group', HTTP_STATUS.INTERNAL_SERVER_ERROR);
  }
}
