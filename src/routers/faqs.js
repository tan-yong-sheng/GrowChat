/**
 * FAQ Management Router
 *
 * Handles FAQ CRUD operations and embedding management
 * All endpoints require admin authorization
 */

import { createDB } from '../db.js';
import { error, json } from '../utils/response.js';
import { authorize, logAuditEvent } from '../utils/authorize.js';
import {
  generateEmbedding,
  upsertFAQ,
  queryFAQs,
  deleteFAQEmbedding,
} from '../services/embeddings.js';

/**
 * FAQ Router Handler
 * Routes:
 *   POST   /api/admin/faqs               - Create FAQ
 *   GET    /api/admin/faqs               - List FAQs
 *   PUT    /api/admin/faqs/:id           - Update FAQ
 *   DELETE /api/admin/faqs/:id           - Delete FAQ
 *   GET    /api/faqs/search              - Search FAQs (user-accessible)
 */
export async function faqsRouter(req, env, ctx, user, path) {
  // Check admin authorization for all admin endpoints
  if ((path === '/api/admin/faqs' || path.match(/^\/api\/admin\/faqs\/[^/]+$/)) && req.method !== 'GET') {
    const authDecision = await authorize(env, user, {
      action: 'kb.write',
      resource: 'faq'
    });

    if (!authDecision.allow) {
      return error(req, authDecision.reason || 'Forbidden', 403);
    }
  }

  // POST /api/admin/faqs - Create new FAQ
  if (req.method === 'POST' && path === '/api/admin/faqs') {
    const db = createDB(env.DB);

    let body;
    try {
      body = await req.json();
    } catch {
      return error(req, 'Invalid JSON body', 400);
    }

    const { question, answer, category, tags } = body;

    if (!question || !question.trim()) {
      return error(req, 'question is required', 400);
    }
    if (!answer || !answer.trim()) {
      return error(req, 'answer is required', 400);
    }

    const faqId = crypto.randomUUID();
    const tagsJson = JSON.stringify(Array.isArray(tags) ? tags : []);

    try {
      // Store in D1 first
      await db.run(
        `INSERT INTO faqs (id, user_id, question, answer, category, tags, embedding_generated, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, 0, unixepoch(), unixepoch())`,
        [faqId, user.sub, question.trim(), answer.trim(), category || null, tagsJson]
      );

      // Log audit event
      await logAuditEvent(env, {
        actor_id: user.sub,
        action: 'faq_created',
        resource_type: 'faq',
        resource_id: faqId,
        metadata: { category, tags_count: Array.isArray(tags) ? tags.length : 0 }
      });

      // Generate embedding asynchronously
      ctx.waitUntil(
        upsertFAQ(env, db, faqId, question.trim(), answer.trim(), {
          category: category || undefined,
          tags: Array.isArray(tags) ? tags : [],
        }).catch((err) => {
          console.error(`Failed to generate embedding for FAQ ${faqId}:`, err);
        })
      );

      return json(
        req,
        {
          id: faqId,
          question: question.trim(),
          answer: answer.trim(),
          category: category || null,
          tags: Array.isArray(tags) ? tags : [],
          embedding_generated: 0,
          created_at: Math.floor(Date.now() / 1000),
        },
        201
      );
    } catch (err) {
      console.error('FAQ creation failed:', err);
      return error(req, 'Failed to create FAQ', 500);
    }
  }

  // GET /api/admin/faqs - List FAQs
  if (req.method === 'GET' && path === '/api/admin/faqs') {
    // Check authorization for reading admin FAQs
    const authDecision = await authorize(env, user, {
      action: 'kb.read',
      resource: 'faq'
    });

    if (!authDecision.allow) {
      return error(req, authDecision.reason || 'Forbidden', 403);
    }

    const db = createDB(env.DB);
    const limit = Math.min(parseInt(new URL(req.url).searchParams.get('limit') || '20'), 100);
    const offset = parseInt(new URL(req.url).searchParams.get('offset') || '0');

    try {
      const faqs = await db.all(
        `SELECT id, question, answer, category, tags, embedding_generated, created_at, updated_at
         FROM faqs
         WHERE user_id = ?
         ORDER BY created_at DESC
         LIMIT ? OFFSET ?`,
        [user.sub, limit, offset]
      );

      const parsed = faqs.map((faq) => ({
        ...faq,
        tags: parseTags(faq.tags),
      }));

      return json(req, { faqs: parsed });
    } catch (err) {
      console.error('FAQ list failed:', err);
      return error(req, 'Failed to list FAQs', 500);
    }
  }

  // PUT /api/admin/faqs/:id - Update FAQ
  if (req.method === 'PUT' && path.match(/^\/api\/admin\/faqs\/[^/]+$/)) {
    const faqId = path.split('/').pop();
    const db = createDB(env.DB);

    let body;
    try {
      body = await req.json();
    } catch {
      return error(req, 'Invalid JSON body', 400);
    }

    const { question, answer, category, tags } = body;

    // Verify ownership
    const existing = await db.first('SELECT id, user_id FROM faqs WHERE id = ?', [faqId]);
    if (!existing || existing.user_id !== user.sub) {
      return error(req, 'Not found', 404);
    }

    const updates = [];
    const values = [];

    if (question !== undefined) {
      const q = String(question).trim();
      if (!q) return error(req, 'question cannot be empty', 400);
      updates.push('question = ?');
      values.push(q);
    }

    if (answer !== undefined) {
      const a = String(answer).trim();
      if (!a) return error(req, 'answer cannot be empty', 400);
      updates.push('answer = ?');
      values.push(a);
    }

    if (category !== undefined) {
      updates.push('category = ?');
      values.push(category || null);
    }

    if (tags !== undefined) {
      const tagsJson = JSON.stringify(Array.isArray(tags) ? tags : []);
      updates.push('tags = ?');
      values.push(tagsJson);
    }

    if (updates.length === 0) {
      return error(req, 'No fields to update', 400);
    }

    updates.push('updated_at = unixepoch()');
    values.push(faqId);

    try {
      await db.run(`UPDATE faqs SET ${updates.join(', ')} WHERE id = ?`, values);

      // Regenerate embedding if question or answer changed
      if (question !== undefined || answer !== undefined) {
        const updated = await db.first(
          'SELECT question, answer, category, tags FROM faqs WHERE id = ?',
          [faqId]
        );

        ctx.waitUntil(
          upsertFAQ(env, db, faqId, updated.question, updated.answer, {
            category: updated.category || undefined,
            tags: parseTags(updated.tags),
          }).catch((err) => {
            console.error(`Failed to update embedding for FAQ ${faqId}:`, err);
          })
        );
      }

      // Return updated FAQ
      const faq = await db.first(
        'SELECT id, question, answer, category, tags, embedding_generated, created_at, updated_at FROM faqs WHERE id = ?',
        [faqId]
      );

      await logAuditEvent(env, {
        actor_id: user.sub,
        action: 'faq_updated',
        resource_type: 'faq',
        resource_id: faqId,
        metadata: {
          question_changed: question !== undefined,
          answer_changed: answer !== undefined,
          category_changed: category !== undefined,
          tags_changed: tags !== undefined,
        }
      });

      return json(req, {
        ...faq,
        tags: parseTags(faq.tags),
      });
    } catch (err) {
      console.error('FAQ update failed:', err);
      return error(req, 'Failed to update FAQ', 500);
    }
  }

  // DELETE /api/admin/faqs/:id - Delete FAQ
  if (req.method === 'DELETE' && path.match(/^\/api\/admin\/faqs\/[^/]+$/)) {
    const faqId = path.split('/').pop();
    const db = createDB(env.DB);

    try {
      // Verify ownership
      const faq = await db.first('SELECT id, user_id FROM faqs WHERE id = ?', [faqId]);
      if (!faq || faq.user_id !== user.sub) {
        return error(req, 'Not found', 404);
      }

      // Delete from Vectorize
      await deleteFAQEmbedding(env, faqId);

      // Delete from D1
      await db.run('DELETE FROM faqs WHERE id = ?', [faqId]);

      await logAuditEvent(env, {
        actor_id: user.sub,
        action: 'faq_deleted',
        resource_type: 'faq',
        resource_id: faqId
      });

      return json(req, { success: true });
    } catch (err) {
      console.error('FAQ deletion failed:', err);
      return error(req, 'Failed to delete FAQ', 500);
    }
  }

  // GET /api/faqs/search - Search FAQs (user-accessible)
  if (req.method === 'GET' && path === '/api/faqs/search') {
    if (!user) {
      return error(req, 'Unauthorized', 401);
    }

    const db = createDB(env.DB);
    const query = new URL(req.url).searchParams.get('q');

    if (!query || !query.trim()) {
      return error(req, 'query parameter required', 400);
    }

    const topK = Math.min(parseInt(new URL(req.url).searchParams.get('topk') || '5'), 10);
    const minSimilarity = Math.max(
      0,
      Math.min(parseFloat(new URL(req.url).searchParams.get('minsimilarity') || '0.5'), 1)
    );

    try {
      const results = await queryFAQs(env, db, query.trim(), topK, minSimilarity);
      return json(req, { faqs: results });
    } catch (err) {
      console.error('FAQ search failed:', err);
      // Graceful degradation - return empty results instead of error
      return json(req, { faqs: [] });
    }
  }

  return null;
}

/**
 * Helper: Parse tags from JSON string
 */
function parseTags(tagsJson) {
  if (!tagsJson) return [];
  try {
    const parsed = JSON.parse(tagsJson);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}
