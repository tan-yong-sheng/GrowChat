import { authError, error } from '../../utils/response.js';
import { authorize } from '../../utils/authorize.js';

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
  return error(req, 'Invalid JSON body', 400);
}

export function noDatabase(req) {
  return error(req, 'Database unavailable', 500);
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
