/**
 * Admin Panel Router
 *
 * Statistics, analytics, and vector management endpoints
 * All endpoints require admin authorization
 */

import { createDB } from '../db.js';
import { error, json } from '../utils/response.js';
import { requireAdmin } from '../utils/admin.js';

/**
 * Admin Router Handler
 * Routes:
 *   GET /api/admin/stats                - System statistics
 *   GET /api/admin/faqs/status          - FAQ embedding status
 *   GET /api/admin/documents/status     - Document extraction/embedding status
 *   POST /api/admin/faqs/reindex        - Regenerate FAQ embeddings
 *   POST /api/admin/documents/reindex   - Regenerate document chunk embeddings
 */
export async function adminRouter(req, env, ctx, user, path) {
  // All admin endpoints require authorization
  if (!user || !requireAdmin(user)) {
    return error(req, 'Forbidden', 403);
  }

  const db = createDB(env.DB);

  // GET /api/admin/stats - System statistics
  if (req.method === 'GET' && path === '/api/admin/stats') {
    try {
      const [
        userCount,
        chatCount,
        messageCount,
        faqCount,
        documentCount,
        sessionCount,
      ] = await Promise.all([
        db.first('SELECT COUNT(*) as count FROM users'),
        db.first('SELECT COUNT(*) as count FROM chats'),
        db.first('SELECT COUNT(*) as count FROM messages'),
        db.first('SELECT COUNT(*) as count FROM faqs WHERE user_id = ?', [user.sub]),
        db.first('SELECT COUNT(*) as count FROM documents WHERE user_id = ?', [user.sub]),
        db.first('SELECT COUNT(*) as count FROM chat_sessions'),
      ]);

      return json(req, {
        stats: {
          total_users: userCount?.count || 0,
          total_chats: chatCount?.count || 0,
          total_messages: messageCount?.count || 0,
          user_faqs: faqCount?.count || 0,
          user_documents: documentCount?.count || 0,
          active_sessions: sessionCount?.count || 0,
          timestamp: new Date().toISOString(),
        },
      });
    } catch (err) {
      console.error('Stats query failed:', err);
      return error(req, 'Failed to fetch statistics', 500);
    }
  }

  // GET /api/admin/faqs/status - FAQ embedding status
  if (req.method === 'GET' && path === '/api/admin/faqs/status') {
    try {
      const [pending, done, failed] = await Promise.all([
        db.first(
          'SELECT COUNT(*) as count FROM faqs WHERE user_id = ? AND embedding_generated = 0',
          [user.sub]
        ),
        db.first(
          'SELECT COUNT(*) as count FROM faqs WHERE user_id = ? AND embedding_generated = 1',
          [user.sub]
        ),
        db.first(
          'SELECT COUNT(*) as count FROM faqs WHERE user_id = ? AND embedding_generated = -1',
          [user.sub]
        ),
      ]);

      return json(req, {
        embedding_status: {
          pending: pending?.count || 0,
          completed: done?.count || 0,
          failed: failed?.count || 0,
          total: (pending?.count || 0) + (done?.count || 0) + (failed?.count || 0),
        },
      });
    } catch (err) {
      console.error('FAQ status query failed:', err);
      return error(req, 'Failed to fetch FAQ status', 500);
    }
  }

  // GET /api/admin/documents/status - Document extraction/embedding status
  if (req.method === 'GET' && path === '/api/admin/documents/status') {
    try {
      const [
        extractionPending,
        extractionDone,
        extractionFailed,
        embeddingPending,
        embeddingDone,
        embeddingFailed,
      ] = await Promise.all([
        db.first(
          'SELECT COUNT(*) as count FROM documents WHERE user_id = ? AND extraction_status = 0',
          [user.sub]
        ),
        db.first(
          'SELECT COUNT(*) as count FROM documents WHERE user_id = ? AND extraction_status = 1',
          [user.sub]
        ),
        db.first(
          'SELECT COUNT(*) as count FROM documents WHERE user_id = ? AND extraction_status = -1',
          [user.sub]
        ),
        db.first(
          'SELECT COUNT(*) as count FROM documents WHERE user_id = ? AND embedding_generated = 0',
          [user.sub]
        ),
        db.first(
          'SELECT COUNT(*) as count FROM documents WHERE user_id = ? AND embedding_generated = 1',
          [user.sub]
        ),
        db.first(
          'SELECT COUNT(*) as count FROM documents WHERE user_id = ? AND embedding_generated = -1',
          [user.sub]
        ),
      ]);

      return json(req, {
        extraction_status: {
          pending: extractionPending?.count || 0,
          completed: extractionDone?.count || 0,
          failed: extractionFailed?.count || 0,
        },
        embedding_status: {
          pending: embeddingPending?.count || 0,
          completed: embeddingDone?.count || 0,
          failed: embeddingFailed?.count || 0,
        },
        total_documents: (extractionPending?.count || 0) +
          (extractionDone?.count || 0) +
          (extractionFailed?.count || 0),
      });
    } catch (err) {
      console.error('Document status query failed:', err);
      return error(req, 'Failed to fetch document status', 500);
    }
  }

  // POST /api/admin/faqs/reindex - Regenerate FAQ embeddings
  if (req.method === 'POST' && path === '/api/admin/faqs/reindex') {
    try {
      const faqsToReindex = await db.all(
        'SELECT id, question, answer, category, tags FROM faqs WHERE user_id = ?',
        [user.sub]
      );

      if (!faqsToReindex.length) {
        return json(req, { queued: 0, message: 'No FAQs to reindex' });
      }

      // Queue embedding regeneration
      ctx.waitUntil(
        (async () => {
          const { upsertFAQ } = await import('../services/embeddings.js');
          let succeeded = 0;
          let failed = 0;

          for (const faq of faqsToReindex) {
            try {
              const tags = faq.tags ? JSON.parse(faq.tags) : [];
              await upsertFAQ(env, db, faq.id, faq.question, faq.answer, {
                category: faq.category || undefined,
                tags,
              });
              succeeded++;
            } catch (err) {
              console.error(`Failed to reindex FAQ ${faq.id}:`, err);
              failed++;
            }
          }

          console.log(`FAQ reindexing complete: ${succeeded} succeeded, ${failed} failed`);
        })()
      );

      return json(req, {
        queued: faqsToReindex.length,
        message: 'FAQ reindexing queued',
      });
    } catch (err) {
      console.error('FAQ reindex failed:', err);
      return error(req, 'Failed to queue FAQ reindexing', 500);
    }
  }

  // POST /api/admin/documents/reindex - Regenerate document chunk embeddings
  if (req.method === 'POST' && path === '/api/admin/documents/reindex') {
    try {
      const chunks = await db.all(
        `SELECT dc.id, dc.chunk_text as text, dc.document_id as documentId, dc.chunk_index as chunkIndex
         FROM document_chunks dc
         JOIN documents d ON dc.document_id = d.id
         WHERE d.user_id = ?`,
        [user.sub]
      );

      if (!chunks.length) {
        return json(req, { queued: 0, message: 'No document chunks to reindex' });
      }

      // Queue embedding regeneration
      ctx.waitUntil(
        (async () => {
          const { upsertDocumentChunks } = await import('../services/embeddings.js');

          try {
            const result = await upsertDocumentChunks(env, db, chunks);
            console.log(
              `Document reindexing complete: ${result.uploaded} succeeded, ${result.failed} failed`
            );
          } catch (err) {
            console.error('Document chunk reindex error:', err);
          }
        })()
      );

      return json(req, {
        queued: chunks.length,
        message: 'Document chunk reindexing queued',
      });
    } catch (err) {
      console.error('Document reindex failed:', err);
      return error(req, 'Failed to queue document reindexing', 500);
    }
  }

  return null;
}
