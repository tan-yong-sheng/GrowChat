/**
 * Centralized Authorization Core
 *
 * Single authorization entry point for all permission checks.
 * Implements deny-by-default model with machine-readable denial reasons.
 */

import { createDB } from '../db.js';
import { createRootLogger } from '../utils/logger.js';
import { getAuditLog } from './authorize-audit.js';

export { getAuditLog };

const BASE_36_RADIX = 36;
const ID_RANDOM_LENGTH = 8;
const HTTP_STATUS_FORBIDDEN_DEFAULT = 403;

const rootLogger = createRootLogger({});

/**
 * Denial reason codes for machine-readable error classification
 */
export const DENIAL_REASONS = {
  MISSING_PERMISSION: 'missing_permission',
  ACCOUNT_NOT_ACTIVE: 'account_not_active',
  LAST_OWNER_PROTECTED: 'last_owner_protected',
  SYSTEM_ROLE_IMMUTABLE: 'system_role_immutable',
  INVALID_REQUEST: 'invalid_request',
};

/**
 * Resolve user's permissions from database
 *
 * @param {Object} db - Database instance (wrapped DB or raw D1)
 * @param {Object} user - User object with sub (user ID)
 * @returns {Promise<string[]>} Array of permission keys user has
 */
export async function resolvePermissions(db, user, logger = rootLogger) {
  if (!user?.sub) return [];

  try {
    // Query: Get all permissions for user's roles
    const roleQuery = `
      SELECT DISTINCT p.key
      FROM permissions p
      INNER JOIN role_permissions rp ON p.id = rp.permission_id
      INNER JOIN roles r ON rp.role_id = r.id
      INNER JOIN user_roles ur ON r.id = ur.role_id
      WHERE ur.user_id = ?
    `;

    const roleResult = await db.prepare(roleQuery).bind(user.sub).all();

    const rolePermissions = (roleResult.results || []).map((row) => row.key);
    return Array.from(new Set(rolePermissions));
  } catch (err) {
    logger.error('Permission resolution failed', { error: err?.message || err });
    return [];
  }
}

/**
 * Check whether the user passes basic authorization preconditions
 */
function isValidAuthorizationRequest(action, user) {
  if (!action || typeof action !== 'string') {
    return {
      allow: false,
      code: 'forbidden',
      reason: DENIAL_REASONS.INVALID_REQUEST,
      action: 'unknown',
    };
  }
  if (!user?.sub) {
    return {
      allow: false,
      code: 'unauthorized',
      reason: DENIAL_REASONS.ACCOUNT_NOT_ACTIVE,
      action,
    };
  }
  return null;
}

/**
 * Authorize a user action with deny-by-default
 */
export async function authorize(env, user, options = {}, logger = rootLogger) {
  const { action } = options;

  const invalid = isValidAuthorizationRequest(action, user);
  if (invalid) return invalid;

  try {
    const db = createDB(env.DB);
    const permissions = await resolvePermissions(db, user);

    if (permissions.includes(action)) {
      return {
        allow: true,
        code: 'ok',
        action,
      };
    }

    return {
      allow: false,
      code: 'forbidden',
      reason: DENIAL_REASONS.MISSING_PERMISSION,
      action,
    };
  } catch (err) {
    logger.error('Authorization check failed', { error: err?.message || err });
    return {
      allow: false,
      code: 'server_error',
      reason: DENIAL_REASONS.INVALID_REQUEST,
      action,
    };
  }
}

/**
 * Log an audit event for admin mutations
 *
 * @param {Object} env - Cloudflare environment with DB binding
 * @param {Object} event - Audit event
 * @param {string} event.actor_id - User ID performing action
 * @param {string} event.action - Action name (e.g., 'role_change')
 * @param {string} event.resource_type - Resource type (e.g., 'user')
 * @param {string} event.resource_id - Resource ID being modified
 * @param {Object} event.metadata - Additional metadata (as object)
 * @returns {Promise<void>}
 */
export async function logAuditEvent(env, event, logger = rootLogger) {
  const db = createDB(env.DB);
  await logAuditEventImpl(event, db, logger);
}

/**
 * Internal audit log implementation
 *
 * @param {Object} event - Audit event
 * @param {Object} db - Database instance
 * @param {Object} logger - Logger instance
 * @returns {Promise<void>}
 */
