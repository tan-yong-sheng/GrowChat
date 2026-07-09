/**
 * Groups - POST /api/admin/groups
 * Creates a new group
 */
import { error, json } from '../utils/response.js';
import { HTTP_STATUS } from '../shared/http-status.js';
import { logAuditEvent } from '../utils/authorize.js';
import { normalizePermissionsList } from './groups-helpers.js';

const MAX_DESCRIPTION_LENGTH = 500;

/**
 * Parse and validate the group creation request body.
 * Returns object with { error?, name, description, member_ids } on success.
 */
function validateCreateInput(body) {
  const name = String(body.name || '').trim();
  if (!name || name.length > 100) {
    return { error: 'Name required (1-100 chars)' };
  }

  const description = body.description ? String(body.description).trim() : null;
  if (description && description.length > MAX_DESCRIPTION_LENGTH) {
    return { error: 'Description too long (max 500 chars)' };
  }

  const memberIds = normalizePermissionsList(body.member_ids);
  return { name, description, memberIds };
}

/**
 * Check for existing group name and create the group in the database.
 */
async function createGroupInDb(db, name, description, memberIds) {
  const existing = await db.first('SELECT id FROM groups WHERE name = ?', [name]);
  if (existing) return { error: 'Group name already exists', status: HTTP_STATUS.CONFLICT };

  const groupId = crypto.randomUUID();
  const statements = [
    db.prepare(
      `INSERT INTO groups (id, name, description, is_system, created_at, updated_at)
       VALUES (?, ?, ?, 0, unixepoch(), unixepoch())`,
      [groupId, name, description]
    ),
    ...memberIds.map((userId) =>
      db.prepare(
        `INSERT INTO group_members (id, group_id, user_id, created_at)
         VALUES (?, ?, ?, unixepoch())`,
        [crypto.randomUUID(), groupId, userId]
      )
    ),
  ];
  await db.batch(statements);

  return {
    group: {
      id: groupId,
      name,
      description,
      is_system: 0,
      member_count: memberIds.length,
    },
  };
}

// eslint-disable-next-line max-params -- router dispatcher pattern (req, env, ctx, user, path, deps)
export async function handleGroupsCreate(req, env, _ctx, user, path, { db, logger } = {}) {
  if (path !== '/api/admin/groups') return null;

  let body;
  try {
    body = await req.json();
  } catch {
    return error(req, 'Invalid JSON', HTTP_STATUS.BAD_REQUEST);
  }

  const validated = validateCreateInput(body);
  if (validated.error) {
    return error(req, validated.error, HTTP_STATUS.BAD_REQUEST);
  }

  const { name, description, memberIds } = validated;

  try {
    const result = await createGroupInDb(db, name, description, memberIds);
    if (result.error) {
      return error(req, result.error, result.status);
    }

    await logAuditEvent(env, {
      actor_id: user.sub,
      action: 'group_created',
      resource_type: 'group',
      resource_id: result.group.id,
      metadata: { name, member_ids: memberIds },
    });

    return json(req, { group: result.group }, HTTP_STATUS.CREATED);
  } catch (err) {
    logger.error('Create group failed', { error: err?.message || err });
    return error(req, 'Failed to create group', HTTP_STATUS.INTERNAL_SERVER_ERROR);
  }
}
