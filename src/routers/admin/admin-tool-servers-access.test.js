import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  createDB: vi.fn(),
  ensureAdminAclAccess: vi.fn(),
  logAuditEvent: vi.fn(),
  loadToolServerAclRules: vi.fn(),
  normalizeToolServerAclRule: vi.fn(),
  saveToolServerAclRulesForToolServer: vi.fn(),
  buildToolServerAclRuleSaveStatements: vi.fn(),
  loadToolServers: vi.fn(),
}));

vi.mock('../../db.js', () => ({
  createDB: (...args) => mocks.createDB(...args),
}));

vi.mock('../../utils/authorize.js', () => ({
  logAuditEvent: (...args) => mocks.logAuditEvent(...args),
}));

vi.mock('../../utils/tool-server-acl.js', () => ({
  loadToolServerAclRules: (...args) => mocks.loadToolServerAclRules(...args),
  normalizeToolServerAclRule: (...args) => mocks.normalizeToolServerAclRule(...args),
  saveToolServerAclRulesForToolServer: (...args) =>
    mocks.saveToolServerAclRulesForToolServer(...args),
  buildToolServerAclRuleSaveStatements: (...args) =>
    mocks.buildToolServerAclRuleSaveStatements(...args),
}));

vi.mock('../../admin/tool-servers.js', () => ({
  loadToolServers: (...args) => mocks.loadToolServers(...args),
}));

vi.mock('./admin-helpers.js', () => ({
  ensureAdminAclAccess: (...args) => mocks.ensureAdminAclAccess(...args),
}));

import { handleAdminToolServersAccess } from './admin-tool-servers-access.js';

function makeReq(path, method, body) {
  const init = { method, headers: {} };
  if (body !== undefined) {
    init.body = typeof body === 'string' ? body : JSON.stringify(body);
    init.headers['Content-Type'] = 'application/json';
  }
  return new Request(`https://example.com${path}`, init);
}

