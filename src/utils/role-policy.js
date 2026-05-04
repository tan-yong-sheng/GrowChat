/**
 * Role policy helpers
 *
 * Canonical helpers for coarse role checks. Thin adapters may re-export these
 * for legacy import paths, but the role decision lives here.
 */

export function isAdmin(user) {
  return user && user.primary_role === 'admin';
}

export function requireAdmin(user) {
  return isAdmin(user);
}

export function requireRole(user, allowedRoles = ['admin']) {
  return user && user.primary_role && allowedRoles.includes(user.primary_role);
}
