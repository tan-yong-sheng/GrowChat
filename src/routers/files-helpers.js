/**
 * Shared ownership check helper for file routes
 *
 * Wraps requireOwnedDocument so callers don't repeat the call+check.
 * Returns { doc } on success or { error: Response } when ownership is denied.
 * Does NOT catch — callers handle their own catch with specific messages.
 */

import { createDB } from '../db.js';
import { requireOwnedDocument } from '../services/uploads.js';
import { createLogger } from '../utils/logger.js';

/**
 * @param {{ req: Request, db: object, documentId: string, userId: string }} opts
 * @returns {Promise<{ doc: object }|{ error: Response }>}
 */
export async function getOwnedDocument({ req, db, documentId, userId }) {
  const owned = await requireOwnedDocument({ req, db, documentId, userId });
  if (owned.error) return { error: owned.error };
  return { doc: owned.doc };
}

/**
 * Create shared file request context
 *
 * Wraps the common logger+DB+requestContext pattern
 * so all file-handler routes use the same initialization.
 */
export function createFileContext(env, requestContext) {
  const logger =
    requestContext.logger || createLogger(env, { requestId: requestContext.requestId });
  const db = createDB(env.DB);
  return { logger, db };
}

/**
 * Combined context + ownership check for file handlers.
 *
 * Wraps createFileContext + getOwnedDocument so
 * callers don't repeat the context creation and ownership check.
 * Returns { logger, db, doc } on success or { logger, db, error: Response } when denied.
 * Callers must still check .error and handle their own catch with specific messages.
 *
 * @param {{ req: Request, env: object, requestContext: object, documentId: string, userId: string }} opts
 * @returns {Promise<{ logger: object, db: object, doc: object }|{ logger: object, db: object, error: Response }>}
 */
export async function withOwnedFile({ req, env, requestContext, documentId, userId }) {
  const { logger, db } = createFileContext(env, requestContext);
  const owned = await getOwnedDocument({ req, db, documentId, userId });
  if (owned.error) return { logger, db, error: owned.error };
  return { logger, db, doc: owned.doc };
}
