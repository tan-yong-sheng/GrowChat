/**
 * Document Extraction Service
 *
 * Handles extraction of text from uploaded documents.
 * Vector chunking and embeddings were removed from this codebase.
 */

import { parseDocument } from './parsers/index.js';
import { createRootLogger } from '../utils/logger.js';
const logger = createRootLogger({});

async function handleSkippedExtraction({ db, documentId, reason } = {}) {
  const message = reason || 'Document extraction skipped';
  await db.run(
    `UPDATE documents SET extraction_status = -1, extraction_error = ?, updated_at = unixepoch()
     WHERE id = ?`,
    [message, documentId]
  );
  return { extractedText: '', excerptLength: 0, skipped: true, reason: message };
}

async function markExtractionSuccess({ db, documentId, excerpt } = {}) {
  await db.run(
    `UPDATE documents SET extraction_status = 1, text_excerpt = ?, updated_at = unixepoch()
     WHERE id = ?`,
    [excerpt, documentId]
  );
}

async function markExtractionFailed({ db, documentId, errorMessage } = {}) {
  await db.run(`UPDATE documents SET extraction_status = -1, extraction_error = ? WHERE id = ?`, [
    errorMessage,
    documentId,
  ]);
}

/**
 * Extract text from an uploaded document and store a preview excerpt.
 * @param {Object} options - Extraction options
 * @param {Object} options.env - Worker environment
 * @param {Object} options.db - Database connection
 * @param {string} options.documentId - Document ID
 * @param {string} options.contentType - MIME type
 * @param {ArrayBuffer} options.buffer - File buffer
 * @returns {Promise<Object>} - { extractedText, excerptLength, skipped?, reason? }
 */
export async function extractDocumentText({ env, db, documentId, contentType, buffer }) {
  try {
    const result = await parseDocument(env, { contentType, buffer });
    if (result?.skipped) {
      return handleSkippedExtraction({ db, documentId, reason: result.reason });
    }

    const fullText = result?.text || '';
    if (!fullText.trim()) {
      throw new Error('Document extraction resulted in empty text');
    }

    const excerpt = fullText.slice(0, 500);
    await markExtractionSuccess({ db, documentId, excerpt });

    return {
      extractedText: fullText,
      excerptLength: excerpt.length,
    };
  } catch (err) {
    const errorMessage = err?.message || String(err) || 'Unknown extraction error';
    logger.error('Document extraction failed', { documentId, error: errorMessage });
    await markExtractionFailed({ db, documentId, errorMessage });
    throw err;
  }
}
