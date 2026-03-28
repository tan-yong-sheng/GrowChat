import { createDB } from '../db.js';
import { error, json } from '../utils/response.js';
import { hashPassword, signJWT, verifyPassword } from '../shared/auth.js';
import { createRefreshToken, consumeRefreshToken, revokeRefreshToken } from '../shared/session.js';
import { getConfigBool, getConfigValue, setConfigValue } from '../utils/app-config.js';
import { getJwtSecret } from '../shared/jwt-secret.js';
import { requireString, validateEmail } from '../validation/request.js';
import { RATE_LIMITS, checkRateLimit, resolveRateLimitSubject } from '../services/rate-limit.js';
import { createUserRepository } from '../repositories/user-repository.js';
import { APP_TTLS } from '../config/app.js';
import { ValidationError } from '../errors/http-errors.js';
import { loadPrimaryRole, normalizePublicRole } from '../utils/user-role.js';

function normalizeAccountStatus(value, fallback = 'active') {
  const status = String(value || fallback).trim().toLowerCase();
  return status === 'pending' ? 'pending' : 'active';
}

function isActiveAccount(user) {
  if (!user) return false;
  return normalizeAccountStatus(user.account_status) === 'active';
}

async function ensureUserRoleBinding(db, userId, role, accountStatus = 'active') {
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
    await db.run('DELETE FROM user_roles WHERE user_id = ?', [userId]);
    await db.run(
      `INSERT OR IGNORE INTO user_roles (id, user_id, role_id, created_at)
       SELECT ?, ?, r.id, unixepoch()
       FROM roles r
       WHERE r.name = ?`,
      [crypto.randomUUID(), userId, mappedRole]
    );
  } catch (err) {
    // Temporary safety net: do not block auth when RBAC tables are not migrated yet.
    if (/no such table:\s*(user_roles|roles)/i.test(String(err?.message || ''))) {
      console.warn('RBAC role binding skipped: run migrations/001_initial.sql');
      return;
    }
    throw err;
  }
}

function sanitizeUser(user, primaryRole = 'member') {
  let settings = {};
  try {
    settings = user.settings ? JSON.parse(user.settings) : {};
  } catch {
    settings = {};
  }
  return {
    id: user.id,
    email: user.email,
    name: user.name,
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
    { sub: user.id, email: user.email, primary_role: normalizePublicRole(primaryRole), name: user.name },
    secret,
    APP_TTLS.accessTokenSeconds
  );
}

export async function authRouter(req, env, _ctx, _authUser, path) {
  const db = createDB(env.DB);
  const users = createUserRepository(db);
  const jwtSecret = getJwtSecret(env, req);

  if (path.startsWith('/api/auth/') && !jwtSecret) {
    return error(req, 'JWT_SECRET is not configured', 500);
  }

  if (req.method === 'POST' && path === '/api/auth/register') {
    let body;
    try {
      body = await req.json();
    } catch {
      return error(req, 'Invalid JSON body', 400);
    }

    const hasUsers = (await users.count()) > 0;
    const publicRegistrationEnabled = await getConfigBool(db, 'public_registration', true);
    if (!publicRegistrationEnabled && hasUsers) {
      return error(req, 'Public registration is disabled', 403);
    }

    const registerLimit = await checkRateLimit(env.CACHE, {
      action: 'auth-register',
      subject: resolveRateLimitSubject(req),
      ...RATE_LIMITS.authRegister,
    });
    if (!registerLimit.allowed) {
      return error(req, 'Too many registration attempts', 429, {
        retry_after: Math.ceil((registerLimit.resetAt - Date.now()) / 1000),
      });
    }

    let email;
    let name;
    let password;
    try {
      email = validateEmail(requireString(body.email, 'email, name, password are required').toLowerCase());
      name = requireString(body.name, 'email, name, password are required');
      password = requireString(body.password, 'email, name, password are required', { trim: false });
    } catch (err) {
      if (err instanceof ValidationError) {
        return error(req, err.message, 400);
      }
      throw err;
    }
    if (password.length < 8) {
      return error(req, 'Password must be at least 8 characters', 400);
    }

    const existing = await users.findByEmail(email, 'id');
    if (existing) return error(req, 'Email already registered', 409);

    const id = crypto.randomUUID();
    const passwordHash = await hashPassword(password);
    const registrationStatusRaw = await getConfigValue(db, 'public_registration_status', 'pending');
    const registrationStatus = String(registrationStatusRaw || 'pending').trim().toLowerCase() === 'active'
      ? 'active'
      : 'pending';
    // Bootstrap the very first account as the admin owner of the fresh workspace.
    const finalRole = hasUsers ? 'member' : 'admin';
    const finalAccountStatus = finalRole === 'admin' ? 'active' : registrationStatus;
    let user = await users.create({
      id,
      email,
      passwordHash,
      name,
      accountStatus: finalAccountStatus,
      settings: '{}',
    });
    if (finalRole === 'admin') {
      // Disable public registration after first admin is created.
      await setConfigValue(db, 'public_registration', 'false');
      user = { ...user, primary_role: 'admin', account_status: 'active' };
    } else {
      user = { ...user, primary_role: 'member', account_status: finalAccountStatus };
    }
    await ensureUserRoleBinding(db, id, finalRole, finalAccountStatus);
    if (finalAccountStatus === 'pending') {
      return json(req, {
        user: sanitizeUser(user, finalRole),
        account_status: 'pending',
        status: 'pending',
        message: 'Account pending approval.',
      }, 201);
    }

    const accessToken = await createAccessToken(jwtSecret, user, finalRole);
    const refresh = await createRefreshToken(env, user.id);

    return json(req, {
      user: sanitizeUser(user, finalRole),
      access_token: accessToken,
      refresh_token: refresh.token,
      expires_in: 900,
      refresh_expires_at: refresh.expiresAt,
    }, 201);
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
      email = validateEmail(requireString(body.email, 'email and password are required').toLowerCase());
      password = requireString(body.password, 'email and password are required', { trim: false });
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
    await ensureUserRoleBinding(db, user.id, userRole, user.account_status);

      const ok = await verifyPassword(password, user.password_hash);
    if (!ok) return error(req, 'Invalid credentials', 401);
    if (!isActiveAccount(user)) {
      return json(req, {
        error: 'pending_account',
        message: 'Account pending approval.',
      }, 403);
    }

    await users.touchLastActive(user.id);
    const freshUser = await users.findById(user.id);
    const primaryRole = (await loadPrimaryRole(db, freshUser.id)) || 'member';

    const accessToken = await signJWT(
      { sub: freshUser.id, email: freshUser.email, primary_role: primaryRole, name: freshUser.name },
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
      refreshToken = requireString(body.refresh_token, 'refresh_token is required', { trim: false });
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
    await ensureUserRoleBinding(db, user.id, userRole, user.account_status);
    if (!isActiveAccount(user)) {
      return json(req, {
        error: 'pending_account',
        message: 'Account pending approval.',
      }, 403);
    }

    await users.touchLastActive(user.id);
    const freshUser = await users.findById(user.id);
    const primaryRole = (await loadPrimaryRole(db, freshUser.id)) || 'member';

    const accessToken = await signJWT(
      { sub: freshUser.id, email: freshUser.email, primary_role: primaryRole, name: freshUser.name },
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

  return null;
}
