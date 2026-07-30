import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  createDB: vi.fn(),
  ensureAdminAclAccess: vi.fn(),
  logAuditEvent: vi.fn(),
  loadConnectionAclRules: vi.fn(),
  normalizeConnectionAclRule: vi.fn(),
  saveConnectionAclRulesForConnection: vi.fn(),
  buildConnectionAclRuleSaveStatements: vi.fn(),
  getAllOpenAIConnectionConfigs: vi.fn(),
}));

vi.mock('../../db.js', () => ({
  createDB: (...args) => mocks.createDB(...args),
}));

vi.mock('../../utils/authorize.js', () => ({
  logAuditEvent: (...args) => mocks.logAuditEvent(...args),
}));

vi.mock('../../utils/connection-acl.js', () => ({
  loadConnectionAclRules: (...args) => mocks.loadConnectionAclRules(...args),
  normalizeConnectionAclRule: (...args) => mocks.normalizeConnectionAclRule(...args),
  saveConnectionAclRulesForConnection: (...args) =>
    mocks.saveConnectionAclRulesForConnection(...args),
  buildConnectionAclRuleSaveStatements: (...args) =>
    mocks.buildConnectionAclRuleSaveStatements(...args),
}));

vi.mock('../../llm/connections.js', () => ({
  getAllOpenAIConnectionConfigs: (...args) => mocks.getAllOpenAIConnectionConfigs(...args),
}));

vi.mock('./admin-helpers.js', () => ({
  ensureAdminAclAccess: (...args) => mocks.ensureAdminAclAccess(...args),
  parseJsonAndRequireAdminAcl: async (req, env, user, resource) => {
    let body;
    try {
      body = await req.json();
    } catch {
      return { error: new Response('Invalid JSON body', { status: 400 }) };
    }
    const aclDecision = await mocks.ensureAdminAclAccess({ env, user, resource });
    if (!aclDecision.allow) {
      return { error: new Response(aclDecision.reason || 'Forbidden', { status: 403 }) };
    }
    return { body };
  },
}));

import { handleAdminConnectionsAccess } from './admin-connections-access.js';

function makeReq(path, method, body, headers = {}) {
  const init = { method, headers: { ...headers } };
  if (body !== undefined) {
    init.body = typeof body === 'string' ? body : JSON.stringify(body);
    init.headers['Content-Type'] = 'application/json';
  }
  return new Request(`https://example.com${path}`, init);
}

