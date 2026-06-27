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

  const registerLimit = await checkRateLimit(env, {
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

  // Guard against first-user bootstrap race: two concurrent registrations
  // could both observe an empty system and both claim admin. Use INSERT OR IGNORE
  // on the UNIQUE app_config key — if meta.changes === 0, another request already
  // claimed first-admin and the loser must retry (it will register as member).
  //
  // The claim is intentionally AFTER rate limit + body validation so that a
  // throttled or malformed first request cannot consume the sentinel and leave
  // an empty deployment stuck behind 409s on retries. If user creation later
  // throws after the claim succeeded, we roll the sentinel back below.
  let claimedBootstrap = false;
  if (!hasUsers) {
    const claimResult = await db.run(
      `INSERT OR IGNORE INTO app_config (key, value, updated_at) VALUES ('first_admin_claimed', '1', unixepoch())`,
      []
    );
    // D1 returns meta.changes = 1 on insert, 0 on ignore (conflict).
    // If meta is absent (e.g. test mock), treat as success for compatibility.
    const claimSucceeded = claimResult?.meta ? claimResult.meta.changes > 0 : true;
    if (!claimSucceeded) {
      // Another request won the race — tell the client to retry.
      // On retry, hasUsers will be > 0 so they register as member.
      return error(req, 'Registration in progress, please retry', 409);
    }
    claimedBootstrap = true;
  }

  const existing = await users.findByEmail(email, 'id');
  if (existing) {
    if (claimedBootstrap) {
      // We claimed first-admin but this email is already taken — release the
      // sentinel so a different request can claim it instead.
      try {
        await db.run(`DELETE FROM app_config WHERE key = 'first_admin_claimed'`, []);
      } catch {
        /* best-effort cleanup */
      }
    }
    return error(req, 'Email already registered', 409);
  }

  const id = crypto.randomUUID();
  const registrationStatusRaw = await getConfigValue(db, 'public_registration_status', 'pending');
  const registrationStatus =
    String(registrationStatusRaw || 'pending')
      .trim()
      .toLowerCase() === 'active'
      ? 'active'
      : 'pending';

  const finalRole = hasUsers ? 'member' : 'admin';
  const finalAccountStatus = finalRole === 'admin' ? 'active' : registrationStatus;

  let user;
  try {
    const passwordHash = await hashPassword(password);

    user = await users.create({
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

    // Sync users.primary_role in the DB (create() inserts with the column default,
    // which is 'member'). Without this UPDATE the users table and user_roles table
    // can disagree on the role for the first-admin path.
    try {
      await db.run('UPDATE users SET primary_role = ? WHERE id = ?', [
        normalizePublicRole(finalRole),
        id,
      ]);
    } catch {
      // Tolerate missing column in older schemas.
    }

    // Defer the public_registration flip until AFTER all bootstrap writes
    // succeed. If ensureUserRoleBinding / the primary_role UPDATE fails
    // after the claim succeeded, the catch block below only rolls back the
    // first_admin_claimed sentinel — flipping public_registration here would
    // leave the deployment with registration permanently disabled until a
    // manual DB repair. Holding the flip to the end keeps a failed bootstrap
    // self-healing: a retry can still register the first admin.
    if (finalRole === 'admin') {
      await setConfigValue(db, 'public_registration', 'false');
    }
  } catch (err) {
    // Roll back the bootstrap sentinel if user creation failed so a retry
    // can succeed. Without this, a transient failure leaves the deployment
    // stuck behind 409s for the lifetime of the DB.
    if (claimedBootstrap) {
      try {
        await db.run(`DELETE FROM app_config WHERE key = 'first_admin_claimed'`, []);
      } catch {
        /* best-effort cleanup */
      }
    }
    throw err;
  }

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
