/**
 * File upload handler (POST /api/files/upload)
 *
 * Handles multipart/form-data file uploads to R2 with metadata storage in D1,
 * async document extraction, rate limiting, and audit logging.
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
} from '../services/uploads.js';
import { extractDocumentText } from '../services/extraction.js';
import { createLogger } from '../utils/logger.js';

export async function handleFileUpload(req, env, ctx, user, requestContext = {}) {
  const logger =
    requestContext.logger || createLogger(env, { requestId: requestContext.requestId });

  const authDecision = await authorize(env, user, { action: 'file.upload', resource: 'file' });
  if (!authDecision.allow) {
    const statusMap = { server_error: 500, unauthorized: 401, not_found: 404 };
    return error(req, authDecision.reason || 'Forbidden', statusMap[authDecision.code] || 403);
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
    const formData = await req.formData();
    const file = formData.get('file');
    const chatId = formData.get('chat_id');
    if (!file) return error(req, 'file field required', 400);

    const filename = file.name;
    const contentType = resolveContentType(filename, file.type);
    const buffer = await file.arrayBuffer();
    const fileSize = buffer.byteLength;

    const validation = validateFile({ filename, contentType, fileSize });
    if (!validation.valid) return error(req, validation.error, 400);

    const r2Result = await uploadFileToR2({ env, userId: user.sub, filename, contentType, buffer });
    const documentId = await storeFileMetadata(db, {
      userId: user.sub,
      chatId: chatId || null,
      filename,
      contentType,
      fileSize,
      r2Key: r2Result.r2Key,
      r2Url: r2Result.r2Url,
    });

    await logAuditEvent(env, {
      actor_id: user.sub,
      action: 'file_uploaded',
      resource_type: 'file',
      resource_id: documentId,
      metadata: { filename, contentType, fileSize },
    });

    if (!contentType.includes('json')) {
      ctx.waitUntil(
        extractDocumentText({ env, db, documentId, contentType, buffer })
          .then((r) => {
            if (r?.skipped)
              logger.info('Document extraction skipped', { documentId, reason: r.reason });
            else logger.info('Document extraction complete', { documentId });
          })
          .catch((err) =>
            logger.error('Failed to process document extraction', {
              documentId,
              error: err?.message || err,
            })
          )
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
        extraction_status: 0,
        created_at: Math.floor(Date.now() / 1000),
      },
      201
    );
  } catch (err) {
    const msg = err?.message || 'File upload failed';
    const status = String(msg).includes('R2') ? 504 : 500;
    logger.error('File upload failed', { error: err?.message || err });
    return error(req, `File upload failed: ${msg}`, status);
  }
}
