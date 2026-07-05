/**
 * File blob handler (GET /api/files/:id/blob)
 *
 * Returns raw file contents from R2 with authorization and ownership check.
 */
import { createDB } from '../db.js';
import { error } from '../utils/response.js';
import { createLogger } from '../utils/logger.js';
import { RATE_LIMITS, checkRateLimit } from '../services/rate-limit.js';
import { requireOwnedDocument } from '../services/uploads.js';

export async function handleFileBlob(req, env, ctx, user, documentId, requestContext = {}) {
  const logger =
    requestContext.logger || createLogger(env, { requestId: requestContext.requestId });
  const downloadLimit = await checkRateLimit(env, {
    action: 'file-download',
    subject: user.sub,
    ...RATE_LIMITS.fileDownload,
  });
  if (!downloadLimit.allowed) {
    return error(req, 'Too many file downloads', 429, {
      retry_after: Math.ceil((downloadLimit.resetAt - Date.now()) / 1000),
    });
  }

  if (!env.FILES) return error(req, 'FILES binding missing', 500);

  const db = createDB(env.DB);

  try {
    const owned = await requireOwnedDocument({ req, db, documentId, userId: user.sub });
    if (owned.error) return owned.error;
    const doc = owned.doc;

    const object = await env.FILES.get(doc.r2_key);
    if (!object || !object.body) return error(req, 'File not found', 404);

    const safeName = String(doc.filename || 'file').replace(/["\\]/g, '_');
    const headers = new Headers();
    headers.set(
      'Content-Type',
      doc.content_type || object.httpMetadata?.contentType || 'application/octet-stream'
    );
    headers.set('Content-Disposition', `inline; filename="${safeName}"`);
    headers.set('Cache-Control', 'private, max-age=3600');

    return new Response(object.body, { status: 200, headers });
  } catch (err) {
    logger.error('Get file blob failed', { error: err?.message || err });
    return error(req, 'Failed to fetch file', 500);
  }
}
