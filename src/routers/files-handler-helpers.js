/**
 * Shared file handler context (logger + rate-limit + DB).
 *
 * Both handleFileBlob and handleFileContent share this exact
 * preamble. Extracted here to avoid duplication.
 */
import { createDB } from '../db.js';
import { error } from '../utils/response.js';
import { createLogger } from '../utils/logger.js';
import { HTTP_STATUS } from '../shared/http-status.js';
import { RATE_LIMITS, checkRateLimit } from '../services/rate-limit.js';

/**
 * Prepare the common file-handler context: logger, rate-limit info, DB.
 *
 * Returns `{ ok: true, logger, downloadLimit, db }` on success,
 * or `{ ok: false, response }` when the rate limit is hit.
 *
 * @param {Request} req
 * @param {object} env
 * @param {object} requestContext
 * @param {{ sub: string }} user
 * @returns {Promise<{ok: boolean, logger?: object, downloadLimit?: object, db?: object, response?: Response}>}
 */
export async function prepareFileHandlerContext(req, env, requestContext, user) {
  const logger =
    requestContext.logger || createLogger(env, { requestId: requestContext.requestId });
  const downloadLimit = await checkRateLimit(env, {
    action: 'file-download',
    subject: user.sub,
    ...RATE_LIMITS.fileDownload,
  });
  if (!downloadLimit.allowed) {
    const retryAfter = Math.ceil((downloadLimit.resetAt - Date.now()) / 1000);
    return {
      ok: false,
      response: error(req, 'Too many file downloads', HTTP_STATUS.TOO_MANY_REQUESTS, {
        retry_after: retryAfter,
      }),
    };
  }

  const db = createDB(env.DB);

  return { ok: true, logger, downloadLimit, db };
}
