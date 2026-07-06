import { error } from '../../utils/response.js';
import { authorize } from '../../utils/authorize.js';

const STATUS_CODE_MAP = {
  server_error: 500,
  unauthorized: 401,
  not_found: 404,
};

export async function requireModelAdmin(req, env, user, resourceId) {
  const authDecision = await authorize(env, user, {
    action: 'model.admin',
    resource: 'model',
    ...(resourceId ? { resourceId } : {}),
  });
  if (authDecision.allow) {
    return null;
  }
  const statusCode = STATUS_CODE_MAP[authDecision.code] || 403;
  return error(req, authDecision.reason || 'Forbidden', statusCode);
}
