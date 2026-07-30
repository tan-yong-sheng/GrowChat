/**
 * Shared helpers for file upload handling
 */
import { error, json, authError } from '../utils/response.js';
import { HTTP_STATUS } from '../shared/http-status.js';
import { createLogger } from '../utils/logger.js';
import { authorize, logAuditEvent } from '../utils/authorize.js';
import { RATE_LIMITS, checkRateLimit } from '../services/rate-limit.js';
import {
  validateFile,
  resolveContentType,
  uploadFileToR2,
  storeFileMetadata,
} from '../services/uploads.js';

const MILLISECONDS_PER_SECOND = 1000;
const EXTRACTION_STATUS_DONE = 1;

export function getRequestLogger(env, requestContext) {
  return requestContext.logger || createLogger(env, { requestId: requestContext.requestId });
}

export async function authorizeFileUpload(env, user, req) {
  const decision = await authorize(env, user, { action: 'file.upload', resource: 'file' });
  if (!decision.allow) return authError(req, decision);
  return null;
}

export async function checkUploadRateLimit(env, user, req) {
  const result = await checkRateLimit(env, {
    action: 'file-upload',
    subject: user.sub,
    ...RATE_LIMITS.fileUpload,
  });
  if (!result.allowed) {
    return error(req, 'Too many file uploads', HTTP_STATUS.TOO_MANY_REQUESTS, {
      retry_after: Math.ceil((result.resetAt - Date.now()) / MILLISECONDS_PER_SECOND),
    });
  }
  return null;
}

export async function parseUploadForm(req) {
  const formData = await req.formData();
  const file = formData.get('file');
  const chatId = formData.get('chat_id');
  if (!file) return error(req, 'file field required', HTTP_STATUS.BAD_REQUEST);
  return { file, chatId };
}

export async function resolveUploadFileData(req, file, chatId) {
  const filename = file.name;
  const contentType = resolveContentType(filename, file.type);
  const buffer = await file.arrayBuffer();
  const fileSize = buffer.byteLength;
  const validation = validateFile({ filename, contentType, fileSize });
  if (!validation.valid) return error(req, validation.error, HTTP_STATUS.BAD_REQUEST);
  return { filename, contentType, buffer, fileSize, chatId };
}

export async function persistUploadedFile(env, db, user, fileData) {
  const { filename, contentType, fileSize, chatId, buffer } = fileData;
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
  return { documentId, r2Result };
}

export async function logFileUploadEvent(env, user, documentId, fileData) {
  const { filename, contentType, fileSize } = fileData;
  await logAuditEvent(env, {
    actor_id: user.sub,
    action: 'file_uploaded',
    resource_type: 'file',
    resource_id: documentId,
    metadata: { filename, contentType, fileSize },
  });
}

// Extraction removed in repo-reduction pass (see docs/REDUCTION_HANDOFF_PLAN.md row 4).
// Replaced with a no-op; documents are inserted with extraction_status = 1 (done).
export function scheduleDocumentExtraction(_ctx, _documentId, _fileData, deps) {
  deps?.logger?.info?.('Document extraction removed (repo-reduction pass)', {});
}

export function buildUploadResponse(req, documentId, fileData, r2Result) {
  const { filename, contentType, fileSize } = fileData;
  return json(
    req,
    {
      id: documentId,
      filename,
      content_type: contentType,
      file_size: fileSize,
      r2_key: r2Result.r2Key,
      r2_url: r2Result.r2Url,
      extraction_status: EXTRACTION_STATUS_DONE,
      created_at: Math.floor(Date.now() / MILLISECONDS_PER_SECOND),
    },
    HTTP_STATUS.CREATED
  );
}

export function resolveUploadError(req, err, logger) {
  const msg = err?.message || 'File upload failed';
  const status = String(msg).includes('R2')
    ? HTTP_STATUS.GATEWAY_TIMEOUT
    : HTTP_STATUS.INTERNAL_SERVER_ERROR;
  logger.error('File upload failed', { error: err?.message || err });
  return error(req, `File upload failed: ${msg}`, status);
}