describe('handleAdminToolServersAccess', () => {
  const user = { sub: 'admin-1' };
  const env = { DB: {} };
  const ctx = {};
  const db = {
    all: vi.fn(),
    run: vi.fn(),
    batch: vi.fn(),
    prepare: vi.fn((sql, params = []) => ({
      sql,
      params,
      bind: (...args) => ({ sql, params: args }),
    })),
  };
  const logger = { error: vi.fn(), warn: vi.fn(), info: vi.fn() };

  beforeEach(() => {
    vi.resetAllMocks();
    mocks.createDB.mockReturnValue(db);
    mocks.ensureAdminAclAccess.mockResolvedValue({ allow: true });
    mocks.logAuditEvent.mockResolvedValue(undefined);
    mocks.loadToolServerAclRules.mockResolvedValue([]);
    mocks.normalizeToolServerAclRule.mockImplementation((rule) => rule);
    mocks.loadToolServers.mockResolvedValue([
      { id: 'mcp-1', name: 'Server One', url: 'https://example.com', enabled: true },
    ]);
  });

  describe('GET /api/admin/tool-servers/access', () => {
    it('returns groups and rules', async () => {
      db.all.mockResolvedValue([
        {
          id: 'g1',
          name: 'Core',
          description: 'Core team',
          is_system: 0,
          created_at: 1,
          updated_at: 1,
        },
      ]);
      mocks.loadToolServerAclRules.mockResolvedValue([]);
      const res = await handleAdminToolServersAccess(
        makeReq('/api/admin/tool-servers/access', 'GET'),
        env,
        ctx,
        user,
        '/api/admin/tool-servers/access',
        { db, logger, _requestContext: {} }
      );
      expect(res.status).toBe(200);
      const payload = await res.json();
      expect(payload.groups).toHaveLength(1);
    });

    it('returns 500 on error', async () => {
      db.all.mockRejectedValue(new Error('fail'));
      const res = await handleAdminToolServersAccess(
        makeReq('/api/admin/tool-servers/access', 'GET'),
        env,
        ctx,
        user,
        '/api/admin/tool-servers/access',
        { db, logger, _requestContext: {} }
      );
      expect(res.status).toBe(500);
    });
  });

  describe('PUT /api/admin/tool-servers/access (bulk)', () => {
    it('rejects ACL denied', async () => {
      mocks.ensureAdminAclAccess.mockResolvedValue({ allow: false, reason: 'no' });
      const res = await handleAdminToolServersAccess(
        makeReq('/api/admin/tool-servers/access', 'PUT', {
          updates: [{ tool_server_id: 'mcp-1', rules: [] }],
        }),
        env,
        ctx,
        user,
        '/api/admin/tool-servers/access',
        { db, logger, _requestContext: {} }
      );
      expect(res.status).toBe(403);
    });

    it('rejects empty updates', async () => {
      const res = await handleAdminToolServersAccess(
        makeReq('/api/admin/tool-servers/access', 'PUT', { updates: [] }),
        env,
        ctx,
        user,
        '/api/admin/tool-servers/access',
        { db, logger, _requestContext: {} }
      );
      expect(res.status).toBe(400);
    });

    it('rejects too many updates', async () => {
      const updates = Array.from({ length: 201 }, (_, i) => ({
        tool_server_id: `mcp-${i}`,
        rules: [],
      }));
      const res = await handleAdminToolServersAccess(
        makeReq('/api/admin/tool-servers/access', 'PUT', { updates }),
        env,
        ctx,
        user,
        '/api/admin/tool-servers/access',
        { db, logger, _requestContext: {} }
      );
      expect(res.status).toBe(400);
    });

    it('rejects missing tool_server_id', async () => {
      db.all.mockResolvedValue([]); // groups query
      const res = await handleAdminToolServersAccess(
        makeReq('/api/admin/tool-servers/access', 'PUT', {
          updates: [{ rules: [] }],
        }),
        env,
        ctx,
        user,
        '/api/admin/tool-servers/access',
        { db, logger, _requestContext: {} }
      );
      expect(res.status).toBe(400);
    });

    it('rejects disabled servers', async () => {
      db.all.mockResolvedValue([]); // groups query
      mocks.loadToolServers.mockResolvedValue([{ id: 'mcp-1', name: 'Disabled', enabled: false }]);
      const res = await handleAdminToolServersAccess(
        makeReq('/api/admin/tool-servers/access', 'PUT', {
          updates: [{ tool_server_id: 'mcp-1', rules: [] }],
        }),
        env,
        ctx,
        user,
        '/api/admin/tool-servers/access',
        { db, logger, _requestContext: {} }
      );
      expect(res.status).toBe(409);
    });

    it('successfully saves bulk updates', async () => {
      db.all.mockResolvedValue([{ id: 'g1' }]);
      mocks.normalizeToolServerAclRule.mockImplementation((rule) => ({
        ...rule,
        principal_type: 'group',
        principal_id: 'g1',
      }));
      mocks.buildToolServerAclRuleSaveStatements.mockReturnValue({
        statements: [{ sql: 'DELETE', params: [] }],
      });
      db.batch.mockResolvedValue(undefined);
      const res = await handleAdminToolServersAccess(
        makeReq('/api/admin/tool-servers/access', 'PUT', {
          updates: [
            {
              tool_server_id: 'mcp-1',
              rules: [{ principal_type: 'group', principal_id: 'g1', effect: 'allow' }],
            },
          ],
        }),
        env,
        ctx,
        user,
        '/api/admin/tool-servers/access',
        { db, logger, _requestContext: {} }
      );
      expect(res.status).toBe(200);
      expect(mocks.logAuditEvent).toHaveBeenCalled();
    });
  });

  describe('GET /api/admin/tool-servers/:id/access', () => {
    it('returns server access groups', async () => {
      db.all.mockResolvedValue([
        { id: 'g1', name: 'Core', description: 'Core', is_system: 0, created_at: 1, updated_at: 1 },
      ]);
      mocks.loadToolServerAclRules.mockResolvedValue([
        {
          id: 'r1',
          tool_server_id: 'mcp-1',
          principal_type: 'group',
          principal_id: 'g1',
          effect: 'allow',
          action: 'use',
        },
      ]);
      const res = await handleAdminToolServersAccess(
        makeReq('/api/admin/tool-servers/mcp-1/access', 'GET'),
        env,
        ctx,
        user,
        '/api/admin/tool-servers/mcp-1/access',
        { db, logger, _requestContext: {} }
      );
      expect(res.status).toBe(200);
      const payload = await res.json();
      expect(payload.tool_server_id).toBe('mcp-1');
    });

    it('returns 500 on error', async () => {
      db.all.mockRejectedValue(new Error('fail'));
      const res = await handleAdminToolServersAccess(
        makeReq('/api/admin/tool-servers/mcp-1/access', 'GET'),
        env,
        ctx,
        user,
        '/api/admin/tool-servers/mcp-1/access',
        { db, logger, _requestContext: {} }
      );
      expect(res.status).toBe(500);
    });
  });

  describe('PUT /api/admin/tool-servers/:id/access', () => {
    it('rejects ACL denied', async () => {
      mocks.ensureAdminAclAccess.mockResolvedValue({ allow: false, reason: 'no' });
      const res = await handleAdminToolServersAccess(
        makeReq('/api/admin/tool-servers/mcp-1/access', 'PUT', { rules: [] }),
        env,
        ctx,
        user,
        '/api/admin/tool-servers/mcp-1/access',
        { db, logger, _requestContext: {} }
      );
      expect(res.status).toBe(403);
    });

    it('rejects disabled servers', async () => {
      mocks.loadToolServers.mockResolvedValue([{ id: 'mcp-1', name: 'Disabled', enabled: false }]);
      const res = await handleAdminToolServersAccess(
        makeReq('/api/admin/tool-servers/mcp-1/access', 'PUT', { rules: [] }),
        env,
        ctx,
        user,
        '/api/admin/tool-servers/mcp-1/access',
        { db, logger, _requestContext: {} }
      );
      expect(res.status).toBe(409);
    });

    it('saves rules and logs audit', async () => {
      db.all.mockResolvedValue([{ id: 'g1' }]);
      mocks.normalizeToolServerAclRule.mockImplementation((rule) => ({
        ...rule,
        principal_type: 'group',
        principal_id: 'g1',
      }));
      mocks.saveToolServerAclRulesForToolServer.mockResolvedValue([
        { principal_type: 'group', principal_id: 'g1', effect: 'allow', action: 'use' },
      ]);
      const res = await handleAdminToolServersAccess(
        makeReq('/api/admin/tool-servers/mcp-1/access', 'PUT', {
          rules: [{ principal_type: 'group', principal_id: 'g1', effect: 'allow' }],
        }),
        env,
        ctx,
        user,
        '/api/admin/tool-servers/mcp-1/access',
        { db, logger, _requestContext: {} }
      );
      expect(res.status).toBe(200);
      const payload = await res.json();
      expect(payload.rules).toHaveLength(1);
      expect(mocks.logAuditEvent).toHaveBeenCalled();
    });

    it('returns 405 for unsupported method', async () => {
      const res = await handleAdminToolServersAccess(
        makeReq('/api/admin/tool-servers/mcp-1/access', 'PATCH', {}),
        env,
        ctx,
        user,
        '/api/admin/tool-servers/mcp-1/access',
        { db, logger, _requestContext: {} }
      );
      expect(res.status).toBe(405);
    });
  });

  it('returns null for unrecognized paths', async () => {
    const result = await handleAdminToolServersAccess(
      makeReq('/api/admin/unknown', 'GET'),
      env,
      ctx,
      user,
      '/api/admin/unknown',
      { db, logger, _requestContext: {} }
    );
    expect(result).toBeNull();
  });
});