async function logAuditEventImpl(event, db, logger) {
  try {
    const { actor_id, action, resource_type, resource_id, metadata = {} } = event;

    if (!actor_id || !action || !resource_type) return;

    const id = generateId('audit');
    const created_at = new Date().toISOString();
    const metadataJson = JSON.stringify(metadata);

    await db
      .prepare(
        `INSERT INTO audit_logs (id, actor_id, action, resource_type, resource_id, metadata, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
      )
      .bind(id, actor_id, action, resource_type, resource_id, metadataJson, created_at)
      .run();
  } catch (err) {
    logger.error('Failed to log audit event', { error: err?.message || err });
    // Don't throw - audit logging failures shouldn't break operations
  }
}

/**
 * Generate a unique ID for database records
 *
 * @param {string} prefix - ID prefix (e.g., 'audit', 'user')
 * @returns {string} Unique ID with prefix
 */
function generateId(prefix) {
  const timestamp = Date.now().toString(BASE_36_RADIX);
  const random = Math.random().toString(BASE_36_RADIX).substring(2, ID_RANDOM_LENGTH);
  return `${prefix}-${timestamp}-${random}`;
}

/**
 * Check if user has a specific permission
 *
 * @param {Object} env - Cloudflare environment with DB binding
 * @param {Object} user - User object
 * @param {string} permission - Permission key to check
 * @param {Object} options - Additional options
 * @param {Object} options.context - Additional context for logging
 * @returns {Promise<boolean>} True if user has permission
 */
export async function hasPermission(env, user, permission, options = {}) {
  const decision = await authorize(env, user, {
    action: permission,
    context: options.context,
  });
  return decision.allow === true;
}

/**
 * Require admin permission
 * Throws error if user doesn't have admin.rbac.admin permission
 *
 * @param {Object} options - Options object {env, user}
 * @param {Object} options.env - Cloudflare environment with DB binding
 * @param {Object} options.user - User object
 * @throws {Error} If permission denied
 */
export async function requireAdmin({ env, user }) {
  const decision = await authorize(env, user, {
    action: 'admin.rbac.admin',
  });

  if (!decision.allow) {
    const statusCodeMap = {
      server_error: 500,
      unauthorized: 401,
      not_found: 404,
    };
    const statusCode = statusCodeMap[decision.code] || HTTP_STATUS_FORBIDDEN_DEFAULT;
    const error = new Error(decision.reason || 'Forbidden');
    error.code = decision.code;
    error.statusCode = statusCode;
    throw error;
  }
}

/**
 * Get count of users with specific role
 *
 * @param {Object} env - Cloudflare environment with DB binding
 * @param {string} roleName - Role name (e.g., 'admin')
 * @param {string} excludeUserId - User ID to exclude from count (optional)
 * @returns {Promise<number>} Count of users with role
 */
export async function getRoleUserCount(env, roleName, excludeUserId, logger = rootLogger) {
  try {
    let query = `
      SELECT COUNT(*) as count
      FROM user_roles ur
      INNER JOIN roles r ON ur.role_id = r.id
      WHERE r.name = ?
    `;

    const bindings = [roleName];

    if (excludeUserId) {
      query += ` AND ur.user_id != ?`;
      bindings.push(excludeUserId);
    }

    const result = await env.DB.prepare(query)
      .bind(...bindings)
      .first();
    return result?.count || 0;
  } catch (err) {
    logger.error('Failed to get role user count', { error: err?.message || err });
    return 0;
  }
}

/**
 * Check last-owner protection
 * Returns true if user is the last member of a critical role
 *
 * @param {Object} env - Cloudflare environment with DB binding
 * @param {string} userId - User ID to check
 * @param {string} roleName - Role name (e.g., 'admin')
 * @returns {Promise<boolean>} True if this is the last user with role
 */
export async function isLastOwnerOfRole(env, userId, roleName, _logger = rootLogger) {
  const count = await getRoleUserCount(env, roleName, userId);
  return count === 0;
}

/**
 * Get user's roles
 *
 * @param {Object} db - Database instance (wrapped DB or raw D1)
 * @param {string} userId - User ID
 * @returns {Promise<Object[]>} Array of { role_id, role_name }
 */
export async function getUserRoles(db, userId, logger = rootLogger) {
  try {
    const query = `
      SELECT ur.id, ur.role_id, r.name as role_name
      FROM user_roles ur
      INNER JOIN roles r ON ur.role_id = r.id
      WHERE ur.user_id = ?
      ORDER BY r.name ASC
    `;

    const result = await db.prepare(query).bind(userId).all();
    return result.results || [];
  } catch (err) {
    logger.error('Failed to get user roles', { error: err?.message || err });
    return [];
  }
}

/**
 * Get role details with permissions
 *
 * @param {Object} env - Cloudflare environment with DB binding
 * @param {string} roleName - Role name (e.g., 'admin')
 * @returns {Promise<Object>} { id, name, system, permissions: [...] }
 */
export async function getRoleDetails(env, roleName, logger = rootLogger) {
  try {
    // Get role
    const roleQuery = 'SELECT * FROM roles WHERE name = ?';
    const role = await env.DB.prepare(roleQuery).bind(roleName).first();

    if (!role) return null;

    // Get permissions
    const permQuery = `
      SELECT p.id, p.key, p.description
      FROM permissions p
      INNER JOIN role_permissions rp ON p.id = rp.permission_id
      WHERE rp.role_id = ?
      ORDER BY p.key ASC
    `;

    const permResult = await env.DB.prepare(permQuery).bind(role.id).all();

    return {
      ...role,
      permissions: permResult.results || [],
    };
  } catch (err) {
    logger.error('Failed to get role details', { error: err?.message || err });
    return null;
  }
}
