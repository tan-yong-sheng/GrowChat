/**
 * Groups shared helpers for group management
 */
import { error, json } from '../utils/response.js';
import { HTTP_STATUS } from '../shared/http-status.js';
import { logAuditEvent } from '../utils/authorize.js';

const MAX_DESCRIPTION_LENGTH = 500;

export function normalizePermissionsList(value) {
  if (!Array.isArray(value)) return [];
  const cleaned = value
    .map((item) => {
      if (typeof item === 'string') return item.trim();
      if (item && typeof item === 'object') return String(item.key || '').trim();
      return '';
    })
    .filter(Boolean);
  return Array.from(new Set(cleaned));
}

export function resolveGroupName(input, current) {
  const name = input !== undefined ? String(input).trim() : current;
  if (!name || name.length > 100) return { error: 'Name required (1-100 chars)' };
  return { name };
}

export function resolveGroupDescription(input, current) {
  const description = input !== undefined ? String(input).trim() : current;
  if (description && description.length > MAX_DESCRIPTION_LENGTH)
    return { error: 'Description too long (max 500 chars)' };
  return { description };
}

export function extractMemberIds(body) {
  const hasMemberIds = Object.prototype.hasOwnProperty.call(body, 'member_ids');
  const memberIds = hasMemberIds ? normalizePermissionsList(body.member_ids) : null;
  return { hasMemberIds, memberIds };
}

export function buildGroupUpdateStatements({ db, groupId, name, description, memberIds }) {
  const statements = [
    db.prepare(
      `UPDATE groups
       SET name = ?, description = ?, updated_at = unixepoch()
       WHERE id = ?`,
      [name, description || null, groupId]
    ),
  ];
  if (memberIds) {
    statements.push(
      db.prepare('DELETE FROM group_members WHERE group_id = ?', [groupId]),
      ...memberIds.map((userId) =>
        db.prepare(
          `INSERT INTO group_members (id, group_id, user_id, created_at)
           VALUES (?, ?, ?, unixepoch())`,
          [crypto.randomUUID(), groupId, userId]
        )
      )
    );
  }
  return statements;
}

export function buildUpdatedGroup({ groupId, group, name, description, hasMemberIds, memberIds }) {
  return {
    id: groupId,
    name,
    description: description || null,
    is_system: group.is_system || 0,
    ...(hasMemberIds ? { member_count: memberIds.length, member_ids: memberIds } : {}),
  };
}

/**
 * Log a group members audit event.
 */
export async function logGroupMembersAudit({ env, actorId, groupId, userIds, action }) {
  await logAuditEvent(env, {
    actor_id: actorId,
    action: `group_members_${action}`,
    resource_type: 'group',
    resource_id: groupId,
    metadata: { user_ids: userIds },
  });
}

/**
 * Execute a group member operation (add/remove) with shared
 * validation, audit, and error handling.
 *
 * Handles: parseUserIds → groupExists → performOp → audit → response
 *
 * @param {Request}  req      - Incoming request (for JSON parse + response)
 * @param {object}  env      - Environment bindings (for audit)
 * @param {object}  user     - Authenticated user with .sub
 * @param {string}  groupId  - Target group ID
 * @param {object}  opts     - { db, logger, action, statusCode }
 * @param {Function} performOp - Async callback (db, groupId, userIds) => void
 */
export async function handleGroupMemberOperation(
  { req, env, user },
  groupId,
  { db, logger, action, statusCode = HTTP_STATUS.OK } = {},
  performOp
) {
  const parsed = await parseGroupUserIds(req);
  if (parsed.error) return parsed.error;
  const { userIds } = parsed;

  try {
    const group = await db.first('SELECT id FROM groups WHERE id = ?', [groupId]);
    if (!group) return error(req, 'Group not found', HTTP_STATUS.NOT_FOUND);

    await performOp(db, groupId, userIds);

    await logGroupMembersAudit({ env, actorId: user.sub, groupId, userIds, action });

    return json(req, { group_id: groupId, user_ids: userIds }, statusCode);
  } catch (err) {
    return catchGroupMembersError(err, logger, req, action);
  }
}

export async function parseGroupUserIds(req) {
  let body;
  try {
    body = await req.json();
  } catch {
    return { error: error(req, 'Invalid JSON', HTTP_STATUS.BAD_REQUEST) };
  }
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return { error: error(req, 'Invalid JSON payload', HTTP_STATUS.BAD_REQUEST) };
  }
  const userIds = normalizePermissionsList(body.user_ids || (body.user_id ? [body.user_id] : []));
  if (!userIds.length) return { error: error(req, 'user_id required', HTTP_STATUS.BAD_REQUEST) };
  return { userIds };
}

/**
 * Look up a group by ID and return the row, or return a 404 error response.
 */
export async function groupExistsOrFail(req, db, groupId) {
  const group = await db.first('SELECT id FROM groups WHERE id = ?', [groupId]);
  if (!group) return error(req, 'Group not found', HTTP_STATUS.NOT_FOUND);
  return group;
}

/**
 * Catch and format a group members operation error into a consistent error response.
 */
export function catchGroupMembersError(err, logger, req, action) {
  logger.error(`${action} group members failed`, { error: err?.message || err });
  return error(req, `Failed to ${action} group members`, HTTP_STATUS.INTERNAL_SERVER_ERROR);
}
