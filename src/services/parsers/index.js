/**
 * Document Parser Registry
 *
 * Keeps file format parsing modular and pluggable.
 */

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

const isTextLikeContentType = (type) => {
  const mediaType = String(type || '').toLowerCase();
  if (!mediaType) return false;
  if (mediaType.startsWith('text/')) return true;
  return TEXT_LIKE_MIME_TYPES.has(mediaType);
};

const textParser = {
  id: 'text',
  label: 'Text',
  accepts: {
    mimePrefixes: ['text/'],
    mimes: Array.from(TEXT_LIKE_MIME_TYPES),
  },
  async parse(_env, { buffer }) {
    const decoder = new TextDecoder();
    return { text: decoder.decode(buffer) };
  },
};

const imageParser = {
  id: 'image',
  label: 'Image',
  accepts: {
    mimePrefixes: ['image/'],
  },
  async parse() {
    return { skipped: true, reason: 'Image extraction not supported (OCR disabled)' };
  },
};

const pdfParser = {
  id: 'pdf',
  label: 'PDF',
  accepts: {
    mimes: ['application/pdf'],
  },
  async parse() {
    return { skipped: true, reason: 'PDF extraction not yet supported' };
  },
};

const PARSERS = [textParser, imageParser, pdfParser];

const matchesParser = (parser, contentType) => {
  const mediaType = String(contentType || '').toLowerCase();
  if (!mediaType) return false;
  const { mimes = [], mimePrefixes = [] } = parser.accepts || {};
  if (mimes.includes(mediaType)) return true;
  return mimePrefixes.some((prefix) => mediaType.startsWith(prefix));
};

export function listDocumentParsers() {
  return PARSERS.map((parser) => ({
    id: parser.id,
    label: parser.label,
    accepts: parser.accepts,
  }));
}

export function selectDocumentParser(contentType) {
  return PARSERS.find((parser) => matchesParser(parser, contentType)) || null;
}

export async function parseDocument(env, { contentType, buffer, filename }) {
  const parser = selectDocumentParser(contentType);
  if (!parser) {
    return { skipped: true, reason: `Unsupported content type: ${contentType || 'unknown'}` };
  }
  return parser.parse(env, { contentType, buffer, filename });
}

export { isTextLikeContentType };
