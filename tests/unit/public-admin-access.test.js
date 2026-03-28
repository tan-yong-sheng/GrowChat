import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  fetchAdminConnectionAccess,
  fetchAdminToolServerAccess,
  fetchAdminUserAccess,
  updateAdminConnectionAccess,
  updateAdminToolServerAccess,
} from '../../public/js/shared/admin-access.js';

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('admin access facade', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    const storage = () => {
      const map = new Map();
      return {
        getItem: (key) => (map.has(key) ? map.get(key) : null),
        setItem: (key, value) => map.set(key, String(value)),
        removeItem: (key) => map.delete(key),
        clear: () => map.clear(),
      };
    };
    vi.stubGlobal('localStorage', storage());
    vi.stubGlobal('sessionStorage', storage());
  });

  it('builds connection, tool server, and user access requests with shared paths', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ groups: [], rules: [] }))
      .mockResolvedValueOnce(jsonResponse({ ok: true }))
      .mockResolvedValueOnce(jsonResponse({ groups: [], rules: [] }))
      .mockResolvedValueOnce(jsonResponse({ ok: true }))
      .mockResolvedValueOnce(jsonResponse({ user_id: 'u1', rules: [] }));
    vi.stubGlobal('fetch', fetchMock);

    await fetchAdminConnectionAccess('conn-1');
    await updateAdminConnectionAccess('conn-1', [{ principal_type: 'group', principal_id: 'g1', effect: 'allow', action: 'use' }]);
    await fetchAdminToolServerAccess('mcp-1');
    await updateAdminToolServerAccess('mcp-1', [{ principal_type: 'group', principal_id: 'g1', effect: 'deny', action: 'use' }]);
    await fetchAdminUserAccess('u1');

    expect(fetchMock.mock.calls[0][0]).toBe('/api/admin/openai/connections/conn-1/access');
    expect(fetchMock.mock.calls[1][0]).toBe('/api/admin/openai/connections/conn-1/access');
    expect(fetchMock.mock.calls[1][1]).toMatchObject({ method: 'PUT' });
    expect(fetchMock.mock.calls[2][0]).toBe('/api/admin/tool-servers/mcp-1/access');
    expect(fetchMock.mock.calls[3][0]).toBe('/api/admin/tool-servers/mcp-1/access');
    expect(fetchMock.mock.calls[3][1]).toMatchObject({ method: 'PUT' });
    expect(fetchMock.mock.calls[4][0]).toBe('/api/admin/users/u1/access');
    expect(fetchMock.mock.calls[4][1]).toMatchObject({ cache: 'no-store' });
  });
});
