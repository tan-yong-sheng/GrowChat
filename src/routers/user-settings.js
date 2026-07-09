import { HTTP_STATUS } from '../shared/http-status.js';
import { createDB } from '../db.js';
import { createLogger } from '../utils/logger.js';
import { error, json } from '../utils/response.js';
import { buildUserProfileResponse } from './user-profile.js';
import { loadWorkspaceSettingsPayload } from '../services/workspace-settings.js';

function isUserSettingsPath(path) {
  return path === '/api/users/me/settings' || path === '/api/users/me/settings/';
}

function isAccountPending(user) {
  return user.account_status && user.account_status !== 'active';
}

// eslint-disable-next-line max-params -- router dispatcher pattern (req, env, ctx, user, path, deps)
export async function userSettingsRouter(req, env, _ctx, user, path, _deps) {
  if (!isUserSettingsPath(path)) return null;
  if (!user) return error(req, 'Unauthorized', HTTP_STATUS.UNAUTHORIZED);

  if (isAccountPending(user)) {
    return error(req, 'Account pending approval.', HTTP_STATUS.FORBIDDEN);
  }

  if (req.method !== 'GET') {
    return error(req, 'Method not allowed', HTTP_STATUS.METHOD_NOT_ALLOWED);
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
    if (!payload) return error(req, 'User not found', HTTP_STATUS.NOT_FOUND);

    return json(req, payload);
  } catch (err) {
    const log = createLogger(env, { requestId: crypto.randomUUID() });
    log.error('Load user settings failed', { error: err?.message || err });
    return error(req, 'Failed to load user settings', HTTP_STATUS.INTERNAL_SERVER_ERROR);
  }
}
