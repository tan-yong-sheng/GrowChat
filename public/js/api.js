const STORAGE_KEY = 'growchat_auth';
const CLIENT_SESSION_KEY = 'growchat_client_session_id';

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

export function getClientSessionId() {
  try {
    let id = sessionStorage.getItem(CLIENT_SESSION_KEY);
    if (id) return id;
    id = `${Date.now().toString(36)}-${crypto.randomUUID()}`;
    sessionStorage.setItem(CLIENT_SESSION_KEY, id);
    return id;
  } catch {
    return `fallback-${crypto.randomUUID()}`;
  }
}

export async function apiFetch(path, options = {}) {
  const auth = getAuthState();
  const headers = new Headers(options.headers || {});
  const isFormData = typeof FormData !== 'undefined' && options.body instanceof FormData;

  if (!headers.has('Content-Type') && options.body && !isFormData) {
    headers.set('Content-Type', 'application/json');
  }

  if (auth?.access_token) {
    headers.set('Authorization', `Bearer ${auth.access_token}`);
  }
  headers.set('x-client-session-id', getClientSessionId());

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

export async function fetchChats({ q = '', limit = 20, offset = 0, signal } = {}) {
  const params = new URLSearchParams();
  if (q && q.trim()) params.set('q', q.trim());
  params.set('limit', String(limit));
  params.set('offset', String(offset));

  const path = `/api/chats?${params.toString()}`;
  const res = await apiFetch(path, { signal });
  if (!res.ok) {
    const err = new Error(`Failed to fetch chats (${res.status})`);
    err.status = res.status;
    throw err;
  }

  return res.json();
}

export async function fetchFiles({ limit = 20, offset = 0, signal } = {}) {
  const params = new URLSearchParams();
  params.set('limit', String(limit));
  params.set('offset', String(offset));

  const path = `/api/files?${params.toString()}`;
  const res = await apiFetch(path, { signal });
  if (!res.ok) {
    const err = new Error(`Failed to fetch files (${res.status})`);
    err.status = res.status;
    throw err;
  }

  return res.json();
}

export async function uploadFile(file, chatId = null) {
  const formData = new FormData();
  formData.append('file', file);
  if (chatId) formData.append('chat_id', chatId);

  const res = await apiFetch('/api/files/upload', {
    method: 'POST',
    body: formData,
  });

  if (!res.ok) {
    const err = new Error(`Failed to upload file (${res.status})`);
    err.status = res.status;
    throw err;
  }

  return res.json();
}

export async function deleteFile(id) {
  const res = await apiFetch(`/api/files/${id}`, {
    method: 'DELETE',
  });

  if (!res.ok) {
    const err = new Error(`Failed to delete file (${res.status})`);
    err.status = res.status;
    throw err;
  }

  return res.json();
}

export async function getFileMetadata(id) {
  const res = await apiFetch(`/api/files/${id}`);
  if (!res.ok) {
    const err = new Error(`Failed to get file metadata (${res.status})`);
    err.status = res.status;
    throw err;
  }

  return res.json();
}

export async function searchFiles({ q = '', limit = 20, offset = 0, signal } = {}) {
  const params = new URLSearchParams();
  params.set('q', q.trim());
  params.set('limit', String(limit));
  params.set('offset', String(offset));

  const res = await apiFetch(`/api/files/search?${params.toString()}`, { signal });
  if (!res.ok) {
    const err = new Error(`Failed to search files (${res.status})`);
    err.status = res.status;
    throw err;
  }

  return res.json();
}

export async function getFileContent(id) {
  const res = await apiFetch(`/api/files/${id}/content`);
  if (!res.ok) {
    const err = new Error(`Failed to get file content (${res.status})`);
    err.status = res.status;
    throw err;
  }
  return res.json();
}

export async function shareChat(chatId) {
  const res = await apiFetch(`/api/chats/${chatId}/share`, { method: 'POST' });
  if (!res.ok) {
    const err = new Error(`Failed to share chat (${res.status})`);
    err.status = res.status;
    throw err;
  }
  return res.json();
}

export async function unshareChat(chatId) {
  const res = await apiFetch(`/api/chats/${chatId}/share`, { method: 'DELETE' });
  if (!res.ok) {
    const err = new Error(`Failed to unshare chat (${res.status})`);
    err.status = res.status;
    throw err;
  }
  return res.json();
}

export async function fetchSharedChats() {
  const res = await apiFetch('/api/chats/shared');
  if (!res.ok) {
    const err = new Error(`Failed to fetch shared chats (${res.status})`);
    err.status = res.status;
    throw err;
  }
  return res.json();
}

export async function toggleArchiveChat(chatId) {
  const res = await apiFetch(`/api/chats/${chatId}/archive`, { method: 'POST' });
  if (!res.ok) {
    const err = new Error(`Failed to archive chat (${res.status})`);
    err.status = res.status;
    throw err;
  }
  return res.json();
}

export async function fetchArchivedChats() {
  const res = await apiFetch('/api/chats/archived');
  if (!res.ok) {
    const err = new Error(`Failed to fetch archived chats (${res.status})`);
    err.status = res.status;
    throw err;
  }
  return res.json();
}

export async function fetchPrompts() {
  const res = await apiFetch('/api/prompts/list?limit=100&offset=0');
  if (!res.ok) {
    const err = new Error(`Failed to fetch prompts (${res.status})`);
    err.status = res.status;
    throw err;
  }
  return res.json();
}

export async function fetchPromptByCommand(command) {
  const normalized = String(command || '').trim().toLowerCase();
  const res = await apiFetch(`/api/prompts/command/${encodeURIComponent(normalized)}`);
  if (!res.ok) {
    const err = new Error(`Failed to fetch prompt command (${res.status})`);
    err.status = res.status;
    throw err;
  }
  return res.json();
}

export async function fetchPublicSharedChat(shareId) {
  const res = await fetch(`/s/${encodeURIComponent(shareId)}?format=json`, {
    headers: { Accept: 'application/json' },
  });
  if (!res.ok) {
    const err = new Error(`Failed to fetch shared chat (${res.status})`);
    err.status = res.status;
    throw err;
  }
  return res.json();
}

export async function fetchMyPermissions() {
  const res = await apiFetch('/api/users/me/permissions');
  if (!res.ok) {
    const err = new Error(`Failed to fetch permissions (${res.status})`);
    err.status = res.status;
    throw err;
  }
  return res.json();
}

export async function fetchMyRoles() {
  const res = await apiFetch('/api/users/me/roles');
  if (!res.ok) {
    const err = new Error(`Failed to fetch roles (${res.status})`);
    err.status = res.status;
    throw err;
  }
  return res.json();
}
