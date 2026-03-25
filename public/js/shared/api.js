import { readStoredJson, readStoredString, removeStoredValue, writeStoredJson } from './utils/storage.js';

const STORAGE_KEY = 'growchat_auth';
const CLIENT_SESSION_KEY = 'growchat_client_session_id';
const MODEL_CACHE_KEY = 'growchat_models_cache_v1';
const CHAT_CACHE_KEY_PREFIX = 'growchat_chats_cache_v1_';
const MODEL_CACHE_TTL_MS = 15 * 60 * 1000;
const CHAT_CACHE_TTL_MS = 30 * 1000;

function readCache(key, maxAgeMs) {
  const parsed = readStoredJson(localStorage, key, null);
  if (!parsed || typeof parsed !== 'object') return null;
  const savedAt = Number(parsed.savedAt || 0);
  if (maxAgeMs && savedAt && Date.now() - savedAt > maxAgeMs) return null;
  return parsed;
}

function writeCache(key, value) {
  writeStoredJson(localStorage, key, { savedAt: Date.now(), value });
}

export function readModelsCache(maxAgeMs = MODEL_CACHE_TTL_MS) {
  const entry = readCache(MODEL_CACHE_KEY, maxAgeMs);
  return entry ? entry.value : null;
}

export function writeModelsCache(payload) {
  writeCache(MODEL_CACHE_KEY, payload);
}

export function clearModelsCache() {
  removeStoredValue(localStorage, MODEL_CACHE_KEY);
}

function getChatsCacheKey(userId) {
  const safeId = String(userId || '').trim() || 'anonymous';
  return `${CHAT_CACHE_KEY_PREFIX}${safeId}`;
}

export function readChatsCache(userId, maxAgeMs = CHAT_CACHE_TTL_MS) {
  if (!userId) return null;
  const entry = readCache(getChatsCacheKey(userId), maxAgeMs);
  return entry ? entry.value : null;
}

export function writeChatsCache(userId, payload) {
  if (!userId) return;
  writeCache(getChatsCacheKey(userId), payload);
}

export function getAuthState() {
  return readStoredJson(localStorage, STORAGE_KEY, null);
}

export function setAuthState(state) {
  writeStoredJson(localStorage, STORAGE_KEY, state);
}

export function clearAuthState() {
  removeStoredValue(localStorage, STORAGE_KEY);
}

function decodeJwtPayload(token) {
  const parts = String(token || '').split('.');
  if (parts.length < 2) return null;
  const payload = parts[1].replace(/-/g, '+').replace(/_/g, '/');
  const padded = payload.padEnd(Math.ceil(payload.length / 4) * 4, '=');
  try {
    return JSON.parse(atob(padded));
  } catch {
    return null;
  }
}

export function isAccessTokenUsable(token) {
  const payload = decodeJwtPayload(token);
  if (!payload || typeof payload !== 'object') return false;
  const exp = Number(payload.exp || 0);
  return Number.isFinite(exp) && exp > Math.floor(Date.now() / 1000);
}

export function getClientSessionId() {
  try {
    let id = readStoredString(sessionStorage, CLIENT_SESSION_KEY, '');
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

  let shouldRefresh = response.status === 401;
  if (!shouldRefresh && response.status === 403) {
    try {
      const payload = await response.clone().json();
      shouldRefresh = payload?.error === 'inactive_account';
    } catch {
      shouldRefresh = false;
    }
  }

  if (shouldRefresh && auth?.refresh_token) {
    const refreshed = await refreshToken(auth.refresh_token, { signal: options.signal });
    if (refreshed) {
      headers.set('Authorization', `Bearer ${refreshed.access_token}`);
      return fetch(path, { ...options, headers });
    }
  }

  return response;
}

export async function refreshToken(refreshTokenValue, options = {}) {
  const res = await fetch('/api/auth/refresh', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refresh_token: refreshTokenValue }),
    signal: options.signal,
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
  const res = await apiFetch(path, { signal, cache: 'no-store' });
  if (!res.ok) {
    const err = new Error(`Failed to fetch chats (${res.status})`);
    err.status = res.status;
    throw err;
  }

  return res.json();
}

