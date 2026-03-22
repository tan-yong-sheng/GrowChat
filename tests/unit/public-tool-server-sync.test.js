// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';

async function loadModule() {
  vi.resetModules();
  return import('../../public/js/shared/utils/tool-server-sync.js');
}

describe('tool server sync', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    vi.restoreAllMocks();
  });

  it('broadcasts and consumes invalidations once', async () => {
    const { broadcastToolServersInvalidation, consumeToolServersInvalidation } = await loadModule();
    const listener = vi.fn();
    window.addEventListener('growchat:tool-servers-invalidated', listener);

    const token = broadcastToolServersInvalidation('token-123');
    expect(token).toBe('token-123');
    expect(localStorage.getItem('growchat_tool_servers_invalidate')).toBe('token-123');
    expect(listener).toHaveBeenCalledTimes(1);
    expect(consumeToolServersInvalidation()).toBe('token-123');
    expect(sessionStorage.getItem('growchat_tool_servers_invalidate_seen')).toBe('token-123');
    expect(consumeToolServersInvalidation()).toBeNull();

    window.removeEventListener('growchat:tool-servers-invalidated', listener);
  });
});
