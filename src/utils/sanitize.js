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
 * (e.g. `<<script>script>` → `<script>` after a single pass).
 *
 * @param {string} text - Raw text that may contain HTML
 * @returns {string} Text with HTML tags removed
 */
export function stripHtml(text) {
  let result = String(text ?? '');
  let previous;
  do {
    previous = result;
    result = result.replace(/<[^>]*>/g, '');
  } while (result !== previous);
  return result.trim();
}
