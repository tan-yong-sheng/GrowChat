/**
 * Shared ACL (Access Control List) utilities.
 *
 * Common functions used across connection-acl.js, model-acl.js,
 * and tool-server-acl.js for rule matching and query building.
 */

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
