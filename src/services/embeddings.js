/**
 * Embedding Service
 *
 * Handles generation of vector embeddings using Workers AI
 * and querying of Vectorize indexes for semantic search
 */

/**
 * Generate embedding for a given text using Workers AI
 * @param {Object} env - Worker environment bindings
 * @param {string} text - Text to embed (should be <8192 tokens)
 * @returns {Promise<Array<number>>} - 768-dimensional embedding vector
 */
export async function generateEmbedding(env, text) {
  if (!env.AI) throw new Error('AI binding not configured');
  if (!text || typeof text !== 'string') throw new Error('Text required');

  try {
    const response = await env.AI.run('@cf/baai/bge-base-en-v1.5', {
      text: text.slice(0, 8192), // Truncate to 8K tokens
    });

    if (!response.data || !Array.isArray(response.data)) {
      throw new Error('Invalid embedding response');
    }

    return response.data;
  } catch (err) {
    console.error('Embedding generation failed:', err);
    throw new Error(`Embedding failed: ${err.message}`);
  }
}

function isVectorizeDisabled(env) {
  const raw = String(env?.DISABLE_VECTORIZE || '').toLowerCase();
  return raw === '1' || raw === 'true' || raw === 'yes';
}

/**
 * Insert or update an FAQ with embedding
 * @param {Object} env - Worker environment
 * @param {string} faqId - FAQ ID
 * @param {string} question - FAQ question
 * @param {string} answer - FAQ answer
 * @param {Object} metadata - Additional metadata
 * @returns {Promise<Object>} - Inserted FAQ with vector_id
 */
export async function upsertFAQ(env, db, faqId, question, answer, metadata = {}) {
  if (!env.VECTORIZE || isVectorizeDisabled(env)) throw new Error('VECTORIZE binding not configured');

  try {
    // Combine question + answer for embedding
    const embeddingText = `${question} ${answer}`;
    const embedding = await generateEmbedding(env, embeddingText);

    // Upsert into Vectorize
    const vectorizeResult = await env.VECTORIZE.upsert([
      {
        id: faqId,
        values: embedding,
        metadata: {
          type: 'faq',
          question,
          answer,
          ...metadata,
        },
      },
    ]);

    if (!vectorizeResult.success) {
      throw new Error('Vectorize upsert failed');
    }

    // Update FAQ record in D1
    await db.run(
      `UPDATE faqs SET embedding_generated = 1, vector_id = ? WHERE id = ?`,
      [faqId, faqId]
    );

    return {
      id: faqId,
      vector_id: faqId,
      embedding_generated: 1,
    };
  } catch (err) {
    console.error(`FAQ embedding failed for ${faqId}:`, err);

    // Mark as failed in D1
    await db.run(
      `UPDATE faqs SET embedding_generated = -1, embedding_error = ? WHERE id = ?`,
      [err.message, faqId]
    );

    throw err;
  }
}

/**
 * Query similar FAQs using Vectorize
 * @param {Object} env - Worker environment
 * @param {Object} db - Database connection
 * @param {string} query - User query text
 * @param {number} topK - Number of results to return (default: 3)
 * @param {number} minSimilarity - Minimum similarity score (0-1, default: 0.5)
 * @returns {Promise<Array>} - Array of similar FAQs with similarity scores
 */
export async function queryFAQs(env, db, query, topK = 3, minSimilarity = 0.5) {
  if (!env.VECTORIZE || isVectorizeDisabled(env)) return [];

  try {
    // Generate embedding for query
    const queryEmbedding = await generateEmbedding(env, query);

    // Query Vectorize
    const results = await env.VECTORIZE.query(queryEmbedding, {
      topK: Math.min(topK, 10), // Vectorize returns up to 10 results
      returnMetadata: 'all',
    });

    if (!results.matches) {
      return [];
    }

    // Filter by minimum similarity and load full FAQ from D1
    const filteredResults = [];
    for (const match of results.matches) {
      if (match.score < minSimilarity) continue;

      // Load full FAQ from D1
      const faq = await db.first(
        'SELECT id, question, answer, category, tags FROM faqs WHERE id = ?',
        [match.id]
      );

      if (faq) {
        filteredResults.push({
          ...faq,
          similarity_score: match.score,
          vector_id: match.id,
        });
      }
    }

    return filteredResults;
  } catch (err) {
    console.error('FAQ query failed:', err);
    // Return empty array instead of throwing to allow graceful degradation
    return [];
  }
}

