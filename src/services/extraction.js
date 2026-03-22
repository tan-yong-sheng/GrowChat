/**
 * Document Extraction Service
 *
 * Handles extraction of text from uploaded documents.
 * Vector chunking and embeddings were removed from this codebase.
 */

import { parseDocument } from './parsers/index.js';

/**
 * Extract text from an uploaded document and store a preview excerpt.
 * @param {Object} env - Worker environment
 * @param {Object} db - Database connection
 * @param {string} documentId - Document ID
 * @param {string} contentType - MIME type
 * @param {ArrayBuffer} buffer - File buffer
 * @returns {Promise<Object>} - { extractedText, excerptLength, skipped?, reason? }
 */
export async function extractDocumentText(env, db, documentId, contentType, buffer) {
  try {
    const result = await parseDocument(env, { contentType, buffer });
    if (result?.skipped) {
      const reason = result.reason || 'Document extraction skipped';
      await db.run(
        `UPDATE documents SET extraction_status = -1, extraction_error = ?, updated_at = unixepoch()
         WHERE id = ?`,
        [reason, documentId]
      );
      return { extractedText: '', excerptLength: 0, skipped: true, reason };
    }

    const fullText = result?.text || '';

    if (!fullText || fullText.trim().length === 0) {
      throw new Error('Document extraction resulted in empty text');
    }

    // Update document extraction status
    const excerpt = fullText.slice(0, 500);
    await db.run(
      `UPDATE documents SET extraction_status = 1, text_excerpt = ?, updated_at = unixepoch()
       WHERE id = ?`,
      [excerpt, documentId]
    );

    return {
      extractedText: fullText,
      excerptLength: excerpt.length,
    };
  } catch (err) {
    console.error(`Document extraction failed for ${documentId}:`, err);

    // Mark as failed in D1
    await db.run(
      `UPDATE documents SET extraction_status = -1, extraction_error = ? WHERE id = ?`,
      [err.message, documentId]
    );

    throw err;
  }
}
