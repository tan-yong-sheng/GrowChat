import { error, json } from '../../utils/response.js';
import { loadPrimaryRole } from '../../utils/user-role.js';
import { sanitizeUser } from './auth-helpers.js';

export async function handleMe(req, env, db, users, authUser) {
  if (!authUser?.sub) {
    return error(req, 'Authentication required', 401);
  }
  const user = await users.findById(authUser.sub);
  if (!user) {
    return error(req, 'User not found', 404);
  }
  const primaryRole = await loadPrimaryRole(db, authUser.sub);
  return json(req, sanitizeUser(user, primaryRole));
}