export async function fetchModels({ signal, cache = 'default', cacheBust } = {}) {
  const suffix = cacheBust ? `?t=${encodeURIComponent(cacheBust === true ? Date.now() : cacheBust)}` : '';
  const res = await apiFetch(`/api/models${suffix}`, { signal, cache });
  if (!res.ok) {
    const err = new Error(`Failed to fetch models (${res.status})`);
    err.status = res.status;
    throw err;
  }
  const data = await res.json();
  writeModelsCache(data);
  return data;
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

export async function fetchToolServers({ signal, cache = 'no-store' } = {}) {
  const res = await apiFetch('/api/tool-servers', { signal, cache });
  if (!res.ok) {
    const err = new Error(`Failed to fetch tool servers (${res.status})`);
    err.status = res.status;
    throw err;
  }
  return res.json();
}

export async function uploadFile(file, chatId = null, options = {}) {
  const timeoutMs = Number.isFinite(options.timeoutMs) ? options.timeoutMs : 30000;
  const externalSignal = options.signal;
  const controller = new AbortController();
  if (externalSignal) {
    if (externalSignal.aborted) {
      controller.abort();
    } else {
      externalSignal.addEventListener('abort', () => controller.abort(), { once: true });
    }
  }
  const timeoutId = timeoutMs > 0
    ? setTimeout(() => controller.abort(), timeoutMs)
    : null;
  const formData = new FormData();
  formData.append('file', file);
  if (chatId) formData.append('chat_id', chatId);

  let res;
  try {
    res = await apiFetch('/api/files/upload', {
      method: 'POST',
      body: formData,
      signal: controller.signal,
    });
  } catch (err) {
    if (timeoutId) clearTimeout(timeoutId);
    if (err?.name === 'AbortError') {
      throw new Error('Upload timed out');
    }
    throw err;
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }

  if (!res.ok) {
    let message = `Failed to upload file (${res.status})`;
    try {
      const payload = await res.json();
      message = payload?.error || payload?.message || message;
    } catch {
      // ignore
    }
    const err = new Error(message);
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

export async function getFileBlob(id) {
  const res = await apiFetch(`/api/files/${id}/blob`);
  if (!res.ok) {
    const err = new Error(`Failed to get file blob (${res.status})`);
    err.status = res.status;
    throw err;
  }
  return res.blob();
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
  const res = await apiFetch('/api/chats/shared', { cache: 'no-store' });
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
  const res = await apiFetch('/api/chats/archived', { cache: 'no-store' });
  if (!res.ok) {
    const err = new Error(`Failed to fetch archived chats (${res.status})`);
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

async function parseApiError(res, fallback) {
  let message = fallback;
  try {
    const payload = await res.json();
    message = payload?.error || payload?.message || message;
  } catch {
    // ignore
  }
  const err = new Error(message);
  err.status = res.status;
  throw err;
}

export async function fetchAdminUsers({ limit = 200, offset = 0 } = {}) {
  const params = new URLSearchParams();
  params.set('limit', String(limit));
  params.set('offset', String(offset));
  const res = await apiFetch(`/api/admin/users?${params.toString()}`);
  if (!res.ok) {
    return parseApiError(res, `Failed to fetch users (${res.status})`);
  }
  return res.json();
}

export async function fetchAdminGroups() {
  const res = await apiFetch('/api/admin/groups');
  if (!res.ok) {
    return parseApiError(res, `Failed to fetch groups (${res.status})`);
  }
  return res.json();
}

export async function fetchAdminModels({ limit = 200, offset = 0, query = '', includeDisabled = true, provider = '' } = {}) {
  const params = new URLSearchParams();
  params.set('limit', String(limit));
  params.set('offset', String(offset));
  if (query) params.set('q', query);
  if (provider && provider !== 'all') params.set('provider', provider);
  if (includeDisabled) params.set('include_disabled', '1');
  const res = await apiFetch(`/api/admin/models?${params.toString()}`);
  if (!res.ok) {
    return parseApiError(res, `Failed to fetch models (${res.status})`);
  }
  return res.json();
}

export async function fetchAdminGroup(groupId) {
  const res = await apiFetch(`/api/admin/groups/${encodeURIComponent(groupId)}`);
  if (!res.ok) {
    return parseApiError(res, `Failed to fetch group (${res.status})`);
  }
  return res.json();
}

export async function createAdminGroup(payload) {
  const res = await apiFetch('/api/admin/groups', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    return parseApiError(res, `Failed to create group (${res.status})`);
  }
  return res.json();
}

export async function updateAdminGroup(groupId, payload) {
  const res = await apiFetch(`/api/admin/groups/${encodeURIComponent(groupId)}`, {
    method: 'PUT',
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    return parseApiError(res, `Failed to update group (${res.status})`);
  }
  return res.json();
}

export async function deleteAdminGroup(groupId) {
  const res = await apiFetch(`/api/admin/groups/${encodeURIComponent(groupId)}`, {
    method: 'DELETE',
  });
  if (!res.ok) {
    return parseApiError(res, `Failed to delete group (${res.status})`);
  }
  return res;
}

export async function fetchGroupDefaultPermissions() {
  const res = await apiFetch('/api/admin/groups/default-permissions');
  if (!res.ok) {
    return parseApiError(res, `Failed to fetch default permissions (${res.status})`);
  }
  return res.json();
}

export async function updateGroupDefaultPermissions(payload) {
  const res = await apiFetch('/api/admin/groups/default-permissions', {
    method: 'PUT',
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    return parseApiError(res, `Failed to update default permissions (${res.status})`);
  }
  return res.json();
}

export async function addGroupMembers(groupId, userIds = []) {
  const res = await apiFetch(`/api/admin/groups/${encodeURIComponent(groupId)}/users`, {
    method: 'POST',
    body: JSON.stringify({ user_ids: userIds }),
  });
  if (!res.ok) {
    return parseApiError(res, `Failed to add group members (${res.status})`);
  }
  return res.json();
}

export async function removeGroupMembers(groupId, userIds = []) {
  const res = await apiFetch(`/api/admin/groups/${encodeURIComponent(groupId)}/users`, {
    method: 'DELETE',
    body: JSON.stringify({ user_ids: userIds }),
  });
  if (!res.ok) {
    return parseApiError(res, `Failed to remove group members (${res.status})`);
  }
  return res.json();
}

export async function fetchGroupModelAccess(groupId) {
  const res = await apiFetch(`/api/admin/groups/${encodeURIComponent(groupId)}/models`);
  if (!res.ok) {
    return parseApiError(res, `Failed to fetch group models (${res.status})`);
  }
  return res.json();
}

export async function updateGroupModelAccess(groupId, modelIds = []) {
  const res = await apiFetch(`/api/admin/groups/${encodeURIComponent(groupId)}/models`, {
    method: 'PUT',
    body: JSON.stringify({ model_ids: modelIds }),
  });
  if (!res.ok) {
    return parseApiError(res, `Failed to update group models (${res.status})`);
  }
  return res.json();
}
