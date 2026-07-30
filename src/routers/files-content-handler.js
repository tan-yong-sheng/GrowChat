/**
 * File content handler (GET /api/files/:id/content)
 *
 * Returns safe text representation of a file's content based on its type.
 */
import { json, error } from '../utils/response.js';
import { HTTP_STATUS } from '../shared/http-status.js';
import { requireOwnedDocument } from '../services/uploads.js';
import { prepareFileHandlerContext } from './files-handler-helpers.js';

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
export async function handleFileContent({
  req,
  env,
  ctx: _ctx,
  user,
  documentId,
  requestContext = {},
}) {
  const ctx2 = await prepareFileHandlerContext(req, env, requestContext, user);
  if (!ctx2.ok) return ctx2.response;

  const { logger, db } = ctx2;

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
