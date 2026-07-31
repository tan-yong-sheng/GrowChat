/**
 * File upload handler (POST /api/files/upload)
 *
 * Handles multipart/form-data file uploads to R2 with metadata storage in D1,
 * rate limiting, and audit logging. Document extraction is a no-op after row 4
 * reduction; uploads are stored with extraction_status set to 1 (done).
 */
import { createDB } from '../db.js';
import {
  authorizeFileUpload,
  checkUploadRateLimit,
  parseUploadForm,
  resolveUploadFileData,
  persistUploadedFile,
  logFileUploadEvent,
  scheduleDocumentExtraction,
  buildUploadResponse,
  resolveUploadError,
  getRequestLogger,
} from './files-upload-helpers.js';
export async function handleFileUpload({ req, env, ctx, user, requestContext = {} }) {
  const logger = getRequestLogger(env, requestContext);
  const db = createDB(env.DB);

  try {
    const authErrorResponse = await authorizeFileUpload(env, user, req);
    if (authErrorResponse) return authErrorResponse;

    const rateLimitResponse = await checkUploadRateLimit(env, user, req);
    if (rateLimitResponse) return rateLimitResponse;

    const formResult = await parseUploadForm(req);
    if (formResult instanceof Response) return formResult;

    const fileDataResult = await resolveUploadFileData(req, formResult.file, formResult.chatId);
    if (fileDataResult instanceof Response) return fileDataResult;

    const { documentId, r2Result } = await persistUploadedFile(env, db, user, fileDataResult);

    await logFileUploadEvent(env, user, documentId, fileDataResult);

    scheduleDocumentExtraction(ctx, documentId, fileDataResult, { env, db, logger });

    return buildUploadResponse(req, documentId, fileDataResult, r2Result);
  } catch (err) {
    return resolveUploadError(req, err, logger);
  }
}
