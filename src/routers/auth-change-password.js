import { error, json } from '../utils/response.js';
import { verifyPassword, hashPassword } from '../shared/auth.js';
import { bumpSessionVersion } from '../shared/session.js';
import { requireString } from '../validation/request.js';
import { RATE_LIMITS, checkRateLimit, resolveRateLimitSubject } from '../services/rate-limit.js';
import { createLogger } from '../utils/logger.js';
import { ValidationError } from '../errors/http-errors.js';

export async function handleChangePassword(req, env, db, authUser, requestContext = {}) {
  const logger = createLogger(env, { requestId: requestContext.requestId });

  let body;
  try {
    body = await req.json();
  } catch {
    return error(req, 'Invalid JSON body', 400);
  }

  let currentPassword;
  let newPassword;
  let confirmNewPassword;
  try {
    currentPassword = requireString(
      body.currentPassword,
      'currentPassword and newPassword are required',
      {
        trim: false,
      }
    );
    newPassword = requireString(body.newPassword, 'currentPassword and newPassword are required', {
      trim: false,
    });
    confirmNewPassword = requireString(
      body.confirmNewPassword,
      'currentPassword and newPassword are required',
      {
        trim: false,
      }
    );
  } catch (err) {
    if (err instanceof ValidationError) {
      return error(req, err.message, 400);
    }
    throw err;
  }

  if (newPassword.length < 8) {
    return error(req, 'Password must be at least 8 characters', 400);
  }

  if (newPassword !== confirmNewPassword) {
    return error(req, 'New password and confirmation do not match', 400);
  }

  const changeLimit = await checkRateLimit(env, {
    action: 'auth-change-password',
    subject: resolveRateLimitSubject(req),
    ...RATE_LIMITS.authChangePassword,
  });
  if (!changeLimit.allowed) {
    return error(req, 'Too many password change requests', 429, {
      retry_after: Math.ceil((changeLimit.resetAt - Date.now()) / 1000),
    });
  }

  const user = await db.first('SELECT id, password_hash FROM users WHERE id = ?', [authUser.sub]);
  if (!user) {
    return error(req, 'User not found', 404);
  }

  const currentOk = await verifyPassword(currentPassword, user.password_hash);
  if (!currentOk) {
    return error(req, 'Current password is incorrect', 401);
  }

  // Invalidate all KV-backed refresh tokens before mutating the password.
  // This ensures the session-version check in consumeRefreshToken() rejects
  // any previously-issued tokens.
  await bumpSessionVersion(env, authUser.sub, { required: true });

  const passwordHash = await hashPassword(newPassword);

  await db.run('UPDATE users SET password_hash = ?, updated_at = unixepoch() WHERE id = ?', [
    passwordHash,
    authUser.sub,
  ]);

  return json(req, { message: 'Password changed successfully' });
}
