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
 */
export async function loadAndValidateAttachments(req, env, db, user, attachmentIds, model) {
  let attachmentDocs = [];
  let attachmentParts = [];
  let attachmentKinds = [];

  if (attachmentIds.length > 0) {
    if (!env.FILES) {
      return { error: error(req, 'FILES binding missing', 500) };
    }
    try {
      attachmentDocs = await loadAttachmentDocuments(db, user.sub, attachmentIds);
    } catch (err) {
      return { error: error(req, normalizeErrorMessage(err, 'Invalid attachments'), 400) };
    }

    const unsupported = attachmentDocs.filter((doc) => {
      const type = String(doc.content_type || '').trim();
      return !isSupportedAttachmentType(type);
    });
    if (unsupported.length > 0) {
      const list = unsupported.map((doc) => doc.filename || doc.id).join(', ');
      return { error: error(req, `Unsupported attachment type for: ${list}`, 400) };
    }

    try {
      attachmentParts = await buildAttachmentParts(env, attachmentDocs);
    } catch (err) {
      return { error: error(req, normalizeErrorMessage(err, 'Failed to load attachments'), 400) };
    }
  }

  if (attachmentDocs.length > 0) {
    attachmentKinds = getAttachmentKinds(attachmentDocs);
    const nonLocalKinds = attachmentKinds.filter((kind) => kind !== 'text');
    const caps = await loadModelAttachmentCaps(db);
    const modelCaps = getModelAttachmentCapsEntry(caps, model);

    const unsupported = nonLocalKinds.length
      ? STRICT_ATTACHMENT_CAPS
        ? getUnsupportedAttachmentKindsStrict(modelCaps, nonLocalKinds)
        : getUnsupportedAttachmentKinds(modelCaps, nonLocalKinds)
      : [];
    if (attachmentKinds.includes('text') && modelCaps?.text !== true) {
      unsupported.push('text');
    }

    if (unsupported.length > 0) {
      return {
        error: error(req, 'attachments_not_supported', 400, {
          message: modelCaps
            ? formatUnsupportedAttachmentMessage(unsupported)
            : 'Attachment capabilities not configured for this model.',
          unsupported_types: unsupported,
          resumable: false,
        }),
      };
    }
    attachmentKinds = nonLocalKinds;
  }

  return { attachmentDocs, attachmentParts, attachmentKinds };
}

function normalizeErrorMessage(err, fallback) {
  return err?.message || fallback;
}
