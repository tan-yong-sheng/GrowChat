/**
 * File content handler (GET /api/files/:id/content)
 *
 * Returns safe text representation of a file's content based on its type.
 */
import { createDB } from '../db.js';
import { json, error } from '../utils/response.js';
import { createLogger } from '../utils/logger.js';
import { HTTP_STATUS } from '../shared/http-status.js';
import { RATE_LIMITS, checkRateLimit } from '../services/rate-limit.js';
import { requireOwnedDocument } from '../services/uploads.js';

/**
 * Resolves file content representation based on document type.
 */
function resolveFileContent(doc) {
  if (doc.content_type?.startsWith('application/json')) {
    try {
      return JSON.parse(doc.text_excerpt || '{}');
    } catch {
      return { error: 'Failed to parse JSON content' };
    }
  }
  if (doc.content_type?.startsWith('text/')) {
    return doc.text_excerpt || '[No text content extracted]';
  }
  return {
    filename: doc.filename,
    type: doc.content_type,
    status: doc.extraction_status === 1 ? 'extracted' : 'pending',
    note: 'Binary file - text excerpt not available',
  };
}

// eslint-disable-next-line max-params -- router dispatcher pattern (req, env, ctx, user, documentId, requestContext)
export async function handleFileContent(req, env, ctx, user, documentId, requestContext = {}) {
  const logger =
    requestContext.logger || createLogger(env, { requestId: requestContext.requestId });
  const downloadLimit = await checkRateLimit(env, {
    action: 'file-download',
    subject: user.sub,
    ...RATE_LIMITS.fileDownload,
  });
  if (!downloadLimit.allowed) {
    return error(req, 'Too many file downloads', HTTP_STATUS.TOO_MANY_REQUESTS, {
      retry_after: Math.ceil((downloadLimit.resetAt - Date.now()) / 1000),
    });
  }

  const db = createDB(env.DB);

  try {
    const owned = await requireOwnedDocument({ req, db, documentId, userId: user.sub });
    if (owned.error) return owned.error;
    const doc = owned.doc;

    const content = resolveFileContent(doc);

    return json(req, {
      id: doc.id,
      filename: doc.filename,
      type: doc.content_type,
      content,
      extracted: doc.extraction_status === 1,
    });
  } catch (err) {
    logger.error('Get file content failed', { error: err?.message || err });
    return error(req, 'Failed to get content', HTTP_STATUS.INTERNAL_SERVER_ERROR);
  }
}
