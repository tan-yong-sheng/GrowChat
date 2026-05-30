/**
 * Shared MIME type mapping from file extensions to content types.
 * Used by both server-side uploads and client-side attachment handling.
 */

const MIME_MAP = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  gif: 'image/gif',
  pdf: 'application/pdf',
  txt: 'text/plain',
  md: 'text/markdown',
  csv: 'text/csv',
  tsv: 'text/tsv',
  json: 'application/json',
  json5: 'application/json5',
  ndjson: 'application/x-ndjson',
  yml: 'application/yaml',
  yaml: 'application/yaml',
  xml: 'application/xml',
  js: 'application/javascript',
  ts: 'application/typescript',
  html: 'text/html',
  css: 'text/css',
  py: 'text/x-python',
};

/**
 * Infer content type from a filename or extension.
 * @param {string} name - Filename or name with extension
 * @returns {string} MIME type or empty string if unknown
 */
export function inferContentType(name) {
  const lower = String(name || '').toLowerCase();
  const ext = lower.includes('.') ? lower.split('.').pop() : lower;
  return MIME_MAP[ext] || '';
}

export { MIME_MAP };
