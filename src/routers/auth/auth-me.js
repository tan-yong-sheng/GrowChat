import { error, json } from '../../utils/response.js';
import { loadPrimaryRole } from '../../utils/user-role.js';
import { HTTP_STATUS } from '../../shared/http-status.js';
import { sanitizeUser } from './auth-helpers.js';
export async function handleMe(req, env, db, users, authUser) {
  if (!authUser?.sub) {
    return error(req, 'Authentication required', HTTP_STATUS.UNAUTHORIZED);
  }
  const user = await users.findById(authUser.sub);
  if (!user) {
    return error(req, 'User not found', HTTP_STATUS.NOT_FOUND);
  }
  const primaryRole = await loadPrimaryRole(db, authUser.sub);
  return json(req, sanitizeUser(user, primaryRole));
}
