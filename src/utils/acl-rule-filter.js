/**
 * Filter ACL rules to only valid group rules for a given resource.
 *
 * @param {Object} params
 * @param {Array} params.rules - incoming rules array
 * @param {string} params.resourceId - id of the resource the rules apply to
 * @param {string} params.resourceIdKey - property name to inject the resource id under
 * @param {Function} params.normalizeRule - normalizer that returns a rule object or null
 * @param {Set<string>} params.validGroupIds - set of valid group ids
 * @param {string} params.invalidTypeMessage - message used when invalid principal types are found
 * @returns {Array} filtered and normalized rules
 * @throws {Error} when invalid principal types are present (error.status === 400)
 */
export function filterAclRulesByGroup({
  rules,
  resourceId,
  resourceIdKey,
  normalizeRule,
  validGroupIds,
  invalidTypeMessage = 'Invalid principal_type',
  extraRuleFields = {},
}) {
  const incomingRules = Array.isArray(rules) ? rules : [];
  const filteredRules = [];
  const invalidPrincipalTypes = [];

  for (const rule of incomingRules) {
    const normalized = normalizeRule({ ...rule, [resourceIdKey]: resourceId, ...extraRuleFields });
    if (!normalized) continue;
    if (normalized.principal_type !== 'group') {
      invalidPrincipalTypes.push(normalized.principal_type);
      continue;
    }
    if (!validGroupIds.has(normalized.principal_id)) continue;
    filteredRules.push(normalized);
  }

  if (invalidPrincipalTypes.length) {
    const err = new Error(invalidTypeMessage);
    err.status = 400;
    err.invalid = Array.from(new Set(invalidPrincipalTypes));
    throw err;
  }

  return filteredRules;
}
