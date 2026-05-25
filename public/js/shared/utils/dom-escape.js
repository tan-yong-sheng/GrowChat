/**
 * CSS Selector Escaping Utility
 *
 * Provides consistent CSS.escape() functionality with fallback for older browsers.
 * Used in DOM queries to safely escape special characters in CSS selectors.
 */

/**
 * Escape a string for safe use in CSS selectors
 * @param {string} value - The string to escape
 * @returns {string} The escaped string safe for CSS selectors
 */
export function escapeSelector(value) {
  const raw = String(value ?? '');
  if (typeof CSS !== 'undefined' && typeof CSS.escape === 'function') {
    return CSS.escape(raw);
  }
  // Fallback for older browsers: escape all non-alphanumeric characters except hyphen and underscore
  return raw.replace(/[^a-zA-Z0-9_-]/g, '\\$&');
}

/**
 * Escape HTML special characters to prevent XSS
 * @param {string} value - The string to escape
 * @returns {string} The escaped string safe for HTML
 */
export function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

/**
 * Escape HTML special characters except single quotes.
 *
 * Use this in markdown/content rendering pipelines where
 * DOMPurify handles the final output and apostrophes must
 * remain as literal characters (e.g. after decodeHtmlEntities).
 * The full escapeHtml would re-encode decoded apostrophes
 * back to &#39;, breaking the decode-then-render flow.
 *
 * @param {string} value - The string to escape
 * @returns {string} The escaped string (apostrophes preserved)
 */
export function escapeHtmlLoose(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}
