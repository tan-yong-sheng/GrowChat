import { error, json } from '../utils/response.js';
import { hashPassword } from '../shared/auth.js';
import { createRefreshToken } from '../shared/session.js';
import { getConfigBool, getConfigValue, setConfigValue } from '../utils/app-config.js';
import { requireString, validateEmail } from '../validation/request.js';
import { RATE_LIMITS, checkRateLimit, resolveRateLimitSubject } from '../services/rate-limit.js';
import { handleValidationErrorCatch, sanitizeUser } from './auth/auth-helpers.js';
import { stripHtml } from '../utils/sanitize.js';
import { normalizePublicRole } from '../utils/user-role.js';
import { ValidationError } from '../errors/http-errors.js';

const PASSWORD_MIN_LENGTH = 8;
const HTTP_STATUS_BAD_REQUEST = 400;
const HTTP_STATUS_FORBIDDEN = 403;
const HTTP_STATUS_CONFLICT = 409;
const HTTP_STATUS_TOO_MANY_REQUESTS = 429;
const HTTP_STATUS_CREATED = 201;
const ACCESS_TOKEN_EXPIRES_IN_SECONDS = 900;

async function parseJsonBody(req) {
  try {
    return await req.json();
  } catch {
    throw Object.assign(new Error('Invalid JSON body'), { status: HTTP_STATUS_BAD_REQUEST });
  }
}

function validateRegisterBody(body) {
  const email = validateEmail(
    requireString(body.email, 'email, name, password are required').toLowerCase()
  );
  let name = requireString(body.name, 'email, name, password are required');
  name = stripHtml(name);
  if (!name) {
    throw new ValidationError('Name cannot be empty after removing invalid characters');
  }
  const password = requireString(body.password, 'email, name, password are required', {
    trim: false,
  });
  if (password.length < PASSWORD_MIN_LENGTH) {
    throw new ValidationError(`Password must be at least ${PASSWORD_MIN_LENGTH} characters`);
  }
  return { email, name, password };
}

async function determineAccountStatus(db, hasUsers) {
  const registrationStatusRaw = await getConfigValue(db, 'public_registration_status', 'pending');
  const registrationStatus =
    String(registrationStatusRaw || 'pending')
      .trim()
      .toLowerCase() === 'active'
      ? 'active'
      : 'pending';
  const finalRole = hasUsers ? 'member' : 'admin';
  const finalAccountStatus = finalRole === 'admin' ? 'active' : registrationStatus;
  return { finalRole, finalAccountStatus };
}

async function checkRegistrationAllowed(db, users, env, req) {
  const hasUsers = (await users.count()) > 0;
  const publicRegistrationEnabled = await getConfigBool(db, 'public_registration', true);
  if (!publicRegistrationEnabled && hasUsers) {
    return {
      allowed: false,
      response: error(req, 'Public registration is disabled', HTTP_STATUS_FORBIDDEN),
    };
  }
  const registerLimit = await checkRateLimit(env, {
    action: 'auth-register',
    subject: resolveRateLimitSubject(req),
    ...RATE_LIMITS.authRegister,
  });
  if (!registerLimit.allowed) {
    return {
      allowed: false,
      response: error(req, 'Too many registration attempts', HTTP_STATUS_TOO_MANY_REQUESTS, {
        retry_after: Math.ceil((registerLimit.resetAt - Date.now()) / 1000),
      }),
    };
  }
  return { allowed: true, hasUsers };
}

async function prepareBootstrapClaim(db, users, hasUsers, email) {
  let claimedBootstrap = false;
  if (!hasUsers) {
    const { claimSucceeded } = await claimBootstrapAdmin(db);
    if (!claimSucceeded) {
      return { claimedBootstrap, existing: null, retry: true };
    }
    claimedBootstrap = true;
  }
  const existing = await users.findByEmail(email, 'id');
  if (existing && claimedBootstrap) {
    await releaseBootstrapClaim(db);
  }
  return { claimedBootstrap, existing, retry: false };
}

async function claimBootstrapAdmin(db) {
  const claimResult = await db.run(
    `INSERT OR IGNORE INTO app_config (key, value, updated_at) VALUES ('first_admin_claimed', '1', unixepoch())`,
    []
  );
  const claimSucceeded = claimResult?.meta ? claimResult.meta.changes > 0 : true;
  return { claimSucceeded };
}

async function releaseBootstrapClaim(db) {
  try {
    await db.run(`DELETE FROM app_config WHERE key = 'first_admin_claimed'`, []);
  } catch {
    /* best-effort cleanup */
  }
}

async function rollbackCreatedUser(db, id) {
  try {
    await db.run('DELETE FROM users WHERE id = ?', [id]);
  } catch {
    /* best-effort cleanup */
  }
}

