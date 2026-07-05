/**
 * File process status handler (GET /api/files/:id/process/status)
 *
 * Returns extraction status for a document.
 */
import { createDB } from '../db.js';
import { json, error } from '../utils/response.js';
import { createLogger } from '../utils/logger.js';
import { requireOwnedDocument } from '../services/uploads.js';

export async function handleFileProcessStatus(
  req,
  env,
  ctx,
  user,
  documentId,
  requestContext = {}
) {
  const logger =
    requestContext.logger || createLogger(env, { requestId: requestContext.requestId });
  const db = createDB(env.DB);

  try {
    const owned = await requireOwnedDocument({ req, db, documentId, userId: user.sub });
    if (owned.error) return owned.error;
    const doc = owned.doc;

    const extractionState =
      doc.extraction_status === 1 ? 'done' : doc.extraction_status === -1 ? 'failed' : 'pending';

    return json(req, {
      id: doc.id,
      filename: doc.filename,
      extraction: { status: extractionState, error: doc.extraction_error || null },
      created_at: doc.created_at,
      updated_at: doc.updated_at,
    });
  } catch (err) {
    logger.error('Get process status failed', { error: err?.message || err });
    return error(req, 'Failed to get status', 500);
  }
}
