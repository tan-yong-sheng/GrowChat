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
 *   DELETE /api/files/:id                - Delete document and R2 file
 */
export async function filesRouter(req, env, ctx, user, path) {
  if (!user) {
    return error(req, 'Unauthorized', 401);
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
      console.error('File list failed:', err);
      return error(req, 'Failed to list documents', 500);
    }
  }

  // GET /api/files/:id - Get document metadata
  if (req.method === 'GET' && path.match(/^\/api\/files\/[^/]+$/)) {
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

  return null;
}
