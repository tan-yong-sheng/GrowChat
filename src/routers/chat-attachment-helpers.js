import { HTTP_STATUS } from '../shared/http-status.js';
import { error } from '../utils/response.js';
import { loadAttachmentDocuments, buildAttachmentParts } from './chat-core.js';
import {
  STRICT_ATTACHMENT_CAPS,
  formatUnsupportedAttachmentMessage,
  getAttachmentKinds,
  getModelAttachmentCapsEntry,
  getUnsupportedAttachmentKinds,
  getUnsupportedAttachmentKindsStrict,
  loadModelAttachmentCaps,
  isSupportedAttachmentType,
} from '../chat/attachments.js';

/**
 * Load, validate, and prepare attachments for a chat message.
 * Returns { error: Response } on failure or { attachmentDocs, attachmentParts, attachmentKinds }
 * on success. attachmentKinds is filtered to non-text kinds after validation.
 *
 * @param {Object} params - Parameters bundle
 * @param {Request} params.req - Incoming request
 * @param {Object} params.env - Worker environment
 * @param {D1Database} params.db - Database connection
 * @param {Object} params.user - Authenticated user
 * @param {string[]} params.attachmentIds - Attachment document IDs
 * @param {string} params.model - Model to validate against
 */
export async function loadAndValidateAttachments({ req, env, db, user, attachmentIds, model }) {
  if (attachmentIds.length === 0) {
    return { attachmentDocs: [], attachmentParts: [], attachmentKinds: [] };
  }

  if (!env.FILES) {
    return { error: error(req, 'FILES binding missing', HTTP_STATUS.INTERNAL_SERVER_ERROR) };
  }

  const attachmentDocs = await loadAttachmentDocs(req, db, user, attachmentIds);
  if (attachmentDocs.error) return attachmentDocs;

  const unsupportedTypes = findUnsupportedTypes(attachmentDocs.attachmentDocs);
  if (unsupportedTypes.error) {
    return {
      error: error(
        req,
        `Unsupported attachment type for: ${unsupportedTypes.list}`,
        HTTP_STATUS.BAD_REQUEST
      ),
    };
  }

  const attachmentParts = await buildParts(req, env, attachmentDocs.attachmentDocs);
  if (attachmentParts.error) return attachmentParts;

  const capsResult = await validateCapabilities(req, db, model, attachmentDocs.attachmentDocs);
  if (capsResult.error) return capsResult;

  return {
    attachmentDocs: attachmentDocs.attachmentDocs,
    attachmentParts: attachmentParts.attachmentParts,
    attachmentKinds: capsResult.attachmentKinds,
  };
}

async function loadAttachmentDocs(req, db, user, attachmentIds) {
  try {
    return { attachmentDocs: await loadAttachmentDocuments(db, user.sub, attachmentIds) };
  } catch (err) {
    return { error: error(req, err?.message || 'Invalid attachments', HTTP_STATUS.BAD_REQUEST) };
  }
}

function findUnsupportedTypes(attachmentDocs) {
  const unsupported = attachmentDocs.filter((doc) => {
    const type = String(doc.content_type || '').trim();
    return !isSupportedAttachmentType(type);
  });
  if (unsupported.length > 0) {
    return { error: true, list: unsupported.map((doc) => doc.filename || doc.id).join(', ') };
  }
  return {};
}

async function buildParts(req, env, attachmentDocs) {
  try {
    return { attachmentParts: await buildAttachmentParts(env, attachmentDocs) };
  } catch (err) {
    return {
      error: error(req, err?.message || 'Failed to load attachments', HTTP_STATUS.BAD_REQUEST),
    };
  }
}

async function validateCapabilities(req, db, model, attachmentDocs) {
  const kinds = getAttachmentKinds(attachmentDocs);
  const nonLocalKinds = kinds.filter((kind) => kind !== 'text');
  const caps = await loadModelAttachmentCaps(db);
  const modelCaps = getModelAttachmentCapsEntry(caps, model);

  const unsupported = nonLocalKinds.length
    ? STRICT_ATTACHMENT_CAPS
      ? getUnsupportedAttachmentKindsStrict(modelCaps, nonLocalKinds)
      : getUnsupportedAttachmentKinds(modelCaps, nonLocalKinds)
    : [];
  if (kinds.includes('text') && modelCaps?.text !== true) {
    unsupported.push('text');
  }

  if (unsupported.length > 0) {
    return {
      error: error(req, 'attachments_not_supported', HTTP_STATUS.BAD_REQUEST, {
        message: modelCaps
          ? formatUnsupportedAttachmentMessage(unsupported)
          : 'Attachment capabilities not configured for this model.',
        unsupported_types: unsupported,
        resumable: false,
      }),
    };
  }

  return { attachmentKinds: nonLocalKinds };
}
