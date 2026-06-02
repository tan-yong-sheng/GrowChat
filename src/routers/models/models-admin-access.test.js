import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  createDB: vi.fn(),
  authorize: vi.fn(),
  logAuditEvent: vi.fn(),
  loadModelAclRules: vi.fn(),
  normalizeModelAclRule: vi.fn(),
  saveModelAclRulesForModel: vi.fn(),
  buildModelAclRuleSaveStatements: vi.fn(),
  getModelAccessMap: vi.fn(),
  normalizeModelId: vi.fn(),
}));

vi.mock('../../db.js', () => ({
  createDB: (...args) => mocks.createDB(...args),
}));

vi.mock('../../utils/authorize.js', () => ({
  authorize: (...args) => mocks.authorize(...args),
  logAuditEvent: (...args) => mocks.logAuditEvent(...args),
}));

vi.mock('../../utils/model-acl.js', () => ({
  loadModelAclRules: (...args) => mocks.loadModelAclRules(...args),
  normalizeModelAclRule: (...args) => mocks.normalizeModelAclRule(...args),
  saveModelAclRulesForModel: (...args) => mocks.saveModelAclRulesForModel(...args),
  buildModelAclRuleSaveStatements: (...args) => mocks.buildModelAclRuleSaveStatements(...args),
}));

vi.mock('../../admin/tool-servers.js', () => ({
  normalizeModelId: (...args) => mocks.normalizeModelId(...args),
}));

vi.mock('./models-helpers.js', () => ({
  getModelAccessMap: (...args) => mocks.getModelAccessMap(...args),
}));

import { handleAdminModelsAccess } from './models-admin-access.js';

function makeReq(path, method, body) {
  const init = { method, headers: {} };
  if (body !== undefined) {
    init.body = typeof body === 'string' ? body : JSON.stringify(body);
    init.headers['Content-Type'] = 'application/json';
  }
  return new Request(`https://example.com${path}`, init);
}