async function createRegisteredUser({
  db,
  users,
  id,
  email,
  password,
  name,
  finalRole,
  finalAccountStatus,
  ensureUserRoleBinding,
  logger,
}) {
  const passwordHash = await hashPassword(password);
  let user = await users.create({
    id,
    email,
    passwordHash,
    name,
    accountStatus: finalAccountStatus,
    settings: '{}',
  });

  if (finalRole === 'admin') {
    user = { ...user, primary_role: 'admin', account_status: 'active' };
  } else {
    user = { ...user, primary_role: 'member', account_status: finalAccountStatus };
  }

  await ensureUserRoleBinding(db, id, finalRole, finalAccountStatus, logger);

  try {
    await db.run('UPDATE users SET primary_role = ? WHERE id = ?', [
      normalizePublicRole(finalRole),
      id,
    ]);
  } catch {
    // Tolerate missing column in older schemas.
  }

  if (finalRole === 'admin') {
    await setConfigValue(db, 'public_registration', 'false');
  }

  return user;
}

async function parseAndValidateBody(req) {
  let body;
  try {
    body = await parseJsonBody(req);
  } catch (err) {
    return { errorResponse: error(req, err.message, err.status) };
  }
  let email;
  let name;
  let password;
  try {
    ({ email, name, password } = validateRegisterBody(body));
  } catch (err) {
    return { errorResponse: handleValidationErrorCatch(err, req) };
  }
  return { email, name, password };
}

function claimFailureResponse(req, claimedBootstrapResult) {
  const { existing, retry } = claimedBootstrapResult;
  if (retry) {
    return error(req, 'Registration in progress, please retry', HTTP_STATUS_CONFLICT);
  }
  if (existing) {
    return error(req, 'Email already registered', HTTP_STATUS_CONFLICT);
  }
  return null;
}

async function createUserWithRollback({
  db,
  users,
  id,
  email,
  password,
  name,
  finalRole,
  finalAccountStatus,
  ensureUserRoleBinding,
  logger,
  claimedBootstrap,
}) {
  let user;
  let userCreated = false;
  try {
    user = await createRegisteredUser({
      db,
      users,
      id,
      email,
      password,
      name,
      finalRole,
      finalAccountStatus,
      ensureUserRoleBinding,
      logger,
    });
    userCreated = true;
  } catch (err) {
    if (userCreated) {
      await rollbackCreatedUser(db, id);
    }
    if (claimedBootstrap) {
      await releaseBootstrapClaim(db);
    }
    throw err;
  }
  return user;
}

function buildRegistrationResponse({
  req,
  user,
  finalRole,
  finalAccountStatus,
  jwtSecret,
  env,
  createAccessToken,
}) {
  if (finalAccountStatus === 'pending') {
    return buildPendingRegistrationResponse(req, user, finalRole);
  }
  return buildActiveRegistrationResponse({
    req,
    user,
    finalRole,
    jwtSecret,
    env,
    createAccessToken,
  });
}

export async function handleRegister({ req, env, db, users, jwtSecret, logger, sharedFns }) {
  const { ensureUserRoleBinding, createAccessToken } = sharedFns;

  const { allowed, response, hasUsers } = await checkRegistrationAllowed(db, users, env, req);
  if (!allowed) {
    return response;
  }

  const parsed = await parseAndValidateBody(req);
  if (parsed.errorResponse) {
    return parsed.errorResponse;
  }
  const { email, name, password } = parsed;

  const claimResult = await prepareBootstrapClaim(db, users, hasUsers, email);
  const claimError = claimFailureResponse(req, claimResult);
  if (claimError) {
    return claimError;
  }
  const { claimedBootstrap } = claimResult;

  const id = crypto.randomUUID();
  const { finalRole, finalAccountStatus } = await determineAccountStatus(db, hasUsers);

  const user = await createUserWithRollback({
    db,
    users,
    id,
    email,
    password,
    name,
    finalRole,
    finalAccountStatus,
    ensureUserRoleBinding,
    logger,
    claimedBootstrap,
  });

  return buildRegistrationResponse({
    req,
    user,
    finalRole,
    finalAccountStatus,
    jwtSecret,
    env,
    createAccessToken,
  });
}

function buildPendingRegistrationResponse(req, user, finalRole) {
  return json(
    req,
    {
      user: sanitizeUser(user, finalRole),
      account_status: 'pending',
      status: 'pending',
      message: 'Account pending approval.',
    },
    HTTP_STATUS_CREATED
  );
}

async function buildActiveRegistrationResponse({
  req,
  user,
  finalRole,
  jwtSecret,
  env,
  createAccessToken,
}) {
  const accessToken = await createAccessToken(jwtSecret, user, finalRole);
  const refresh = await createRefreshToken(env, user.id);
  return json(
    req,
    {
      user: sanitizeUser(user, finalRole),
      access_token: accessToken,
      refresh_token: refresh.token,
      expires_in: ACCESS_TOKEN_EXPIRES_IN_SECONDS,
      refresh_expires_at: refresh.expiresAt,
    },
    HTTP_STATUS_CREATED
  );
}
