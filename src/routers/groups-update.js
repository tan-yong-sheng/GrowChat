/**
 * Groups - PUT /api/admin/groups/:id
 * Updates a group (name, description, members)
 */
import { error, json } from '../utils/response.js';
import { logAuditEvent } from '../utils/authorize.js';
import {
  buildGroupUpdateStatements,
  buildUpdatedGroup,
  extractMemberIds,
  resolveGroupDescription,
  resolveGroupName,
} from './groups-helpers.js';

async function parseBody(req) {
  try {
    return await req.json();
  } catch {
    return null;
  }
}

function validateUpdate(body, group) {
  const nameResult = resolveGroupName(body?.name, group.name);
  if (nameResult.error) return { error: nameResult.error };

  const descriptionResult = resolveGroupDescription(body?.description, group.description);
  if (descriptionResult.error) return { error: descriptionResult.error };

  const { hasMemberIds, memberIds } = extractMemberIds(body || {});
  return {
    name: nameResult.name,
    description: descriptionResult.description,
    hasMemberIds,
    memberIds,
  };
}

export async function handleGroupsUpdate(req, env, _ctx, user, groupId, path, { db, logger } = {}) {
  const body = await parseBody(req);
  if (body === null) return error(req, 'Invalid JSON', 400);

  try {
    const group = await db.first('SELECT * FROM groups WHERE id = ?', [groupId]);
    if (!group) return error(req, 'Group not found', 404);
    if (group.is_system) return error(req, 'Cannot modify system group', 403);

    const update = validateUpdate(body, group);
    if (update.error) return error(req, update.error, 400);

    const statements = buildGroupUpdateStatements(
      db,
      groupId,
      update.name,
      update.description,
      update.hasMemberIds ? update.memberIds : null
    );
    await db.batch(statements);

    await logAuditEvent(env, {
      actor_id: user.sub,
      action: 'group_updated',
      resource_type: 'group',
      resource_id: groupId,
      metadata: {
        name: update.name,
        ...(update.hasMemberIds ? { member_ids: update.memberIds } : {}),
      },
    });

    return json(req, {
      group: buildUpdatedGroup(
        groupId,
        group,
        update.name,
        update.description,
        update.hasMemberIds,
        update.memberIds
      ),
    });
  } catch (err) {
    logger.error('Update group failed', { error: err?.message || err });
    return error(req, 'Failed to update group', 500);
  }
}
