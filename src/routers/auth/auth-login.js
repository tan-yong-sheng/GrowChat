import { error, json } from '../../utils/response.js';
import { verifyPassword } from '../../shared/auth.js';
import { RATE_LIMITS, checkRateLimit, resolveRateLimitSubject } from '../../services/rate-limit.js';
import { requireString, validateEmail } from '../../validation/request.js';
import { ValidationError } from '../../errors/http-errors.js';
import { loadPrimaryRole } from '../../utils/user-role.js';
import {
  trackFailedLoginAttempt,
  clearFailedLoginAttempts,
  getFailedLoginAttempts,
} from '../../services/audit-logging.js';
import {
  checkActiveAccountAndGenerateTokens,
  computeAccountLockoutRetryAfter,
  ensureUserRoleBinding,
  MAX_LOGIN_ATTEMPTS_PER_ACCOUNT,
  sanitizeUser,
} from './auth-helpers.js';

export async function handleLogin(req, env, db, users, jwtSecret) {
  let body;
  try {
    body = await req.json();
  } catch {
    return error(req, 'Invalid JSON body', 400);
  }

  let email;
  let password;
  try {
    email = validateEmail(
      requireString(body.email, 'email and password are required').toLowerCase()
    );
    password = requireString(body.password, 'email and password are required', {
      trim: false,
    });
  } catch (err) {
    if (err instanceof ValidationError) {
      return error(req, err.message, 400);
    }
    throw err;
  }

  const loginLimit = await checkRateLimit(env, {
    action: 'auth-login',
    subject: resolveRateLimitSubject(req),
    ...RATE_LIMITS.authLogin,
  });
  if (!loginLimit.allowed) {
    return error(req, 'Too many login attempts', 429, {
      retry_after: Math.ceil((loginLimit.resetAt - Date.now()) / 1000),
    });
  }

  let priorAttempts = await getFailedLoginAttempts(env, email);
  if (priorAttempts.length >= MAX_LOGIN_ATTEMPTS_PER_ACCOUNT) {
    return error(req, 'Too many failed login attempts for this account', 429, {
      retry_after: computeAccountLockoutRetryAfter(priorAttempts),
    });
  }

  const user = await users.findByEmail(email);
  if (!user) {
    const attempts = await trackFailedLoginAttempt(env, email);
    if (attempts >= MAX_LOGIN_ATTEMPTS_PER_ACCOUNT) {
      priorAttempts = await getFailedLoginAttempts(env, email);
      return error(req, 'Too many failed login attempts for this account', 429, {
        retry_after: computeAccountLockoutRetryAfter(priorAttempts),
      });
    }
    return error(req, 'Invalid credentials', 401);
  }

  const userRole = (await loadPrimaryRole(db, user.id)) || 'member';
  await ensureUserRoleBinding(db, user.id, userRole, user.account_status);

  const ok = await verifyPassword(password, user.password_hash);
  if (!ok) {
    const attempts = await trackFailedLoginAttempt(env, email);
    if (attempts >= MAX_LOGIN_ATTEMPTS_PER_ACCOUNT) {
      priorAttempts = await getFailedLoginAttempts(env, email);
      return error(req, 'Too many failed login attempts for this account', 429, {
        retry_after: computeAccountLockoutRetryAfter(priorAttempts),
      });
    }
    return error(req, 'Invalid credentials', 401);
  }
  const tokenResult = await checkActiveAccountAndGenerateTokens(
    req,
    db,
    env,
    users,
    user,
    jwtSecret
  );
  if (tokenResult instanceof Response) return tokenResult;

  await clearFailedLoginAttempts(env, email);

  return json(req, {
    user: sanitizeUser(tokenResult.user, tokenResult.primaryRole),
    access_token: tokenResult.accessToken,
    refresh_token: tokenResult.refreshToken,
    expires_in: 900,
    refresh_expires_at: tokenResult.refreshExpiresAt,
  });
}
