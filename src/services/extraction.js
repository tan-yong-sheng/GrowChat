/**
 * Document Extraction Service
 *
 * Handles extraction of text from uploaded documents
 * and chunking for semantic search embeddings
 */

import { parseDocument } from './parsers/index.js';

/**
 * Extract text from a document based on content type
 * @param {Object} env - Worker environment
 * @param {string} contentType - MIME type of document
 * @param {ArrayBuffer} buffer - File buffer
 * @returns {Promise<string>} - Extracted text
 */
export async function extractText(env, contentType, buffer) {
  if (!contentType) throw new Error('Content type required');
  const result = await parseDocument(env, { contentType, buffer });
  if (result?.skipped) {
    throw new Error(result.reason || 'Document extraction skipped');
  }
  const text = result?.text || '';
  if (!text.trim()) {
    throw new Error('Document extraction resulted in empty text');
  }
  return text;
}

/**
 * Chunk text into overlapping segments
 * @param {string} text - Full text to chunk
 * @param {number} chunkSize - Size of each chunk in characters (default: 500)
 * @param {number} overlap - Character overlap between chunks (default: 50)
 * @returns {Array<Object>} - Array of {text, index}
 */
export function chunkText(text, chunkSize = 500, overlap = 50) {
  if (!text || typeof text !== 'string') return [];

  const chunks = [];
  let startIdx = 0;
  let chunkIndex = 0;

  while (startIdx < text.length) {
    const endIdx = Math.min(startIdx + chunkSize, text.length);
    const chunkText = text.slice(startIdx, endIdx);

    if (chunkText.trim().length > 0) {
      chunks.push({
        text: chunkText,
        index: chunkIndex,
      });
      chunkIndex++;
    }

    // Move to next chunk, accounting for overlap
    startIdx = endIdx - overlap;

    // Avoid infinite loop on very short text
    if (startIdx >= text.length) break;
  }

  return chunks.length > 0 ? chunks : [];
}

/**
 * Extract text and create chunks (used during file upload)
 * @param {Object} env - Worker environment
 * @param {Object} db - Database connection
 * @param {string} documentId - Document ID
 * @param {string} contentType - MIME type
 * @param {ArrayBuffer} buffer - File buffer
 * @returns {Promise<Object>} - {extractedText, chunkCount, error?}
 */
export async function extractAndChunk(env, db, documentId, contentType, buffer) {
  try {
    const result = await parseDocument(env, { contentType, buffer });
    if (result?.skipped) {
      const reason = result.reason || 'Document extraction skipped';
      await db.run(
        `UPDATE documents SET extraction_status = -1, extraction_error = ?, updated_at = unixepoch()
         WHERE id = ?`,
        [reason, documentId]
      );
      return { extractedText: '', chunkCount: 0, skipped: true, reason };
    }

    const fullText = result?.text || '';

    if (!fullText || fullText.trim().length === 0) {
      throw new Error('Document extraction resulted in empty text');
    }

    // Create chunks
    const chunks = chunkText(fullText, 500, 50);

    if (!chunks.length) {
      throw new Error('Text chunking failed');
    }

    // Store chunks in D1
    for (const chunk of chunks) {
      const chunkId = crypto.randomUUID();
      await db.run(
        `INSERT INTO document_chunks
         (id, document_id, chunk_index, chunk_text, embedding_generated, created_at)
         VALUES (?, ?, ?, ?, 0, unixepoch())`,
        [chunkId, documentId, chunk.index, chunk.text]
      );
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
      chunkCount: chunks.length,
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
