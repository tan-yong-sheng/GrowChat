/**
 * Email Verification Router
 * Handles email verification and resend verification endpoints
 */

import db from '../db.js';
import { generateToken, hashToken, constantTimeEquals } from '../shared/crypto.js';

const VERIFICATION_TOKEN_EXPIRY_SECONDS = 24 * 60 * 60; // 24 hours

/**
 * Verify email address with token
 * @param {Object} params - Request parameters
 * @param {string} params.token - Verification token
 * @param {D1Database} params.db - Database instance (optional, uses default)
 * @returns {Promise<Response>}
 */
export async function verifyEmail({ token }) {
  if (!token) {
    return Response.json({ error: 'Token is required' }, { status: 400 });
  }

  const tokenHash = hashToken(token);

  // Find verification record
  const verification = await db
    .prepare('SELECT * FROM email_verifications WHERE token_hash = ?')
    .bind(tokenHash)
    .first();

  if (!verification) {
    return Response.json({ error: 'Invalid or expired token' }, { status: 400 });
  }

  // Check if token expired
  const now = Math.floor(Date.now() / 1000);
  if (verification.expires_at < now) {
    return Response.json({ error: 'Token has expired' }, { status: 400 });
  }

  // Mark user as verified and delete verification record
  await db.batch([
    db.prepare('UPDATE users SET account_status = ? WHERE id = ?').bind('active', verification.user_id),
    db.prepare('DELETE FROM email_verifications WHERE id = ?').bind(verification.id),
  ]);

  return Response.json({ message: 'Email verified successfully' });
}

/**
 * Resend verification email
 * @param {Object} params - Request parameters
 * @param {string} params.email - User email
 * @param {D1Database} params.db - Database instance (optional, uses default)
 * @param {Object} params.env - Environment variables (for email sending)
 * @returns {Promise<Response>}
 */
export async function resendVerification({ email, env }) {
  if (!email) {
    return Response.json({ error: 'Email is required' }, { status: 400 });
  }

  // Find user
  const user = await db
    .prepare('SELECT * FROM users WHERE email = ?')
    .bind(email)
    .first();

  // Return success even if user not found (prevents email enumeration)
  if (!user) {
    return Response.json({ message: 'If the email exists, a verification email has been sent' });
  }

  // If already verified, return success without sending
  if (user.account_status === 'active') {
    return Response.json({ message: 'If the email exists, a verification email has been sent' });
  }

  // Generate new verification token
  const token = generateToken();
  const tokenHash = hashToken(token);
  const expiresAt = Math.floor(Date.now() / 1000) + VERIFICATION_TOKEN_EXPIRY_SECONDS;
  const verificationId = crypto.randomUUID();

  // Delete any existing verification tokens for this user
  await db.prepare('DELETE FROM email_verifications WHERE user_id = ?').bind(user.id).run();

  // Insert new verification token
  await db
    .prepare('INSERT INTO email_verifications (id, user_id, token_hash, expires_at) VALUES (?, ?, ?, ?)')
    .bind(verificationId, user.id, tokenHash, expiresAt)
    .run();

  // TODO: Send verification email via Resend
  // For now, just log the verification URL
  console.log(`Verification URL: ${env?.BASE_URL || 'http://localhost:8787'}/verify-email?token=${token}`);

  return Response.json({ message: 'If the email exists, a verification email has been sent' });
}

/**
 * Create email verification for a new user
 * @param {string} userId - User ID
 * @param {string} email - User email
 * @param {Object} env - Environment variables
 * @returns {Promise<string>} - Verification token
 */
export async function createEmailVerification(userId, email, env) {
  const token = generateToken();
  const tokenHash = hashToken(token);
  const expiresAt = Math.floor(Date.now() / 1000) + VERIFICATION_TOKEN_EXPIRY_SECONDS;
  const verificationId = crypto.randomUUID();

  await db
    .prepare('INSERT INTO email_verifications (id, user_id, token_hash, expires_at) VALUES (?, ?, ?, ?)')
    .bind(verificationId, userId, tokenHash, expiresAt)
    .run();

  // TODO: Send verification email via Resend
  console.log(`Verification URL for ${email}: ${env?.BASE_URL || 'http://localhost:8787'}/verify-email?token=${token}`);

  return token;
}

export default {
  verifyEmail,
  resendVerification,
  createEmailVerification,
};
