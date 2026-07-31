/**
 * File Upload Service
 *
 * Handles file uploads to R2 and metadata storage in D1
 */

import { error } from '../utils/response.js';
import { inferContentType } from '../shared/mime-types.js';
import { createRootLogger } from '../utils/logger.js';
import { withTimeout } from '../utils/promise.js';
const logger = createRootLogger({});

export const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB

const TEXT_LIKE_TYPES = new Set([
  'application/csv',
  'application/x-iif',
  'application/json',
  'application/json5',
  'application/x-json5',
  'application/x-ndjson',
  'application/ndjson',
  'application/xml',
  'application/x-xml',
  'application/yaml',
  'application/x-yaml',
  'application/javascript',
  'application/x-javascript',
  'application/typescript',
]);

export function isTextLikeContentType(type) {
  const normalized = String(type || '').toLowerCase();
  if (!normalized) return false;
  if (normalized.startsWith('text/')) return true;
  return TEXT_LIKE_TYPES.has(normalized);
}

/**
 * Validate file before upload
 * @param {Object} options
 * @param {string} options.filename - Original filename
 * @param {string} options.contentType - MIME type
 * @param {number} options.fileSize - Size in bytes
 * @returns {Object} - {valid: boolean, error?: string}
 */
export function validateFile({ filename, contentType, fileSize } = {}) {
  const normalizedType = String(contentType || '').toLowerCase();

  const isAllowedType = (type) => {
    if (!type) return false;
    if (type.startsWith('image/')) return true;
    if (type === 'application/pdf') return true;
    if (isTextLikeContentType(type)) return true;
    return false;
  };

  // Check file size
  if (fileSize > MAX_FILE_SIZE) {
    return {
      valid: false,
      error: `File size ${(fileSize / 1024 / 1024).toFixed(2)}MB exceeds 50MB limit`,
    };
  }

  // Check content type
  if (!isAllowedType(normalizedType)) {
    return {
      valid: false,
      error: `File type ${contentType || 'unknown'} not supported. Supported: text/code, images, pdf`,
    };
  }

  // Validate filename
  if (!filename || filename.length > 255) {
    return {
      valid: false,
      error: 'Invalid filename',
    };
  }

  return { valid: true };
}

export function inferContentTypeFromFilename(filename) {
  return inferContentType(filename);
}

export function resolveContentType(filename, contentType) {
  const explicit = String(contentType || '').trim();
  if (explicit) return explicit;
  const inferred = inferContentTypeFromFilename(filename);
  return inferred || 'application/octet-stream';
}

/**
 * Get file extension from content type
 * @param {string} contentType - MIME type
 * @returns {string} - File extension (without dot)
 */
function getExtensionFromContentType(contentType) {
  const type = String(contentType || '').toLowerCase();
  const typeMap = {
    'text/plain': 'txt',
    'text/markdown': 'md',
    'text/csv': 'csv',
    'text/tsv': 'tsv',
    'application/json': 'json',
    'application/json5': 'json5',
    'application/x-json5': 'json5',
    'application/x-ndjson': 'ndjson',
    'application/ndjson': 'ndjson',
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp',
    'application/pdf': 'pdf',
  };

  if (typeMap[type]) return typeMap[type];
  if (type.startsWith('text/')) return 'txt';
  return 'bin';
}

/**
 * Upload file to R2
 * @param {Object} options
 * @param {Object} options.env - Worker environment with R2 binding
 * @param {string} options.userId - User ID
 * @param {string} options.filename - Original filename
 * @param {string} options.contentType - MIME type
 * @param {ArrayBuffer} options.buffer - File buffer
 * @returns {Promise<Object>} - {r2Key, r2Url}
 */
export async function uploadFileToR2({ env, userId, filename, contentType, buffer } = {}) {
  if (!env.FILES) throw new Error('R2 binding not configured');

  // Generate unique file key
  const ext = getExtensionFromContentType(contentType);
  const fileId = crypto.randomUUID();
  const r2Key = `/user/${userId}/files/${fileId}.${ext}`;

  try {
    // Upload to R2
    const r2Object = await withTimeout(
      env.FILES.put(r2Key, buffer, {
        httpMetadata: {
          contentType,
          cacheControl: 'max-age=86400', // Cache for 1 day
        },
        customMetadata: {
          originalFilename: filename,
          uploadedAt: new Date().toISOString(),
          userId,
        },
      }),
      15000,
      'R2 upload timed out'
    );

    // Generate signed URL (valid for 7 days)
    // Note: In real implementation, you'd use R2 signed URLs
    // For now, return the key for signed URL generation
    const r2Url = `https://r2.example.com${r2Key}`;

    return {
      r2Key,
      r2Url,
      objectId: r2Object.id,
    };
  } catch (err) {
    logger.error('R2 upload failed', { error: err?.message || err });
    throw new Error(`R2 upload failed: ${err.message}`, { cause: err });
  }
}

