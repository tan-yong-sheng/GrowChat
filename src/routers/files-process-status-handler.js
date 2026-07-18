/**
 * File process status handler (GET /api/files/:id/process/status)
 *
 * Returns extraction status for a document.
 */
import { json, error } from '../utils/response.js';
import { HTTP_STATUS } from '../shared/http-status.js';
import { getOwnedDocument, createFileContext } from './files-helpers.js';
export async function handleFileProcessStatus(
  req,
  env,
  ctx,
  user,
  documentId,
  requestContext = {}
) {
  const { logger, db } = createFileContext(env, requestContext);

  try {
    const owned = await getOwnedDocument({ req, db, documentId, userId: user.sub });
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
    return error(req, 'Failed to get status', HTTP_STATUS.INTERNAL_SERVER_ERROR);
  }
}
