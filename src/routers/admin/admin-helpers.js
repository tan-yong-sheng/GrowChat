/**
 * Admin Route Helpers
 *
 * Shared authorization and validation helpers for admin sub-handlers.
 */
import { authorize, DENIAL_REASONS } from '../../utils/authorize.js';

/**
 * Check if a value is a valid model access ID.
 * @param {string} value
 * @returns {boolean}
 */
export function isValidModelAccessId(value) {
  const id = String(value || '').trim();
  if (!id) return false;
  if (id.length > 200) return false;
  if (/\s/.test(id)) return false;
  return true;
}

/**
 * Ensure the user has ACL admin access.
 * Keeps the permission policy explicit at the call site.
 * Returns a graceful 401/403 denial when env or user is missing/invalid.
 *
 * @param {Object} options - Options object {env, user, resource} OR legacy env (first arg)
 * @param {Object} [legacyUser] - User object (legacy second arg)
 * @param {string} [legacyResource='admin'] - Resource type (legacy third arg)
 */
export async function ensureAdminAclAccess(options = {}, legacyUser, legacyResource = 'admin') {
  // Detect legacy positional signature: (env, user, resource)
  // When user is explicitly passed as object, treat as legacy mode
  if (legacyUser !== undefined && typeof legacyUser === 'object') {
    // Validate legacy env in legacy mode too
    if (options == null || typeof options !== 'object') {
      return {
        allow: false,
        code: 'unauthorized',
        reason: DENIAL_REASONS.INVALID_REQUEST,
        action: 'admin.rbac.admin',
      };
    }
    return authorize(options, legacyUser, {
      action: 'admin.rbac.admin',
      resource: legacyResource,
    });
  }

  // Options-object signature
  if (options == null || typeof options !== 'object') {
    return {
      allow: false,
      code: 'unauthorized',
      reason: DENIAL_REASONS.INVALID_REQUEST,
      action: 'admin.rbac.admin',
    };
  }
  const { env, user, resource = 'admin' } = options;
  if (!env || !user || typeof env !== 'object' || typeof user !== 'object') {
    return {
      allow: false,
      code: 'unauthorized',
      reason: DENIAL_REASONS.INVALID_REQUEST,
      action: 'admin.rbac.admin',
    };
  }
  return authorize(env, user, {
    action: 'admin.rbac.admin',
    resource,
  });
}

/**
 * Ensure the user has a specific mutation permission.
 * Returns a graceful 401/403 denial when env or user is missing/invalid.
 *
 * @param {Object} options - Options object {env, user, permission, resource} OR legacy env (first arg)
 * @param {Object} [legacyUser] - User object (legacy second arg)
 * @param {string} [legacyPermission] - Permission action (legacy third arg)
 * @param {string} [legacyResource='admin'] - Resource type (legacy fourth arg)
 */
export async function ensureAdminMutationAccess(
  options = {},
  legacyUser,
  legacyPermission,
  legacyResource = 'admin'
) {
  // Detect legacy positional signature: (env, user, permission, resource)
  if (legacyUser !== undefined && typeof legacyUser === 'object') {
    // Validate legacy env in legacy mode too
    if (options == null || typeof options !== 'object') {
      return {
        allow: false,
        code: 'unauthorized',
        reason: DENIAL_REASONS.INVALID_REQUEST,
        action: legacyPermission || 'unknown',
      };
    }
    return authorize(options, legacyUser, {
      action: legacyPermission,
      resource: legacyResource,
    });
  }

  // Options-object signature
  if (options == null || typeof options !== 'object') {
    return {
      allow: false,
      code: 'unauthorized',
      reason: DENIAL_REASONS.INVALID_REQUEST,
      action: 'unknown',
    };
  }
  const { env, user, permission, resource = 'admin' } = options;
  if (!env || !user || typeof env !== 'object' || typeof user !== 'object') {
    return {
      allow: false,
      code: 'unauthorized',
      reason: DENIAL_REASONS.INVALID_REQUEST,
      action: permission || 'unknown',
    };
  }
  return authorize(env, user, {
    action: permission,
    resource,
  });
}
