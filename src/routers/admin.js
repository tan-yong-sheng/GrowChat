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
import { buildEnvOpenAIConnections, ensureConnectionId, getEnvOpenAIOverrides } from '../utils/openai-connections.js';

function isValidHttpUrl(value) {
  if (!value) return false;
  return /^https?:\/\//i.test(value);
}

function normalizeHeaders(input) {
  const trimmed = String(input || '').trim();
  if (!trimmed) return '';
  let parsed;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    throw new Error('Headers must be valid JSON');
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('Headers must be a JSON object');
  }
  const normalized = {};
  for (const [key, value] of Object.entries(parsed)) {
    const headerKey = String(key || '').trim();
    if (!headerKey) {
      throw new Error('Header names cannot be empty');
    }
    if (/[\r\n]/.test(headerKey)) {
      throw new Error('Header names cannot contain newline characters');
    }
    const headerValue = String(value ?? '').trim();
    if (/[\r\n]/.test(headerValue)) {
      throw new Error('Header values cannot contain newline characters');
    }
    normalized[headerKey] = headerValue;
  }
  return JSON.stringify(normalized);
}

function parseHeadersForRequest(input) {
  if (input && typeof input === 'object' && !Array.isArray(input)) {
    return input;
  }
  const normalized = normalizeHeaders(input);
  if (!normalized) return {};
  return JSON.parse(normalized);
}

