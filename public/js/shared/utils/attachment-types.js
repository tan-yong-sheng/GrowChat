const TEXT_LIKE_MIME_TYPES = new Set([
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

export const TEXT_LIKE_ACCEPT_TYPES = [
  'text/*',
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
];

export function inferContentTypeFromName(name) {
  const lower = String(name || '').toLowerCase();
  const ext = lower.includes('.') ? lower.split('.').pop() : '';
  switch (ext) {
    case 'png':
      return 'image/png';
    case 'jpg':
    case 'jpeg':
      return 'image/jpeg';
    case 'webp':
      return 'image/webp';
    case 'gif':
      return 'image/gif';
    case 'pdf':
      return 'application/pdf';
    case 'txt':
      return 'text/plain';
    case 'md':
      return 'text/markdown';
    case 'csv':
      return 'text/csv';
    case 'tsv':
      return 'text/tsv';
    case 'json':
      return 'application/json';
    case 'json5':
      return 'application/json5';
    case 'ndjson':
      return 'application/x-ndjson';
    case 'yml':
    case 'yaml':
      return 'application/yaml';
    case 'xml':
      return 'application/xml';
    case 'js':
      return 'application/javascript';
    case 'ts':
      return 'application/typescript';
    case 'html':
      return 'text/html';
    case 'css':
      return 'text/css';
    case 'py':
      return 'text/x-python';
    default:
      return '';
  }
}

export function getFileContentType(file) {
  const explicit = String(file?.type || '').trim();
  if (explicit) return explicit;
  return inferContentTypeFromName(file?.name);
}

export function isTextLikeContentType(type) {
  const mediaType = String(type || '').toLowerCase();
  if (!mediaType) return false;
  if (mediaType.startsWith('text/')) return true;
  return TEXT_LIKE_MIME_TYPES.has(mediaType);
}

export function isSupportedAttachmentType(type) {
  const mediaType = String(type || '').toLowerCase();
  if (!mediaType) return false;
  if (mediaType.startsWith('image/')) return true;
  if (mediaType === 'application/pdf') return true;
  if (isTextLikeContentType(mediaType)) return true;
  return false;
}

export function getAttachmentKindFromType(type) {
  const mediaType = String(type || '').toLowerCase();
  if (!mediaType) return 'other';
  if (mediaType.startsWith('image/')) return 'image';
  if (mediaType === 'application/pdf') return 'pdf';
  if (isTextLikeContentType(mediaType)) return 'text';
  if (mediaType.startsWith('audio/')) return 'audio';
  if (mediaType.startsWith('video/')) return 'video';
  return 'other';
}

export function getActiveModelAttachmentCaps(currentState) {
  const modelId = currentState?.activeModelId;
  if (!modelId) return null;
  const model = (currentState?.models || []).find((item) => String(item.id) === String(modelId));
  const caps = model?.attachments;
  if (!caps || typeof caps !== 'object') return { text: true };
  if (typeof caps.text !== 'boolean') return { ...caps, text: true };
  return caps;
}

export function getAllowedAttachmentKinds(currentState, { localTextLabel = 'text-local' } = {}) {
  const caps = getActiveModelAttachmentCaps(currentState);
  const allowed = [];
  if (caps?.image === true) allowed.push('image');
  if (caps?.pdf === true) allowed.push('pdf');
  if (caps?.text === true) allowed.push(localTextLabel);
  return allowed;
}

export function getAllowedNonLocalKinds(currentState) {
  const caps = getActiveModelAttachmentCaps(currentState);
  const allowed = [];
  if (caps?.image === true) allowed.push('image');
  if (caps?.pdf === true) allowed.push('pdf');
  return allowed;
}

export function isAttachmentAllowedByModel(currentState, type) {
  const kind = getAttachmentKindFromType(type);
  const caps = getActiveModelAttachmentCaps(currentState);
  if (kind === 'text') return caps?.text === true;
  if (!caps) return false;
  return caps[kind] === true;
}
