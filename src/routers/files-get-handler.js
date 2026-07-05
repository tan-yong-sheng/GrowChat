/**
 * File get handler (GET /api/files/:id)
 *
 * Gets document metadata by ID.
 */
import { createDB } from '../db.js';
import { json, error } from '../utils/response.js';
import { createLogger } from '../utils/logger.js';
import { requireOwnedDocument } from '../services/uploads.js';

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
    return error(req, 'Failed to get document', 500);
  }
}