/**
 * Delete file from R2
 * @param {Object} env - Worker environment with R2 binding
 * @param {string} r2Key - R2 object key
 */
export async function deleteFileFromR2(env, r2Key) {
  if (!env.FILES) return;

  try {
    await env.FILES.delete(r2Key);
  } catch (err) {
    logger.error('Failed to delete R2 object', { r2Key, error: err?.message || err });
    // Non-fatal error
  }
}

/**
 * Store file metadata in D1
 * @param {Object} db - Database connection
 * @param {Object} fileMetadata - {userId, chatId?, filename, contentType, fileSize, r2Key, r2Url}
 * @returns {Promise<string>} - Document ID
 */
export async function storeFileMetadata(db, fileMetadata) {
  const documentId = crypto.randomUUID();

  await db.run(
    `INSERT INTO documents
     (id, user_id, chat_id, filename, content_type, file_size, r2_key, r2_url,
      extraction_status, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, unixepoch(), unixepoch())`,
    [
      documentId,
      fileMetadata.userId,
      fileMetadata.chatId || null,
      fileMetadata.filename,
      fileMetadata.contentType,
      fileMetadata.fileSize,
      fileMetadata.r2Key,
      fileMetadata.r2Url,
    ]
  );

  return documentId;
}

/**
 * Get file metadata from D1
 * @param {Object} db - Database connection
 * @param {string} documentId - Document ID
 * @returns {Promise<Object>} - Document metadata
 */
export async function getFileMetadata(db, documentId) {
  return await db.first(`SELECT * FROM documents WHERE id = ?`, [documentId]);
}

/**
 * Get file metadata owned by a user
 * @param {Object} db - Database connection
 * @param {string} documentId - Document ID
 * @param {string} userId - User ID
 * @returns {Promise<Object>} - Owned document metadata
 */
export async function getOwnedDocument({ db, documentId, userId } = {}) {
  return await db.first('SELECT * FROM documents WHERE id = ? AND user_id = ?', [
    documentId,
    userId,
  ]);
}

/**
 * Require file metadata owned by a user
 * @param {Object} req - Request object
 * @param {Object} db - Database connection
 * @param {string} documentId - Document ID
 * @param {string} userId - User ID
 * @returns {Promise<Object>} - { doc } or { error }
 */
export async function requireOwnedDocument({ req, db, documentId, userId } = {}) {
  const doc = await getOwnedDocument({ db, documentId, userId });
  if (!doc) {
    return { error: error(req, 'Document not found', 404) };
  }
  return { doc };
}

/**
 * List user's documents
 * @param {Object} db - Database connection
 * @param {string} userId - User ID
 * @param {number} limit - Number of documents to return
 * @param {number} offset - Pagination offset
 * @returns {Promise<Array>} - Array of documents
 */
export async function listUserDocuments({ db, userId, limit = 20, offset = 0 } = {}) {
  return await db.all(
    `SELECT id, filename, content_type, file_size, text_excerpt, extraction_status,
            created_at, updated_at
     FROM documents
     WHERE user_id = ?
     ORDER BY created_at DESC
     LIMIT ? OFFSET ?`,
    [userId, limit, offset]
  );
}

/**
 * Delete document and associated R2 file
 * @param {Object} env - Worker environment
 * @param {Object} db - Database connection
 * @param {string} documentId - Document ID
 * @param {string} userId - User ID (for authorization)
 * @returns {Promise<boolean>} - Success status
 */
export async function deleteDocument({ env, db, documentId, userId } = {}) {
  // Check ownership
  const doc = await getOwnedDocument({ db, documentId, userId });

  if (!doc) {
    throw new Error('Document not found');
  }

  // Delete from R2
  await deleteFileFromR2(env, doc.r2_key);

  // Delete from D1 (cascades to message references)
  await db.run('DELETE FROM documents WHERE id = ? AND user_id = ?', [documentId, userId]);

  return true;
}
