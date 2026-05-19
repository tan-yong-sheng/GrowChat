import { createRootLogger } from '../utils/logger.js';
const logger = createRootLogger({});

/**
 * Security Audit Logging Service
 *
 * Logs security-relevant events for monitoring and compliance.
 * Events are stored in KV with timestamps for later analysis.
 */

const AUDIT_LOG_PREFIX = 'audit:';
const AUDIT_LOG_TTL_DAYS = 90;
const AUDIT_LOG_TTL_SECONDS = AUDIT_LOG_TTL_DAYS * 24 * 60 * 60;

/**
 * Security event types
 */
export const SecurityEventTypes = {
  LOGIN_SUCCESS: 'login_success',
  LOGIN_FAILURE: 'login_failure',
  LOGIN_ATTEMPT_BLOCKED: 'login_attempt_blocked',
  PASSWORD_RESET_REQUESTED: 'password_reset_requested',
  PASSWORD_RESET_SUCCESS: 'password_reset_success',
  API_KEY_CREATED: 'api_key_created',
  API_KEY_REVOKED: 'api_key_revoked',
  UNAUTHORIZED_ACCESS_ATTEMPT: 'unauthorized_access_attempt',
  CSRF_TOKEN_VALIDATION_FAILED: 'csrf_token_validation_failed',
  SUSPICIOUS_ACTIVITY: 'suspicious_activity',
};

/**
 * Log a security event
 * @param {Object} env - Worker environment with SESSIONS KV binding
 * @param {string} eventType - Type of security event
 * @param {Object} details - Event details (userId, ip, endpoint, etc.)
 * @returns {Promise<void>}
 */
export async function logSecurityEvent(env, eventType, details = {}) {
  if (!env?.SESSIONS) {
    logger.warn('SESSIONS KV binding required for audit logging');
    return;
  }

  const timestamp = new Date().toISOString();
  const eventId = `${AUDIT_LOG_PREFIX}${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;

  const event = {
    id: eventId,
    type: eventType,
    timestamp,
    ...details,
  };

  try {
    await env.SESSIONS.put(eventId, JSON.stringify(event), {
      expirationTtl: AUDIT_LOG_TTL_SECONDS,
    });
  } catch (err) {
    logger.error('Failed to log security event', { error: err?.message || err });
    // Don't throw - audit logging should not break the application
  }
}

/**
 * Track failed login attempts for rate limiting
 * @param {Object} env - Worker environment
 * @param {string} email - User email
 * @returns {Promise<number>} Number of failed attempts in the last hour
 */
export async function trackFailedLoginAttempt(env, email) {
  if (!env?.SESSIONS) return 0;

  const key = `login_attempts:${email}`;
  const now = Date.now();
  const oneHourAgo = now - 60 * 60 * 1000;

  try {
    const stored = await env.SESSIONS.get(key, 'json');
    let attempts = stored?.attempts || [];

    // Filter out attempts older than 1 hour
    attempts = attempts.filter((timestamp) => timestamp > oneHourAgo);

    // Add current attempt
    attempts.push(now);

    // Store updated attempts
    await env.SESSIONS.put(
      key,
      JSON.stringify({ attempts, email }),
      { expirationTtl: 3600 } // 1 hour
    );

    return attempts.length;
  } catch (err) {
    logger.error('Failed to track login attempt', { error: err?.message || err });
    return 0;
  }
}

/**
 * Clear failed login attempts for a user
 * @param {Object} env - Worker environment
 * @param {string} email - User email
 * @returns {Promise<void>}
 */
export async function clearFailedLoginAttempts(env, email) {
  if (!env?.SESSIONS) return;

  const key = `login_attempts:${email}`;

  try {
    await env.SESSIONS.delete(key);
  } catch (err) {
    logger.error('Failed to clear login attempts', { error: err?.message || err });
  }
}

/**
 * Check if account should be locked due to too many failed attempts
 * @param {number} failedAttempts - Number of failed attempts
 * @param {number} maxAttempts - Maximum allowed attempts (default: 5)
 * @returns {boolean} True if account should be locked
 */
export function shouldLockAccount(failedAttempts, maxAttempts = 5) {
  return failedAttempts >= maxAttempts;
}
