import { error, json } from '../../utils/response.js';
import { consumeRefreshToken } from '../../shared/session.js';
import { requireString } from '../../validation/request.js';
import { ValidationError } from '../../errors/http-errors.js';
import { loadPrimaryRole } from '../../utils/user-role.js';
import { HTTP_STATUS } from '../../shared/http-status.js';
import {
  checkActiveAccountAndGenerateTokens,
  ensureUserRoleBinding,
  sanitizeUser,
} from './auth-helpers.js';

// handler receives (req, env, db, users, jwtSecret) for router dispatch
export async function handleRefresh(req, env, db, users, jwtSecret) {
  let body;
  try {
    body = await req.json();
  } catch {
    return error(req, 'Invalid JSON body', HTTP_STATUS.BAD_REQUEST);
  }

  let refreshToken;
  try {
    refreshToken = requireString(body.refresh_token, 'refresh_token is required', {
      trim: false,
    });
  } catch (err) {
    if (err instanceof ValidationError) {
      return error(req, err.message, HTTP_STATUS.BAD_REQUEST);
    }
    throw err;
  }

  const session = await consumeRefreshToken(env, refreshToken);
  if (!session?.userId) return error(req, 'Invalid refresh token', HTTP_STATUS.UNAUTHORIZED);

  const user = await users.findById(session.userId);
  if (!user) return error(req, 'User not found', HTTP_STATUS.NOT_FOUND);

  const userRole = (await loadPrimaryRole(db, user.id)) || 'member';
  await ensureUserRoleBinding(db, user.id, userRole, user.account_status);
  const tokenResult = await checkActiveAccountAndGenerateTokens(
    req,
    db,
    env,
    users,
    user,
    jwtSecret
  );
  if (tokenResult instanceof Response) return tokenResult;
  return json(req, {
    user: sanitizeUser(tokenResult.user, tokenResult.primaryRole),
    access_token: tokenResult.accessToken,
    refresh_token: tokenResult.refreshToken,
    expires_in: 900,
    refresh_expires_at: tokenResult.refreshExpiresAt,
  });
}
