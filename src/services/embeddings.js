/**
 * Embedding Service (disabled)
 *
 * Embeddings are disabled for now. These helpers are kept as no-ops so the
 * rest of the codebase can run without external vector services.
 */

export async function generateEmbedding(_env, _text) {
  throw new Error('Embeddings are disabled');
}

export async function upsertFAQ(_env, db, faqId) {
  if (db && faqId) {
    try {
      await db.run(
        'UPDATE faqs SET embedding_generated = 0, embedding_error = ? WHERE id = ?',
        ['Embeddings disabled', faqId]
      );
    } catch {}
  }
  return { id: faqId, vector_id: null, embedding_generated: 0 };
}

export async function queryFAQs() {
  return [];
}

export async function deleteFAQEmbedding() {
  return;
}

export async function upsertDocumentChunks(_env, db, chunks = []) {
  if (db && Array.isArray(chunks) && chunks.length) {
    try {
      for (const chunk of chunks) {
        await db.run(
          'UPDATE document_chunks SET embedding_generated = 0, vector_id = NULL WHERE id = ?',
          [chunk.id]
        );
      }
    } catch {}
  }
  return { success: false, uploaded: 0, failed: Array.isArray(chunks) ? chunks.length : 0 };
}

export async function queryDocumentChunks() {
  return [];
}
