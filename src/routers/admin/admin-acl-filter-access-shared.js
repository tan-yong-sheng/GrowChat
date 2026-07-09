/**
 * Shared ACL filter helper — applies filterAclRulesByGroup and returns
 * a consistent error Response when invalid principal types are found.
 *
 * Both admin-connections-access and admin-tool-servers-access use this
 * same pattern: they call filterAclRulesByGroup with the same error handling
 * to reject updates with invalid principal types via HTTP 400.
 */
import { error } from '../../utils/response.js';
import { HTTP_STATUS } from '../../shared/http-status.js';
import { filterAclRulesByGroup } from '../../utils/acl-rule-filter.js';

/**
 * Call filterAclRulesByGroup and return { result, error } on invalid principal types.
 *
 * Wraps filterAclRulesByGroup + the standard error-return pattern that both
 * admin-connections-access and admin-tool-servers-access use in their
 * PUT handlers.
 */
export function validateAndFilterAclRules({
  rules,
  resourceId,
  resourceIdKey,
  normalizeRule,
  validGroupIds,
  invalidTypeMessage,
  extraRuleFields = {},
  req,
}) {
  try {
    const filtered = filterAclRulesByGroup({
      rules,
      resourceId,
      resourceIdKey,
      normalizeRule,
      validGroupIds,
      invalidTypeMessage,
      extraRuleFields,
    });
    return { result: filtered, error: null };
  } catch (err) {
    if (err.status === HTTP_STATUS.BAD_REQUEST) {
      return {
        result: null,
        error: error(req, err.message, HTTP_STATUS.BAD_REQUEST, { invalid: err.invalid }),
      };
    }
    throw err;
  }
}
