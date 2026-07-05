/**
 * Groups - DELETE /api/admin/groups/:id
 * Deletes a group
 */
import { error, json } from '../utils/response.js';
import { logAuditEvent } from '../utils/authorize.js';

export async function handleGroupsDelete(req, env, _ctx, user, groupId, path, { db, logger } = {}) {
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
