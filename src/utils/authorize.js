/**
 * Centralized Authorization Core
 *
 * Single authorization entry point for all permission checks.
 * Implements deny-by-default model with machine-readable denial reasons.
 */

/**
 * Denial reason codes for machine-readable error classification
 */
export const DENIAL_REASONS = {
  MISSING_PERMISSION: 'missing_permission',
  INACTIVE_ACCOUNT: 'inactive_account',
  INSUFFICIENT_SCOPE: 'insufficient_scope',
  LAST_OWNER_PROTECTED: 'last_owner_protected',
  SYSTEM_ROLE_IMMUTABLE: 'system_role_immutable',
  INVALID_REQUEST: 'invalid_request',
};

/**
 * Resolve user's permissions from database
 *
 * @param {Object} env - Cloudflare environment with DB binding
 * @param {Object} user - User object with sub (user ID)
 * @param {Object} context - Optional context { scope_type, scope_id }
 * @returns {Promise<string[]>} Array of permission keys user has
 */
export async function resolvePermissions(env, user, context = {}) {
  if (!user?.sub) return [];

  try {
    // Query: Get all permissions for user's roles
    // Respects scope: if scope_type/scope_id provided, includes both global and scoped permissions
    const query = `
      SELECT DISTINCT p.key
      FROM permissions p
      INNER JOIN role_permissions rp ON p.id = rp.permission_id
      INNER JOIN roles r ON rp.role_id = r.id
      INNER JOIN user_roles ur ON r.id = ur.role_id
      WHERE ur.user_id = ?
        AND (ur.scope_type IS NULL OR (ur.scope_type = ? AND ur.scope_id = ?))
    `;

    const bindings = [user.sub, context.scope_type || null, context.scope_id || null];
    const result = await env.DB.prepare(query).bind(bindings).all();

    return (result.results || []).map((row) => row.key);
  } catch (err) {
    console.error('Permission resolution failed:', err);
    return [];
  }
}

/**
 * Authorize a user action with deny-by-default
 *
 * @param {Object} env - Cloudflare environment with DB binding
 * @param {Object} user - User object with sub (user ID) and role
 * @param {Object} options - Authorization options
 * @param {string} options.action - Permission action (e.g., 'admin.user.write')
 * @param {string} options.resource - Resource type (optional)
 * @param {string} options.resourceId - Resource ID (optional)
 * @param {Object} options.context - Additional context (optional)
 * @returns {Promise<Object>} { allow: boolean, reason?: string }
 */
