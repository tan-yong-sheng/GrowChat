/**
 * Users Admin List Handler
 */
import { createDB } from '../../db.js';
import { authorize, logAuditEvent } from '../../utils/authorize.js';
import { error, json } from '../../utils/response.js';
import { parsePagination } from '../../validation/request.js';
import { normalizeAccountStatus, normalizeRole, parseSettings } from './users-helpers.js';

/**
 * Handle users/admin/list routes.
 * Returns Response if handled, null if path doesn't match.
 */
export async function handleUsersAdminList(
  req,
  env,
  ctx,
  user,
  path,
  { _db, logger, _requestContext }
) {
  if (req.method === 'GET' && path === '/api/admin/users') {
    // Check authorization
    const authDecision = await authorize(env, user, {
      action: 'admin.user.read',
      resource: 'users',
    });

    if (!authDecision.allow) {
      return error(req, authDecision.reason || 'Forbidden', 403);
    }

    const db = createDB(env.DB);
    const url = new URL(req.url);
    const { limit, offset } = parsePagination(url, {
      defaultLimit: 20,
      maxLimit: 100,
      defaultOffset: 0,
    });
    const query = (url.searchParams.get('q') || '').trim();

    try {
      let countSql = 'SELECT COUNT(*) as count FROM users';
      let dataSql = `SELECT
           u.id,
           u.email,
           u.name,
           u.account_status,
           u.settings,
           u.created_at,
           u.updated_at,
           u.last_active_at,
           COALESCE((
             SELECT r.name
             FROM user_roles ur
             INNER JOIN roles r ON r.id = ur.role_id
             WHERE ur.user_id = u.id
             ORDER BY r.name ASC
             LIMIT 1
           ), 'member') AS primary_role
         FROM users u`;

      const params = [];
      const countParams = [];

      if (query) {
        const likeQuery = `%${query}%`;
        const whereClause = ' WHERE u.email LIKE ? OR u.name LIKE ?';
        countSql += whereClause;
        dataSql += whereClause;
        countParams.push(likeQuery, likeQuery);
        params.push(likeQuery, likeQuery);
      }

      dataSql += `
         ORDER BY
           CASE COALESCE((
             SELECT r.name
             FROM user_roles ur
             INNER JOIN roles r ON r.id = ur.role_id
             WHERE ur.user_id = u.id
             ORDER BY r.name ASC
             LIMIT 1
           ), 'member')
             WHEN 'admin' THEN 0
             WHEN 'member' THEN 1
             ELSE 2
           END,
           CASE COALESCE(account_status, 'active')
             WHEN 'active' THEN 0
             WHEN 'pending' THEN 1
             ELSE 2
           END,
           LOWER(COALESCE(name, '')) ASC,
           LOWER(email) ASC
         LIMIT ? OFFSET ?`;

      params.push(limit, offset);

      const totalRow = await db.first(countSql, countParams);
      const users = await db.all(dataSql, params);

      // Parse settings JSON
      const parsedUsers = users.map((u) => ({
        id: u.id,
        email: u.email,
        name: u.name,
        primary_role: normalizeRole(u.primary_role),
        account_status: normalizeAccountStatus(u.account_status),
        settings: parseSettings(u.settings),
        created_at: u.created_at,
        last_active_at: u.last_active_at || null,
        updated_at: u.updated_at,
      }));

      // Log audit event
      await logAuditEvent(env, {
        actor_id: user.sub,
        action: 'user_list_accessed',
        resource_type: 'users',
        resource_id: null,
        metadata: { limit, offset, count: parsedUsers.length },
      });

      return json(req, {
        users: parsedUsers,
        total: totalRow?.count || 0,
        limit,
        offset,
      });
    } catch (err) {
      logger.error('List users failed', { error: err?.message || err });
      return error(req, 'Failed to list users', 500);
    }
  }

  // GET /api/admin/users/:id/access - Inspect effective ACL access (admin only)
  return null;
}
