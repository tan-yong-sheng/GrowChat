/**
 * Shared sanitization utilities for user-provided data.
 */

/**
 * Escape HTML special characters to prevent XSS when rendering user data.
 * Covers: &, <, >, ", '
 *
 * @param {string} text - Raw text to escape
 * @returns {string} HTML-safe text
 */
export function escapeHtml(text) {
  const map = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  };
  return String(text ?? '').replace(/[&<>"']/g, (char) => map[char]);
}

/**
 * Strip all HTML tags from a string.
 * Used to sanitize user input before storing in the database.
 *
 * Iterates until no tags remain to prevent reconstruction attacks
 * (e.g. `<<script>script>` → `<script>` after a single pass) and
 * then escapes any leftover `<` / `>` characters as a defense-in-depth
 * measure for partial tags like `<script` that lack a closing `>`.
 *
 * @param {string} text - Raw text that may contain HTML
 * @returns {string} Text with HTML tags removed and residual angle brackets escaped
 */
export function stripHtml(text) {
  let result = String(text ?? '');
  let previous;
  do {
    previous = result;
    result = result.replace(/<[^>]*>/g, '');
  } while (result !== previous);
  // Escape any residual `<` / `>` so unclosed tags (e.g. `<script`) cannot
  // be rendered as HTML when the sanitized value is later injected into a
  // template. This addresses CodeQL "incomplete multi-character sanitization".
  return result.replace(/[<>]/g, (char) => (char === '<' ? '&lt;' : '&gt;')).trim();
}
