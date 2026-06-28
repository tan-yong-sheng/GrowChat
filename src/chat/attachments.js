import { getConfigValue, setConfigValue } from '../utils/app-config.js';
import { APP_LIMITS } from '../config/app.js';
import { createRootLogger } from '../utils/logger.js';
const logger = createRootLogger({});

export const MAX_ATTACHMENTS = APP_LIMITS.maxAttachments;
export const MAX_ATTACHMENT_BYTES = APP_LIMITS.maxAttachmentBytes;
export const MAX_ATTACHMENT_TOTAL_BYTES = APP_LIMITS.maxAttachmentTotalBytes;
export const MAX_TEXT_ATTACHMENT_CHARS = APP_LIMITS.maxTextAttachmentChars;
export const TEXT_LIKE_MIME_TYPES = new Set([
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

export const MODEL_ATTACHMENT_CAPS_KEY = 'model_attachment_caps_v1';
export const DEFAULT_ATTACHMENT_CAPS = { text: true };
export const ATTACHMENT_KIND_ORDER = ['image', 'pdf', 'text', 'audio', 'video', 'other'];
export const ATTACHMENT_CAP_TYPES = [...ATTACHMENT_KIND_ORDER];
export const STRICT_ATTACHMENT_CAPS = true;

export function isTextLikeContentType(contentType) {
  const type = String(contentType || '').toLowerCase();
  if (!type) return false;
  if (type.startsWith('text/')) return true;
  return TEXT_LIKE_MIME_TYPES.has(type);
}

export function isSupportedAttachmentType(contentType) {
  const type = String(contentType || '').toLowerCase();
  if (!type) return false;
  if (type.startsWith('image/')) return true;
  if (type === 'application/pdf') return true;
  if (isTextLikeContentType(type)) return true;
  return false;
}

export function normalizeAttachmentIds(input) {
  if (!Array.isArray(input)) return [];
  const cleaned = input.map((id) => String(id || '').trim()).filter(Boolean);
  const seen = new Set();
  const unique = [];
  for (const id of cleaned) {
    if (seen.has(id)) continue;
    seen.add(id);
    unique.push(id);
  }
  return unique.slice(0, MAX_ATTACHMENTS);
}

export function getAttachmentKind(contentType) {
  const type = String(contentType || '').toLowerCase();
  if (!type) return 'other';
  if (type.startsWith('image/')) return 'image';
  if (type === 'application/pdf') return 'pdf';
  if (isTextLikeContentType(type)) return 'text';
  if (type.startsWith('audio/')) return 'audio';
  if (type.startsWith('video/')) return 'video';
  return 'other';
}

export function getAttachmentKinds(docs = []) {
  const kinds = new Set();
  docs.forEach((doc) => {
    kinds.add(getAttachmentKind(doc?.content_type));
  });
  return Array.from(kinds);
}

export function mergeTextAttachmentParts(content, parts = []) {
  const segments = parts
    .filter((part) => part && part.type === 'text' && typeof part.text === 'string')
    .map((part) => part.text.trim())
    .filter(Boolean);
  if (!segments.length) return content;
  const prefix = content ? `${content}\n\n` : '';
  return `${prefix}${segments.join('\n\n')}`;
}

export async function loadModelAttachmentCaps(db) {
  try {
    const raw = await getConfigValue(db, MODEL_ATTACHMENT_CAPS_KEY, '{}');
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    return parsed;
  } catch {
    return {};
  }
}

export async function saveModelAttachmentCaps(db, caps) {
  try {
    await setConfigValue(db, MODEL_ATTACHMENT_CAPS_KEY, JSON.stringify(caps || {}));
  } catch (err) {
    logger.warn('Failed to save attachment caps', { error: String(err?.message || err) });
  }
}

export function applyAttachmentDefaults(attachments) {
  const caps = attachments && typeof attachments === 'object' ? { ...attachments } : {};
  caps.text = DEFAULT_ATTACHMENT_CAPS.text;
  return caps;
}

export function getModelAttachmentCapsEntry(caps, modelId) {
  const entry = caps?.[modelId];
  if (!entry || typeof entry !== 'object') return applyAttachmentDefaults(null);
  const attachments = entry.attachments;
  if (!attachments || typeof attachments !== 'object') return applyAttachmentDefaults(null);
  return applyAttachmentDefaults(attachments);
}

export function getUnsupportedAttachmentKinds(modelCaps, attachmentKinds = []) {
  if (!modelCaps) return [];
  return attachmentKinds.filter((kind) => modelCaps[kind] === false);
}

export function getUnsupportedAttachmentKindsStrict(modelCaps, attachmentKinds = []) {
  if (!attachmentKinds.length) return [];
  if (!modelCaps) return [...attachmentKinds];
  return attachmentKinds.filter((kind) => modelCaps[kind] !== true);
}

export function formatUnsupportedAttachmentMessage(unsupported = []) {
  const list = unsupported.filter(Boolean);
  if (!list.length) return 'Selected model does not support these attachments.';
  const joined = list.join(', ');
  return `Selected model does not support ${joined} attachment${list.length > 1 ? 's' : ''}.`;
}

const TRANSIENT_ERROR_PATTERN =
  /rate limit|overloaded|timeout|timed out|temporarily|unavailable|connect|network|502|503|504/i;

export function isTransientModelError(message) {
  return TRANSIENT_ERROR_PATTERN.test(String(message || ''));
}

const KIND_KEYWORDS = [
  { keywords: ['image', 'vision', 'multimodal'], kind: 'image' },
  { keywords: ['audio'], kind: 'audio' },
  { keywords: ['video'], kind: 'video' },
  { keywords: ['pdf'], kind: 'pdf' },
  { keywords: ['text'], kind: 'text' },
];

export function inferUnsupportedAttachmentKind(message, attachmentKinds = []) {
  if (!attachmentKinds.length) return null;
  if (attachmentKinds.length === 1) return attachmentKinds[0];
  const msg = String(message || '').toLowerCase();
  for (const { keywords, kind } of KIND_KEYWORDS) {
    if (keywords.some((kw) => msg.includes(kw))) return kind;
  }
  return null;
}

function attachFailureToCaps(caps, modelId, kind) {
  const current = caps[modelId] && typeof caps[modelId] === 'object' ? caps[modelId] : {};
  const attachments = { ...(current.attachments || {}) };
  attachments[kind] = false;
  caps[modelId] = {
    ...current,
    attachments,
    updated_at: Math.floor(Date.now() / 1000),
  };
}

export async function recordAttachmentCapabilityFailure(db, modelId, attachmentKinds, err) {
  const message = String(err?.message || err || '');
  if (!modelId || !attachmentKinds?.length || isTransientModelError(message)) return;
  const inferred = inferUnsupportedAttachmentKind(message, attachmentKinds);
  if (!inferred) return;
  const caps = await loadModelAttachmentCaps(db);
  attachFailureToCaps(caps, modelId, inferred);
  await saveModelAttachmentCaps(db, caps);
}

export function arrayBufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  const chunkSize = 0x8000;
  let binary = '';
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.slice(i, i + chunkSize));
  }
  return btoa(binary);
}