/**
 * Delete FAQ embedding from Vectorize
 * @param {Object} env - Worker environment
 * @param {string} faqId - FAQ ID to delete
 */
export async function deleteFAQEmbedding(env, faqId) {
  if (!env.VECTORIZE || isVectorizeDisabled(env)) return;

  try {
    await env.VECTORIZE.deleteByIds([faqId]);
  } catch (err) {
    console.error(`Failed to delete FAQ embedding ${faqId}:`, err);
    // Non-fatal error
  }
}

/**
 * Upsert document chunk embeddings (batch)
 * @param {Object} env - Worker environment
 * @param {Object} db - Database connection
 * @param {Array} chunks - Array of {id, text, documentId, chunkIndex}
 */
export async function upsertDocumentChunks(env, db, chunks) {
  if (!env.VECTORIZE || isVectorizeDisabled(env)) return;
  if (!chunks.length) return;

  try {
    // Generate embeddings for all chunks
    const vectorizePayload = [];
    const embeddingPromises = [];

    for (const chunk of chunks) {
      embeddingPromises.push(
        generateEmbedding(env, chunk.text)
          .then((embedding) => ({
            id: chunk.id,
            values: embedding,
            metadata: {
              type: 'document_chunk',
              document_id: chunk.documentId,
              chunk_index: chunk.chunkIndex,
            },
          }))
          .catch((err) => {
            console.error(`Embedding failed for chunk ${chunk.id}:`, err);
            return null;
          })
      );
    }

    const embeddingResults = await Promise.all(embeddingPromises);
    const validEmbeddings = embeddingResults.filter((r) => r !== null);

    if (!validEmbeddings.length) {
      throw new Error('All embeddings failed');
    }

    // Upsert into Vectorize
    const vectorizeResult = await env.VECTORIZE.upsert(validEmbeddings);

    if (!vectorizeResult.success) {
      throw new Error('Vectorize batch upsert failed');
    }

    // Update D1 records
    for (const chunk of chunks) {
      const succeeded = validEmbeddings.some((r) => r.id === chunk.id);
      await db.run(
        `UPDATE document_chunks SET embedding_generated = ?, vector_id = ? WHERE id = ?`,
        [succeeded ? 1 : -1, chunk.id, chunk.id]
      );
    }

    return {
      success: true,
      uploaded: validEmbeddings.length,
      failed: chunks.length - validEmbeddings.length,
    };
  } catch (err) {
    console.error('Document chunk embedding batch failed:', err);
    throw err;
  }
}

/**
 * Query similar document chunks
 * @param {Object} env - Worker environment
 * @param {Object} db - Database connection
 * @param {string} query - User query
 * @param {number} topK - Number of results
 * @param {number} minSimilarity - Minimum similarity threshold
 * @returns {Promise<Array>} - Array of similar chunks with documents
 */
export async function queryDocumentChunks(env, db, query, topK = 5, minSimilarity = 0.5) {
  if (!env.VECTORIZE || isVectorizeDisabled(env)) return [];

  try {
    // Generate query embedding
    const queryEmbedding = await generateEmbedding(env, query);

    // Query Vectorize
    const results = await env.VECTORIZE.query(queryEmbedding, {
      topK: Math.min(topK, 10),
      returnMetadata: 'all',
    });

    if (!results.matches) {
      return [];
    }

    // Filter and load related documents
    const filteredResults = [];
    for (const match of results.matches) {
      if (match.score < minSimilarity) continue;

      // Load chunk and document
      const chunk = await db.first(
        `SELECT dc.*, d.filename, d.id as doc_id FROM document_chunks dc
         JOIN documents d ON dc.document_id = d.id WHERE dc.id = ?`,
        [match.id]
      );

      if (chunk) {
        filteredResults.push({
          ...chunk,
          similarity_score: match.score,
        });
      }
    }

    return filteredResults;
  } catch (err) {
    console.error('Document chunk query failed:', err);
    return [];
  }
}
