/**
 * Shared ownership check helper for file routes
 *
 * Wraps requireOwnedDocument so callers don't repeat the call+check.
 * Returns { doc } on success or { error: Response } when ownership is denied.
 * Does NOT catch — callers handle their own catch with specific messages.
 */

import { requireOwnedDocument } from '../services/uploads.js';

/**
 * @param {{ req: Request, db: object, documentId: string, userId: string }} opts
 * @returns {Promise<{ doc: object }|{ error: Response }>}
 */
export async function getOwnedDocument({ req, db, documentId, userId }) {
  const owned = await requireOwnedDocument({ req, db, documentId, userId });
  if (owned.error) return { error: owned.error };
  return { doc: owned.doc };
}
