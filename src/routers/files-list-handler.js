/**
 * File list handler (GET /api/files)
 *
 * Lists user's documents with pagination.
 */
import { createDB } from '../db.js';
import { json, error } from '../utils/response.js';
import { createLogger } from '../utils/logger.js';
import { RATE_LIMITS, checkRateLimit } from '../services/rate-limit.js';
import { listUserDocuments } from '../services/uploads.js';
import { HTTP_STATUS } from '../shared/http-status.js';
export async function handleFileList({ req, env, ctx: _ctx, user, requestContext = {} }) {
  const logger =
    requestContext.logger || createLogger(env, { requestId: requestContext.requestId });
  const listLimit = await checkRateLimit(env, {
    action: 'file-list',
    subject: user.sub,
    ...RATE_LIMITS.fileList,
  });
  if (!listLimit.allowed) {
    return error(req, 'Too many file lists', HTTP_STATUS.TOO_MANY_REQUESTS, {
      retry_after: Math.ceil((listLimit.resetAt - Date.now()) / 1000),
    });
  }

  const db = createDB(env.DB);
  const limit = Math.min(parseInt(new URL(req.url).searchParams.get('limit') || '20'), 100);
  const offset = parseInt(new URL(req.url).searchParams.get('offset') || '0');

  try {
    const documents = await listUserDocuments({ db, userId: user.sub, limit, offset });
    return json(req, { documents });
  } catch (err) {
    if (isMissingDocumentsTable(err)) {
      return json(req, { documents: [] });
    }
    logger.error('File list failed', { error: err?.message || err });
    return error(req, 'Failed to list documents', HTTP_STATUS.INTERNAL_SERVER_ERROR);
  }
}

function isMissingDocumentsTable(err) {
  return /no such table:\s*documents/i.test(String(err?.message || ''));
}
