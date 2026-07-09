/**
 * Groups - PUT /api/admin/groups/:id
 * Updates a group (name, description, members)
 */
import { error, json } from '../utils/response.js';
import { HTTP_STATUS } from '../shared/http-status.js';
import { logAuditEvent } from '../utils/authorize.js';
import {
  buildGroupUpdateStatements,
  buildUpdatedGroup,
  extractMemberIds,
  resolveGroupDescription,
  resolveGroupName,
} from './groups-helpers.js';

/**
 * Parse request body, returning null on invalid JSON.
 */
async function parseBody(req) {
  try {
    return await req.json();
  } catch {
    return null;
  }
}

/**
 * Validate update fields against incoming body and current group.
 */
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

// eslint-disable-next-line max-params -- router dispatcher pattern (req, env, ctx, user, groupId, path, deps)
export async function handleGroupsUpdate(req, env, _ctx, user, groupId, path, { db, logger } = {}) {
  const body = await parseBody(req);
  if (body === null) return error(req, 'Invalid JSON', HTTP_STATUS.BAD_REQUEST);

  try {
    const group = await db.first('SELECT * FROM groups WHERE id = ?', [groupId]);
    if (!group) return error(req, 'Group not found', HTTP_STATUS.NOT_FOUND);
    if (group.is_system) return error(req, 'Cannot modify system group', HTTP_STATUS.FORBIDDEN);

    const update = validateUpdate(body, group);
    if (update.error) return error(req, update.error, HTTP_STATUS.BAD_REQUEST);

    const statements = buildGroupUpdateStatements({
      db,
      groupId,
      name: update.name,
      description: update.description,
      memberIds: update.memberIds,
    });
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
      group: buildUpdatedGroup({
        groupId,
        group,
        name: update.name,
        description: update.description,
        hasMemberIds: update.hasMemberIds,
        memberIds: update.memberIds,
      }),
    });
  } catch (err) {
    logger.error('Update group failed', { error: err?.message || err });
    return error(req, 'Failed to update group', HTTP_STATUS.INTERNAL_SERVER_ERROR);
  }
}
