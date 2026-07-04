import { error, json } from '../utils/response.js';
import { verifyPassword, hashPassword } from '../shared/auth.js';
import { bumpSessionVersion } from '../shared/session.js';
import { requireString } from '../validation/request.js';
import { RATE_LIMITS, checkRateLimit, resolveRateLimitSubject } from '../services/rate-limit.js';
import { ValidationError } from '../errors/http-errors.js';

const HTTP = {
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  NOT_FOUND: 404,
  TOO_MANY: 429,
};
const MIN_PASSWORD_LENGTH = 8;

export async function handleChangePassword(req, env, db, authUser) {
  let body;
  try {
    body = await req.json();
  } catch {
    return error(req, 'Invalid JSON body', HTTP.BAD_REQUEST);
  }

  let currentPassword;
  let newPassword;
  let confirmNewPassword;
  try {
    currentPassword = requireString(
      body.currentPassword,
      'currentPassword and newPassword are required',
      { trim: false }
    );
    newPassword = requireString(body.newPassword, 'currentPassword and newPassword are required', {
      trim: false,
    });
    confirmNewPassword = requireString(
      body.confirmNewPassword,
      'currentPassword and newPassword are required',
      { trim: false }
    );
  } catch (err) {
    if (err instanceof ValidationError) {
      return error(req, err.message, HTTP.BAD_REQUEST);
    }
    throw err;
  }

  if (newPassword.length < MIN_PASSWORD_LENGTH) {
    return error(req, 'Password must be at least 8 characters', HTTP.BAD_REQUEST);
  }

  if (newPassword !== confirmNewPassword) {
    return error(req, 'New password and confirmation do not match', HTTP.BAD_REQUEST);
  }

  const changeLimit = await checkRateLimit(env, {
    action: 'auth-change-password',
    subject: resolveRateLimitSubject(req),
    ...RATE_LIMITS.authChangePassword,
  });
  if (!changeLimit.allowed) {
    return error(req, 'Too many password change requests', HTTP.TOO_MANY, {
      retry_after: Math.ceil((changeLimit.resetAt - Date.now()) / 1000),
    });
  }

  const user = await db.first('SELECT id, password_hash FROM users WHERE id = ?', [authUser.sub]);
  if (!user) {
    return error(req, 'User not found', HTTP.NOT_FOUND);
  }

  const currentOk = await verifyPassword(currentPassword, user.password_hash);
  if (!currentOk) {
    return error(req, 'Current password is incorrect', HTTP.UNAUTHORIZED);
  }

  await bumpSessionVersion(env, authUser.sub, { required: true });

  const passwordHash = await hashPassword(newPassword);

  await db.run('UPDATE users SET password_hash = ?, updated_at = unixepoch() WHERE id = ?', [
    passwordHash,
    authUser.sub,
  ]);

  return json(req, { message: 'Password changed successfully' });
}
