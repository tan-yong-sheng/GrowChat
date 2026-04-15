// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  apiFetch,
  clearAuthState,
  clearModelsCache,
  createAdminRbacRole,
  deleteAdminRbacRole,
  fetchArchivedChats,
  fetchAdminRbacRoles,
  fetchChats,
  fetchSharedChats,
  fetchModels,
  getAuthState,
  getClientSessionId,
  isAccessTokenUsable,
  readChatsCache,
  readModelsCache,
  setAuthState,
  updateAdminRbacRole,
  writeChatsCache,
  writeModelsCache,
} from '../../public/js/shared/api.js';

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
      'growchat_models_cache_v1_global',
      JSON.stringify({ savedAt: staleAt, value: { models: [{ id: 'old' }] } })
    );
    localStorage.removeItem('growchat_models_cache_v1');

    expect(readModelsCache()).toBeNull();
    expect(readChatsCache(null)).toBeNull();
  });

  it('refreshes auth before a request when the access token is stale', async () => {
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
    expect(fetchMock).toHaveBeenCalledTimes(2);

    expect(headerSnapshots[0]).toMatchObject({
      url: '/api/auth/refresh',
      authorization: null,
      contentType: null,
    });
    expect(headerSnapshots[1].clientSessionId).toBeTruthy();
    expect(headerSnapshots[1]).toMatchObject({
      url: '/api/chats',
      authorization: 'Bearer new-access',
      contentType: 'application/json',
    });

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

  it('builds scoped model requests for account and chat surfaces', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ models: [] }));
    vi.stubGlobal('fetch', fetchMock);

    await fetchModels({ scope: 'effective' });

    expect(fetchMock.mock.calls[0][0]).toBe('/api/models?scope=effective');
  });

  it('builds admin RBAC role requests with the expected methods and paths', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ roles: [] }))
      .mockResolvedValueOnce(jsonResponse({ role: { id: 'r1' } }))
      .mockResolvedValueOnce(jsonResponse({ role: { id: 'r1' } }))
      .mockResolvedValueOnce(new Response(null, { status: 204 }));
    vi.stubGlobal('fetch', fetchMock);

    await fetchAdminRbacRoles();
    await createAdminRbacRole({ name: 'Support', permissions: ['chat.read'] });
    await updateAdminRbacRole('r1', { name: 'Support+', permissions: ['chat.read'] });
    await deleteAdminRbacRole('r1');

    expect(fetchMock.mock.calls[0][0]).toBe('/api/admin/rbac/roles');
    expect(fetchMock.mock.calls[1][0]).toBe('/api/admin/rbac/roles');
    expect(fetchMock.mock.calls[1][1]).toMatchObject({ method: 'POST' });
    expect(fetchMock.mock.calls[2][0]).toBe('/api/admin/rbac/roles/r1');
    expect(fetchMock.mock.calls[2][1]).toMatchObject({ method: 'PUT' });
    expect(fetchMock.mock.calls[3][0]).toBe('/api/admin/rbac/roles/r1');
    expect(fetchMock.mock.calls[3][1]).toMatchObject({ method: 'DELETE' });
  });

});


