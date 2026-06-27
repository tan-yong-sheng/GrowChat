import { getAuthState, getClientSessionId, isAccessTokenUsable, refreshToken } from './auth.js';

export async function apiFetch(path, options = {}) {
  let auth = getAuthState();
  const headers = new Headers(options.headers || {});
  const isFormData = typeof FormData !== 'undefined' && options.body instanceof FormData;

  if (!headers.has('Content-Type') && options.body && !isFormData) {
    headers.set('Content-Type', 'application/json');
  }

  if (auth?.refresh_token && auth?.access_token && !isAccessTokenUsable(auth.access_token)) {
    const refreshed = await refreshToken(auth.refresh_token, { signal: options.signal });
    if (refreshed) {
      auth = refreshed;
    } else {
      auth = getAuthState();
    }
  }

  if (auth?.access_token) {
    headers.set('Authorization', `Bearer ${auth.access_token}`);
  }
  headers.set('x-client-session-id', getClientSessionId());

  const response = await fetch(path, {
    ...options,
    headers,
  });

  // Only retry on 401 (unauthenticated). 403 is forbidden/RBAC denial — the
  // user IS authenticated but not authorized for this resource, so refreshing
  // the token cannot help and just causes unnecessary session churn.
  if (response.status === 401 && auth?.refresh_token) {
    const refreshed = await refreshToken(auth.refresh_token, { signal: options.signal });
    if (refreshed) {
      headers.set('Authorization', `Bearer ${refreshed.access_token}`);
      return fetch(path, { ...options, headers });
    }
  }

  return response;
}
