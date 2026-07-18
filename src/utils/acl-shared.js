/**
 * Shared ACL (Access Control List) utilities.
 *
 * Common functions used across connection-acl.js, model-acl.js,
 * and tool-server-acl.js for rule matching and query building.
 */

const ACL_RELEVANT_ACTIONS = ['use', 'manage', 'admin', 'read'];

/**
 * Check whether an ACL action is one of the relevant actions.
 * @param {string} action
 * @returns {boolean}
 */
export function isAclActionRelevant(action) {
  const normalized = String(action || 'use')
    .trim()
    .toLowerCase();
  return ACL_RELEVANT_ACTIONS.includes(normalized);
}

/**
 * Evaluate generic ACL access for a resource.
 * @param {Object} options
 * @param {Object} options.resource - The resource being evaluated
 * @param {Array} options.rules - ACL rules
 * @param {Function} options.normalizeRule - Rule normalizer
 * @param {Object} [options.user=null] - Current user
 * @param {Set} [options.userGroupIds=new Set()] - User group IDs
 * @param {boolean} [options.allowAdmin=true] - Whether admins are implicitly allowed
 * @param {Function} [options.isPersonal] - Optional predicate returning true for personal resources
 * @returns {{allowed: boolean, access_label: string, access_variant: string}}
 */
// evaluateAclAccess has 12 paths
export function evaluateAclAccess({
  resource,
  rules,
  normalizeRule,
  user = null,
  userGroupIds = new Set(),
  allowAdmin = true,
  isPersonal = () => false,
}) {
  if (isPersonal(resource)) {
    return { allowed: true, access_label: 'Personal', access_variant: 'personal' };
  }

  const normalizedRules = Array.isArray(rules) ? rules.map(normalizeRule).filter(Boolean) : [];

  const denyMatched = normalizedRules.some(
    (rule) =>
      rule.effect === 'deny' &&
      isAclActionRelevant(rule.action) &&
      ruleMatchesPrincipal(rule, user?.sub, userGroupIds)
  );
  if (denyMatched) {
    return { allowed: false, access_label: 'No access', access_variant: 'none' };
  }

  const allowMatched = normalizedRules.some(
    (rule) =>
      rule.effect === 'allow' &&
      isAclActionRelevant(rule.action) &&
      ruleMatchesPrincipal(rule, user?.sub, userGroupIds)
  );
  if (allowMatched) {
    return { allowed: true, access_label: 'Shared', access_variant: 'shared' };
  }

  if (allowAdmin && user?.primary_role === 'admin') {
    return { allowed: true, access_label: 'Admin', access_variant: 'admin' };
  }

  return { allowed: false, access_label: 'No access', access_variant: 'none' };
}

/**
 * Check if an ACL rule matches a given principal (user or group).
 * @param {Object} rule - The ACL rule
 * @param {string} userId - The user ID to check
 * @param {Set} userGroupIds - Set of group IDs the user belongs to
 * @returns {boolean}
 */
export function ruleMatchesPrincipal(rule, userId, userGroupIds) {
  if (!rule) return false;
  if (rule.principal_type === 'user') {
    return String(rule.principal_id ?? '') === String(userId ?? '');
  }
  return userGroupIds instanceof Set && userGroupIds.has(String(rule.principal_id ?? ''));
}

/**
 * Build a SQL IN clause filter for IDs.
 * @param {string} columnName - The SQL column name
 * @param {Array} ids - Array of IDs to filter by
 * @returns {{ clause: string, values: string[] } | null}
 */
export function buildIdFilterClause(columnName, ids = []) {
  const values = Array.isArray(ids)
    ? ids
        .filter((id) => id != null)
        .map((id) => String(id).trim())
        .filter((id) => id !== '')
    : [];
  if (!values.length) return null;
  return {
    clause: `${columnName} IN (${values.map(() => '?').join(', ')})`,
    values,
  };
}
