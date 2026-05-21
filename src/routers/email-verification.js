/**
 * Email Verification Router
 * Handles email verification and resend verification endpoints
 */

import { createDB } from '../db.js';
import { generateToken, hashTokenAsync } from '../shared/crypto.js';
import { createEmailService } from '../services/email/email-service.js';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

let emailTemplate = null;
function getEmailTemplate() {
  if (!emailTemplate) {
    try {
      emailTemplate = readFileSync(
        join(__dirname, '../services/email/templates/email-verification.html'),
        'utf-8'
      );
    } catch (error) {
      console.error('Failed to load email template:', error);
      emailTemplate = '<html>{{userName}} {{verificationUrl}}</html>';
    }
  }
  return emailTemplate;
}

const VERIFICATION_TOKEN_EXPIRY_SECONDS = 24 * 60 * 60; // 24 hours

/**
 * Verify email address with token
 * @param {Object} params - Request parameters
 * @param {string} params.token - Verification token
 * @param {D1Database} params.db - Database instance (optional, uses default)
 * @returns {Promise<Response>}
 */
export async function verifyEmail({ token, env }) {
  const db = env?.DB ? createDB(env.DB) : null;
  if (!db) {
    return Response.json({ error: 'Database unavailable' }, { status: 500 });
  }
  if (!token) {
    return Response.json({ error: 'Token is required' }, { status: 400 });
  }

  const tokenHash = await hashTokenAsync(token);

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
  if (verification.expires_at <= now) {
    return Response.json({ error: 'Token has expired' }, { status: 400 });
  }

  // Mark user as verified and delete verification record
  await db.batch([
    db
      .prepare('UPDATE users SET account_status = ? WHERE id = ?')
      .bind('active', verification.user_id),
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
  const db = env?.DB ? createDB(env.DB) : null;
  if (!db) {
    return Response.json({ error: 'Database unavailable' }, { status: 500 });
  }
  if (!email) {
    return Response.json({ error: 'Email is required' }, { status: 400 });
  }

  // Find user
  const user = await db.prepare('SELECT * FROM users WHERE email = ?').bind(email).first();

  // Return success even if user not found (prevents email enumeration)
  if (!user) {
    return Response.json({
      message: 'If the email exists, a verification email has been sent',
    });
  }

  // If already verified, return success without sending
  if (user.account_status === 'active') {
    return Response.json({
      message: 'If the email exists, a verification email has been sent',
    });
  }

  // Generate new verification token
  const token = generateToken();
  const tokenHash = await hashTokenAsync(token);
  const expiresAt = Math.floor(Date.now() / 1000) + VERIFICATION_TOKEN_EXPIRY_SECONDS;
  const verificationId = crypto.randomUUID();

  // Delete any existing verification tokens for this user
  await db.prepare('DELETE FROM email_verifications WHERE user_id = ?').bind(user.id).run();

  // Insert new verification token
  await db
    .prepare(
      'INSERT INTO email_verifications (id, user_id, token_hash, expires_at) VALUES (?, ?, ?, ?)'
    )
    .bind(verificationId, user.id, tokenHash, expiresAt)
    .run();

  // Send verification email
  try {
    const emailService = createEmailService(env);
    const verificationUrl = `${env.APP_URL || 'http://localhost:8787'}/verify?token=${token}`;
    const html = getEmailTemplate()
      .replace('{{userName}}', user.name || 'User')
      .replace('{{verificationUrl}}', verificationUrl);

    await emailService.send({
      to: email,
      subject: 'Verify your GrowChat email',
      html,
    });
  } catch (error) {
    console.error('Failed to send verification email:', error);
    // Don't fail the request if email send fails
  }

  return Response.json({
    message: 'If the email exists, a verification email has been sent',
  });
}

/**
 * Create email verification for a new user
 * @param {string} userId - User ID
 * @param {string} email - User email
 * @param {Object} env - Environment variables
 * @returns {Promise<string>} - Verification token
 */
export async function createEmailVerification(userId, email, env) {
  const db = env?.DB ? createDB(env.DB) : null;
  if (!db) {
    throw new Error('Database unavailable');
  }
  const token = generateToken();
  const tokenHash = await hashTokenAsync(token);
  const expiresAt = Math.floor(Date.now() / 1000) + VERIFICATION_TOKEN_EXPIRY_SECONDS;
  const verificationId = crypto.randomUUID();

  await db
    .prepare(
      'INSERT INTO email_verifications (id, user_id, token_hash, expires_at) VALUES (?, ?, ?, ?)'
    )
    .bind(verificationId, userId, tokenHash, expiresAt)
    .run();

  // Send verification email
  try {
    const emailService = createEmailService(env);
    const verificationUrl = `${env.APP_URL || 'http://localhost:8787'}/verify?token=${token}`;
    const html = getEmailTemplate()
      .replace('{{userName}}', 'User')
      .replace('{{verificationUrl}}', verificationUrl);

    await emailService.send({
      to: email,
      subject: 'Verify your GrowChat email',
      html,
    });
  } catch (error) {
    console.error('Failed to send verification email:', error);
    // Don't fail the request if email send fails
  }

  return token;
}

export default {
  verifyEmail,
  resendVerification,
  createEmailVerification,
};
