import { error, json } from '../../utils/response.js';
import { verifyPassword } from '../../shared/auth.js';
import { RATE_LIMITS, checkRateLimit, resolveRateLimitSubject } from '../../services/rate-limit.js';
import { requireString, validateEmail } from '../../validation/request.js';
import { ValidationError } from '../../errors/http-errors.js';
import { HTTP_STATUS } from '../../shared/http-status.js';
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
import { APP_TTLS } from '../../config/app.js';

const MILLISECONDS_PER_SECOND = 1000;

async function parseLoginBody(req) {
  let body;
  try {
    body = await req.json();
  } catch {
    return error(req, 'Invalid JSON body', HTTP_STATUS.BAD_REQUEST);
  }

  try {
    const email = validateEmail(
      requireString(body.email, 'email and password are required').toLowerCase()
    );
    const password = requireString(body.password, 'email and password are required', {
      trim: false,
    });
    return { email, password };
  } catch (err) {
    if (err instanceof ValidationError) {
      return error(req, err.message, HTTP_STATUS.BAD_REQUEST);
    }
    throw err;
  }
}

async function checkLoginRateLimit(req, env) {
  const loginLimit = await checkRateLimit(env, {
    action: 'auth-login',
    subject: resolveRateLimitSubject(req),
    ...RATE_LIMITS.authLogin,
  });
  if (!loginLimit.allowed) {
    return error(req, 'Too many login attempts', HTTP_STATUS.TOO_MANY_REQUESTS, {
      retry_after: Math.ceil((loginLimit.resetAt - Date.now()) / MILLISECONDS_PER_SECOND),
    });
  }
  return loginLimit;
}

async function checkAccountLockout(req, env, email) {
  const priorAttempts = await getFailedLoginAttempts(env, email);
  if (priorAttempts.length >= MAX_LOGIN_ATTEMPTS_PER_ACCOUNT) {
    return error(
      req,
      'Too many failed login attempts for this account',
      HTTP_STATUS.TOO_MANY_REQUESTS,
      { retry_after: computeAccountLockoutRetryAfter(priorAttempts) }
    );
  }
  return priorAttempts;
}

async function handleFailedLogin(req, env, email) {
  const attempts = await trackFailedLoginAttempt(env, email);
  if (attempts >= MAX_LOGIN_ATTEMPTS_PER_ACCOUNT) {
    const priorAttempts = await getFailedLoginAttempts(env, email);
    return error(
      req,
      'Too many failed login attempts for this account',
      HTTP_STATUS.TOO_MANY_REQUESTS,
      { retry_after: computeAccountLockoutRetryAfter(priorAttempts) }
    );
  }
  return error(req, 'Invalid credentials', HTTP_STATUS.UNAUTHORIZED);
}

async function prepareUserForLogin(db, user) {
  const userRole = (await loadPrimaryRole(db, user.id)) || 'member';
  await ensureUserRoleBinding(db, user.id, userRole, user.account_status);
}

// eslint-disable-next-line max-params -- auth dispatcher pattern (req, env, db, users, jwtSecret)
export async function handleLogin(req, env, db, users, jwtSecret) {
  const parsed = await parseLoginBody(req);
  if (parsed instanceof Response) return parsed;

  const { email, password } = parsed;

  const rateLimitResult = await checkLoginRateLimit(req, env);
  if (rateLimitResult instanceof Response) return rateLimitResult;

  const priorAttempts = await checkAccountLockout(req, env, email);
  if (priorAttempts instanceof Response) return priorAttempts;

  const user = await users.findByEmail(email);
  if (!user) {
    return handleFailedLogin(req, env, email);
  }

  await prepareUserForLogin(db, user);

  const ok = await verifyPassword(password, user.password_hash);
  if (!ok) {
    return handleFailedLogin(req, env, email);
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
    expires_in: APP_TTLS.accessTokenSeconds,
    refresh_expires_at: tokenResult.refreshExpiresAt,
  });
}
