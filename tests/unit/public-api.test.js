// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  apiFetch,
  clearAuthState,
  clearModelsCache,
  fetchArchivedChats,
  fetchChats,
  fetchSharedChats,
  fetchModels,
  getAuthState,
  getClientSessionId,
  isAccessTokenUsable,
  readChatsCache,
  readModelsCache,
  setAuthState,
  writeChatsCache,
  writeModelsCache,
} from '../../public/js/api.js';

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function makeJwt(exp) {
  const encode = (value) => btoa(JSON.stringify(value)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
  return `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode({ exp })}.sig`;
}

describe('public api helpers', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    clearAuthState();
    clearModelsCache();
    vi.restoreAllMocks();
  });

  it('stores auth and client session ids deterministically', () => {
    setAuthState({ access_token: 'a', refresh_token: 'r', user: { id: 'u1' } });

    expect(getAuthState()).toEqual({
      access_token: 'a',
      refresh_token: 'r',
      user: { id: 'u1' },
    });

    const first = getClientSessionId();
    const second = getClientSessionId();

    expect(first).toBe(second);
    expect(sessionStorage.getItem('growchat_client_session_id')).toBe(first);
  });

  it('rejects expired or malformed access tokens locally', () => {
    const now = Math.floor(Date.now() / 1000);
    expect(isAccessTokenUsable(makeJwt(now + 60))).toBe(true);
    expect(isAccessTokenUsable(makeJwt(now - 60))).toBe(false);
    expect(isAccessTokenUsable('invalid-token')).toBe(false);
  });

  it('reads and writes model and chat caches with ttl semantics', () => {
    writeModelsCache({ models: [{ id: 'm1' }] });
    writeChatsCache('u1', { chats: [{ id: 'c1' }], limit: 20 });

    expect(readModelsCache()).toEqual({ models: [{ id: 'm1' }] });
    expect(readChatsCache('u1')).toEqual({ chats: [{ id: 'c1' }], limit: 20 });

    const staleAt = Date.now() - (16 * 60 * 1000);
    localStorage.setItem(
      'growchat_models_cache_v1',
      JSON.stringify({ savedAt: staleAt, value: { models: [{ id: 'old' }] } })
    );

    expect(readModelsCache()).toBeNull();
    expect(readChatsCache(null)).toBeNull();
  });

  it('refreshes auth and retries a request after 401', async () => {
    setAuthState({ access_token: 'old-access', refresh_token: 'old-refresh', user: { id: 'u1' } });

    const headerSnapshots = [];
    const fetchMock = vi.fn((url, init = {}) => {
      headerSnapshots.push({
        url,
        authorization: init.headers?.get?.('Authorization') || null,
        contentType: init.headers?.get?.('Content-Type') || null,
        clientSessionId: init.headers?.get?.('x-client-session-id') || null,
      });

      if (headerSnapshots.length === 1) {
        return Promise.resolve(new Response('', { status: 401 }));
      }
      if (headerSnapshots.length === 2) {
        return Promise.resolve(jsonResponse({
          access_token: 'new-access',
          refresh_token: 'new-refresh',
          user: { id: 'u1' },
        }));
      }
      return Promise.resolve(jsonResponse({ ok: true }));
    });
    vi.stubGlobal('fetch', fetchMock);

    const res = await apiFetch('/api/chats', {
      method: 'POST',
      body: JSON.stringify({ message: 'Hello' }),
    });

    expect(res.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(3);

    expect(headerSnapshots[0]).toMatchObject({
      url: '/api/chats',
      authorization: 'Bearer old-access',
      contentType: 'application/json',
    });
    expect(headerSnapshots[0].clientSessionId).toBeTruthy();

    expect(getAuthState()).toEqual({
      access_token: 'new-access',
      refresh_token: 'new-refresh',
      user: { id: 'u1' },
    });
  });

  it('builds chat and model requests with the expected query parameters', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ chats: [] }))
      .mockResolvedValueOnce(jsonResponse({ models: [{ id: 'm1' }] }))
      .mockResolvedValueOnce(jsonResponse({ chats: [] }))
      .mockResolvedValueOnce(jsonResponse({ chats: [] }));
    vi.stubGlobal('fetch', fetchMock);

    await fetchChats({ q: ' hello ', limit: 10, offset: 5 });
    await fetchModels();
    await fetchSharedChats();
    await fetchArchivedChats();

    expect(fetchMock.mock.calls[0][0]).toBe('/api/chats?q=hello&limit=10&offset=5');
    expect(fetchMock.mock.calls[1][0]).toBe('/api/models');
    expect(fetchMock.mock.calls[2][0]).toBe('/api/chats/shared');
    expect(fetchMock.mock.calls[2][1]).toMatchObject({ cache: 'no-store' });
    expect(fetchMock.mock.calls[3][0]).toBe('/api/chats/archived');
    expect(fetchMock.mock.calls[3][1]).toMatchObject({ cache: 'no-store' });
    expect(readModelsCache()).toEqual({ models: [{ id: 'm1' }] });
  });
});