describe('handleAdminModelsAccess', () => {
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
    mocks.authorize.mockResolvedValue({ allow: true });
    mocks.logAuditEvent.mockResolvedValue(undefined);
    mocks.loadModelAclRules.mockResolvedValue([]);
    mocks.normalizeModelAclRule.mockImplementation((rule) => rule);
    mocks.normalizeModelId.mockImplementation((id) => String(id || '').trim());
    mocks.getModelAccessMap.mockResolvedValue(new Map());
  });

  describe('GET /api/admin/models/access', () => {
    it('rejects unauthorized', async () => {
      mocks.authorize.mockResolvedValue({ allow: false, reason: 'no' });
      const res = await handleAdminModelsAccess(
        makeReq('/api/admin/models/access', 'GET'),
        env,
        ctx,
        user,
        '/api/admin/models/access',
        { _db: db, logger, _requestContext: {} }
      );
      expect(res.status).toBe(403);
    });

    it('returns groups and rules', async () => {
      db.all.mockResolvedValue([
        { id: 'g1', name: 'Core', description: 'Core', is_system: 0, created_at: 1, updated_at: 1 },
      ]);
      mocks.loadModelAclRules.mockResolvedValue([]);
      const res = await handleAdminModelsAccess(
        makeReq('/api/admin/models/access', 'GET'),
        env,
        ctx,
        user,
        '/api/admin/models/access',
        { _db: db, logger, _requestContext: {} }
      );
      expect(res.status).toBe(200);
    });

    it('returns 500 on error', async () => {
      db.all.mockRejectedValue(new Error('fail'));
      const res = await handleAdminModelsAccess(
        makeReq('/api/admin/models/access', 'GET'),
        env,
        ctx,
        user,
        '/api/admin/models/access',
        { _db: db, logger, _requestContext: {} }
      );
      expect(res.status).toBe(500);
    });
  });

  describe('PUT /api/admin/models/access (bulk)', () => {
    it('rejects unauthorized', async () => {
      mocks.authorize.mockResolvedValue({ allow: false, reason: 'no' });
      const res = await handleAdminModelsAccess(
        makeReq('/api/admin/models/access', 'PUT', { updates: [{ model_id: 'm1', rules: [] }] }),
        env,
        ctx,
        user,
        '/api/admin/models/access',
        { _db: db, logger, _requestContext: {} }
      );
      expect(res.status).toBe(403);
    });

    it('rejects empty updates', async () => {
      const res = await handleAdminModelsAccess(
        makeReq('/api/admin/models/access', 'PUT', { updates: [] }),
        env,
        ctx,
        user,
        '/api/admin/models/access',
        { _db: db, logger, _requestContext: {} }
      );
      expect(res.status).toBe(400);
    });

    it('rejects too many updates', async () => {
      const updates = Array.from({ length: 201 }, (_, i) => ({ model_id: `m${i}`, rules: [] }));
      const res = await handleAdminModelsAccess(
        makeReq('/api/admin/models/access', 'PUT', { updates }),
        env,
        ctx,
        user,
        '/api/admin/models/access',
        { _db: db, logger, _requestContext: {} }
      );
      expect(res.status).toBe(400);
    });

    it('rejects missing model_id', async () => {
      db.all.mockResolvedValue([]); // groups query
      const res = await handleAdminModelsAccess(
        makeReq('/api/admin/models/access', 'PUT', { updates: [{ rules: [] }] }),
        env,
        ctx,
        user,
        '/api/admin/models/access',
        { _db: db, logger, _requestContext: {} }
      );
      expect(res.status).toBe(400);
    });

    it('rejects disabled models', async () => {
      db.all.mockResolvedValue([]); // groups query
      mocks.getModelAccessMap.mockResolvedValue(new Map([['m1', false]]));
      const res = await handleAdminModelsAccess(
        makeReq('/api/admin/models/access', 'PUT', { updates: [{ model_id: 'm1', rules: [] }] }),
        env,
        ctx,
        user,
        '/api/admin/models/access',
        { _db: db, logger, _requestContext: {} }
      );
      expect(res.status).toBe(409);
    });

    it('successfully processes bulk updates', async () => {
      db.all.mockResolvedValue([{ id: 'g1' }]);
      mocks.getModelAccessMap.mockResolvedValue(new Map());
      mocks.normalizeModelAclRule.mockImplementation((rule) => ({
        ...rule,
        principal_type: 'group',
        principal_id: 'g1',
      }));
      mocks.buildModelAclRuleSaveStatements.mockReturnValue({ statements: [] });
      db.batch.mockResolvedValue(undefined);
      const res = await handleAdminModelsAccess(
        makeReq('/api/admin/models/access', 'PUT', {
          updates: [
            {
              model_id: 'm1',
              rules: [{ principal_type: 'group', principal_id: 'g1', effect: 'allow' }],
            },
          ],
        }),
        env,
        ctx,
        user,
        '/api/admin/models/access',
        { _db: db, logger, _requestContext: {} }
      );
      expect(res.status).toBe(200);
      expect(mocks.logAuditEvent).toHaveBeenCalled();
    });
  });

  describe('per-model access routes', () => {
    it('GET returns model access rules', async () => {
      db.all.mockResolvedValue([
        { id: 'g1', name: 'Core', description: 'Core', is_system: 0, created_at: 1, updated_at: 1 },
      ]);
      mocks.loadModelAclRules.mockResolvedValue([]);
      const res = await handleAdminModelsAccess(
        makeReq('/api/admin/models/gpt-4o/access', 'GET'),
        env,
        ctx,
        user,
        '/api/admin/models/gpt-4o/access',
        { _db: db, logger, _requestContext: {} }
      );
      expect(res.status).toBe(200);
    });

    it('PUT saves model access rules', async () => {
      db.all.mockResolvedValue([{ id: 'g1' }]);
      mocks.getModelAccessMap.mockResolvedValue(new Map());
      mocks.normalizeModelAclRule.mockImplementation((rule) => ({
        ...rule,
        principal_type: 'group',
        principal_id: 'g1',
      }));
      mocks.saveModelAclRulesForModel.mockResolvedValue([
        { principal_type: 'group', principal_id: 'g1', effect: 'allow', action: 'use' },
      ]);
      const res = await handleAdminModelsAccess(
        makeReq('/api/admin/models/gpt-4o/access', 'PUT', {
          rules: [{ principal_type: 'group', principal_id: 'g1', effect: 'allow' }],
        }),
        env,
        ctx,
        user,
        '/api/admin/models/gpt-4o/access',
        { _db: db, logger, _requestContext: {} }
      );
      expect(res.status).toBe(200);
      expect(mocks.logAuditEvent).toHaveBeenCalled();
    });

    it('returns 405 for unsupported method', async () => {
      const res = await handleAdminModelsAccess(
        makeReq('/api/admin/models/gpt-4o/access', 'PATCH', {}),
        env,
        ctx,
        user,
        '/api/admin/models/gpt-4o/access',
        { _db: db, logger, _requestContext: {} }
      );
      expect(res.status).toBe(405);
    });
  });

  it('returns null for unrecognized paths', async () => {
    const result = await handleAdminModelsAccess(
      makeReq('/api/unknown', 'GET'),
      env,
      ctx,
      user,
      '/api/unknown',
      { _db: db, logger, _requestContext: {} }
    );
    expect(result).toBeNull();
  });
});
