/**
 * Admin authorization utilities
 *
 * Helpers for checking admin role and enforcing admin-only endpoints
 */

/**
 * Check if user has admin role
 * @param {Object} user - Decoded JWT user object with 'role' claim
 * @returns {boolean} - True if user is admin
 */
export function isAdmin(user) {
  return user && user.primary_role === 'admin';
}

/**
 * Require admin authorization for endpoint
 * Use in routers: if (!requireAdmin(user)) return error(req, 'Forbidden', 403);
 *
 * @param {Object} user - Decoded JWT user object
 * @returns {boolean} - True if authorized as admin
 */
export function requireAdmin(user) {
  return isAdmin(user);
}
