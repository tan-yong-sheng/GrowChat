/**
 * Apply auth headers utility — shares the auth header setup pattern
 * between src/admin/ (tool-servers.js) and src/routers/admin/ (admin-tool-servers-crud.js).
 *
 * Replaces the inline bearer/basic token header setup in both files.
 *
 * @param {object} headers - Headers object to mutate
 * @param {object} source - Object with auth fields (auth_type, auth_bearer_token, etc.)
 * @returns {object} Updated headers with Authorization set if applicable
 */
export function applyAuthHeaders(headers, source = {}) {
  const authType = String(source.auth_type || '')
    .trim()
    .toLowerCase();

  if (authType === 'bearer') {
    const token = String(source.auth_bearer_token || '').trim();
    if (token) headers.Authorization = `Bearer ${token}`;
  } else if (authType === 'basic') {
    const user = String(source.auth_basic_username || '').trim();
    const pass = String(source.auth_basic_password || '');
    if (user) headers.Authorization = `Basic ${btoa(`${user}:${pass}`)}`;
  }

  return headers;
}
