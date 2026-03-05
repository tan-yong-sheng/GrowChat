const STORAGE_KEY = 'growchat_auth';

export function getAuthState() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
  } catch {
    return null;
  }
}

export function setAuthState(state) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

export function clearAuthState() {
  localStorage.removeItem(STORAGE_KEY);
}

export async function apiFetch(path, options = {}) {
  const auth = getAuthState();
  const headers = new Headers(options.headers || {});

  if (!headers.has('Content-Type') && options.body) {
    headers.set('Content-Type', 'application/json');
  }

  if (auth?.access_token) {
    headers.set('Authorization', `Bearer ${auth.access_token}`);
  }

  const response = await fetch(path, {
    ...options,
    headers,
  });

  if (response.status === 401 && auth?.refresh_token) {
    const refreshed = await refreshToken(auth.refresh_token);
    if (refreshed) {
      headers.set('Authorization', `Bearer ${refreshed.access_token}`);
      return fetch(path, { ...options, headers });
    }
  }

  return response;
}

export async function refreshToken(refreshTokenValue) {
  const res = await fetch('/api/auth/refresh', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refresh_token: refreshTokenValue }),
  });

  if (!res.ok) {
    clearAuthState();
    return null;
  }

  const data = await res.json();
  setAuthState(data);
  return data;
}
