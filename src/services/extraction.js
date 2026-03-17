/**
 * Document Extraction Service
 *
 * Handles extraction of text from uploaded documents
 * and chunking for semantic search embeddings
 */

/**
 * Extract text from a document based on content type
 * @param {string} contentType - MIME type of document
 * @param {ArrayBuffer} buffer - File buffer
 * @returns {Promise<string>} - Extracted text
 */
export async function extractText(env, contentType, buffer) {
  if (!contentType) throw new Error('Content type required');

  // Plain text - straightforward
  if (contentType === 'text/plain' || contentType === 'text/markdown') {
    const decoder = new TextDecoder();
    return decoder.decode(buffer);
  }

  // Images - OCR disabled
  if (contentType.startsWith('image/')) {
    throw new Error('Image extraction not supported (OCR disabled)');
  }

  // PDF - defer to Phase 3 (requires external service)
  if (contentType === 'application/pdf') {
    throw new Error('PDF extraction not yet supported. Please use text or image files.');
  }

  throw new Error(`Unsupported content type: ${contentType}`);
}

/**
 * Extract text from image (OCR disabled)
 * @param {Object} env - Worker environment
 * @param {ArrayBuffer} buffer - Image buffer
 * @returns {Promise<string>} - Extracted text
 */
async function extractTextFromImage() {
  throw new Error('Image extraction not supported (OCR disabled)');
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
    // Extract text
    const fullText = await extractText(env, contentType, buffer);

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
