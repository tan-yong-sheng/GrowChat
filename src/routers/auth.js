import { createDB } from '../db.js';
import { error, json } from '../utils/response.js';
import { signJWT, verifyPassword } from '../shared/auth.js';
import { createRefreshToken, consumeRefreshToken, revokeRefreshToken } from '../shared/session.js';
import { getJwtSecret } from '../shared/jwt-secret.js';
import { requireString, validateEmail } from '../validation/request.js';
import { RATE_LIMITS, checkRateLimit, resolveRateLimitSubject } from '../services/rate-limit.js';
import { createUserRepository } from '../repositories/user-repository.js';
import { APP_TTLS } from '../config/app.js';
import { ValidationError } from '../errors/http-errors.js';
import { loadPrimaryRole, normalizePublicRole } from '../utils/user-role.js';
import { escapeHtml } from '../utils/sanitize.js';
import { createLogger } from '../utils/logger.js';
import { handleForgotPassword, handleResetPassword } from './auth-password-reset.js';
import { handleRegister } from './auth-register.js';

function normalizeAccountStatus(value, fallback = 'active') {
  const status = String(value || fallback)
    .trim()
    .toLowerCase();
  if (status === 'active') return 'active';
  return 'pending';
}

function isActiveAccount(user) {
  if (!user) return false;
  return normalizeAccountStatus(user.account_status) === 'active';
}

async function ensureUserRoleBinding(db, userId, role, accountStatus = 'active', logger = null) {
  if (!userId) return;
  if (normalizeAccountStatus(accountStatus) !== 'active') {
    try {
      await db.run('DELETE FROM user_roles WHERE user_id = ?', [userId]);
    } catch {
      // Ignore missing RBAC tables during migrations.
    }
    return;
  }
  if (!role) return;
  const mappedRole = normalizePublicRole(role);
  try {
    await db.batch([
      db.prepare('DELETE FROM user_roles WHERE user_id = ?').bind(userId),
      db
        .prepare(
          `INSERT OR IGNORE INTO user_roles (id, user_id, role_id, created_at)
					SELECT ?, ?, r.id, unixepoch()
					FROM roles r WHERE r.name = ?`
        )
        .bind(crypto.randomUUID(), userId, mappedRole),
    ]);
  } catch (err) {
    if (/no such table:\s*(user_roles|roles)/i.test(String(err?.message || ''))) {
      (logger || console).warn('RBAC role binding skipped: run migrations/001_initial.sql');
      return;
    }
    throw err;
  }
}

function sanitizeUser(user, primaryRole = 'member') {
  let settings;
  try {
    settings = user.settings ? JSON.parse(user.settings) : {};
  } catch {
    settings = {};
  }
  return {
    id: user.id,
    email: user.email,
    name: escapeHtml(String(user.name || '')),
    account_status: normalizeAccountStatus(user.account_status),
    primary_role: normalizePublicRole(primaryRole),
    settings,
    created_at: user.created_at,
    last_active_at: user.last_active_at,
    updated_at: user.updated_at,
  };
}

function readBearerToken(req) {
  const header = req.headers.get('Authorization');
  if (!header?.startsWith('Bearer ')) return null;
  return header.slice('Bearer '.length).trim();
}

async function createAccessToken(secret, user, primaryRole) {
  return signJWT(
    {
      sub: user.id,
      email: user.email,
      primary_role: normalizePublicRole(primaryRole),
      name: escapeHtml(String(user.name || '')),
    },
    secret,
    APP_TTLS.accessTokenSeconds
  );
}

