/**
 * Structured JSON Logger for Cloudflare Workers
 *
 * Outputs structured JSON log entries with severity levels, requestId
 * injection, user correlation, and LOG_LEVEL env var filtering.
 *
 * Usage:
 *   import { createLogger } from '../utils/logger.js';
 *   const logger = createLogger(env);
 *   logger.info('Request processed', { path: '/api/chats', duration_ms: 12 });
 *   logger.error('DB query failed', { error: err.message });
 *
 * In request context (with requestId):
 *   const logger = createLogger(env, { requestId: 'abc-123', userId: 'user-456' });
 *   logger.info('Authenticated', { email: 'user@example.com' });
 */

const LEVEL_VALUES = { debug: 0, info: 1, warn: 2, error: 3 };

/**
 * Resolve the effective log level from env.
 * - env.LOG_LEVEL takes precedence (case-insensitive)
 * - Falls back to 'debug' when ENVIRONMENT=dev, otherwise 'info'
 */
export function resolveLogLevel(env) {
  const explicit = String(env?.LOG_LEVEL || '')
    .trim()
    .toLowerCase();
  if (LEVEL_VALUES[explicit] !== undefined) return explicit;

  const environment = String(env?.ENVIRONMENT || '')
    .trim()
    .toLowerCase();
  return environment === 'dev' || environment === 'development' ? 'debug' : 'info';
}

/**
 * Create a structured logger instance.
 *
 * @param {Object} env - Worker environment bindings (used for LOG_LEVEL)
 * @param {Object} [context={}] - Optional request context
 * @param {string} [context.requestId] - Per-request UUID
 * @param {string} [context.userId] - Authenticated user ID
 * @returns {Object} Logger with debug/info/warn/error methods
 */
export function createLogger(env, context = {}) {
  const level = resolveLogLevel(env);
  const levelValue = LEVEL_VALUES[level];

  function emit(entryLevel, message, data = {}) {
    const entryValue = LEVEL_VALUES[entryLevel];
    if (entryValue < levelValue) return;

    const entry = {
      level: entryLevel,
      timestamp: new Date().toISOString(),
      ...(context.requestId ? { requestId: context.requestId } : {}),
      ...(context.userId ? { userId: context.userId } : {}),
      ...(data && typeof data === 'object' ? data : {}),
      // Ensure the log message is never overwritten by data keys
      message: typeof message === 'string' ? message : String(message),
    };

    // Workers console output is captured by the platform logger.
    // Use the matching console method so severity is preserved in
    // Cloudflare's structured log viewer (Workers tail / wrangler tail).
    switch (entryLevel) {
      case 'debug':
        console.debug(JSON.stringify(entry));
        break;
      case 'info':
        console.info(JSON.stringify(entry));
        break;
      case 'warn':
        console.warn(JSON.stringify(entry));
        break;
      case 'error':
        console.error(JSON.stringify(entry));
        break;
    }
  }

  return {
    debug: (message, data) => emit('debug', message, data),
    info: (message, data) => emit('info', message, data),
    warn: (message, data) => emit('warn', message, data),
    error: (message, data) => emit('error', message, data),

    /** Current resolved log level (for introspection / testing) */
    level,

    /**
     * Create a child logger with additional context merged in.
     * Useful for adding userId after authentication.
     */
    child: (extraContext = {}) => createLogger(env, { ...context, ...extraContext }),
  };
}

/**
 * Root logger without request context — for use outside the request
 * lifecycle (e.g. Durable Object alarms, startup code).
 * Still respects LOG_LEVEL from env.
 */
export function createRootLogger(env) {
  return createLogger(env, {});
}
