import { HTTP_STATUS } from '../../shared/http-status.js';
import { error } from '../../utils/response.js';
import { authorize } from '../../utils/authorize.js';

const STATUS_CODE_MAP = {
  server_error: HTTP_STATUS.INTERNAL_SERVER_ERROR,
  unauthorized: HTTP_STATUS.UNAUTHORIZED,
  not_found: HTTP_STATUS.NOT_FOUND,
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
  const statusCode = STATUS_CODE_MAP[authDecision.code] || HTTP_STATUS.FORBIDDEN;
  return error(req, authDecision.reason || 'Forbidden', statusCode);
}
