import { error, json } from '../utils/response.js';
import { hashPassword } from '../shared/auth.js';
import { requireString, validateEmail } from '../validation/request.js';
import { RATE_LIMITS, checkRateLimit, resolveRateLimitSubject } from '../services/rate-limit.js';
import { createEmailService } from '../services/email/email-service.js';
import { escapeHtml } from '../utils/sanitize.js';
import { createLogger } from '../utils/logger.js';
import { ValidationError } from '../errors/http-errors.js';

const PASSWORD_RESET_TTL_SECONDS = 3600;
const PASSWORD_RESET_TTL_DISPLAY = '1 hour';

export async function handleForgotPassword(req, env, db, users, requestContext = {}) {
  const logger =
    requestContext.logger || createLogger(env, { requestId: requestContext.requestId });

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

  // Check APP_PUBLIC_ORIGIN as a precondition — must be set before any DB write
  const origin = env.APP_PUBLIC_ORIGIN;
  if (!origin) {
    logger.error('APP_PUBLIC_ORIGIN is not configured — password reset link origin unknown');
    // Return same fake-OK as missing-user to avoid email enumeration
    return json(req, {
      message: 'If an account exists with this email, a reset link has been sent.',
    });
  }

  const resetToken = crypto.getRandomValues(new Uint8Array(32));
  const resetTokenHex = [...resetToken].map((x) => x.toString(16).padStart(2, '0')).join('');

  const tokenHash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(resetTokenHex));
  const tokenHashHex = [...new Uint8Array(tokenHash)]
    .map((x) => x.toString(16).padStart(2, '0'))
    .join('');

  const expiresAt = Math.floor(Date.now() / 1000) + PASSWORD_RESET_TTL_SECONDS;

  await db.run(
    `INSERT INTO password_reset_tokens (id, user_id, token_hash, expires_at, created_at) VALUES (?, ?, ?, ?, unixepoch())`,
    [crypto.randomUUID(), user.id, tokenHashHex, expiresAt]
  );

  try {
    const emailService = createEmailService(env);
    const userNameEscaped = escapeHtml(user.name);

    const resetLink = `${origin}/auth/reset-password?token=${resetTokenHex}`;
    const emailHtml = buildPasswordResetEmailHtml(userNameEscaped, resetLink);
    const fromEmail = env.EMAIL_FROM || 'noreply@resend.dev';
    await emailService.send({
      from: fromEmail,
      to: user.email,
      subject: 'Reset Your Password',
      html: emailHtml,
    });
  } catch (err) {
    logger.error('Failed to send password reset email', { error: err?.message || err });
  }

  return json(req, {
    message: 'If an account exists with this email, a reset link has been sent.',
  });
}

export async function handleResetPassword(req, env, db) {
  let body;
  try {
    body = await req.json();
  } catch {
    return error(req, 'Invalid JSON body', 400);
  }

  let token;
  let password;
  try {
    token = requireString(body.token, 'token and password are required', { trim: false });
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
    `SELECT user_id FROM password_reset_tokens WHERE token_hash = ? AND expires_at > unixepoch()`,
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
  await db.run(`DELETE FROM password_reset_tokens WHERE user_id = ?`, [resetRecord.user_id]);
  // Invalidate all KV-backed refresh tokens by bumping the user's session version.
  // consumeRefreshToken() checks session-version and rejects tokens with an
  // older version, so this effectively revokes all existing sessions.
  try {
    const versionKey = `session-version:${resetRecord.user_id}`;
    const currentVersion = await env.SESSIONS.get(versionKey);
    await env.SESSIONS.put(versionKey, String(Number(currentVersion || 0) + 1), {
      expirationTtl: 60 * 60 * 24 * 30,
    });
  } catch (e) {
    // KV unavailability should not block password reset
  }

  return json(req, {
    message: 'Password reset successful. Please log in with your new password.',
  });
}

function buildPasswordResetEmailHtml(userNameEscaped, resetLink) {
  return `<!DOCTYPE html>
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
@media (max-width: 600px) { .container { border-radius: 0; } .content { padding: 30px 20px; } .header { padding: 30px 20px; } .header h1 { font-size: 24px; } .button { display: block; width: 100%; box-sizing: border-box; } }
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
}
