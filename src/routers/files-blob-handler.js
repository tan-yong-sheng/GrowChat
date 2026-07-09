/**
 * File blob handler (GET /api/files/:id/blob)
 *
 * Returns raw file contents from R2 with authorization and ownership check.
 */
import { createDB } from '../db.js';
import { error } from '../utils/response.js';
import { createLogger } from '../utils/logger.js';
import { HTTP_STATUS } from '../shared/http-status.js';
import { RATE_LIMITS, checkRateLimit } from '../services/rate-limit.js';
import { requireOwnedDocument } from '../services/uploads.js';

/**
 * Resolves the R2 object blob for a document and returns it as a Response.
 */
async function resolveBlobResponse(opts) {
  const owned = await requireOwnedDocument({
    req: opts.req,
    db: opts.db,
    documentId: opts.documentId,
    userId: opts.userId,
  });
  if (owned.error) return owned.error;
  const doc = owned.doc;

  const object = await opts.files.get(doc.r2_key);
  if (!object || !object.body) return error(opts.req, 'File not found', HTTP_STATUS.NOT_FOUND);

  const safeName = String(doc.filename || 'file').replace(/["\\]/g, '_');
  const headers = new Headers();
  headers.set(
    'Content-Type',
    doc.content_type || object.httpMetadata?.contentType || 'application/octet-stream'
  );
  headers.set('Content-Disposition', `inline; filename="${safeName}"`);
  headers.set('Cache-Control', 'private, max-age=3600');

  return new Response(object.body, { status: HTTP_STATUS.OK, headers });
}

// eslint-disable-next-line max-params -- router dispatcher pattern (req, env, ctx, user, documentId, requestContext)
export async function handleFileBlob(req, env, ctx, user, documentId, requestContext = {}) {
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

  if (!env.FILES) return error(req, 'FILES binding missing', HTTP_STATUS.INTERNAL_SERVER_ERROR);

  const db = createDB(env.DB);

  try {
    return await resolveBlobResponse({ req, db, files: env.FILES, documentId, userId: user.sub });
  } catch (err) {
    logger.error('Get file blob failed', { error: err?.message || err });
    return error(req, 'Failed to fetch file', HTTP_STATUS.INTERNAL_SERVER_ERROR);
  }
}
