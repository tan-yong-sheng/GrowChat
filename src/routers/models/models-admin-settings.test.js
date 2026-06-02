import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  createDB: vi.fn(),
  authorize: vi.fn(),
  logAuditEvent: vi.fn(),
  getConfigBool: vi.fn(),
  getConfigValue: vi.fn(),
  setConfigValue: vi.fn(),
  getAllOpenAIConnectionConfigs: vi.fn(),
  normalizeModelAclRule: vi.fn(),
  buildModelAclRuleSaveStatements: vi.fn(),
  getModelAccessMap: vi.fn(),
  loadModelAttachmentCaps: vi.fn(),
  getModelAttachmentCapsEntry: vi.fn(),
  loadAttachmentCapsFromRaw: vi.fn(),
  applyAttachmentCapsPatch: vi.fn(),
  buildModelAttachmentCapSaveStatement: vi.fn(),
  isValidModelId: vi.fn(),
  normalizeModelId: vi.fn(),
  normalizeAttachmentCaps: vi.fn(),
  fetchBaseModelsFromOpenAI: vi.fn(),
  loadCustomModels: vi.fn(),
  toPublicModel: vi.fn(),
  buildProviderStats: vi.fn(),
  sortModelsByActiveThenName: vi.fn(),
  countEnabledModels: vi.fn(),
}));

vi.mock('../../db.js', () => ({
  createDB: (...args) => mocks.createDB(...args),
}));

vi.mock('../../utils/authorize.js', () => ({
  authorize: (...args) => mocks.authorize(...args),
  logAuditEvent: (...args) => mocks.logAuditEvent(...args),
}));

vi.mock('../../utils/app-config.js', () => ({
  getConfigBool: (...args) => mocks.getConfigBool(...args),
  getConfigValue: (...args) => mocks.getConfigValue(...args),
  setConfigValue: (...args) => mocks.setConfigValue(...args),
}));

vi.mock('../../llm/connections.js', () => ({
  getAllOpenAIConnectionConfigs: (...args) => mocks.getAllOpenAIConnectionConfigs(...args),
}));

vi.mock('../../llm/model-state.js', () => ({
  countEnabledModels: (...args) => mocks.countEnabledModels(...args),
  sortModelsByActiveThenName: (...args) => mocks.sortModelsByActiveThenName(...args),
}));

vi.mock('../../utils/model-acl.js', () => ({
  normalizeModelAclRule: (...args) => mocks.normalizeModelAclRule(...args),
  buildModelAclRuleSaveStatements: (...args) => mocks.buildModelAclRuleSaveStatements(...args),
}));

vi.mock('../../admin/tool-servers.js', () => ({
  normalizeModelId: (...args) => mocks.normalizeModelId(...args),
  normalizeAttachmentCaps: (...args) => mocks.normalizeAttachmentCaps(...args),
}));

vi.mock('./models-helpers.js', () => ({
  getModelAccessMap: (...args) => mocks.getModelAccessMap(...args),
  loadModelAttachmentCaps: (...args) => mocks.loadModelAttachmentCaps(...args),
  getModelAttachmentCapsEntry: (...args) => mocks.getModelAttachmentCapsEntry(...args),
  loadAttachmentCapsFromRaw: (...args) => mocks.loadAttachmentCapsFromRaw(...args),
  applyAttachmentCapsPatch: (...args) => mocks.applyAttachmentCapsPatch(...args),
  buildModelAttachmentCapSaveStatement: (...args) => mocks.buildModelAttachmentCapSaveStatement(...args),
  isValidModelId: (...args) => mocks.isValidModelId(...args),
  MODEL_ATTACHMENT_CAPS_KEY: 'model_attachment_caps_v1',
}));

vi.mock('./models-discovery.js', () => ({
  fetchBaseModelsFromOpenAI: (...args) => mocks.fetchBaseModelsFromOpenAI(...args),
  loadCustomModels: (...args) => mocks.loadCustomModels(...args),
  toPublicModel: (...args) => mocks.toPublicModel(...args),
  buildProviderStats: (...args) => mocks.buildProviderStats(...args),
  isOpenAIProvider: vi.fn(() => false),
}));

import { handleAdminModelsSettings } from './models-admin-settings.js';

function makeReq(path, method, body) {
  const init = { method, headers: {} };
  if (body !== undefined) {
    init.body = typeof body === 'string' ? body : JSON.stringify(body);
    init.headers['Content-Type'] = 'application/json';
  }
  return new Request(`https://example.com${path}`, init);
}

