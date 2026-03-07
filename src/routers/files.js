/**
 * File Management Router
 *
 * Handles file uploads to R2, document metadata, and document management
 */

import { createDB } from '../db.js';
import { error, json } from '../utils/response.js';
import {
  validateFile,
  uploadFileToR2,
  storeFileMetadata,
  getFileMetadata,
  listUserDocuments,
  deleteDocument,
} from '../services/uploads.js';
import { extractAndChunk } from '../services/extraction.js';
import { upsertDocumentChunks } from '../services/embeddings.js';

/**
 * File Router Handler
 * Routes:
 *   POST   /api/files/upload             - Upload file
 *   GET    /api/files                    - List user's documents
 *   GET    /api/files/:id                - Get document metadata
 *   GET    /api/files/search             - Search user's documents
 *   GET    /api/files/:id/process/status - Get extraction/embedding status
 *   GET    /api/files/:id/content        - Get safe content representation
 *   DELETE /api/files/:id                - Delete document and R2 file
 */
export async function filesRouter(req, env, ctx, user, path) {
  const isFilePath =
    path === '/api/files' ||
    path === '/api/files/upload' ||
    path === '/api/files/search' ||
    /^\/api\/files\/[^/]+$/.test(path) ||
    /^\/api\/files\/[^/]+\/process\/status$/.test(path) ||
    /^\/api\/files\/[^/]+\/content$/.test(path);
  if (!isFilePath) return null;

  if (!user) {
    return error(req, 'Unauthorized', 401);
  }

  function isMissingDocumentsTable(err) {
    return /no such table:\s*documents/i.test(String(err?.message || ''));
  }

  // POST /api/files/upload - Upload file
  if (req.method === 'POST' && path === '/api/files/upload') {
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
      const contentType = file.type;
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

      // Extract and chunk content asynchronously
      ctx.waitUntil(
        extractAndChunk(env, db, documentId, contentType, buffer)
          .then(async (extractResult) => {
            console.log(
              `Document ${documentId} extraction complete: ${extractResult.chunkCount} chunks`
            );

            // Get chunks for embedding generation
            const chunks = await db.all(
              `SELECT id, chunk_text as text, document_id as documentId, chunk_index as chunkIndex
               FROM document_chunks WHERE document_id = ?`,
              [documentId]
            );

            if (chunks.length > 0) {
              // Generate embeddings for chunks
              await upsertDocumentChunks(env, db, chunks).catch((err) => {
                console.error(`Failed to generate embeddings for document ${documentId}:`, err);
              });
            }
          })
          .catch((err) => {
            console.error(`Failed to process document ${documentId}:`, err);
          })
      );

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
          embedding_generated: 0, // pending
          created_at: Math.floor(Date.now() / 1000),
        },
        201
      );
    } catch (err) {
      console.error('File upload failed:', err);
      return error(req, 'File upload failed: ' + err.message, 500);
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
      console.error('File list failed:', err);
      return error(req, 'Failed to list documents', 500);
    }
  }

  // GET /api/files/:id - Get document metadata
  if (req.method === 'GET' && path !== '/api/files/search' && path.match(/^\/api\/files\/[^/]+$/)) {
    const documentId = path.split('/').pop();
    const db = createDB(env.DB);

    try {
      const doc = await getFileMetadata(db, documentId);

      if (!doc || doc.user_id !== user.sub) {
        return error(req, 'Not found', 404);
      }

      return json(req, doc);
    } catch (err) {
      console.error('Get document failed:', err);
      return error(req, 'Failed to get document', 500);
    }
  }

  // DELETE /api/files/:id - Delete document
  if (req.method === 'DELETE' && path.match(/^\/api\/files\/[^/]+$/)) {
    const documentId = path.split('/').pop();
    const db = createDB(env.DB);

    try {
      await deleteDocument(env, db, documentId, user.sub);
      return json(req, { success: true });
    } catch (err) {
      console.error('Delete document failed:', err);

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
          extraction_status, embedding_generated,
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
      console.error('Document search failed:', err);
      return error(req, 'Search failed', 500);
    }
  }

  // GET /api/files/:id/process/status - Get extraction/embedding status
  const statusMatch = path.match(/^\/api\/files\/([^/]+)\/process\/status$/);
  if (statusMatch && req.method === 'GET') {
    const documentId = statusMatch[1];
    const db = createDB(env.DB);

    try {
      const doc = await db.first(
        `SELECT
          id, filename, extraction_status, extraction_error,
          embedding_generated, embedding_error, created_at, updated_at
        FROM documents
        WHERE id = ? AND user_id = ?`,
        [documentId, user.sub]
      );

      if (!doc) {
        return error(req, 'Document not found', 404);
      }

      // Map numeric status to human-readable state
      const extractionState = doc.extraction_status === 1 ? 'done' :
                             doc.extraction_status === -1 ? 'failed' : 'pending';
      const embeddingState = doc.embedding_generated === 1 ? 'done' :
                            doc.embedding_generated === -1 ? 'failed' : 'pending';

      return json(req, {
        id: doc.id,
        filename: doc.filename,
        extraction: {
          status: extractionState,
          error: doc.extraction_error || null,
        },
        embedding: {
          status: embeddingState,
          error: doc.embedding_error || null,
        },
        created_at: doc.created_at,
        updated_at: doc.updated_at,
      });
    } catch (err) {
      console.error('Get process status failed:', err);
      return error(req, 'Failed to get status', 500);
    }
  }

  // GET /api/files/:id/content - Get safe text representation of file
  const contentMatch = path.match(/^\/api\/files\/([^/]+)\/content$/);
  if (contentMatch && req.method === 'GET') {
    const documentId = contentMatch[1];
    const db = createDB(env.DB);

    try {
      const doc = await db.first(
        `SELECT
          id, filename, content_type, text_excerpt, extraction_status
        FROM documents
        WHERE id = ? AND user_id = ?`,
        [documentId, user.sub]
      );

      if (!doc) {
        return error(req, 'Document not found', 404);
      }

      // Determine safe representation based on content type
      let responseType = 'text/plain';
      let content = null;

      if (doc.content_type?.startsWith('application/json')) {
        responseType = 'application/json';
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
      console.error('Get file content failed:', err);
      return error(req, 'Failed to get content', 500);
    }
  }

  return null;
}
