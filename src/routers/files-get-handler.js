/**
 * File get handler (GET /api/files/:id)
 *
 * Gets document metadata by ID.
 */
import { createDB } from '../db.js';
import { json, error } from '../utils/response.js';
import { createLogger } from '../utils/logger.js';
import { requireOwnedDocument } from '../services/uploads.js';
import { HTTP_STATUS } from '../shared/http-status.js';

// eslint-disable-next-line max-params -- router dispatcher pattern (req, env, ctx, user, documentId, requestContext)
export async function handleFileGet(req, env, ctx, user, documentId, requestContext = {}) {
  const logger =
    requestContext.logger || createLogger(env, { requestId: requestContext.requestId });
  const db = createDB(env.DB);

  try {
    const owned = await requireOwnedDocument({ req, db, documentId, userId: user.sub });
    if (owned.error) return owned.error;
    return json(req, owned.doc);
  } catch (err) {
    logger.error('Get document failed', { error: err?.message || err });
    return error(req, 'Failed to get document', HTTP_STATUS.INTERNAL_SERVER_ERROR);
  }
}
