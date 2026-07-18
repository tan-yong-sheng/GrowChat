/**
 * File get handler (GET /api/files/:id)
 *
 * Gets document metadata by ID.
 */
import { json, error } from '../utils/response.js';
import { getOwnedDocument, createFileContext } from './files-helpers.js';
import { HTTP_STATUS } from '../shared/http-status.js';
export async function handleFileGet(req, env, ctx, user, documentId, requestContext = {}) {
  const { logger, db } = createFileContext(env, requestContext);

  try {
    const owned = await getOwnedDocument({ req, db, documentId, userId: user.sub });
    if (owned.error) return owned.error;
    return json(req, owned.doc);
  } catch (err) {
    logger.error('Get document failed', { error: err?.message || err });
    return error(req, 'Failed to get document', HTTP_STATUS.INTERNAL_SERVER_ERROR);
  }
}