export async function authRouter(req, env, _ctx, authUser, path, requestContext = {}) {
  const logger =
    requestContext.logger || createLogger(env, { requestId: requestContext.requestId });
  const db = createDB(env.DB);
  const users = createUserRepository(db);

  let jwtSecret;
  try {
    jwtSecret = getJwtSecret(env, req);
  } catch (err) {
    return error(req, 'JWT configuration error', 500, {
      message: err?.message || 'JWT_SECRET configuration error',
    });
  }
  if (path.startsWith('/api/auth/') && !jwtSecret) {
    return error(req, 'JWT_SECRET is not configured', 500);
  }

  if (req.method === 'POST' && path === '/api/auth/register') {
    return handleRegister(req, env, db, users, jwtSecret, logger, {
      ensureUserRoleBinding,
      createAccessToken,
    });
  }

  if (req.method === 'POST' && path === '/api/auth/login') {
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

    const loginLimit = await checkRateLimit(env.CACHE, {
      action: 'auth-login',
      subject: resolveRateLimitSubject(req),
      ...RATE_LIMITS.authLogin,
    });
    if (!loginLimit.allowed) {
      return error(req, 'Too many login attempts', 429, {
        retry_after: Math.ceil((loginLimit.resetAt - Date.now()) / 1000),
      });
    }

    const user = await users.findByEmail(email);
    if (!user) return error(req, 'Invalid credentials', 401);

    const userRole = (await loadPrimaryRole(db, user.id)) || 'member';
    await ensureUserRoleBinding(db, user.id, userRole, user.account_status, logger);

    const ok = await verifyPassword(password, user.password_hash);
    if (!ok) return error(req, 'Invalid credentials', 401);

    if (!isActiveAccount(user)) {
      return json(req, { error: 'pending_account', message: 'Account pending approval.' }, 403);
    }

    await users.touchLastActive(user.id);
    const freshUser = await users.findById(user.id);
    const primaryRole = (await loadPrimaryRole(db, freshUser.id)) || 'member';

    const accessToken = await signJWT(
      {
        sub: freshUser.id,
        email: freshUser.email,
        primary_role: primaryRole,
        name: freshUser.name,
      },
      jwtSecret,
      APP_TTLS.accessTokenSeconds
    );
    const refresh = await createRefreshToken(env, freshUser.id);

    return json(req, {
      user: sanitizeUser(freshUser, primaryRole),
      access_token: accessToken,
      refresh_token: refresh.token,
      expires_in: 900,
      refresh_expires_at: refresh.expiresAt,
    });
  }

  if (req.method === 'POST' && path === '/api/auth/refresh') {
    let body;
    try {
      body = await req.json();
    } catch {
      return error(req, 'Invalid JSON body', 400);
    }

    let refreshToken;
    try {
      refreshToken = requireString(body.refresh_token, 'refresh_token is required', {
        trim: false,
      });
    } catch (err) {
      if (err instanceof ValidationError) {
        return error(req, err.message, 400);
      }
      throw err;
    }

    const session = await consumeRefreshToken(env, refreshToken);
    if (!session?.userId) return error(req, 'Invalid refresh token', 401);

    const user = await users.findById(session.userId);
    if (!user) return error(req, 'User not found', 404);

    const userRole = (await loadPrimaryRole(db, user.id)) || 'member';
    await ensureUserRoleBinding(db, user.id, userRole, user.account_status, logger);

    if (!isActiveAccount(user)) {
      return json(req, { error: 'pending_account', message: 'Account pending approval.' }, 403);
    }

    await users.touchLastActive(user.id);
    const freshUser = await users.findById(user.id);
    const primaryRole = (await loadPrimaryRole(db, freshUser.id)) || 'member';

    const accessToken = await signJWT(
      {
        sub: freshUser.id,
        email: freshUser.email,
        primary_role: primaryRole,
        name: freshUser.name,
      },
      jwtSecret,
      APP_TTLS.accessTokenSeconds
    );
    const refresh = await createRefreshToken(env, freshUser.id);

    return json(req, {
      user: sanitizeUser(freshUser, primaryRole),
      access_token: accessToken,
      refresh_token: refresh.token,
      expires_in: 900,
      refresh_expires_at: refresh.expiresAt,
    });
  }

  if (req.method === 'POST' && path === '/api/auth/logout') {
    let body = {};
    try {
      body = await req.json();
    } catch {
      // Allow empty body
    }
    const tokenFromBody = body.refresh_token ? String(body.refresh_token) : null;
    const bearer = readBearerToken(req);
    if (tokenFromBody) {
      await revokeRefreshToken(env, tokenFromBody);
    }
    if (bearer && !tokenFromBody) {
      // Optional compatibility path: no-op for bearer-only logout
    }
    return json(req, { ok: true });
  }

  if (req.method === 'POST' && path === '/api/auth/forgot-password') {
    return handleForgotPassword(req, env, db, users, requestContext);
  }

  if (req.method === 'POST' && path === '/api/auth/reset-password') {
    return handleResetPassword(req, env, db);
  }

  // Email verification endpoints
  if (req.method === 'GET' && path === '/api/auth/verify-email') {
    const url = new URL(req.url);
    const token = url.searchParams.get('token');
    if (!token) {
      return error(req, 'Token is required', 400);
    }
    const { verifyEmail } = await import('./email-verification.js');
    return verifyEmail({ token });
  }

  if (req.method === 'POST' && path === '/api/auth/resend-verification') {
    const resendLimit = await checkRateLimit(env.CACHE, {
      action: 'auth-resend-verification',
      subject: resolveRateLimitSubject(req),
      ...RATE_LIMITS.authResendVerification,
    });
    if (!resendLimit.allowed) {
      return error(req, 'Too many resend attempts', 429, {
        retry_after: Math.ceil((resendLimit.resetAt - Date.now()) / 1000),
      });
    }
    let body;
    try {
      body = await req.json();
    } catch {
      return error(req, 'Invalid JSON body', 400);
    }
    const email = body?.email;
    if (!email) {
      return error(req, 'Email is required', 400);
    }
    const { resendVerification } = await import('./email-verification.js');
    return resendVerification({ email, env });
  }

  // GET /api/auth/me - Return the authenticated user profile
  if (req.method === 'GET' && path === '/api/auth/me') {
    if (!authUser?.sub) {
      return error(req, 'Authentication required', 401);
    }
    const db = createDB(env.DB);
    const users = createUserRepository(db);
    const user = await users.findById(authUser.sub);
    if (!user) {
      return error(req, 'User not found', 404);
    }
    const primaryRole = await loadPrimaryRole(env, authUser.sub);
    return json(req, sanitizeUser(user, primaryRole));
  }

  // Return 405 for method mismatches on known auth paths
  const authPaths = [
    '/api/auth/register',
    '/api/auth/login',
    '/api/auth/refresh',
    '/api/auth/logout',
    '/api/auth/forgot-password',
    '/api/auth/reset-password',
    '/api/auth/verify-email',
    '/api/auth/resend-verification',
    '/api/auth/me',
  ];
  if (authPaths.includes(path)) {
    return error(req, 'Method not allowed', 405);
  }

  return null;
}
