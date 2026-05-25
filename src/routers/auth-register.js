import { error, json } from '../utils/response.js';
import { hashPassword } from '../shared/auth.js';
import { createRefreshToken } from '../shared/session.js';
import { getConfigBool, getConfigValue, setConfigValue } from '../utils/app-config.js';
import { requireString, validateEmail } from '../validation/request.js';
import { RATE_LIMITS, checkRateLimit, resolveRateLimitSubject } from '../services/rate-limit.js';
import { ValidationError } from '../errors/http-errors.js';
import { stripHtml, escapeHtml } from '../utils/sanitize.js';
import { normalizePublicRole } from '../utils/user-role.js';

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
    account_status: user.account_status === 'active' ? 'active' : 'pending',
    primary_role: normalizePublicRole(primaryRole),
    settings,
    created_at: user.created_at,
    last_active_at: user.last_active_at,
    updated_at: user.updated_at,
  };
}

export async function handleRegister(req, env, db, users, jwtSecret, logger, sharedFns) {
  const { ensureUserRoleBinding, createAccessToken } = sharedFns;

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
    email = validateEmail(
      requireString(body.email, 'email, name, password are required').toLowerCase()
    );
    name = requireString(body.name, 'email, name, password are required');
    name = stripHtml(name);
    if (!name) {
      return error(req, 'Name cannot be empty after removing invalid characters', 400);
    }
    password = requireString(body.password, 'email, name, password are required', {
      trim: false,
    });
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
  const registrationStatus =
    String(registrationStatusRaw || 'pending')
      .trim()
      .toLowerCase() === 'active'
      ? 'active'
      : 'pending';

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
    await setConfigValue(db, 'public_registration', 'false');
    user = { ...user, primary_role: 'admin', account_status: 'active' };
  } else {
    user = { ...user, primary_role: 'member', account_status: finalAccountStatus };
  }

  await ensureUserRoleBinding(db, id, finalRole, finalAccountStatus, logger);

  if (finalAccountStatus === 'pending') {
    return json(
      req,
      {
        user: sanitizeUser(user, finalRole),
        account_status: 'pending',
        status: 'pending',
        message: 'Account pending approval.',
      },
      201
    );
  }

  const accessToken = await createAccessToken(jwtSecret, user, finalRole);
  const refresh = await createRefreshToken(env, user.id);
  return json(
    req,
    {
      user: sanitizeUser(user, finalRole),
      access_token: accessToken,
      refresh_token: refresh.token,
      expires_in: 900,
      refresh_expires_at: refresh.expiresAt,
    },
    201
  );
}
