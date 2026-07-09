/**
 * Shared helpers for admin-config handlers
 */
import { getConfigValue, setConfigValue } from '../../utils/app-config.js';
import { loadAttachmentCapsFromRaw } from '../../utils/attachment-caps.js';
import { HTTP_STATUS } from '../../shared/http-status.js';
import { MODEL_ATTACHMENT_CAPS_KEY } from '../../chat/attachments.js';
import { normalizeAttachmentCaps, normalizeModelId } from '../../admin/tool-servers.js';

export function mapAuthCodeToStatus(code) {
  const map = { server_error: 500, unauthorized: 401, not_found: 404 };
  return map[code] || HTTP_STATUS.FORBIDDEN;
}

export async function parseJsonBody(req) {
  try {
    return await req.json();
  } catch {
    return null;
  }
}

export function classifyAttachmentCapsBody(body) {
  const replaceCaps = body.caps && typeof body.caps === 'object' && !Array.isArray(body.caps);
  const updates = Array.isArray(body.updates) ? body.updates : [];
  const remove = Array.isArray(body.remove) ? body.remove : [];

  if (!replaceCaps && !updates.length && !remove.length) {
    return { error: 'No attachment cap changes provided' };
  }

  return { replaceCaps, updates, remove };
}

export function buildReplaceCaps(capsInput) {
  const nextCaps = {};
  for (const [modelId, entry] of Object.entries(capsInput)) {
    const normalizedId = normalizeModelId(modelId);
    if (!normalizedId) continue;
    const attachmentsInput = entry?.attachments ?? entry;
    const attachments = normalizeAttachmentCaps(attachmentsInput);
    nextCaps[normalizedId] = {
      ...(entry && typeof entry === 'object' && !Array.isArray(entry) ? entry : {}),
      attachments,
      updated_at: Math.floor(Date.now() / 1000),
    };
  }
  return nextCaps;
}

function patchModelAttachments(current, patch) {
  const nextAttachments = { ...(current.attachments || {}) };
  for (const [key, value] of Object.entries(patch)) {
    if (value === null) {
      delete nextAttachments[key];
    } else {
      nextAttachments[key] = value;
    }
  }
  return {
    ...current,
    attachments: nextAttachments,
    updated_at: Math.floor(Date.now() / 1000),
  };
}

function removeModelCaps(caps, removeIds) {
  for (const id of removeIds) {
    const normalizedId = normalizeModelId(id);
    if (!normalizedId) continue;
    delete caps[normalizedId];
  }
}

async function loadExistingCaps(db) {
  const raw = await getConfigValue(db, MODEL_ATTACHMENT_CAPS_KEY, '{}');
  return loadAttachmentCapsFromRaw(raw);
}

export async function applyAttachmentCapsPatch(db, updates, remove) {
  const caps = await loadExistingCaps(db);

  for (const update of updates) {
    const modelId = normalizeModelId(update?.model_id);
    if (!modelId) {
      throw new Error('model_id is required');
    }
    const patch = normalizeAttachmentCaps(update?.attachments, { allowNull: true });
    const current = caps[modelId] && typeof caps[modelId] === 'object' ? caps[modelId] : {};
    caps[modelId] = patchModelAttachments(current, patch);
  }

  removeModelCaps(caps, remove);
  return caps;
}

export async function saveAttachmentCaps(db, caps) {
  await setConfigValue(db, MODEL_ATTACHMENT_CAPS_KEY, JSON.stringify(caps));
}
