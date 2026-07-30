/**
 * Users Admin By Id Handler
 */
import { handleDeleteUserById } from './users-admin-by-id-delete.js';
import { handleGetUserById } from './users-admin-by-id-get.js';
import { handleUpdateUserById } from './users-admin-by-id-update.js';

/**
 * Handle users/admin/by/id routes.
 * Returns Response if handled, null if path doesn't match.
 */
export async function handleUsersAdminById(
  req,
  env,
  ctx,
  user,
  path,
  { _db, logger, _requestContext }
) {
  const userIdMatch = path.match(/^\/api\/admin\/users\/([^/]+)$/);
  if (!userIdMatch) return null;

  const userId = userIdMatch[1];

  if (req.method === 'GET') {
    return handleGetUserById(req, env, user, userId);
  }
  if (req.method === 'PUT') {
    return handleUpdateUserById({ req, env, user, userId, logger });
  }
  if (req.method === 'DELETE') {
    return handleDeleteUserById({ req, env, user, userId, logger });
  }

  return null;
}