function normalizeBaseUrl(url) {
  return String(url || '').trim().replace(/\/$/, '');
}

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
  if (path === '/api/admin/openai/connections' || path === '/api/admin/openai/connections/test' || path === '/api/admin/openai/env') {
    requiredPermission = 'admin.rbac.admin';
  }
  if (path === '/api/admin/tool-servers' || path === '/api/admin/tool-servers/test') {
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
      const envOverrides = await getEnvOpenAIOverrides(env);
      envConnections.forEach((conn) => {
        const override = envOverrides.get(conn.id);
        if (override === false) conn.enabled = false;
      });
      let manualConnections = [];
      const raw = await getConfigValue(db, 'openai_connections', '[]');
      try {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          manualConnections = parsed.map((conn, index) => ({
            ...conn,
            id: ensureConnectionId(conn, index),
            providerType: String(conn?.providerType || 'openai-compatible').toLowerCase(),
            readOnly: false,
            source: 'config',
            enabled: conn?.enabled !== false,
          }));
        }
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

  // POST /api/admin/openai/connections/test - Test OpenAI connection
  if (req.method === 'POST' && path === '/api/admin/openai/connections/test') {
    let body;
    try {
      body = await req.json();
    } catch {
      return error(req, 'Invalid JSON body', 400);
    }

    const url = String(body.url || '').trim();
    if (!url || !isValidHttpUrl(url)) {
      return error(req, 'Connection URL must start with http:// or https://', 400);
    }

    const key = String(body.key || '').trim();
    let headers = {};
    try {
      headers = parseHeadersForRequest(body.headers);
    } catch (err) {
      return error(req, err.message || 'Headers must be valid JSON', 400);
    }

    if (key && !headers.Authorization) {
      headers.Authorization = `Bearer ${key}`;
    }

    const baseUrl = normalizeBaseUrl(url);
    try {
      const res = await fetch(`${baseUrl}/models`, { headers });
      if (!res.ok) {
        const bodyText = await res.text().catch(() => '');
        return error(
          req,
          `Connection failed (${res.status})`,
          502,
          { message: bodyText.slice(0, 200) }
        );
      }

      return json(req, { ok: true, message: 'Connection successful' });
    } catch (err) {
      return error(req, 'Connection failed', 502, { message: err?.message || String(err) });
    }
  }

  // GET /api/admin/openai/env - Inspect OpenAI env configuration (admin only)
  if (req.method === 'GET' && path === '/api/admin/openai/env') {
    const baseUrl = env.OPENAI_BASE_URL || '';
    const baseUrls = env.OPENAI_API_BASE_URLS || '';
    const hasKey = Boolean(env.OPENAI_API_KEY);
    const hasKeys = Boolean(env.OPENAI_API_KEYS);

    return json(req, {
      openai_base_url: baseUrl || null,
      openai_api_base_urls: baseUrls || null,
      openai_api_key_present: hasKey,
      openai_api_keys_present: hasKeys,
    });
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

  // POST /api/admin/tool-servers/test - Test tool server connection
  if (req.method === 'POST' && path === '/api/admin/tool-servers/test') {
    let body;
    try {
      body = await req.json();
    } catch {
      return error(req, 'Invalid JSON body', 400);
    }

    const url = String(body.url || '').trim();
    if (!url || !isValidHttpUrl(url)) {
      return error(req, 'Server URL must start with http:// or https://', 400);
    }

    const key = String(body.key || '').trim();
    let headers = {};
    try {
      headers = parseHeadersForRequest(body.headers);
    } catch (err) {
      return error(req, err.message || 'Headers must be valid JSON', 400);
    }

    if (key && !headers.Authorization) {
      headers.Authorization = `Bearer ${key}`;
    }

    const baseUrl = normalizeBaseUrl(url);
    const candidates = ['/openapi.json', '/openapi.yaml', '/openapi.yml'];
    let lastStatus = null;
    let lastBody = '';

    for (const pathSuffix of candidates) {
      try {
        const res = await fetch(`${baseUrl}${pathSuffix}`, { headers });
        if (res.ok) {
          return json(req, { ok: true, message: 'Connection successful' });
        }
        lastStatus = res.status;
        lastBody = await res.text().catch(() => '');
      } catch (err) {
        return error(req, 'Connection failed', 502, { message: err?.message || String(err) });
      }
    }

    return error(
      req,
      `Connection failed${lastStatus ? ` (${lastStatus})` : ''}`,
      502,
      lastBody ? { message: lastBody.slice(0, 200) } : undefined
    );
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
    const envOverridesInput = body.env_overrides && typeof body.env_overrides === 'object'
      ? body.env_overrides
      : {};

    if (connections.length > 100) {
      return error(req, 'Too many connections (max 100)', 400);
    }

    let sanitized;
    try {
      sanitized = connections
        .filter((conn) => !conn?.readOnly && conn?.source !== 'env')
        .map((conn) => {
          const url = String(conn.url || '').trim();
          if (!url) return null;
          if (!isValidHttpUrl(url)) {
            throw new Error('Connection URL must start with http:// or https://');
          }
          const key = String(conn.key || '').trim();
          if (key.length > 4096) {
            throw new Error('API key is too long');
          }
          const headers = normalizeHeaders(conn.headers);
          if (headers.length > 4096) {
            throw new Error('Headers are too long');
          }
          const providerType = String(conn.providerType || 'openai').toLowerCase();
          if (!['openai', 'openai-compatible'].includes(providerType)) {
            throw new Error('Provider type must be openai or openai-compatible');
          }
          return {
            id: conn.id || crypto.randomUUID(),
            name: String(conn.name || 'OpenAI Compatible').slice(0, 120),
            url,
            key,
            headers,
            providerType,
            apiType: 'chat-completions',
            enabled: conn.enabled !== false,
          };
        })
        .filter(Boolean);
    } catch (err) {
      return error(req, err.message || 'Invalid connection data', 400);
    }

    try {
      await setConfigValue(db, 'openai_connections', JSON.stringify(sanitized));
      await setConfigValue(db, 'openai_enabled', enabled ? 'true' : 'false');
      const envOverrides = {};
      for (const [key, value] of Object.entries(envOverridesInput)) {
        if (!/^env-\d+$/.test(String(key))) continue;
        if (value === false) {
          envOverrides[String(key)] = false;
        }
      }
      await setConfigValue(db, 'openai_env_overrides', JSON.stringify(envOverrides));
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
