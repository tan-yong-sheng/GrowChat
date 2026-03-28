/**
 * RBAC Middleware for Admin Routes
 *
 * Role-Based Access Control (RBAC) implementation for GrowChat admin endpoints
 * Enforces admin-only access to sensitive operations
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
 * Use in routers:
 * if (!requireAdmin(user)) return error(req, 'Forbidden', 403);
 *
 * @param {Object} user - Decoded JWT user object
 * @returns {boolean} - True if authorized as admin
 */
export function requireAdmin(user) {
  return isAdmin(user);
}

/**
 * Require any role from list (for future extensibility)
 * @param {Object} user - Decoded JWT user object
 * @param {string[]} allowedRoles - Array of allowed role names
 * @returns {boolean} - True if user has allowed role
 */
export function requireRole(user, allowedRoles = ['admin']) {
  return user && user.primary_role && allowedRoles.includes(user.primary_role);
}

/**
 * Validate user email format (for admin operations)
 * @param {string} email - Email to validate
 * @returns {boolean} - True if valid email format
 */
export function isValidEmail(email) {
  if (!email || typeof email !== 'string') return false;
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}
