/**
 * Knowledge Base Router
 *
 * Handles organization and management of document collections (knowledge bases)
 * Routes:
 *   GET    /api/knowledge              - List user's knowledge bases
 *   POST   /api/knowledge              - Create knowledge base
 *   GET    /api/knowledge/:id          - Get knowledge base details
 *   PUT    /api/knowledge/:id          - Update knowledge base
 *   DELETE /api/knowledge/:id          - Delete knowledge base
 *   GET    /api/knowledge/:id/files    - List documents in knowledge base
 *   POST   /api/knowledge/:id/files/batch/add - Add multiple documents
 *   DELETE /api/knowledge/:id/files/:fileId   - Remove document from KB
 */

import { createDB } from '../db.js';
import { error, json } from '../utils/response.js';
import { authorize, logAuditEvent } from '../utils/authorize.js';

function requireAuth(req, user) {
  if (!user) return error(req, 'Unauthorized', 401);
  return null;
}

async function getOwnedKB(db, kbId, userId) {
  return db.first('SELECT * FROM knowledge_bases WHERE id = ? AND user_id = ?', [kbId, userId]);
}

export async function knowledgeRouter(req, env, _ctx, user, path) {
  const isKBPath = path === '/api/knowledge' || /^\/api\/knowledge\/[^/]+(?:\/(?:files|files\/[^/]+))?(?:\/batch\/add)?$/.test(path);
  if (!isKBPath) return null;

  const authErr = requireAuth(req, user);
  if (authErr) return authErr;

  const db = createDB(env.DB);

  // GET /api/knowledge - List user's knowledge bases
  if (req.method === 'GET' && path === '/api/knowledge') {
    const url = new URL(req.url);
    const limit = Math.min(Math.max(parseInt(url.searchParams.get('limit') || '50'), 1), 100);
    const offset = Math.max(parseInt(url.searchParams.get('offset') || '0'), 0);

    try {
      const kbs = await db.all(
        `SELECT
          id, name, description, is_public, created_at, updated_at,
          (SELECT COUNT(*) FROM knowledge_files WHERE knowledge_base_id = knowledge_bases.id) as file_count
        FROM knowledge_bases
        WHERE user_id = ?
        ORDER BY updated_at DESC
        LIMIT ? OFFSET ?`,
        [user.sub, limit, offset]
      );

      return json(req, { knowledge_bases: kbs, limit, offset });
    } catch (err) {
      console.error('List KBs failed:', err);
      return error(req, 'Failed to list knowledge bases', 500);
    }
  }

  // POST /api/knowledge - Create knowledge base
  if (req.method === 'POST' && path === '/api/knowledge') {
    // Check authorization for KB creation
    const authDecision = await authorize(env, user, {
      action: 'kb.write',
      resource: 'knowledge_base'
    });

    if (!authDecision.allow) {
      return error(req, authDecision.reason || 'Forbidden', 403);
    }

    let body = {};
    try {
      body = await req.json();
    } catch {
      return error(req, 'Invalid JSON', 400);
    }

    const name = (body.name || '').trim();
    if (!name || name.length > 200) {
      return error(req, 'Name required (1-200 chars)', 400);
    }

    const description = (body.description || '').trim().slice(0, 1000);
    const isPublic = body.is_public ? 1 : 0;

    try {
      const kbId = crypto.randomUUID();
      await db.run(
        `INSERT INTO knowledge_bases (id, user_id, name, description, is_public, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, unixepoch(), unixepoch())`,
        [kbId, user.sub, name, description, isPublic]
      );

      // Log audit event
      await logAuditEvent(env, {
        actor_id: user.sub,
        action: 'knowledge_base_created',
        resource_type: 'knowledge_base',
        resource_id: kbId,
        metadata: { name, is_public: isPublic }
      });

      const kb = await getOwnedKB(db, kbId, user.sub);
      return json(req, { knowledge_base: kb }, 201);
    } catch (err) {
      console.error('Create KB failed:', err);
      return error(req, 'Failed to create knowledge base', 500);
    }
  }

  // GET /api/knowledge/:id - Get knowledge base details
  const getMatch = path.match(/^\/api\/knowledge\/([^/]+)$/);
  if (getMatch && req.method === 'GET') {
    const kbId = getMatch[1];
    try {
      const kb = await getOwnedKB(db, kbId, user.sub);
      if (!kb) return error(req, 'Knowledge base not found', 404);

      return json(req, { knowledge_base: kb });
    } catch (err) {
      console.error('Get KB failed:', err);
      return error(req, 'Failed to get knowledge base', 500);
    }
  }

  // PUT /api/knowledge/:id - Update knowledge base
  const putMatch = path.match(/^\/api\/knowledge\/([^/]+)$/);
  if (putMatch && req.method === 'PUT') {
    const kbId = putMatch[1];
    let body = {};
    try {
      body = await req.json();
    } catch {
      return error(req, 'Invalid JSON', 400);
    }

    // Check authorization for KB updates
    const authDecision = await authorize(env, user, {
      action: 'kb.write',
      resource: 'knowledge_base',
      resourceId: kbId
    });

    if (!authDecision.allow) {
      return error(req, authDecision.reason || 'Forbidden', 403);
    }

    try {
      const kb = await getOwnedKB(db, kbId, user.sub);
      if (!kb) return error(req, 'Knowledge base not found', 404);

      const name = body.name !== undefined ? String(body.name).trim() : kb.name;
      const description = body.description !== undefined ? String(body.description).trim().slice(0, 1000) : kb.description;
      const isPublic = body.is_public !== undefined ? (body.is_public ? 1 : 0) : kb.is_public;

      if (!name || name.length > 200) {
        return error(req, 'Name required (1-200 chars)', 400);
      }

      await db.run(
        `UPDATE knowledge_bases SET name = ?, description = ?, is_public = ?, updated_at = unixepoch()
         WHERE id = ? AND user_id = ?`,
        [name, description, isPublic, kbId, user.sub]
      );

      // Log audit event
      await logAuditEvent(env, {
        actor_id: user.sub,
        action: 'knowledge_base_updated',
        resource_type: 'knowledge_base',
        resource_id: kbId,
        metadata: { name, is_public: isPublic }
      });

      const updated = await getOwnedKB(db, kbId, user.sub);
      return json(req, { knowledge_base: updated });
    } catch (err) {
      console.error('Update KB failed:', err);
      return error(req, 'Failed to update knowledge base', 500);
    }
  }

  // DELETE /api/knowledge/:id - Delete knowledge base
  const delMatch = path.match(/^\/api\/knowledge\/([^/]+)$/);
  if (delMatch && req.method === 'DELETE') {
    const kbId = delMatch[1];

    // Check authorization for KB deletion
    const authDecision = await authorize(env, user, {
      action: 'kb.delete',
      resource: 'knowledge_base',
      resourceId: kbId
    });

    if (!authDecision.allow) {
      return error(req, authDecision.reason || 'Forbidden', 403);
    }

    try {
      const kb = await getOwnedKB(db, kbId, user.sub);
      if (!kb) return error(req, 'Knowledge base not found', 404);

      await db.run('DELETE FROM knowledge_bases WHERE id = ? AND user_id = ?', [kbId, user.sub]);

      // Log audit event
      await logAuditEvent(env, {
        actor_id: user.sub,
        action: 'knowledge_base_deleted',
        resource_type: 'knowledge_base',
        resource_id: kbId,
        metadata: { name: kb.name }
      });

      return json(req, { ok: true });
    } catch (err) {
      console.error('Delete KB failed:', err);
      return error(req, 'Failed to delete knowledge base', 500);
    }
  }

  // GET /api/knowledge/:id/files - List documents in KB
  const filesGetMatch = path.match(/^\/api\/knowledge\/([^/]+)\/files$/);
  if (filesGetMatch && req.method === 'GET') {
    const kbId = filesGetMatch[1];
    const url = new URL(req.url);
    const limit = Math.min(Math.max(parseInt(url.searchParams.get('limit') || '50'), 1), 100);
    const offset = Math.max(parseInt(url.searchParams.get('offset') || '0'), 0);

    try {
      const kb = await getOwnedKB(db, kbId, user.sub);
      if (!kb) return error(req, 'Knowledge base not found', 404);

      const files = await db.all(
        `SELECT
          d.id, d.filename, d.content_type, d.file_size,
          d.extraction_status, d.embedding_generated, d.created_at,
          kf.added_at
        FROM knowledge_files kf
        JOIN documents d ON kf.document_id = d.id
        WHERE kf.knowledge_base_id = ?
        ORDER BY kf.added_at DESC
        LIMIT ? OFFSET ?`,
        [kbId, limit, offset]
      );

      return json(req, { files, limit, offset });
    } catch (err) {
      console.error('List KB files failed:', err);
      return error(req, 'Failed to list files', 500);
    }
  }

  // POST /api/knowledge/:id/files/batch/add - Add multiple documents
  const batchAddMatch = path.match(/^\/api\/knowledge\/([^/]+)\/files\/batch\/add$/);
  if (batchAddMatch && req.method === 'POST') {
    const kbId = batchAddMatch[1];

    // Check authorization for adding files to KB
    const authDecision = await authorize(env, user, {
      action: 'kb.write',
      resource: 'knowledge_base',
      resourceId: kbId
    });

    if (!authDecision.allow) {
      return error(req, authDecision.reason || 'Forbidden', 403);
    }

    let body = {};
    try {
      body = await req.json();
    } catch {
      return error(req, 'Invalid JSON', 400);
    }

    const fileIds = Array.isArray(body.document_ids) ? body.document_ids : [];
    if (!fileIds.length || fileIds.length > 100) {
      return error(req, 'document_ids required (1-100 items)', 400);
    }

    try {
      const kb = await getOwnedKB(db, kbId, user.sub);
      if (!kb) return error(req, 'Knowledge base not found', 404);

      // Verify user owns all documents
      const docs = await db.all(
        `SELECT id FROM documents WHERE id IN (${fileIds.map(() => '?').join(',')}) AND user_id = ?`,
        [...fileIds, user.sub]
      );

      if (docs.length !== fileIds.length) {
        return error(req, 'One or more documents not found or not owned by user', 404);
      }

      // Insert knowledge_files, ignoring duplicates
      const addedIds = [];
      for (const docId of fileIds) {
        try {
          await db.run(
            `INSERT INTO knowledge_files (id, knowledge_base_id, document_id, added_at)
             VALUES (?, ?, ?, unixepoch())`,
            [crypto.randomUUID(), kbId, docId]
          );
          addedIds.push(docId);
        } catch (err) {
          // UNIQUE constraint violation - already exists, skip
          if (!/unique constraint/i.test(String(err))) throw err;
        }
      }

      await db.run(
        `UPDATE knowledge_bases SET updated_at = unixepoch() WHERE id = ?`,
        [kbId]
      );

      // Log audit event
      await logAuditEvent(env, {
        actor_id: user.sub,
        action: 'knowledge_base_files_added',
        resource_type: 'knowledge_base',
        resource_id: kbId,
        metadata: { added_count: addedIds.length, file_count: addedIds.length }
      });

      return json(req, { added_count: addedIds.length, added_ids: addedIds });
    } catch (err) {
      console.error('Batch add files failed:', err);
      return error(req, 'Failed to add files', 500);
    }
  }

  // DELETE /api/knowledge/:id/files/:fileId - Remove document from KB
  const fileDelMatch = path.match(/^\/api\/knowledge\/([^/]+)\/files\/([^/]+)$/);
  if (fileDelMatch && req.method === 'DELETE') {
    const [, kbId, fileId] = fileDelMatch;

    // Check authorization for removing files from KB
    const authDecision = await authorize(env, user, {
      action: 'kb.write',
      resource: 'knowledge_base',
      resourceId: kbId
    });

    if (!authDecision.allow) {
      return error(req, authDecision.reason || 'Forbidden', 403);
    }

    try {
      const kb = await getOwnedKB(db, kbId, user.sub);
      if (!kb) return error(req, 'Knowledge base not found', 404);

      const result = await db.run(
        `DELETE FROM knowledge_files WHERE knowledge_base_id = ? AND document_id = ?`,
        [kbId, fileId]
      );

      if (result.success && result.meta?.changes === 0) {
        return error(req, 'File not in knowledge base', 404);
      }

      // Log audit event
      await logAuditEvent(env, {
        actor_id: user.sub,
        action: 'knowledge_base_file_removed',
        resource_type: 'knowledge_base',
        resource_id: kbId,
        metadata: { file_id: fileId }
      });

      return json(req, { ok: true });
    } catch (err) {
      console.error('Remove file from KB failed:', err);
      return error(req, 'Failed to remove file', 500);
    }
  }

  return null;
}
