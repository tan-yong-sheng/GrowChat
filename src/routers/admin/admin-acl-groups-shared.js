/**
 * Shared ACL groups helper — parses `ids` from URL search params
 * and loads all groups from the database.
 *
 * Both admin-connections-access and admin-tool-servers-access use
 * this same pattern in their GET /api/admin/(star)/access handlers
 * to extract comma-separated ids and fetch the full groups table.
 */

/**
 * Parse comma-separated `ids` from URL search params.
 * Handles URL-encoding, trimming, and empty/null values.
 *
 * @param {URL} url - Full parsed URL object
 * @returns {string[]} - Decoded, non-empty ids
 */
export function parseIdsFromUrl(url) {
  return String(url.searchParams.get('ids') || '')
    .split(',')
    .map((value) => decodeURIComponent(String(value || '').trim()))
    .filter(Boolean);
}

/**
 * Load all groups from the database.
 *
 * @param {import('../../db.js').DB} db - Database instance
 * @returns {Promise<Array<{id: string, name: string, description: string|null, is_system: number, created_at: number, updated_at: number}>>}
 */
export function loadGroups(db) {
  return db.all(
    `SELECT id, name, description, is_system, created_at, updated_at
     FROM groups
     ORDER BY is_system DESC, name ASC`
  );
}
