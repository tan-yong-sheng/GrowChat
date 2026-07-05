/**
 * Admin Config - GET /api/admin/model-attachment-caps
 * Fetches per-model attachment capability types
 */
import { error, json } from '../../utils/response.js';
import { getConfigValue } from '../../utils/app-config.js';
import { loadAttachmentCapsFromRaw } from '../../utils/attachment-caps.js';
import { ATTACHMENT_CAP_TYPES, MODEL_ATTACHMENT_CAPS_KEY } from '../../chat/attachments.js';

/**
 * Handle GET /api/admin/model-attachment-caps - Fetch attachment capabilities
 */
export async function handleAdminAttachmentCapsGet(req, env, ctx, user, path, { db, logger } = {}) {
  try {
    const raw = await getConfigValue(db, MODEL_ATTACHMENT_CAPS_KEY, '{}');
    const caps = loadAttachmentCapsFromRaw(raw);
    return json(req, {
      caps,
      supported_types: ATTACHMENT_CAP_TYPES,
    });
  } catch (err) {
    logger.error('Attachment caps fetch failed', { error: err?.message || err });
    return error(req, 'Failed to fetch attachment caps', 500);
  }
}
