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
 * then removes any leftover `<` / `>` characters as a defense-in-depth
 * measure for partial tags like `<script` that lack a closing `>`.
 *
 * The result is plain text: callers may still apply `escapeHtml()`
 * when rendering into HTML, but `stripHtml()` itself does not produce
 * HTML entities (which would double-encode when re-escaped downstream).
 *
 * @param {string} text - Raw text that may contain HTML
 * @returns {string} Plain text with HTML tags and residual angle brackets removed
 */
export function stripHtml(text) {
  let result = String(text ?? '');
  let previous;
  do {
    previous = result;
    result = result.replace(/<[^>]*>/g, '');
  } while (result !== previous);
  // Defense-in-depth: drop residual < and > from partial tags. We do NOT
  // encode them as &lt;/&gt; because stripHtml is meant to produce plain
  // text for storage; encoding here would double-encode when downstream
  // renderers apply escapeHtml() on output.
  return result.replace(/[<>]/g, '').trim();
}
