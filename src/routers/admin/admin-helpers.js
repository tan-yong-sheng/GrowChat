/**
 * Admin Route Helpers
 *
 * Shared authorization and validation helpers for admin sub-handlers.
 */
import { authError, error } from '../../utils/response.js';
import { authorize } from '../../utils/authorize.js';

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
  // Normalize null/undefined to {} so destructuring is safe; delegate
  // validation of env/user to authorize() so it can return the proper
  // server_error vs unauthorized distinction instead of masking both
  // as INVALID_REQUEST here.
  const opts = options ?? {};

  // Detect legacy positional signature: (env, user, resource)
  // When user is explicitly passed as object, treat as legacy mode
  if (legacyUser !== undefined && typeof legacyUser === 'object') {
    return authorize(opts, legacyUser, {
      action: 'admin.rbac.admin',
      resource: legacyResource,
    });
  }

  // Options-object signature
  const { env, user, resource = 'admin' } = opts;
  return authorize(env, user, {
    action: 'admin.rbac.admin',
    resource,
  });
}

/**
 * Parse the request body as JSON and ensure the user has admin ACL access.
 * Returns { body } on success or { error: Response } on failure.
 */
export async function parseJsonAndRequireAdminAcl(req, env, user, resource) {
  let body;
  try {
    body = await req.json();
  } catch {
    return { error: error(req, 'Invalid JSON body', 400) };
  }

  const aclDecision = await ensureAdminAclAccess({ env, user, resource });
  if (!aclDecision.allow) {
    return { error: authError(req, aclDecision) };
  }

  return { body };
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
  // Normalize null/undefined to {} so destructuring is safe; delegate
  // validation of env/user to authorize() so it can return the proper
  // server_error vs unauthorized distinction instead of masking both
  // as INVALID_REQUEST here.
  const opts = options ?? {};

  // Detect legacy positional signature: (env, user, permission, resource)
  if (legacyUser !== undefined && typeof legacyUser === 'object') {
    return authorize(opts, legacyUser, {
      action: legacyPermission,
      resource: legacyResource,
    });
  }

  // Options-object signature
  const { env, user, permission, resource = 'admin' } = opts;
  return authorize(env, user, {
    action: permission,
    resource,
  });
}
