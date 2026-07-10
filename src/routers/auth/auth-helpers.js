import { signJWT } from '../../shared/auth.js';
import { createRefreshToken } from '../../shared/session.js';
import { APP_TTLS } from '../../config/app.js';
import { HTTP_STATUS } from '../../shared/http-status.js';
import { error, json } from '../../utils/response.js';
import { escapeHtml } from '../../utils/sanitize.js';
import { normalizePublicRole, loadPrimaryRole } from '../../utils/user-role.js';
import { ValidationError } from '../../errors/http-errors.js';

export const MAX_LOGIN_ATTEMPTS_PER_ACCOUNT = 5;
export const LOGIN_LOCKOUT_WINDOW_SECONDS = 3600;

export function computeAccountLockoutRetryAfter(attempts) {
  if (attempts.length < MAX_LOGIN_ATTEMPTS_PER_ACCOUNT) return 0;
  const releaseIndex = attempts.length - MAX_LOGIN_ATTEMPTS_PER_ACCOUNT;
  const releaseAt = attempts[releaseIndex] + LOGIN_LOCKOUT_WINDOW_SECONDS * 1000;
  const remaining = Math.ceil((releaseAt - Date.now()) / 1000);
  return Math.max(0, Math.min(remaining, LOGIN_LOCKOUT_WINDOW_SECONDS));
}

export function normalizeAccountStatus(value, fallback = 'active') {
  const status = String(value || fallback)
    .trim()
    .toLowerCase();
  if (status === 'active') return 'active';
  return 'pending';
}

export function isActiveAccount(user) {
  if (!user) return false;
  return normalizeAccountStatus(user.account_status) === 'active';
}

async function clearInactiveRoles(db, userId) {
  try {
    await db.run('DELETE FROM user_roles WHERE user_id = ?', [userId]);
  } catch {
    /* no-op: missing table */
  }
}

async function bindRole(db, userId, mappedRole) {
  try {
    await db.run(
      `INSERT OR IGNORE INTO user_roles (id, user_id, role_id, created_at)
					SELECT ?, ?, r.id, unixepoch()
					FROM roles r WHERE r.name = ?`,
      [crypto.randomUUID(), userId, mappedRole]
    );
  } catch (err) {
    if (/no such table:\s*(user_roles|roles)/i.test(String(err?.message || ''))) {
      // RBAC missing during migrations
      return;
    }
    throw err;
  }
}

export async function ensureUserRoleBinding(db, userId, role, accountStatus = 'active') {
  if (!userId) return;
  if (normalizeAccountStatus(accountStatus) !== 'active') {
    await clearInactiveRoles(db, userId);
    return;
  }
  if (!role) return;
  const mappedRole = normalizePublicRole(role);
  await bindRole(db, userId, mappedRole);
}

export function sanitizeUser(user, primaryRole = 'member') {
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

export function readBearerToken(req) {
  const header = req.headers.get('Authorization');
  if (!header?.startsWith('Bearer ')) return null;
  return header.slice('Bearer '.length).trim();
}

export async function createAccessToken(secret, user, primaryRole) {
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

// eslint-disable-next-line max-params -- dispatcher receives req+db+env+users+user+secret
export async function checkActiveAccountAndGenerateTokens(req, db, env, users, user, jwtSecret) {
  if (!isActiveAccount(user)) {
    return json(
      req,
      { error: 'pending_account', message: 'Account pending approval.' },
      HTTP_STATUS.FORBIDDEN
    );
  }
  await users.touchLastActive(user.id);
  const freshUser = await users.findById(user.id);
  if (!freshUser) {
    return error(req, 'User not found', HTTP_STATUS.NOT_FOUND);
  }
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
  return {
    accessToken,
    refreshToken: refresh.token,
    refreshExpiresAt: refresh.expiresAt,
    user: freshUser,
    primaryRole,
  };
}

/**
 * Handle a ValidationError that was thrown inside a try block and caught by
 * a catch clause. Returns an error response with the ValidationError's message
 * when the error is a ValidationError, otherwise re-throws it.
 */
export function handleValidationErrorCatch(err, req) {
  if (err instanceof ValidationError) {
    return error(req, err.message, 400);
  }
  throw err;
}
