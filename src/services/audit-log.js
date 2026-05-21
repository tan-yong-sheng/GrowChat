/**
 * Audit Logging Service
 * Tracks security-relevant events for compliance and debugging
 */

import db from '../db.js';

/**
 * Log an audit event
 * @param {Object} params - Event parameters
 * @param {string} params.action - Action type (e.g., 'user.login', 'user.logout')
 * @param {string} [params.userId] - User ID (optional for anonymous actions)
 * @param {string} [params.resourceType] - Type of resource affected
 * @param {string} [params.resourceId] - ID of resource affected
 * @param {string} [params.ipAddress] - Client IP address
 * @param {string} [params.userAgent] - Client user agent
 * @param {Object} [params.details] - Additional details (JSON)
 */
export async function logAuditEvent({
  action,
  userId = null,
  resourceType = null,
  resourceId = null,
  ipAddress = null,
  userAgent = null,
  details = null,
}) {
  const id = crypto.randomUUID();
  const createdAt = Math.floor(Date.now() / 1000);

  await db
    .prepare(
      `INSERT INTO audit_logs (id, user_id, action, resource_type, resource_id, ip_address, user_agent, details, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(
      id,
      userId,
      action,
      resourceType,
      resourceId,
      ipAddress,
      userAgent,
      details ? JSON.stringify(details) : null,
      createdAt
    )
    .run();
}

/**
 * Get audit logs with pagination and filtering
 * @param {Object} params - Query parameters
 * @param {string} [params.userId] - Filter by user ID
 * @param {string} [params.action] - Filter by action
 * @param {number} [params.limit=50] - Results per page
 * @param {number} [params.offset=0] - Pagination offset
 * @returns {Promise<Response>}
 */
export async function getAuditLogs({ userId, action, limit = 50, offset = 0 }) {
  let sql = 'SELECT * FROM audit_logs WHERE 1=1';
  const params = [];

  if (userId) {
    sql += ' AND user_id = ?';
    params.push(userId);
  }

  if (action) {
    sql += ' AND action = ?';
    params.push(action);
  }

  sql += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
  params.push(limit, offset);

  const result = await db
    .prepare(sql)
    .bind(...params)
    .all();

  return Response.json({
    logs: result.results || [],
    pagination: {
      limit,
      offset,
      hasMore: (result.results || []).length === limit,
    },
  });
}

/**
 * Audit action types enum
 */
export const AuditActions = {
  // Authentication
  AUTH_LOGIN: 'auth.login',
  AUTH_LOGOUT: 'auth.logout',
  AUTH_REGISTER: 'auth.register',
  AUTH_PASSWORD_RESET: 'auth.password_reset',
  AUTH_EMAIL_VERIFY: 'auth.email_verify',

  // User management
  USER_CREATE: 'user.create',
  USER_UPDATE: 'user.update',
  USER_DELETE: 'user.delete',
  USER_ROLE_CHANGE: 'user.role_change',

  // Chat actions
  CHAT_CREATE: 'chat.create',
  CHAT_DELETE: 'chat.delete',
  CHAT_UPDATE: 'chat.update',

  // Message actions
  MESSAGE_CREATE: 'message.create',
  MESSAGE_EDIT: 'message.edit',
  MESSAGE_DELETE: 'message.delete',

  // File actions
  FILE_UPLOAD: 'file.upload',
  FILE_DELETE: 'file.delete',

  // Admin actions
  ADMIN_SETTINGS_CHANGE: 'admin.settings_change',
  ADMIN_USER_BAN: 'admin.user_ban',
  ADMIN_USER_UNBAN: 'admin.user_unban',
};

export default {
  logAuditEvent,
  getAuditLogs,
  AuditActions,
};
