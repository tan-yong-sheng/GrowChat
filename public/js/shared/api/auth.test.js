import { beforeEach, describe, expect, it, vi } from 'vitest';

import { getAuthState, logout, setAuthState } from './auth.js';

/**
 * @vitest-environment jsdom
 */

describe('auth api', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it('logout sends refresh_token to the logout endpoint and clears auth state', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue({ ok: true });
    setAuthState({ access_token: 'access', refresh_token: 'refresh', user: { id: 'u1' } });

    const result = await logout();

    expect(fetchSpy).toHaveBeenCalledWith(
      '/api/auth/logout',
      expect.objectContaining({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refresh_token: 'refresh' }),
      })
    );
    expect(result).toBe(true);
    expect(getAuthState()).toBeNull();
  });

  it('logout does not clear auth state when the request fails', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('network error'));
    setAuthState({ access_token: 'access', refresh_token: 'refresh', user: { id: 'u1' } });

    const result = await logout();

    expect(result).toBe(false);
    expect(getAuthState()).not.toBeNull();
  });

  it('logout does not clear auth state when the server returns an error', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({ ok: false, status: 500 });
    setAuthState({ access_token: 'access', refresh_token: 'refresh', user: { id: 'u1' } });

    const result = await logout();

    expect(result).toBe(false);
    expect(getAuthState()).not.toBeNull();
  });

  it('logout clears auth state when no refresh token is present', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    setAuthState({ access_token: 'access', user: { id: 'u1' } });

    const result = await logout();

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(result).toBe(true);
    expect(getAuthState()).toBeNull();
  });
});
