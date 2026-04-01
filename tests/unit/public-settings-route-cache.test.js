// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createSettingsRouteCache } from '../../public/js/shared/utils/settings-route-cache.js';

describe('settings route cache', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    vi.restoreAllMocks();
  });

  it('flushes pending invalidations once a refresh handler is registered', async () => {
    localStorage.setItem('growchat_connections_invalidate', 'token-1');

    const cache = createSettingsRouteCache();
    const refresh = vi.fn();

    const cleanup = cache.bind();
    expect(refresh).not.toHaveBeenCalled();

    const unregister = cache.registerConnectionsRefresh(refresh);
    expect(refresh).toHaveBeenCalledTimes(1);

    localStorage.setItem('growchat_connections_invalidate', 'token-2');
    window.dispatchEvent(new StorageEvent('storage', {
      key: 'growchat_connections_invalidate',
      newValue: 'token-2',
    }));

    expect(refresh).toHaveBeenCalledTimes(2);

    unregister();
    cleanup();
  });
});
