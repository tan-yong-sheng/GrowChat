/**
 * Groups shared helpers for group management
 */
import { error } from '../utils/response.js';

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
  if (description && description.length > 500)
    return { error: 'Description too long (max 500 chars)' };
  return { description };
}

export function extractMemberIds(body) {
  const hasMemberIds = Object.prototype.hasOwnProperty.call(body, 'member_ids');
  const memberIds = hasMemberIds ? normalizePermissionsList(body.member_ids) : null;
  return { hasMemberIds, memberIds };
}

export function buildGroupUpdateStatements(db, groupId, name, description, memberIds) {
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

export function buildUpdatedGroup(groupId, group, name, description, hasMemberIds, memberIds) {
  return {
    id: groupId,
    name,
    description: description || null,
    is_system: group.is_system || 0,
    ...(hasMemberIds ? { member_count: memberIds.length, member_ids: memberIds } : {}),
  };
}

export async function parseGroupUserIds(req) {
  let body;
  try {
    body = await req.json();
  } catch {
    return { error: error(req, 'Invalid JSON', 400) };
  }
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return { error: error(req, 'Invalid JSON payload', 400) };
  }
  const userIds = normalizePermissionsList(body.user_ids || (body.user_id ? [body.user_id] : []));
  if (!userIds.length) return { error: error(req, 'user_id required', 400) };
  return { userIds };
}
