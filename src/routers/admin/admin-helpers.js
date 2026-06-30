/**
 * Admin Route Helpers
 *
 * Shared authorization and validation helpers for admin sub-handlers.
 */
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
 */
export async function ensureAdminAclAccess({ env, user, resource = 'admin' } = {}) {
  return authorize(env, user, {
    action: 'admin.rbac.admin',
    resource,
  });
}

/**
 * Ensure the user has a specific mutation permission.
 */
export async function ensureAdminMutationAccess({
  env,
  user,
  permission,
  resource = 'admin',
} = {}) {
  return authorize(env, user, {
    action: permission,
    resource,
  });
}
