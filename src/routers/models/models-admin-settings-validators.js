/**
 * Validation and sanitization helpers for admin model settings updates.
 * Extracted from models-admin-settings-update.js to reduce file size.
 */

import { HTTP_STATUS } from '../../shared/http-status.js';
import { normalizeModelId } from '../../admin/tool-servers.js';
import { isValidModelId } from './models-helpers.js';
import { normalizeAttachmentCaps } from '../../utils/attachment-caps.js';

export const MAX_UPDATES = 500;

/**
 * Parse the request body into typed input arrays.
 * Accepts both snake_case and camelCase keys for compatibility.
 */
export function parseBody(body) {
  const updatesInput = Array.isArray(body.updates) ? body.updates : [];
  const attachmentUpdatesInput = Array.isArray(body.attachment_updates)
    ? body.attachment_updates
    : Array.isArray(body.attachmentUpdates)
      ? body.attachmentUpdates
      : [];
  const accessUpdatesInput = Array.isArray(body.access_updates)
    ? body.access_updates
    : Array.isArray(body.accessUpdates)
      ? body.accessUpdates
      : [];
  return { updatesInput, attachmentUpdatesInput, accessUpdatesInput };
}

/**
 * Validate that each input array is within the MAX_UPDATES limit.
 */
export function validateUpdateCounts(updatesInput, attachmentUpdatesInput, accessUpdatesInput) {
  return (
    updatesInput.length <= MAX_UPDATES &&
    attachmentUpdatesInput.length <= MAX_UPDATES &&
    accessUpdatesInput.length <= MAX_UPDATES
  );
}

/**
 * Sanitize and validate enabled updates — returns {id, enabled} pairs.
 */
export function sanitizeEnabledUpdates(updatesInput) {
  return updatesInput
    .map((item) => ({
      id: String(item?.id || '').trim(),
      enabled: item?.enabled !== false,
    }))
    .filter((item) => isValidModelId(item.id));
}

/**
 * Sanitize access updates — returns {model_id, rules} pairs.
 * Throws a 400 error if a model_id is missing.
 */
export function sanitizeAccessUpdates(accessUpdatesInput) {
  const sanitizedAccessUpdates = [];
  for (const update of accessUpdatesInput) {
    const modelId = normalizeModelId(update?.model_id || update?.modelId);
    if (!modelId) {
      throw Object.assign(new Error('model_id is required'), { status: HTTP_STATUS.BAD_REQUEST });
    }
    const rules = Array.isArray(update?.rules) ? update.rules : [];
    sanitizedAccessUpdates.push({ model_id: modelId, rules });
  }
  return sanitizedAccessUpdates;
}

export { normalizeAttachmentCaps };
