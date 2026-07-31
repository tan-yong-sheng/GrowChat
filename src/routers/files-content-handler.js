/**
 * File content handler (GET /api/files/:id/content)
 *
 * Returns safe text representation of a file's content based on its type.
 */
import { json, error } from '../utils/response.js';
import { HTTP_STATUS } from '../shared/http-status.js';
import { requireOwnedDocument, isTextLikeContentType, MAX_FILE_SIZE } from '../services/uploads.js';
import { prepareFileHandlerContext } from './files-handler-helpers.js';

function parseTextContent(contentType, text) {
  if (contentType?.startsWith('application/json')) {
    try {
      return JSON.parse(text || '{}');
    } catch {
      return { error: 'Failed to parse JSON content' };
    }
  }
  return text || '[No text content extracted]';
}

async function fetchTextContent(req, files, doc) {
  if (typeof files?.get !== 'function') {
    return { content: parseTextContent(doc.content_type, doc.text_excerpt) };
  }

  if (doc.file_size > MAX_FILE_SIZE) {
    return {
      response: error(req, 'File too large to preview', HTTP_STATUS.BAD_REQUEST),
    };
  }

  // Fetch only the bytes needed for the 500-char preview plus UTF-8 headroom.
  // R2's range option avoids buffering the full object into Worker memory.
  const object = await files.get(doc.r2_key, { range: { length: 2000 } });
  if (!object) {
    return { response: error(req, 'File not found', HTTP_STATUS.NOT_FOUND) };
  }

  try {
    const buffer = await object.arrayBuffer();
    const text = new TextDecoder().decode(buffer).slice(0, 500);
    return { content: parseTextContent(doc.content_type, text) };
  } catch (_err) {
    return {
      response: error(req, 'Failed to read file content', HTTP_STATUS.INTERNAL_SERVER_ERROR),
    };
  }
}

function resolveBinaryContent(doc) {
  return {
    filename: doc.filename,
    type: doc.content_type,
    status: doc.extraction_status === 1 ? 'extracted' : 'pending',
    note: 'Binary file - text excerpt not available',
  };
}

export async function handleFileContent({
  req,
  env,
  ctx: _ctx,
  user,
  documentId,
  requestContext = {},
}) {
  const ctx2 = await prepareFileHandlerContext(req, env, requestContext, user);
  if (!ctx2.ok) return ctx2.response;

  const { logger, db } = ctx2;

  try {
    const owned = await requireOwnedDocument({ req, db, documentId, userId: user.sub });
    if (owned.error) return owned.error;
    const doc = owned.doc;

    let content;
    if (isTextLikeContentType(doc.content_type)) {
      const result = await fetchTextContent(req, env.FILES, doc);
      if (result.response) return result.response;
      content = result.content;
    } else {
      content = resolveBinaryContent(doc);
    }

    return json(req, {
      id: doc.id,
      filename: doc.filename,
      type: doc.content_type,
      content,
      extracted: doc.extraction_status === 1,
    });
  } catch (err) {
    logger.error('Get file content failed', { error: err?.message || err });
    return error(req, 'Failed to get content', HTTP_STATUS.INTERNAL_SERVER_ERROR);
  }
}