describe('handleAdminConnectionsAccess', () => {
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
    mocks.loadConnectionAclRules.mockResolvedValue([]);
    mocks.normalizeConnectionAclRule.mockImplementation((rule) => rule);
    mocks.getAllOpenAIConnectionConfigs.mockResolvedValue([
      { id: 'conn-1', name: 'Test', enabled: true },
    ]);
  });

  describe('GET /api/admin/openai/connections/access', () => {
    it('returns all groups and rules', async () => {
      db.all.mockResolvedValue([
        {
          id: 'g1',
          name: 'Admins',
          description: 'Admin group',
          is_system: 1,
          created_at: 1,
          updated_at: 1,
        },
      ]);
      mocks.loadConnectionAclRules.mockResolvedValue([
        {
          id: 'r1',
          connection_id: 'conn-1',
          principal_type: 'group',
          principal_id: 'g1',
          effect: 'allow',
          action: 'use',
        },
      ]);
      const res = await handleAdminConnectionsAccess(
        makeReq('/api/admin/openai/connections/access', 'GET'),
        env,
        ctx,
        user,
        '/api/admin/openai/connections/access',
        { db, logger, _requestContext: {} }
      );
      expect(res.status).toBe(200);
      const payload = await res.json();
      expect(payload.groups).toHaveLength(1);
      expect(payload.rules).toHaveLength(1);
    });

    it('filters by ids query param', async () => {
      const res = await handleAdminConnectionsAccess(
        makeReq('/api/admin/openai/connections/access?ids=conn-1,conn-2', 'GET'),
        env,
        ctx,
        user,
        '/api/admin/openai/connections/access',
        { db, logger, _requestContext: {} }
      );
      expect(res.status).toBe(200);
      const payload = await res.json();
      expect(payload.connection_ids).toEqual(['conn-1', 'conn-2']);
    });

    it('returns 500 on DB error', async () => {
      db.all.mockRejectedValue(new Error('DB fail'));
      const res = await handleAdminConnectionsAccess(
        makeReq('/api/admin/openai/connections/access', 'GET'),
        env,
        ctx,
        user,
        '/api/admin/openai/connections/access',
        { db, logger, _requestContext: {} }
      );
      expect(res.status).toBe(500);
    });
  });

  describe('PUT /api/admin/openai/connections/access (bulk)', () => {
    it('rejects when ACL check fails', async () => {
      mocks.ensureAdminAclAccess.mockResolvedValue({ allow: false, reason: 'no' });
      const res = await handleAdminConnectionsAccess(
        makeReq('/api/admin/openai/connections/access', 'PUT', {
          updates: [{ connection_id: 'conn-1', rules: [] }],
        }),
        env,
        ctx,
        user,
        '/api/admin/openai/connections/access',
        { db, logger, _requestContext: {} }
      );
      expect(res.status).toBe(403);
    });

    it('rejects empty updates', async () => {
      const res = await handleAdminConnectionsAccess(
        makeReq('/api/admin/openai/connections/access', 'PUT', { updates: [] }),
        env,
        ctx,
        user,
        '/api/admin/openai/connections/access',
        { db, logger, _requestContext: {} }
      );
      expect(res.status).toBe(400);
    });

    it('rejects too many updates (>200)', async () => {
      const updates = Array.from({ length: 201 }, (_, i) => ({
        connection_id: `conn-${i}`,
        rules: [],
      }));
      const res = await handleAdminConnectionsAccess(
        makeReq('/api/admin/openai/connections/access', 'PUT', { updates }),
        env,
        ctx,
        user,
        '/api/admin/openai/connections/access',
        { db, logger, _requestContext: {} }
      );
      expect(res.status).toBe(400);
    });

    it('rejects missing connection_id', async () => {
      db.all.mockResolvedValue([]); // groups query
      const res = await handleAdminConnectionsAccess(
        makeReq('/api/admin/openai/connections/access', 'PUT', {
          updates: [{ rules: [] }],
        }),
        env,
        ctx,
        user,
        '/api/admin/openai/connections/access',
        { db, logger, _requestContext: {} }
      );
      expect(res.status).toBe(400);
    });

    it('rejects disabled connections', async () => {
      db.all.mockResolvedValue([]); // groups query
      mocks.getAllOpenAIConnectionConfigs.mockResolvedValue([
        { id: 'conn-disabled', name: 'Disabled', enabled: false },
      ]);
      const res = await handleAdminConnectionsAccess(
        makeReq('/api/admin/openai/connections/access', 'PUT', {
          updates: [{ connection_id: 'conn-disabled', rules: [] }],
        }),
        env,
        ctx,
        user,
        '/api/admin/openai/connections/access',
        { db, logger, _requestContext: {} }
      );
      expect(res.status).toBe(409);
    });

    it('rejects invalid principal_type', async () => {
      db.all.mockResolvedValue([]); // groups query
      mocks.normalizeConnectionAclRule.mockImplementation((rule) => ({
        ...rule,
        principal_type: 'user',
        principal_id: 'u1',
      }));
      const res = await handleAdminConnectionsAccess(
        makeReq('/api/admin/openai/connections/access', 'PUT', {
          updates: [
            {
              connection_id: 'conn-1',
              rules: [{ principal_type: 'user', principal_id: 'u1', effect: 'allow' }],
            },
          ],
        }),
        env,
        ctx,
        user,
        '/api/admin/openai/connections/access',
        { db, logger, _requestContext: {} }
      );
      expect(res.status).toBe(400);
    });

    it('successfully processes bulk updates', async () => {
      db.all.mockResolvedValue([{ id: 'g1' }]);
      mocks.normalizeConnectionAclRule.mockImplementation((rule) => ({
        ...rule,
        principal_type: 'group',
        principal_id: 'g1',
      }));
      mocks.buildConnectionAclRuleSaveStatements.mockReturnValue({
        statements: [{ sql: 'DELETE', params: [] }],
      });
      db.batch.mockResolvedValue(undefined);
      const res = await handleAdminConnectionsAccess(
        makeReq('/api/admin/openai/connections/access', 'PUT', {
          updates: [
            {
              connection_id: 'conn-1',
              rules: [{ principal_type: 'group', principal_id: 'g1', effect: 'allow' }],
            },
          ],
        }),
        env,
        ctx,
        user,
        '/api/admin/openai/connections/access',
        { db, logger, _requestContext: {} }
      );
      expect(res.status).toBe(200);
      expect(mocks.logAuditEvent).toHaveBeenCalled();
    });

    it('returns 500 on batch failure', async () => {
      db.all.mockResolvedValue([{ id: 'g1' }]);
      mocks.normalizeConnectionAclRule.mockImplementation((rule) => ({
        ...rule,
        principal_type: 'group',
        principal_id: 'g1',
      }));
      mocks.buildConnectionAclRuleSaveStatements.mockReturnValue({
        statements: [{ sql: 'DELETE' }],
      });
      db.batch.mockRejectedValue(new Error('batch fail'));
      const res = await handleAdminConnectionsAccess(
        makeReq('/api/admin/openai/connections/access', 'PUT', {
          updates: [{ connection_id: 'conn-1', rules: [] }],
        }),
        env,
        ctx,
        user,
        '/api/admin/openai/connections/access',
        { db, logger, _requestContext: {} }
      );
      expect(res.status).toBe(500);
    });
  });

  describe('GET /api/admin/openai/connections/:id/access', () => {
    it('returns connection access groups', async () => {
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
      mocks.loadConnectionAclRules.mockResolvedValue([
        {
          id: 'r1',
          connection_id: 'conn-1',
          principal_type: 'group',
          principal_id: 'g1',
          effect: 'allow',
          action: 'use',
        },
      ]);
      const res = await handleAdminConnectionsAccess(
        makeReq('/api/admin/openai/connections/conn-1/access', 'GET'),
        env,
        ctx,
        user,
        '/api/admin/openai/connections/conn-1/access',
        { db, logger, _requestContext: {} }
      );
      expect(res.status).toBe(200);
      const payload = await res.json();
      expect(payload.connection_id).toBe('conn-1');
      expect(payload.groups).toHaveLength(1);
    });

    it('returns 500 on error', async () => {
      db.all.mockRejectedValue(new Error('fail'));
      const res = await handleAdminConnectionsAccess(
        makeReq('/api/admin/openai/connections/conn-1/access', 'GET'),
        env,
        ctx,
        user,
        '/api/admin/openai/connections/conn-1/access',
        { db, logger, _requestContext: {} }
      );
      expect(res.status).toBe(500);
    });
  });

  describe('PUT /api/admin/openai/connections/:id/access', () => {
    it('rejects ACL denied', async () => {
      mocks.ensureAdminAclAccess.mockResolvedValue({ allow: false, reason: 'no' });
      const res = await handleAdminConnectionsAccess(
        makeReq('/api/admin/openai/connections/conn-1/access', 'PUT', { rules: [] }),
        env,
        ctx,
        user,
        '/api/admin/openai/connections/conn-1/access',
        { db, logger, _requestContext: {} }
      );
      expect(res.status).toBe(403);
    });

    it('rejects disabled connections', async () => {
      mocks.getAllOpenAIConnectionConfigs.mockResolvedValue([
        { id: 'conn-1', name: 'Disabled', enabled: false },
      ]);
      const res = await handleAdminConnectionsAccess(
        makeReq('/api/admin/openai/connections/conn-1/access', 'PUT', { rules: [] }),
        env,
        ctx,
        user,
        '/api/admin/openai/connections/conn-1/access',
        { db, logger, _requestContext: {} }
      );
      expect(res.status).toBe(409);
    });

    it('saves and returns rules', async () => {
      db.all.mockResolvedValue([{ id: 'g1' }]);
      mocks.normalizeConnectionAclRule.mockImplementation((rule) => ({
        ...rule,
        principal_type: 'group',
        principal_id: 'g1',
      }));
      mocks.saveConnectionAclRulesForConnection.mockResolvedValue([
        { principal_type: 'group', principal_id: 'g1', effect: 'allow', action: 'use' },
      ]);
      const res = await handleAdminConnectionsAccess(
        makeReq('/api/admin/openai/connections/conn-1/access', 'PUT', {
          rules: [{ principal_type: 'group', principal_id: 'g1', effect: 'allow' }],
        }),
        env,
        ctx,
        user,
        '/api/admin/openai/connections/conn-1/access',
        { db, logger, _requestContext: {} }
      );
      expect(res.status).toBe(200);
      const payload = await res.json();
      expect(payload.rules).toHaveLength(1);
      expect(mocks.logAuditEvent).toHaveBeenCalled();
    });

    it('returns 405 for unsupported method', async () => {
      const res = await handleAdminConnectionsAccess(
        makeReq('/api/admin/openai/connections/conn-1/access', 'PATCH', {}),
        env,
        ctx,
        user,
        '/api/admin/openai/connections/conn-1/access',
        { db, logger, _requestContext: {} }
      );
      expect(res.status).toBe(405);
    });
  });

  it('returns null for unrecognized paths', async () => {
    const result = await handleAdminConnectionsAccess(
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