describe('handleAdminModelsSettings', () => {
  const user = { sub: 'admin-1' };
  const env = { DB: {} };
  const ctx = {};
  const db = {
    all: vi.fn(), run: vi.fn(), batch: vi.fn(), first: vi.fn(),
    prepare: vi.fn((sql, params = []) => ({ sql, params, bind: (...args) => ({ sql, params: args }) })),
  };
  const logger = { error: vi.fn(), warn: vi.fn(), info: vi.fn() };

  beforeEach(() => {
    vi.resetAllMocks();
    mocks.createDB.mockReturnValue(db);
    mocks.authorize.mockResolvedValue({ allow: true });
    mocks.logAuditEvent.mockResolvedValue(undefined);
    mocks.getConfigBool.mockResolvedValue(true);
    mocks.getConfigValue.mockResolvedValue('{}');
    mocks.getAllOpenAIConnectionConfigs.mockResolvedValue([]);
    mocks.fetchBaseModelsFromOpenAI.mockResolvedValue([]);
    mocks.loadCustomModels.mockResolvedValue([]);
    mocks.toPublicModel.mockImplementation((m) => ({ ...m, enabled: true }));
    mocks.buildProviderStats.mockReturnValue([]);
    mocks.sortModelsByActiveThenName.mockImplementation((m) => m);
    mocks.countEnabledModels.mockReturnValue(0);
    mocks.getModelAccessMap.mockResolvedValue(new Map());
    mocks.loadModelAttachmentCaps.mockResolvedValue({});
    mocks.getModelAttachmentCapsEntry.mockReturnValue({ text: true });
    mocks.isValidModelId.mockReturnValue(true);
    mocks.normalizeModelId.mockImplementation((id) => String(id || '').trim());
    mocks.normalizeAttachmentCaps.mockImplementation((c) => c || {});
    mocks.normalizeModelAclRule.mockImplementation((r) => r);
    db.all.mockResolvedValue([{ id: 'g1' }]);
    db.batch.mockResolvedValue(undefined);
  });

  describe('GET /api/admin/models', () => {
    it('rejects unauthorized', async () => {
      mocks.authorize.mockResolvedValue({ allow: false, reason: 'no' });
      const res = await handleAdminModelsSettings(
        makeReq('/api/admin/models', 'GET'),
        env, ctx, user, '/api/admin/models',
        { _db: db, logger, _requestContext: {} },
      );
      expect(res.status).toBe(403);
    });

    it('returns models list', async () => {
      mocks.fetchBaseModelsFromOpenAI.mockResolvedValue([
        { id: 'gpt-4o', name: 'GPT-4o', provider: 'openai', enabled: true },
      ]);
      mocks.toPublicModel.mockImplementation((m) => ({ ...m, enabled: true }));
      mocks.sortModelsByActiveThenName.mockImplementation((m) => m);
      mocks.countEnabledModels.mockReturnValue(1);
      const res = await handleAdminModelsSettings(
        makeReq('/api/admin/models', 'GET'),
        env, ctx, user, '/api/admin/models',
        { _db: db, logger, _requestContext: {} },
      );
      expect(res.status).toBe(200);
      const payload = await res.json();
      expect(payload.models).toBeDefined();
      expect(payload.total).toBe(1);
    });

    it('returns 500 when no DB', async () => {
      const noDbEnv = {};
      const res = await handleAdminModelsSettings(
        makeReq('/api/admin/models', 'GET'),
        noDbEnv, ctx, user, '/api/admin/models',
        { _db: db, logger, _requestContext: {} },
      );
      expect(res.status).toBe(500);
    });
  });

  describe('PUT /api/admin/models', () => {
    it('rejects unauthorized', async () => {
      mocks.authorize.mockResolvedValue({ allow: false, reason: 'no' });
      const res = await handleAdminModelsSettings(
        makeReq('/api/admin/models', 'PUT', { updates: [] }),
        env, ctx, user, '/api/admin/models',
        { _db: db, logger, _requestContext: {} },
      );
      expect(res.status).toBe(403);
    });

    it('rejects empty body', async () => {
      const res = await handleAdminModelsSettings(
        makeReq('/api/admin/models', 'PUT', {}),
        env, ctx, user, '/api/admin/models',
        { _db: db, logger, _requestContext: {} },
      );
      expect(res.status).toBe(400);
    });

    it('rejects too many updates', async () => {
      const updates = Array.from({ length: 501 }, (_, i) => ({ id: `m${i}`, enabled: true }));
      const res = await handleAdminModelsSettings(
        makeReq('/api/admin/models', 'PUT', { updates }),
        env, ctx, user, '/api/admin/models',
        { _db: db, logger, _requestContext: {} },
      );
      expect(res.status).toBe(400);
    });

    it('rejects invalid model id', async () => {
      mocks.isValidModelId.mockReturnValue(false);
      const res = await handleAdminModelsSettings(
        makeReq('/api/admin/models', 'PUT', { updates: [{ id: '', enabled: true }] }),
        env, ctx, user, '/api/admin/models',
        { _db: db, logger, _requestContext: {} },
      );
      expect(res.status).toBe(400);
    });

    it('updates model settings', async () => {
      mocks.getModelAccessMap.mockResolvedValue(new Map());
      const res = await handleAdminModelsSettings(
        makeReq('/api/admin/models', 'PUT', {
          updates: [{ id: 'gpt-4o', enabled: false }],
        }),
        env, ctx, user, '/api/admin/models',
        { _db: db, logger, _requestContext: {} },
      );
      expect(res.status).toBe(200);
      expect(mocks.logAuditEvent).toHaveBeenCalled();
    });

    it('rejects access updates when ACL denied', async () => {
      mocks.authorize
        .mockResolvedValueOnce({ allow: true })
        .mockResolvedValueOnce({ allow: false, reason: 'no' });
      const res = await handleAdminModelsSettings(
        makeReq('/api/admin/models', 'PUT', {
          access_updates: [{ model_id: 'm1', rules: [] }],
        }),
        env, ctx, user, '/api/admin/models',
        { _db: db, logger, _requestContext: {} },
      );
      expect(res.status).toBe(403);
    });

    it('returns 500 when no DB', async () => {
      const noDbEnv = {};
      const res = await handleAdminModelsSettings(
        makeReq('/api/admin/models', 'PUT', { updates: [{ id: 'm1', enabled: true }] }),
        noDbEnv, ctx, user, '/api/admin/models',
        { _db: db, logger, _requestContext: {} },
      );
      expect(res.status).toBe(500);
    });
  });

  it('returns null for non-matching paths', async () => {
    const result = await handleAdminModelsSettings(
      makeReq('/api/models', 'GET'),
      env, ctx, user, '/api/models',
      { _db: db, logger, _requestContext: {} },
    );
    expect(result).toBeNull();
  });
});
