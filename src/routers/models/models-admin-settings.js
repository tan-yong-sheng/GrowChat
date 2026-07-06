/**
 * Admin Models Settings Handler - GET/PUT /api/admin/models
 */
import { handleAdminModelsSettingsList } from './models-admin-settings-list.js';
import { handleAdminModelsSettingsUpdate } from './models-admin-settings-update.js';

const ROUTE_MAP = [
  { method: 'GET', path: '/api/admin/models', handler: handleAdminModelsSettingsList },
  { method: 'PUT', path: '/api/admin/models', handler: handleAdminModelsSettingsUpdate },
];

/**
 * Handle handleAdminModelsSettings routes.
 * Returns Response if handled, null if path doesn't match.
 */
export async function handleAdminModelsSettings(
  req,
  env,
  ctx,
  user,
  path,
  { _db, logger, _requestContext }
) {
  for (const route of ROUTE_MAP) {
    if (route.method === req.method && route.path === path) {
      return route.handler(req, env, ctx, user, path, { logger });
    }
  }
  return null;
}