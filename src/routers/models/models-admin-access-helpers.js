import { HTTP_STATUS } from '../../shared/http-status.js';
import { authError, error } from '../../utils/response.js';
import { authorize } from '../../utils/authorize.js';
import { normalizeModelAclRule } from '../../utils/model-acl.js';

export async function requireModelAdmin(req, env, user, resourceId) {
  const authDecision = await authorize(env, user, {
    action: 'model.admin',
    resource: 'model',
    ...(resourceId ? { resourceId } : {}),
  });
  if (authDecision.allow) {
    return null;
  }
  return authError(req, authDecision);
}

export function extractModelIdFromAccessPath(path) {
  const match = path.match(/^\/api\/admin\/models\/([^/]+)\/access$/);
  if (!match) return null;
  try {
    return decodeURIComponent(match[1]);
  } catch {
    return match[1];
  }
}

export function invalidJsonBody(req) {
  return error(req, 'Invalid JSON body', HTTP_STATUS.BAD_REQUEST);
}

export function noDatabase(req) {
  return error(req, 'Database unavailable', HTTP_STATUS.INTERNAL_SERVER_ERROR);
}

export async function loadGroups(db) {
  return db.all(
    `SELECT id, name, description, is_system, created_at, updated_at
     FROM groups
     ORDER BY is_system DESC, name ASC`
  );
}

export async function loadValidGroupIds(db) {
  const groups = await db.all('SELECT id FROM groups');
  return new Set((Array.isArray(groups) ? groups : []).map((group) => group.id).filter(Boolean));
}

/**
 * Filter model ACL rules to only include group-principal rules whose
 * principal_id is in the valid set. Returns { filteredRules, invalidPrincipalTypes }.
 */
export function filterModelRulesByGroup(modelId, rules, validGroupIds) {
  const filteredRules = [];
  const invalidPrincipalTypes = [];
  for (const rule of Array.isArray(rules) ? rules : []) {
    const normalized = normalizeModelAclRule({ ...rule, model_id: modelId });
    if (!normalized) continue;
    if (normalized.principal_type !== 'group') {
      invalidPrincipalTypes.push(normalized.principal_type);
      continue;
    }
    if (!validGroupIds.has(normalized.principal_id)) continue;
    filteredRules.push(normalized);
  }
  return { filteredRules, invalidPrincipalTypes };
}
