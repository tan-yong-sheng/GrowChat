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
 *
 * Module-level root loggers (outside request lifecycle):
 *   import { createRootLogger } from '../utils/logger.js';
 *   const logger = createRootLogger({});
 *   // Later, when env becomes available (e.g. in first request):
 *   logger.reconfigure(env);
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
  let level = resolveLogLevel(env);
  let levelValue = LEVEL_VALUES[level];

  function emit(entryLevel, message, data = {}) {
    const entryValue = LEVEL_VALUES[entryLevel];
    if (entryValue < levelValue) return;

    // Wrap arrays and non-objects in a `data` key to avoid spreading
    // indexed keys (e.g. {"0": ...}) or primitive values into the entry.
    const safeData = data && typeof data === 'object' && !Array.isArray(data) ? data : { data };

    // Build entry with reserved fields protected from data key collisions.
    // Reserved keys (level, timestamp, message) are assigned LAST so they
    // always take precedence over any overlapping keys in data/context.
    const entry = {
      ...safeData,
      ...context,
      level: entryLevel,
      timestamp: new Date().toISOString(),
      message: typeof message === 'string' ? message : String(message),
    };

    // Workers console output is captured by the platform logger.
    // Use the matching console method so severity is preserved in
    // Cloudflare's structured log viewer (Workers tail / wrangler tail).
    // Wrap JSON.stringify in try-catch to prevent circular reference crashes.
    try {
      const output = JSON.stringify(entry);
      switch (entryLevel) {
        case 'debug':
          console.debug(output);
          break;
        case 'info':
          console.info(output);
          break;
        case 'warn':
          console.warn(output);
          break;
        case 'error':
          console.error(output);
          break;
      }
    } catch (err) {
      // Fallback: log a safe entry if serialization fails (e.g. circular refs)
      const fallback = JSON.stringify({
        level: entryLevel,
        message: typeof message === 'string' ? message : String(message),
        timestamp: new Date().toISOString(),
        error: 'Logger serialization failed',
        originalError: err?.message || String(err),
      });
      console.error(fallback);
    }
  }

  return {
    debug: (message, data) => emit('debug', message, data),
    info: (message, data) => emit('info', message, data),
    warn: (message, data) => emit('warn', message, data),
    error: (message, data) => emit('error', message, data),

    /** Current resolved log level (for introspection / testing) */
    get level() {
      return level;
    },

    /**
     * Reconfigure the logger with a new env (e.g. when env becomes
     * available in the first request for module-level root loggers).
     * Updates the log level but preserves the existing context.
     */
    reconfigure(newEnv) {
      level = resolveLogLevel(newEnv);
      levelValue = LEVEL_VALUES[level];
    },

    /**
     * Create a child logger with additional context merged in.
     * Useful for adding userId after authentication.
     */
    child: (extraContext = {}) => createLogger(env, { ...context, ...extraContext }),
  };
}

/**
 * Root logger without request context — for use outside the request
 * lifecycle (e.g. Durable Object alarms, startup code, module-level utils).
 *
 * IMPORTANT: In Cloudflare Workers, env bindings are only available inside
 * the fetch handler. Module-level root loggers created with createRootLogger({})
 * will default to 'info' level. Call reconfigureAllRootLoggers(env) once env
 * is available (e.g. in the first request handler) to respect LOG_LEVEL from
 * wrangler.jsonc.
 */

// Registry of all root loggers for bulk reconfiguration
const rootLoggerRegistry = [];

export function createRootLogger(env) {
  const logger = createLogger(env, {});
  rootLoggerRegistry.push(logger);
  return logger;
}

/**
 * Reconfigure all module-level root loggers with the given env.
 * Call this once from the first request handler (src/index.js) so that
 * LOG_LEVEL from wrangler.jsonc takes effect for all root loggers.
 */
export function reconfigureAllRootLoggers(env) {
  for (const logger of rootLoggerRegistry) {
    logger.reconfigure(env);
  }
}