export async function authorize(env, user, options = {}) {
  // Default deny
  const { action, resource, resourceId, context } = options;

  // Validate inputs
  if (!action || typeof action !== 'string') {
    return {
      allow: false,
      code: 'forbidden',
      reason: DENIAL_REASONS.INVALID_REQUEST,
      action: 'unknown',
    };
  }

  // Check user exists and is active
  if (!user?.sub) {
    return {
      allow: false,
      code: 'forbidden',
      reason: DENIAL_REASONS.INACTIVE_ACCOUNT,
      action,
    };
  }

  try {
    // Resolve user's permissions
    const permissions = await resolvePermissions(env, user, context);

    // Check if user has required permission
    if (permissions.includes(action)) {
      return {
        allow: true,
        code: 'ok',
        action,
      };
    }

    // User lacks permission
    return {
      allow: false,
      code: 'forbidden',
      reason: DENIAL_REASONS.MISSING_PERMISSION,
      action,
    };
  } catch (err) {
    console.error('Authorization check failed:', err);
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
export async function logAuditEvent(env, event) {
  const { actor_id, action, resource_type, resource_id, metadata } = event;

  if (!actor_id || !action || !resource_type) {
    console.warn('Audit event missing required fields:', event);
    return;
  }

  try {
    const id = generateId('audit');
    const metadataJson = metadata ? JSON.stringify(metadata) : null;
    const created_at = Math.floor(Date.now() / 1000);

    await env.DB.prepare(
      `INSERT INTO audit_log (id, actor_id, action, resource_type, resource_id, metadata, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    )
      .bind([id, actor_id, action, resource_type, resource_id, metadataJson, created_at])
      .run();
  } catch (err) {
    console.error('Failed to log audit event:', err);
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
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 8);
  return `${prefix}-${timestamp}-${random}`;
}

/**
 * Check if user has specific permission
 *
 * @param {Object} env - Cloudflare environment with DB binding
 * @param {Object} user - User object
 * @param {string} permission - Permission key to check
 * @param {Object} context - Optional context
 * @returns {Promise<boolean>} True if user has permission
 */
export async function hasPermission(env, user, permission, context) {
  const decision = await authorize(env, user, {
    action: permission,
    context,
  });
  return decision.allow === true;
}

/**
 * Require admin permission
 * Throws error if user doesn't have admin.rbac.admin permission
 *
 * @param {Object} env - Cloudflare environment with DB binding
 * @param {Object} user - User object
 * @throws {Error} If permission denied
 */
export async function requireAdmin(env, user) {
  const decision = await authorize(env, user, {
    action: 'admin.rbac.admin',
  });

  if (!decision.allow) {
    const error = new Error(decision.reason || 'Forbidden');
    error.code = decision.code;
    error.statusCode = 403;
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
export async function getRoleUserCount(env, roleName, excludeUserId) {
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

    const result = await env.DB.prepare(query).bind(bindings).first();
    return result?.count || 0;
  } catch (err) {
    console.error('Failed to get role user count:', err);
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
export async function isLastOwnerOfRole(env, userId, roleName) {
  const count = await getRoleUserCount(env, roleName, userId);
  return count === 0;
}

/**
 * Get audit log entries
 *
 * @param {Object} env - Cloudflare environment with DB binding
 * @param {Object} options - Query options
 * @param {string} options.actor_id - Filter by actor ID (optional)
 * @param {string} options.action - Filter by action (optional)
 * @param {string} options.resource_type - Filter by resource type (optional)
 * @param {string} options.resource_id - Filter by resource ID (optional)
 * @param {number} options.limit - Limit results (default 100, max 500)
 * @param {number} options.offset - Offset for pagination (default 0)
 * @returns {Promise<Object>} { entries, total, limit, offset }
 */
export async function getAuditLog(env, options = {}) {
  const {
    actor_id,
    action,
    resource_type,
    resource_id,
    limit = 100,
    offset = 0,
  } = options;

  // Validate and cap limit
  const safeLimit = Math.min(Math.max(parseInt(limit) || 100, 1), 500);
  const safeOffset = Math.max(parseInt(offset) || 0, 0);

  try {
    // Build WHERE clause
    const conditions = [];
    const bindings = [];

    if (actor_id) {
      conditions.push('actor_id = ?');
      bindings.push(actor_id);
    }

    if (action) {
      conditions.push('action = ?');
      bindings.push(action);
    }

    if (resource_type) {
      conditions.push('resource_type = ?');
      bindings.push(resource_type);
    }

    if (resource_id) {
      conditions.push('resource_id = ?');
      bindings.push(resource_id);
    }

    const whereClause = conditions.length > 0 ? ` WHERE ${conditions.join(' AND ')}` : '';

    // Get total count
    const countQuery = `SELECT COUNT(*) as count FROM audit_log${whereClause}`;
    const countResult = await env.DB.prepare(countQuery).bind(bindings).first();
    const total = countResult?.count || 0;

    // Get entries
    const entriesQuery = `
      SELECT id, actor_id, action, resource_type, resource_id, metadata, created_at
      FROM audit_log
      ${whereClause}
      ORDER BY created_at DESC
      LIMIT ? OFFSET ?
    `;

    const allBindings = [...bindings, safeLimit, safeOffset];
    const entriesResult = await env.DB.prepare(entriesQuery).bind(allBindings).all();

    // Parse metadata JSON
    const entries = (entriesResult.results || []).map((entry) => ({
      ...entry,
      metadata: entry.metadata ? JSON.parse(entry.metadata) : null,
    }));

    return {
      entries,
      total,
      limit: safeLimit,
      offset: safeOffset,
    };
  } catch (err) {
    console.error('Failed to get audit log:', err);
    return {
      entries: [],
      total: 0,
      limit: safeLimit,
      offset: safeOffset,
    };
  }
}

/**
 * Get user's roles
 *
 * @param {Object} env - Cloudflare environment with DB binding
 * @param {string} userId - User ID
 * @returns {Promise<Object[]>} Array of { role_id, role_name, scope_type, scope_id }
 */
export async function getUserRoles(env, userId) {
  try {
    const query = `
      SELECT ur.id, ur.role_id, r.name as role_name, ur.scope_type, ur.scope_id
      FROM user_roles ur
      INNER JOIN roles r ON ur.role_id = r.id
      WHERE ur.user_id = ?
      ORDER BY r.name ASC
    `;

    const result = await env.DB.prepare(query).bind([userId]).all();
    return result.results || [];
  } catch (err) {
    console.error('Failed to get user roles:', err);
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
export async function getRoleDetails(env, roleName) {
  try {
    // Get role
    const roleQuery = 'SELECT * FROM roles WHERE name = ?';
    const role = await env.DB.prepare(roleQuery).bind([roleName]).first();

    if (!role) return null;

    // Get permissions
    const permQuery = `
      SELECT p.id, p.key, p.description
      FROM permissions p
      INNER JOIN role_permissions rp ON p.id = rp.permission_id
      WHERE rp.role_id = ?
      ORDER BY p.key ASC
    `;

    const permResult = await env.DB.prepare(permQuery).bind([role.id]).all();

    return {
      ...role,
      permissions: permResult.results || [],
    };
  } catch (err) {
    console.error('Failed to get role details:', err);
    return null;
  }
}
