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
import { createEmailService } from '../services/email/email-service.js';
import { escapeHtml, stripHtml } from '../utils/sanitize.js';

const PASSWORD_RESET_TTL_SECONDS = 3600;
const PASSWORD_RESET_TTL_DISPLAY = '1 hour';

function normalizeAccountStatus(value, fallback = 'active') {
  const status = String(value || fallback)
    .trim()
    .toLowerCase();
  // Explicit allowlist: only 'active' is treated as active.
  // Future statuses like 'suspended' or 'banned' must be added here.
  if (status === 'active') return 'active';
  return 'pending';
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
    // Use batch for atomicity: if INSERT fails, DELETE is rolled back too.
    await db.batch([
      db.prepare('DELETE FROM user_roles WHERE user_id = ?').bind(userId),
      db
        .prepare(
          `INSERT OR IGNORE INTO user_roles (id, user_id, role_id, created_at)
         SELECT ?, ?, r.id, unixepoch()
         FROM roles r
         WHERE r.name = ?`
        )
        .bind(crypto.randomUUID(), userId, mappedRole),
    ]);
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

export async function authRouter(req, env, _ctx, _authUser, path) {
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
    // Strip HTML tags from name to prevent stored XSS
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
      user = {
        ...user,
        primary_role: 'member',
        account_status: finalAccountStatus,
      };
    }
    await ensureUserRoleBinding(db, id, finalRole, finalAccountStatus);
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
      return json(
        req,
        {
          error: 'pending_account',
          message: 'Account pending approval.',
        },
        403
      );
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
    await ensureUserRoleBinding(db, user.id, userRole, user.account_status);
    if (!isActiveAccount(user)) {
      return json(
        req,
        {
          error: 'pending_account',
          message: 'Account pending approval.',
        },
        403
      );
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
    let body;
    try {
      body = await req.json();
    } catch {
      return error(req, 'Invalid JSON body', 400);
    }

    let email;
    try {
      email = validateEmail(requireString(body.email, 'email is required').toLowerCase());
    } catch (err) {
      if (err instanceof ValidationError) {
        return error(req, err.message, 400);
      }
      throw err;
    }

    const forgotLimit = await checkRateLimit(env.CACHE, {
      action: 'auth-forgot-password',
      subject: resolveRateLimitSubject(req),
      ...RATE_LIMITS.authForgotPassword,
    });
    if (!forgotLimit.allowed) {
      return error(req, 'Too many password reset requests', 429, {
        retry_after: Math.ceil((forgotLimit.resetAt - Date.now()) / 1000),
      });
    }

    const user = await users.findByEmail(email);
    if (!user) {
      return json(req, {
        message: 'If an account exists with this email, a reset link has been sent.',
      });
    }

    const resetToken = crypto.getRandomValues(new Uint8Array(32));
    const resetTokenHex = [...resetToken].map((x) => x.toString(16).padStart(2, '0')).join('');
    const tokenHash = await crypto.subtle.digest(
      'SHA-256',
      new TextEncoder().encode(resetTokenHex)
    );
    const tokenHashHex = [...new Uint8Array(tokenHash)]
      .map((x) => x.toString(16).padStart(2, '0'))
      .join('');

    const expiresAt = Math.floor(Date.now() / 1000) + PASSWORD_RESET_TTL_SECONDS;
    await db.run(
      `INSERT INTO password_reset_tokens (id, user_id, token_hash, expires_at, created_at)
       VALUES (?, ?, ?, ?, unixepoch())`,
      [crypto.randomUUID(), user.id, tokenHashHex, expiresAt]
    );

    try {
      const emailService = createEmailService(env);
      const userNameEscaped = escapeHtml(user.name);
      const origin = new URL(req.url).origin;
      // SECURITY NOTE: The reset token is embedded in the URL query parameter.
      // This is a standard pattern for password reset emails but has known risks:
      // - Token appears in server access logs (mitigated by logging URL paths only)
      // - Token stored in browser history (cleared on tab close in modern browsers)
      // - Token visible in URL bar (user should close tab after use)
      // - Token could leak via Referer header (reset page has no external links)
      // The token is hashed in the database and is single-use (deleted on consumption).
      const resetLink = `${origin}/auth/reset-password?token=${resetTokenHex}`;

      const emailHtml = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Reset Your Password</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Oxygen', 'Ubuntu', 'Cantarell', 'Fira Sans', 'Droid Sans', 'Helvetica Neue', sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 0; background-color: #f5f5f5; }
    .container { max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 8px; box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1); overflow: hidden; }
    .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: #ffffff; padding: 40px 20px; text-align: center; }
    .header h1 { margin: 0; font-size: 28px; font-weight: 600; }
    .content { padding: 40px 30px; }
    .greeting { font-size: 16px; margin-bottom: 20px; color: #333; }
    .message { font-size: 15px; line-height: 1.8; color: #555; margin-bottom: 30px; }
    .button-container { text-align: center; margin: 40px 0; }
    .button { display: inline-block; background-color: #667eea; color: #ffffff; padding: 14px 32px; text-decoration: none; border-radius: 6px; font-weight: 600; font-size: 16px; transition: background-color 0.3s ease; }
    .button:hover { background-color: #5568d3; }
    .expiration-notice { background-color: #fff3cd; border: 1px solid #ffc107; border-radius: 4px; padding: 15px; margin: 30px 0; font-size: 14px; color: #856404; }
    .expiration-notice strong { display: block; margin-bottom: 5px; }
    .security-notice { background-color: #f0f0f0; border-radius: 4px; padding: 20px; margin: 30px 0; font-size: 14px; color: #666; line-height: 1.7; }
    .security-notice strong { display: block; margin-bottom: 8px; color: #333; }
    .footer { background-color: #f9f9f9; padding: 30px; text-align: center; border-top: 1px solid #e0e0e0; font-size: 13px; color: #999; }
    .footer-link { color: #667eea; text-decoration: none; }
    .footer-link:hover { text-decoration: underline; }
    .divider { height: 1px; background-color: #e0e0e0; margin: 20px 0; }
    .fallback-link { word-break: break-all; font-size: 13px; color: #667eea; margin-top: 20px; padding: 15px; background-color: #f9f9f9; border-radius: 4px; border-left: 4px solid #667eea; }
    @media (max-width: 600px) {
      .container { border-radius: 0; }
      .content { padding: 30px 20px; }
      .header { padding: 30px 20px; }
      .header h1 { font-size: 24px; }
      .button { display: block; width: 100%; box-sizing: border-box; }
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>Reset Your Password</h1>
    </div>
    <div class="content">
      <p class="greeting">Hi ${userNameEscaped},</p>
      <p class="message">We received a request to reset your password. Click the button below to create a new password for your account.</p>
      <div class="button-container">
        <a href="${resetLink}" class="button">Reset Password</a>
      </div>
      <div class="expiration-notice">
        <strong>Link Expires In: ${PASSWORD_RESET_TTL_DISPLAY}</strong>
        This password reset link will expire in ${PASSWORD_RESET_TTL_DISPLAY}. If you don't reset your password within this time, you'll need to request a new reset link.
      </div>
      <div class="security-notice">
        <strong>Didn't request this?</strong>
        If you didn't request a password reset, you can safely ignore this email. Your account remains secure and your password hasn't been changed. If you believe your account has been compromised, please contact our support team immediately.
      </div>
      <p style="font-size: 13px; color: #999; margin-top: 30px;">
        <strong>Or copy and paste this link in your browser:</strong><br>
        <span class="fallback-link">${resetLink}</span>
      </p>
    </div>
    <div class="footer">
      <p style="margin: 0 0 15px 0;">
        Need help? <a href="https://support.example.com" class="footer-link">Contact Support</a>
      </p>
      <div class="divider"></div>
      <p style="margin: 15px 0 0 0;">
        This is an automated message from GrowChat. Please do not reply to this email.
      </p>
    </div>
  </div>
</body>
</html>`;

      const fromEmail = env.EMAIL_FROM || 'noreply@resend.dev';

      await emailService.send({
        from: fromEmail,
        to: user.email,
        subject: 'Reset Your Password',
        html: emailHtml,
      });
    } catch (err) {
      console.error('Failed to send password reset email:', err);
    }

    return json(req, {
      message: 'If an account exists with this email, a reset link has been sent.',
    });
  }

  if (req.method === 'POST' && path === '/api/auth/reset-password') {
    let body;
    try {
      body = await req.json();
    } catch {
      return error(req, 'Invalid JSON body', 400);
    }

    let token;
    let password;
    try {
      token = requireString(body.token, 'token and password are required', {
        trim: false,
      });
      password = requireString(body.password, 'token and password are required', { trim: false });
    } catch (err) {
      if (err instanceof ValidationError) {
        return error(req, err.message, 400);
      }
      throw err;
    }

    if (password.length < 8) {
      return error(req, 'Password must be at least 8 characters', 400);
    }

    const resetLimit = await checkRateLimit(env.CACHE, {
      action: 'auth-reset-password',
      subject: resolveRateLimitSubject(req),
      ...RATE_LIMITS.authResetPassword,
    });
    if (!resetLimit.allowed) {
      return error(req, 'Too many password reset attempts', 429, {
        retry_after: Math.ceil((resetLimit.resetAt - Date.now()) / 1000),
      });
    }

    const tokenHash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));
    const tokenHashHex = [...new Uint8Array(tokenHash)]
      .map((x) => x.toString(16).padStart(2, '0'))
      .join('');

    const resetRecord = await db.first(
      `SELECT user_id FROM password_reset_tokens
       WHERE token_hash = ? AND expires_at > unixepoch()`,
      [tokenHashHex]
    );

    if (!resetRecord) {
      return error(req, 'Invalid or expired reset token', 400);
    }

    const passwordHash = await hashPassword(password);
    await db.run(`UPDATE users SET password_hash = ?, updated_at = unixepoch() WHERE id = ?`, [
      passwordHash,
      resetRecord.user_id,
    ]);

    await db.run(`DELETE FROM password_reset_tokens WHERE token_hash = ?`, [tokenHashHex]);

    await db.run(`DELETE FROM refresh_tokens WHERE user_id = ?`, [resetRecord.user_id]);

    return json(req, {
      message: 'Password reset successful. Please log in with your new password.',
    });
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

  return null;
}
