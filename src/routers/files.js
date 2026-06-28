/**
 * File Management Router
 *
 * Handles file uploads to R2, document metadata, and document management
 */

import { createDB } from '../db.js';
import { error, json } from '../utils/response.js';
import { authorize, logAuditEvent } from '../utils/authorize.js';
import { RATE_LIMITS, checkRateLimit } from '../services/rate-limit.js';
import {
  validateFile,
  resolveContentType,
  uploadFileToR2,
  storeFileMetadata,
  requireOwnedDocument,
  listUserDocuments,
  deleteDocument,
} from '../services/uploads.js';
import { extractDocumentText } from '../services/extraction.js';
import { createLogger } from '../utils/logger.js';

/**
 * File Router Handler
 * Routes:
 *   POST   /api/files/upload             - Upload file
 *   GET    /api/files                    - List user's documents
 *   GET    /api/files/:id                - Get document metadata
 *   GET    /api/files/search             - Search user's documents
 *   GET    /api/files/:id/blob           - Get raw file contents (authorized)
 *   GET    /api/files/:id/process/status - Get extraction status
 *   GET    /api/files/:id/content        - Get safe content representation
 *   DELETE /api/files/:id                - Delete document and R2 file
 */
export async function filesRouter(req, env, ctx, user, path, requestContext = {}) {
  const logger =
    requestContext.logger || createLogger(env, { requestId: requestContext.requestId });
  const isFilePath =
    path === '/api/files' ||
    path === '/api/files/health' ||
    path === '/api/files/upload' ||
    path === '/api/files/search' ||
    /^\/api\/files\/[^/]+$/.test(path) ||
    /^\/api\/files\/[^/]+\/blob$/.test(path) ||
    /^\/api\/files\/[^/]+\/process\/status$/.test(path) ||
    /^\/api\/files\/[^/]+\/content$/.test(path);
  if (!isFilePath) return null;

  if (!user) {
    return error(req, 'Unauthorized', 401);
  }

  function isMissingDocumentsTable(err) {
    return /no such table:\s*documents/i.test(String(err?.message || ''));
  }

  // GET /api/files/health - R2 health check
  if (req.method === 'GET' && path === '/api/files/health') {
    if (!env.FILES) {
      return error(req, 'FILES binding missing', 500);
    }

    const withTimeout = (promise, ms) => {
      if (!ms || ms <= 0) return promise;
      let timer;
      const timeout = new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error('R2 health check timed out')), ms);
      });
      return Promise.race([promise.finally(() => clearTimeout(timer)), timeout]);
    };

    try {
      await withTimeout(env.FILES.list({ limit: 1 }), 3000);
      return json(req, { ok: true, message: 'R2 reachable' });
    } catch (err) {
      const message = err?.message || 'R2 health check failed';
      return error(req, `R2 unreachable: ${message}`, 503);
    }
  }

  // POST /api/files/upload - Upload file
  if (req.method === 'POST' && path === '/api/files/upload') {
    // Check authorization
    const authDecision = await authorize(env, user, {
      action: 'file.upload',
      resource: 'file',
    });

    if (!authDecision.allow) {
      const statusCodeMap = {
        server_error: 500,
        unauthorized: 401,
        not_found: 404,
      };
      const statusCode = statusCodeMap[authDecision.code] || 403;
      return error(req, authDecision.reason || 'Forbidden', statusCode);
    }

    const uploadLimit = await checkRateLimit(env, {
      action: 'file-upload',
      subject: user.sub,
      ...RATE_LIMITS.fileUpload,
    });
    if (!uploadLimit.allowed) {
      return error(req, 'Too many file uploads', 429, {
        retry_after: Math.ceil((uploadLimit.resetAt - Date.now()) / 1000),
      });
    }

    const db = createDB(env.DB);

    try {
      // Parse multipart/form-data
      const formData = await req.formData();
      const file = formData.get('file');
      const chatId = formData.get('chat_id'); // Optional

      if (!file) {
        return error(req, 'file field required', 400);
      }

      const filename = file.name;
      const contentType = resolveContentType(filename, file.type);
      const buffer = await file.arrayBuffer();
      const fileSize = buffer.byteLength;

      // Validate file
      const validation = validateFile(filename, contentType, fileSize);
      if (!validation.valid) {
        return error(req, validation.error, 400);
      }

      // Upload to R2
      const r2Result = await uploadFileToR2(env, user.sub, filename, contentType, buffer);

      // Store metadata in D1
      const documentId = await storeFileMetadata(db, {
        userId: user.sub,
        chatId: chatId || null,
        filename,
        contentType,
        fileSize,
        r2Key: r2Result.r2Key,
        r2Url: r2Result.r2Url,
      });

      // Log audit event
      await logAuditEvent(env, {
        actor_id: user.sub,
        action: 'file_uploaded',
        resource_type: 'file',
        resource_id: documentId,
        metadata: { filename, contentType, fileSize },
      });

      // Extract content asynchronously
      // Skip extraction for JSON files (avoid memory overhead for config/data files)
      if (!contentType.includes('json')) {
        ctx.waitUntil(
          extractDocumentText({ env, db, documentId, contentType, buffer })
            .then(async (extractResult) => {
              if (extractResult?.skipped) {
                logger.info('Document extraction skipped', {
                  documentId,
                  reason: extractResult.reason || 'unsupported type',
                });
                return;
              }
              logger.info('Document extraction complete', { documentId });
            })
            .catch((err) => {
              logger.error('Failed to process document extraction', {
                documentId,
                error: err?.message || err,
              });
            })
        );
      } else {
        logger.info('Document extraction skipped for JSON file', { documentId });
      }

      return json(
        req,
        {
          id: documentId,
          filename,
          content_type: contentType,
          file_size: fileSize,
          r2_key: r2Result.r2Key,
          r2_url: r2Result.r2Url,
          extraction_status: 0, // pending
          created_at: Math.floor(Date.now() / 1000),
        },
        201
      );
    } catch (err) {
      const message = err?.message || 'File upload failed';
      const status = String(message).includes('R2 upload timed out') ? 504 : 500;
      logger.error('File upload failed', { error: err?.message || err });
      return error(req, `File upload failed: ${message}`, status);
    }
  }

  // GET /api/files - List user's documents
  if (req.method === 'GET' && path === '/api/files') {
    const db = createDB(env.DB);
    const limit = Math.min(parseInt(new URL(req.url).searchParams.get('limit') || '20'), 100);
    const offset = parseInt(new URL(req.url).searchParams.get('offset') || '0');

    try {
      const documents = await listUserDocuments(db, user.sub, limit, offset);
      return json(req, { documents });
    } catch (err) {
      if (isMissingDocumentsTable(err)) {
        return json(req, { documents: [] });
      }
      logger.error('File list failed', { error: err?.message || err });
      return error(req, 'Failed to list documents', 500);
    }
  }

  // GET /api/files/:id - Get document metadata
  if (req.method === 'GET' && path !== '/api/files/search' && path.match(/^\/api\/files\/[^/]+$/)) {
    const documentId = path.split('/').pop();
    const db = createDB(env.DB);

    try {
      const owned = await requireOwnedDocument(req, db, documentId, user.sub);
      if (owned.error) return owned.error;

      return json(req, owned.doc);
    } catch (err) {
      logger.error('Get document failed', { error: err?.message || err });
      return error(req, 'Failed to get document', 500);
    }
  }

  // DELETE /api/files/:id - Delete document
  if (req.method === 'DELETE' && path.match(/^\/api\/files\/[^/]+$/)) {
    // Check authorization
    const authDecision = await authorize(env, user, {
      action: 'file.delete',
      resource: 'file',
      resourceId: path.split('/').pop(),
    });

    if (!authDecision.allow) {
      const statusCodeMap = {
        server_error: 500,
        unauthorized: 401,
        not_found: 404,
      };
      const statusCode = statusCodeMap[authDecision.code] || 403;
      return error(req, authDecision.reason || 'Forbidden', statusCode);
    }

    const documentId = path.split('/').pop();
    const db = createDB(env.DB);

    try {
      await deleteDocument(env, db, documentId, user.sub);

      // Log audit event
      await logAuditEvent(env, {
        actor_id: user.sub,
        action: 'file_deleted',
        resource_type: 'file',
        resource_id: documentId,
      });

      return json(req, { success: true });
    } catch (err) {
      logger.error('Delete document failed', { error: err?.message || err });

      if (err.message === 'Document not found') {
        return error(req, 'Not found', 404);
      }

      return error(req, 'Failed to delete document', 500);
    }
  }

  // GET /api/files/search - Search user's documents
  if (req.method === 'GET' && path === '/api/files/search') {
    const db = createDB(env.DB);
    const url = new URL(req.url);
    const q = (url.searchParams.get('q') || '').trim();
    const limit = Math.min(Math.max(parseInt(url.searchParams.get('limit') || '20'), 1), 100);
    const offset = Math.max(parseInt(url.searchParams.get('offset') || '0'), 0);

    if (q.length > 200) {
      return error(req, 'Search query exceeds 200 characters', 400);
    }

    try {
      const documents = await db.all(
        `SELECT
          id, filename, content_type, file_size, text_excerpt,
          extraction_status,
          created_at, updated_at
        FROM documents
        WHERE user_id = ? AND filename LIKE ?
        ORDER BY updated_at DESC
        LIMIT ? OFFSET ?`,
        [user.sub, `%${q}%`, limit, offset]
      );

      return json(req, { documents, query: q, limit, offset });
    } catch (err) {
      if (isMissingDocumentsTable(err)) {
        return json(req, { documents: [], query: q, limit, offset });
      }
      logger.error('Document search failed', { error: err?.message || err });
      return error(req, 'Search failed', 500);
    }
  }

  // GET /api/files/:id/blob - Get raw file contents (authorized)
  const blobMatch = path.match(/^\/api\/files\/([^/]+)\/blob$/);
  if (blobMatch && req.method === 'GET') {
    if (!env.FILES) {
      return error(req, 'FILES binding missing', 500);
    }
    const documentId = blobMatch[1];
    const db = createDB(env.DB);

    try {
      const owned = await requireOwnedDocument(req, db, documentId, user.sub);
      if (owned.error) return owned.error;
      const doc = owned.doc;

      const object = await env.FILES.get(doc.r2_key);
      if (!object || !object.body) {
        return error(req, 'File not found', 404);
      }

      const safeName = String(doc.filename || 'file').replace(/["\\]/g, '_');
      const headers = new Headers();
      headers.set(
        'Content-Type',
        doc.content_type || object.httpMetadata?.contentType || 'application/octet-stream'
      );
      headers.set('Content-Disposition', `inline; filename="${safeName}"`);
      headers.set('Cache-Control', 'private, max-age=3600');

      return new Response(object.body, { status: 200, headers });
    } catch (err) {
      logger.error('Get file blob failed', { error: err?.message || err });
      return error(req, 'Failed to fetch file', 500);
    }
  }

  // GET /api/files/:id/process/status - Get extraction status
  const statusMatch = path.match(/^\/api\/files\/([^/]+)\/process\/status$/);
  if (statusMatch && req.method === 'GET') {
    const documentId = statusMatch[1];
    const db = createDB(env.DB);

    try {
      const owned = await requireOwnedDocument(req, db, documentId, user.sub);
      if (owned.error) return owned.error;
      const doc = owned.doc;

      // Map numeric status to human-readable state
      const extractionState =
        doc.extraction_status === 1 ? 'done' : doc.extraction_status === -1 ? 'failed' : 'pending';

      return json(req, {
        id: doc.id,
        filename: doc.filename,
        extraction: {
          status: extractionState,
          error: doc.extraction_error || null,
        },
        created_at: doc.created_at,
        updated_at: doc.updated_at,
      });
    } catch (err) {
      logger.error('Get process status failed', { error: err?.message || err });
      return error(req, 'Failed to get status', 500);
    }
  }

  // GET /api/files/:id/content - Get safe text representation of file
  const contentMatch = path.match(/^\/api\/files\/([^/]+)\/content$/);
  if (contentMatch && req.method === 'GET') {
    const documentId = contentMatch[1];
    const db = createDB(env.DB);

    try {
      const owned = await requireOwnedDocument(req, db, documentId, user.sub);
      if (owned.error) return owned.error;
      const doc = owned.doc;

      // Determine safe representation based on content type
      let content = null;

      if (doc.content_type?.startsWith('application/json')) {
        try {
          content = JSON.parse(doc.text_excerpt || '{}');
        } catch {
          content = { error: 'Failed to parse JSON content' };
        }
      } else if (doc.content_type?.startsWith('text/')) {
        // Plain text content
        content = doc.text_excerpt || '[No text content extracted]';
      } else {
        // Other binary formats - return safe metadata only
        content = {
          filename: doc.filename,
          type: doc.content_type,
          status: doc.extraction_status === 1 ? 'extracted' : 'pending',
          note: 'Binary file - text excerpt not available',
        };
      }

      return json(req, {
        id: doc.id,
        filename: doc.filename,
        type: doc.content_type,
        content: content,
        extracted: doc.extraction_status === 1,
      });
    } catch (err) {
      logger.error('Get file content failed', { error: err?.message || err });
      return error(req, 'Failed to get content', 500);
    }
  }

  return null;
}
