/**
 * Parse a value into a plain object, returning null for non-objects or invalid JSON.
 *
 * @param {unknown} raw
 * @returns {object|null}
 */
export function parseJsonObject(raw) {
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) return raw;
  try {
    const parsed = JSON.parse(String(raw));
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}
