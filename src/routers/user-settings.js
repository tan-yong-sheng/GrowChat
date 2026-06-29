import { createDB } from '../db.js';
import { createLogger } from '../utils/logger.js';
import { error, json } from '../utils/response.js';
import { buildUserProfileResponse } from './user-profile.js';
import { loadWorkspaceSettingsPayload } from '../services/workspace-settings.js';

export async function userSettingsRouter(req, env, _ctx, user, path, requestContext = {}) {
  const logger =
    requestContext.logger || createLogger(env, { requestId: requestContext.requestId });
  const isUserSettingsPath =
    path === '/api/users/me/settings' || path === '/api/users/me/settings/';

  if (!isUserSettingsPath) return null;
  if (!user) return error(req, 'Unauthorized', 401);

  if (user.account_status && user.account_status !== 'active') {
    return error(req, 'Account pending approval.', 403);
  }

  if (req.method !== 'GET') {
    return error(req, 'Method not allowed', 405);
  }

  const db = createDB(env.DB);

  try {
    const payload = await loadWorkspaceSettingsPayload({
      db,
      env,
      userId: user.sub,
      route: 'account',
      profileResponseFactory: buildUserProfileResponse,
    });
    if (!payload) return error(req, 'User not found', 404);

    return json(req, payload);
  } catch (err) {
    logger.error('Load user settings failed', { error: err?.message || err });
    return error(req, 'Failed to load user settings', 500);
  }
}
