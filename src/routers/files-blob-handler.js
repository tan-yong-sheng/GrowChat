/**
 * File blob handler (GET /api/files/:id/blob)
 *
 * Returns raw file contents from R2 with authorization and ownership check.
 */
import { error } from '../utils/response.js';
import { HTTP_STATUS } from '../shared/http-status.js';
import { requireOwnedDocument } from '../services/uploads.js';
import { prepareFileHandlerContext } from './files-handler-helpers.js';

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
  const ctx2 = await prepareFileHandlerContext(req, env, requestContext, user);
  if (!ctx2.ok) return ctx2.response;

  if (!env.FILES) return error(req, 'FILES binding missing', HTTP_STATUS.INTERNAL_SERVER_ERROR);

  const { logger, db } = ctx2;

  try {
    return await resolveBlobResponse({ req, db, files: env.FILES, documentId, userId: user.sub });
  } catch (err) {
    logger.error('Get file blob failed', { error: err?.message || err });
    return error(req, 'Failed to fetch file', HTTP_STATUS.INTERNAL_SERVER_ERROR);
  }
}
