// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  clearAuthState,
  clearPerUserLocalState,
  getAuthState,
  getClientSessionId,
  logout,
  setAuthState,
} from '../../public/js/shared/api.js';

const PER_USER_KEYS = [
  'drafts',
  'defaultModelId',
  'toolSelectionsByChat',
  'sidebarCollapsed',
  'sidebarWidth',
  'newChatDraft',
];

function seedAuthAndSession() {
  setAuthState({ access_token: 'a', refresh_token: 'r', user: { id: 'u1' } });
  getClientSessionId();
}

describe('auth logout flow', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('clearAuthState wipes both auth key and session id', () => {
    seedAuthAndSession();
    expect(localStorage.getItem('growchat_auth')).not.toBeNull();
    expect(sessionStorage.getItem('growchat_client_session_id')).not.toBeNull();

    clearAuthState();

    expect(localStorage.getItem('growchat_auth')).toBeNull();
    expect(sessionStorage.getItem('growchat_client_session_id')).toBeNull();
  });

  it('clearPerUserLocalState removes growchat_* and known per-user keys', () => {
    seedAuthAndSession();
    localStorage.setItem('growchat_models_cache_v1_effective', '{"savedAt":1}');
    localStorage.setItem('growchat_models_cache_v1_default', '{"savedAt":2}');
    localStorage.setItem('growchat_chats_cache_v1_user-abc', '{"savedAt":3}');
    localStorage.setItem('growchat_tool_server_global', '{"savedAt":4}');
    localStorage.setItem('growchat_models_cache_v1_test', '{"savedAt":5}');
    for (const key of PER_USER_KEYS) {
      localStorage.setItem(key, 'sentinel');
    }
    // A non-per-user key should survive.
    localStorage.setItem('public_settings', 'keep-me');

    clearPerUserLocalState();

    expect(localStorage.getItem('growchat_auth')).toBeNull();
    expect(localStorage.getItem('growchat_client_session_id')).toBeNull();
    expect(localStorage.getItem('growchat_models_cache_v1_effective')).toBeNull();
    expect(localStorage.getItem('growchat_models_cache_v1_default')).toBeNull();
    expect(localStorage.getItem('growchat_models_cache_v1_test')).toBeNull();
    expect(localStorage.getItem('growchat_chats_cache_v1_user-abc')).toBeNull();
    expect(localStorage.getItem('growchat_tool_server_global')).toBeNull();
    for (const key of PER_USER_KEYS) {
      expect(localStorage.getItem(key)).toBeNull();
    }
    expect(localStorage.getItem('public_settings')).toBe('keep-me');
    expect(sessionStorage.getItem('growchat_client_session_id')).toBeNull();
  });

  it('logout always wipes local state even when server returns 5xx', async () => {
    seedAuthAndSession();
    localStorage.setItem('drafts', '{"chat-1":"hello"}');
    localStorage.setItem('defaultModelId', 'gpt-4');
    localStorage.setItem('growchat_models_cache_v1_effective', '{"savedAt":1}');

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: 'down' }), { status: 503 }))
    );

    const result = await logout();

    expect(result).toEqual({ ok: false, serverNotified: false });
    expect(getAuthState()).toBeNull();
    expect(localStorage.getItem('drafts')).toBeNull();
    expect(localStorage.getItem('defaultModelId')).toBeNull();
    expect(localStorage.getItem('growchat_models_cache_v1_effective')).toBeNull();
    expect(sessionStorage.getItem('growchat_client_session_id')).toBeNull();
  });

  it('logout always wipes local state even when fetch throws (network error)', async () => {
    seedAuthAndSession();
    localStorage.setItem('drafts', '{"chat-1":"hello"}');
    localStorage.setItem('toolSelectionsByChat', '{"chat-1":[]}');

    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network down')));

    const result = await logout();

    expect(result).toEqual({ ok: false, serverNotified: false });
    expect(getAuthState()).toBeNull();
    expect(localStorage.getItem('drafts')).toBeNull();
    expect(localStorage.getItem('toolSelectionsByChat')).toBeNull();
    expect(sessionStorage.getItem('growchat_client_session_id')).toBeNull();
  });

  it('logout reports success when the server confirms', async () => {
    seedAuthAndSession();

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200 }))
    );

    const result = await logout();

    expect(result).toEqual({ ok: true, serverNotified: true });
    expect(getAuthState()).toBeNull();
  });

  it('logout without a refresh token short-circuits and still wipes local state', async () => {
    setAuthState({ access_token: 'a', user: { id: 'u1' } });
    localStorage.setItem('drafts', '{"chat-1":"hello"}');
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);

    const result = await logout();

    expect(result).toEqual({ ok: true, serverNotified: false });
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(getAuthState()).toBeNull();
    expect(localStorage.getItem('drafts')).toBeNull();
  });
});
