/**
 * Shared tool description preview helpers for integration rendering.
 * Used by both account and admin integration views to avoid
 * repeated inline variable setup for tool description truncation.
 */

/**
 * Prepare tool description preview variables.
 * @param {object} tool - A tool object with .description and ._expanded fields
 * @param {number} [maxLen=160] - Max description character length before truncation
 * @returns {{ description: string, maxLen: number, preview: string, hasMore: boolean, isExpanded: boolean }}
 * @example
 *   const { description, preview, hasMore } = prepareToolPreview(tool);
 *   // use: preview, hasMore, description, etc.
 */
export function prepareToolPreview(tool, maxLen = 160) {
  const description = String(tool.description || '');
  const isExpanded = Boolean(tool._expanded);
  const hasMore = description.length > maxLen;
  const preview =
    hasMore && !isExpanded ? `${description.slice(0, maxLen).trimEnd()}…` : description;
  return { description, preview, hasMore, isExpanded };
}
