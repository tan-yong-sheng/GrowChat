import { createRootLogger } from '../utils/logger.js';
const logger = createRootLogger({});

/**
 * CSRF Protection Service
 *
 * Implements token-based CSRF protection for state-changing operations.
 * Tokens are stored in KV with TTL and validated on each request.
 */

const CSRF_KEY_PREFIX = 'csrf:';
const CSRF_TOKEN_TTL_SECONDS = 3600; // 1 hour

/**
 * Generate a new CSRF token and store it in KV
 * @param {Object} env - Worker environment with SESSIONS KV binding
 * @param {string} sessionId - Session identifier to bind token to
 * @returns {Promise<string>} The generated CSRF token
 */
export async function generateCsrfToken(env, sessionId) {
  if (!env?.SESSIONS) {
    throw new Error('SESSIONS KV binding is required for CSRF protection');
  }

  const token = crypto.randomUUID();
  const key = `${CSRF_KEY_PREFIX}${token}`;

  try {
    await env.SESSIONS.put(
      key,
      JSON.stringify({
        sessionId,
        createdAt: Date.now(),
      }),
      { expirationTtl: CSRF_TOKEN_TTL_SECONDS }
    );
  } catch (err) {
    logger.error('Failed to store CSRF token', { error: err?.message || err });
    throw new Error('Failed to generate CSRF token', { cause: err });
  }

  return token;
}

/**
 * Validate a CSRF token and consume it (one-time use)
 * @param {Object} options
 * @param {Object} options.env - Worker environment with SESSIONS KV binding
 * @param {string} options.token - Token to validate
 * @param {string} options.sessionId - Expected session identifier
 * @returns {Promise<boolean>} True if token is valid, false otherwise
 */
export async function validateCsrfToken({ env, token, sessionId } = {}) {
  if (!env?.SESSIONS) {
    logger.warn('SESSIONS KV binding is required for CSRF validation');
    return false;
  }

  if (!token) {
    return false;
  }

  const key = `${CSRF_KEY_PREFIX}${token}`;

  try {
    const stored = await env.SESSIONS.get(key, 'json');

    if (!stored) {
      return false;
    }

    // Verify session ID matches
    if (stored.sessionId !== sessionId) {
      return false;
    }

    // Consume token (one-time use)
    await env.SESSIONS.delete(key);

    return true;
  } catch (err) {
    logger.error('Failed to validate CSRF token', { error: err?.message || err });
    return false;
  }
}

/**
 * Middleware to require CSRF token on state-changing requests
 * @param {Object} options
 * @param {Request} options.req - The incoming request
 * @param {Object} options.env - Worker environment
 * @param {string} options.sessionId - Current session ID
 * @returns {Object|null} Error response if validation fails, null if valid
 */
export async function requireCsrfToken({ req, env, sessionId } = {}) {
  // GET, HEAD, OPTIONS requests don't need CSRF protection
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
    return null;
  }

  const token = req.headers.get('X-CSRF-Token');

  if (!token) {
    return {
      status: 403,
      body: { error: 'CSRF token is required' },
    };
  }

  const isValid = await validateCsrfToken({ env, token, sessionId });

  if (!isValid) {
    return {
      status: 403,
      body: { error: 'Invalid or expired CSRF token' },
    };
  }

  return null;
}
