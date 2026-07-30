/**
 * Users Admin Crud Handler
 */
import { handleCreateUser } from './users-admin-crud-create.js';
import { handleImportUsers } from './users-admin-crud-import.js';

/**
 * Handle users/admin/crud routes.
 * Returns Response if handled, null if path doesn't match.
 */
export async function handleUsersAdminCrud(
  req,
  env,
  ctx,
  user,
  path,
  { _db, logger, _requestContext }
) {
  if (req.method === 'POST' && path === '/api/admin/users') {
    return handleCreateUser(req, env, user, logger);
  }

  if (req.method === 'POST' && path === '/api/admin/users/import') {
    return handleImportUsers(req, env, user, logger);
  }

  return null;
}
