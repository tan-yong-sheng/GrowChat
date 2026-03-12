/**
 * Admin Panel Router
 *
 * Statistics, analytics, and vector management endpoints
 * All endpoints require admin authorization
 */

import { createDB } from '../db.js';
import { error, json } from '../utils/response.js';
import { authorize, logAuditEvent } from '../utils/authorize.js';
import { getConfigBool, getConfigValue, setConfigValue } from '../utils/app-config.js';
import { buildEnvOpenAIConnections } from '../utils/openai-connections.js';

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
  if (!path.startsWith('/api/admin/')) return null;

  let requiredPermission = 'admin.user.read';
  if (path === '/api/admin/faqs/reindex' || path === '/api/admin/documents/reindex') {
    requiredPermission = 'kb.reindex';
  }
  if (path === '/api/admin/config' && req.method === 'PUT') {
    requiredPermission = 'admin.user.write';
  }
  if (path === '/api/admin/openai/connections') {
    requiredPermission = 'admin.rbac.admin';
  }
  if (path === '/api/admin/tool-servers') {
    requiredPermission = 'admin.rbac.admin';
  }
  const authDecision = await authorize(env, user, { action: requiredPermission });

  if (!authDecision.allow) {
    return error(req, authDecision.reason || 'Forbidden', 403);
  }

  const db = createDB(env.DB);

  // GET /api/admin/config - Fetch admin configuration
  if (req.method === 'GET' && path === '/api/admin/config') {
    try {
      const publicRegistration = await getConfigBool(db, 'public_registration', true);
      return json(req, {
        public_registration: publicRegistration
      });
    } catch (err) {
      console.error('Admin config fetch failed:', err);
      return error(req, 'Failed to fetch admin config', 500);
    }
  }

  // PUT /api/admin/config - Update admin configuration
  if (req.method === 'PUT' && path === '/api/admin/config') {
    let body;
    try {
      body = await req.json();
    } catch {
      return error(req, 'Invalid JSON body', 400);
    }

    if (typeof body.public_registration !== 'boolean') {
      return error(req, 'public_registration must be a boolean', 400);
    }

    try {
      await setConfigValue(db, 'public_registration', body.public_registration ? 'true' : 'false');
      await logAuditEvent(env, {
        actor_id: user.sub,
        action: 'admin_config_updated',
        resource_type: 'admin',
        resource_id: 'config'
      });
      return json(req, {
        public_registration: body.public_registration
      });
    } catch (err) {
      console.error('Admin config update failed:', err);
      return error(req, 'Failed to update admin config', 500);
    }
  }

  // GET /api/admin/openai/connections - List OpenAI connections
  if (req.method === 'GET' && path === '/api/admin/openai/connections') {
    try {
      const envConnections = buildEnvOpenAIConnections(env);
      let manualConnections = [];
      const raw = await getConfigValue(db, 'openai_connections', '[]');
      try {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) manualConnections = parsed;
      } catch {
        manualConnections = [];
      }
      const enabledRaw = await getConfigValue(db, 'openai_enabled', 'true');
      const enabled = String(enabledRaw).toLowerCase() !== 'false';

      return json(req, {
        enabled,
        connections: [...envConnections, ...manualConnections]
      });
    } catch (err) {
      console.error('OpenAI connections fetch failed:', err);
      return error(req, 'Failed to fetch connections', 500);
    }
  }

  // GET /api/admin/tool-servers - List tool servers
  if (req.method === 'GET' && path === '/api/admin/tool-servers') {
    try {
      let servers = [];
      const raw = await getConfigValue(db, 'tool_servers', '[]');
      try {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) servers = parsed;
      } catch {
        servers = [];
      }
      return json(req, { servers });
    } catch (err) {
      console.error('Tool servers fetch failed:', err);
      return error(req, 'Failed to fetch tool servers', 500);
    }
  }

  // PUT /api/admin/tool-servers - Update tool servers
  if (req.method === 'PUT' && path === '/api/admin/tool-servers') {
    let body;
    try {
      body = await req.json();
    } catch {
      return error(req, 'Invalid JSON body', 400);
    }

    const servers = Array.isArray(body.servers) ? body.servers : [];
    const sanitized = servers
      .map((server) => ({
        id: server.id || crypto.randomUUID(),
        name: String(server.name || 'Tool Server').slice(0, 120),
        url: String(server.url || '').trim(),
        key: String(server.key || '').trim(),
        headers: String(server.headers || '').trim(),
        enabled: server.enabled !== false,
      }))
      .filter((server) => server.url);

    try {
      await setConfigValue(db, 'tool_servers', JSON.stringify(sanitized));
      await logAuditEvent(env, {
        actor_id: user.sub,
        action: 'tool_servers_updated',
        resource_type: 'admin',
        resource_id: 'tool-servers',
      });
      return json(req, { ok: true });
    } catch (err) {
      console.error('Tool servers update failed:', err);
      return error(req, 'Failed to update tool servers', 500);
    }
  }

  // PUT /api/admin/openai/connections - Update OpenAI connections
  if (req.method === 'PUT' && path === '/api/admin/openai/connections') {
    let body;
    try {
      body = await req.json();
    } catch {
      return error(req, 'Invalid JSON body', 400);
    }

    const enabled = typeof body.enabled === 'boolean' ? body.enabled : true;
    const connections = Array.isArray(body.connections) ? body.connections : [];

    const sanitized = connections
      .filter((conn) => !conn?.readOnly && conn?.source !== 'env')
      .map((conn) => ({
        id: conn.id || crypto.randomUUID(),
        name: String(conn.name || 'OpenAI Compatible').slice(0, 120),
        url: String(conn.url || '').trim(),
        key: String(conn.key || '').trim(),
        headers: String(conn.headers || '').trim(),
        providerType: 'openai',
        apiType: 'chat-completions',
        enabled: conn.enabled !== false,
      }))
      .filter((conn) => conn.url);

    try {
      await setConfigValue(db, 'openai_connections', JSON.stringify(sanitized));
      await setConfigValue(db, 'openai_enabled', enabled ? 'true' : 'false');
      await logAuditEvent(env, {
        actor_id: user.sub,
        action: 'openai_connections_updated',
        resource_type: 'admin',
        resource_id: 'openai-connections',
      });
      return json(req, { ok: true });
    } catch (err) {
      console.error('OpenAI connections update failed:', err);
      return error(req, 'Failed to update connections', 500);
    }
  }

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

      // Log audit event
      await logAuditEvent(env, {
        actor_id: user.sub,
        action: 'stats_accessed',
        resource_type: 'admin',
        resource_id: 'stats'
      });

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

      // Log audit event
      await logAuditEvent(env, {
        actor_id: user.sub,
        action: 'faq_reindex_started',
        resource_type: 'faqs',
        resource_id: null,
        metadata: { faq_count: faqsToReindex.length }
      });

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

          // Log completion
          await logAuditEvent(env, {
            actor_id: user.sub,
            action: 'faq_reindex_completed',
            resource_type: 'faqs',
            resource_id: null,
            metadata: { succeeded, failed }
          });
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
