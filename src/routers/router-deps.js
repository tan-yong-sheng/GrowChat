/**
 * Router Dependency Provider
 *
 * Shared boilerplate for creating DB and logger instances used by
 * domain-specific router handlers.
 *
 * All routers follow the signature:
 *   async function someRouter(req, env, ctx, user, path, requestContext = {})
 * and construct deps = { db, logger, requestContext } for sub-handlers.
 *
 * Usage:
 *   import { createDB } from '../db.js';
 *   import { createLogger } from '../utils/logger.js';
 *   import { createRouterDeps } from './router-deps.js';
 *
 *   const deps = createRouterDeps(env, requestContext);
 *   // Then delegate to handlers...
 *
 * This eliminates the duplicated { createDB, createLogger } import pair
 * and the replicated { db, logger, requestContext } construction.
 */
import { createDB } from '../db.js';
import { createLogger } from '../utils/logger.js';

/**
 * Build the standard deps object for a router handler.
 *
 * @param {import('../../types').Env} env - Cloudflare Worker env
 * @param {object} [requestContext] - Optional request context with requestId
 * @returns {{ db: import('../db.js').DB, logger: import('../utils/logger.js').Logger, requestContext: object | undefined }}
 */
export function createRouterDeps(env, requestContext = {}) {
  const logger =
    requestContext.logger || createLogger(env, { requestId: requestContext.requestId });
  const db = createDB(env.DB);
  return { db, logger, requestContext };
}
