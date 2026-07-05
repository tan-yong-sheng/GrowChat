/**
 * File delete handler (DELETE /api/files/:id)
 *
 * Deletes a document and its R2 file, with authorization and audit logging.
 */
import { createDB } from '../db.js';
import { json, error } from '../utils/response.js';
import { authorize, logAuditEvent } from '../utils/authorize.js';
import { createLogger } from '../utils/logger.js';
import { deleteDocument } from '../services/uploads.js';

export async function handleFileDelete(req, env, ctx, user, documentId, requestContext = {}) {
  const logger =
    requestContext.logger || createLogger(env, { requestId: requestContext.requestId });
  const authDecision = await authorize(env, user, {
    action: 'file.delete',
    resource: 'file',
    resourceId: documentId,
  });
  if (!authDecision.allow) {
    const statusMap = { server_error: 500, unauthorized: 401, not_found: 404 };
    return error(req, authDecision.reason || 'Forbidden', statusMap[authDecision.code] || 403);
  }

  const db = createDB(env.DB);

  try {
    await deleteDocument({ env, db, documentId, userId: user.sub });

    await logAuditEvent(env, {
      actor_id: user.sub,
      action: 'file_deleted',
      resource_type: 'file',
      resource_id: documentId,
    });

    return json(req, { success: true });
  } catch (err) {
    logger.error('Delete document failed', { error: err?.message || err });
    if (err.message === 'Document not found') {
      return error(req, 'Not found', 404);
    }
    return error(req, 'Failed to delete document', 500);
  }
}
