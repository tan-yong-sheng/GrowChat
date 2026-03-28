import { apiFetch } from './request.js';
import { readJsonResponse } from './response.js';

export async function fetchChats({ q = '', limit = 20, offset = 0, signal } = {}) {
  const params = new URLSearchParams();
  if (q && q.trim()) params.set('q', q.trim());
  params.set('limit', String(limit));
  params.set('offset', String(offset));

  const res = await apiFetch(`/api/chats?${params.toString()}`, { signal, cache: 'no-store' });
  return readJsonResponse(res, `Failed to fetch chats (${res.status})`);
}

export async function fetchSharedChats() {
  const res = await apiFetch('/api/chats/shared', { cache: 'no-store' });
  return readJsonResponse(res, `Failed to fetch shared chats (${res.status})`);
}

export async function fetchArchivedChats() {
  const res = await apiFetch('/api/chats/archived', { cache: 'no-store' });
  return readJsonResponse(res, `Failed to fetch archived chats (${res.status})`);
}

export async function fetchPublicSharedChat(shareId) {
  const res = await fetch(`/s/${encodeURIComponent(shareId)}?format=json`, {
    headers: { Accept: 'application/json' },
  });
  return readJsonResponse(res, `Failed to fetch shared chat (${res.status})`);
}

export async function shareChat(chatId) {
  const res = await apiFetch(`/api/chats/${chatId}/share`, { method: 'POST' });
  return readJsonResponse(res, `Failed to share chat (${res.status})`);
}

export async function unshareChat(chatId) {
  const res = await apiFetch(`/api/chats/${chatId}/share`, { method: 'DELETE' });
  return readJsonResponse(res, `Failed to unshare chat (${res.status})`);
}

export async function toggleArchiveChat(chatId) {
  const res = await apiFetch(`/api/chats/${chatId}/archive`, { method: 'POST' });
  return readJsonResponse(res, `Failed to archive chat (${res.status})`);
}
