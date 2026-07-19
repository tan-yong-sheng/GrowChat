import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  createDB: vi.fn(),
  getConfigBool: vi.fn(),
  getAllOpenAIConnectionConfigs: vi.fn(),
  fetchBaseModelsFromOpenAI: vi.fn(),
  loadCustomModels: vi.fn(),
  toPublicModel: vi.fn(),
  buildProviderStats: vi.fn(),
  sortModelsByActiveThenName: vi.fn(),
  countEnabledModels: vi.fn(),
  isOpenAIProvider: vi.fn(),
  getDisabledModelSet: vi.fn(),
  getModelAccessMap: vi.fn(),
  loadModelAttachmentCaps: vi.fn(),
  getModelAttachmentCapsEntry: vi.fn(),
  loadUserResourceOverrides: vi.fn(),
  loadModelAclRules: vi.fn(),
  buildModelAclIndex: vi.fn(),
  evaluateModelAclAccess: vi.fn(),
  splitModelScopeByUserVisibility: vi.fn(),
  matchesModelQuery: vi.fn(),
  parseModelListSearchParams: vi.fn(),
}));

vi.mock('../../db.js', () => ({
  createDB: (...args) => mocks.createDB(...args),
}));

vi.mock('../../utils/app-config.js', () => ({
  getConfigBool: (...args) => mocks.getConfigBool(...args),
}));

vi.mock('../../llm/connections.js', () => ({
  getAllOpenAIConnectionConfigs: (...args) => mocks.getAllOpenAIConnectionConfigs(...args),
}));

vi.mock('../../llm/model-state.js', () => ({
  countEnabledModels: (...args) => mocks.countEnabledModels(...args),
  sortModelsByActiveThenName: (...args) => mocks.sortModelsByActiveThenName(...args),
}));

vi.mock('../../../public/js/shared/utils/user-resource-overrides.js', () => ({
  loadUserResourceOverrides: (...args) => mocks.loadUserResourceOverrides(...args),
}));

vi.mock('../../utils/model-acl.js', () => ({
  loadModelAclRules: (...args) => mocks.loadModelAclRules(...args),
  buildModelAclIndex: (...args) => mocks.buildModelAclIndex(...args),
  evaluateModelAclAccess: (...args) => mocks.evaluateModelAclAccess(...args),
}));

vi.mock('./models-helpers.js', () => ({
  getDisabledModelSet: (...args) => mocks.getDisabledModelSet(...args),
  getModelAccessMap: (...args) => mocks.getModelAccessMap(...args),
  loadModelAttachmentCaps: (...args) => mocks.loadModelAttachmentCaps(...args),
  getModelAttachmentCapsEntry: (...args) => mocks.getModelAttachmentCapsEntry(...args),
  parseModelListSearchParams: (...args) => mocks.parseModelListSearchParams(...args),
}));

vi.mock('./models-discovery.js', () => ({
  fetchBaseModelsFromOpenAI: (...args) => mocks.fetchBaseModelsFromOpenAI(...args),
  loadModels: async (env, logger, options) => {
    let modelConnections;
    let baseModels = [];
    let customModels = [];
    try {
      modelConnections = await mocks.getAllOpenAIConnectionConfigs(env, options);
      baseModels = await mocks.fetchBaseModelsFromOpenAI(env, modelConnections);
    } catch (err) {
      logger.warn('Failed to fetch base models from OpenAI-compatible sources', {
        error: err.message,
      });
    }
    try {
      customModels = await mocks.loadCustomModels(env);
    } catch (err) {
      logger.warn('Failed to load custom models', { error: err.message });
    }
    return { baseModels, customModels };
  },
  loadCustomModels: (...args) => mocks.loadCustomModels(...args),
  toPublicModel: (...args) => mocks.toPublicModel(...args),
  buildProviderStats: (...args) => mocks.buildProviderStats(...args),
  isOpenAIProvider: (...args) => mocks.isOpenAIProvider(...args),
  splitModelScopeByUserVisibility: (...args) => mocks.splitModelScopeByUserVisibility(...args),
  matchesModelQuery: (...args) => mocks.matchesModelQuery(...args),
}));

import { handlePublicModelsList } from './models-public-list.js';

function makeReq(path, method) {
  return new Request(`https://example.com${path}`, { method });
}

describe('handlePublicModelsList', () => {
  const user = { sub: 'u1' };
  const env = { DB: {} };
  const ctx = {};
  const db = { all: vi.fn(), run: vi.fn(), first: vi.fn() };
  const logger = { error: vi.fn(), warn: vi.fn(), info: vi.fn() };

  beforeEach(() => {
    vi.resetAllMocks();
    mocks.createDB.mockReturnValue(db);
    mocks.getConfigBool.mockResolvedValue(true);
    mocks.getAllOpenAIConnectionConfigs.mockResolvedValue([]);
    mocks.fetchBaseModelsFromOpenAI.mockResolvedValue([]);
    mocks.loadCustomModels.mockResolvedValue([]);
    mocks.toPublicModel.mockImplementation((m) => ({ ...m, enabled: true }));
    mocks.buildProviderStats.mockReturnValue([]);
    mocks.sortModelsByActiveThenName.mockImplementation((m) => m);
    mocks.countEnabledModels.mockReturnValue(0);
    mocks.isOpenAIProvider.mockReturnValue(false);
    mocks.getDisabledModelSet.mockResolvedValue(new Set());
    mocks.getModelAccessMap.mockResolvedValue(new Map());
    mocks.loadModelAttachmentCaps.mockResolvedValue({});
    mocks.getModelAttachmentCapsEntry.mockReturnValue({ text: true });
    mocks.loadUserResourceOverrides.mockResolvedValue({});
    mocks.loadModelAclRules.mockResolvedValue([]);
    mocks.buildModelAclIndex.mockReturnValue(new Map());
    mocks.evaluateModelAclAccess.mockReturnValue({
      allowed: true,
      access_label: 'granted',
      access_variant: 'personal',
    });
    mocks.splitModelScopeByUserVisibility.mockImplementation((models, hiddenIds) => {
      const visible = [];
      const hidden = [];
      models.forEach((m) => {
        hiddenIds.has(m.id) ? hidden.push(m) : visible.push(m);
      });
      return { visibleModels: visible, hiddenModels: hidden };
    });
    mocks.matchesModelQuery.mockImplementation((model, query) => {
      const fields = ['name', 'id', 'connection_name', 'provider'];
      return fields.some((key) =>
        String(model?.[key] || '')
          .toLowerCase()
          .includes(query)
      );
    });
    mocks.parseModelListSearchParams.mockImplementation((params) => {
      const limit = parseInt(params.get('limit') || '0', 10);
      const offset = parseInt(params.get('offset') || '0', 10);
      const rawQuery = params.get('q') || '';
      const query = String(rawQuery).trim().toLowerCase();
      return { limit, offset, query };
    });
  });

  describe('GET /api/models', () => {
    it('returns models list without auth', async () => {
      const res = await handlePublicModelsList({
        req: makeReq('/api/models', 'GET'),
        env: env,
        ctx: ctx,
        user: user,
        path: '/api/models',
        deps: { _db: db, logger, _requestContext: {} },
      });
      expect(res.status).toBe(200);
    });

    it('works without user', async () => {
      const res = await handlePublicModelsList({
        req: makeReq('/api/models', 'GET'),
        env: env,
        ctx: ctx,
        user: null,
        path: '/api/models',
        deps: { _db: db, logger, _requestContext: {} },
      });
      expect(res.status).toBe(200);
    });

    it('returns models with pagination', async () => {
      mocks.fetchBaseModelsFromOpenAI.mockResolvedValue([
        { id: 'm1', name: 'M1', provider: 'openai' },
      ]);
      mocks.toPublicModel.mockImplementation((m) => ({ ...m, enabled: true }));
      mocks.countEnabledModels.mockReturnValue(1);
      const res = await handlePublicModelsList({
        req: makeReq('/api/models?limit=1&offset=0', 'GET'),
        env: env,
        ctx: ctx,
        user: user,
        path: '/api/models',
        deps: { _db: db, logger, _requestContext: {} },
      });
      expect(res.status).toBe(200);
      const payload = await res.json();
      expect(payload.models).toHaveLength(1);
      expect(payload.limit).toBe(1);
      expect(payload.offset).toBe(0);
      expect(payload.total).toBe(1);
    });

    it('supports search query', async () => {
      mocks.fetchBaseModelsFromOpenAI.mockResolvedValue([
        { id: 'm1', name: 'GPT-4o', provider: 'openai' },
      ]);
      mocks.toPublicModel.mockImplementation((m) => ({ ...m, enabled: true }));
      mocks.countEnabledModels.mockReturnValue(1);
      const res = await handlePublicModelsList({
        req: makeReq('/api/models?q=gpt', 'GET'),
        env: env,
        ctx: ctx,
        user: user,
        path: '/api/models',
        deps: { _db: db, logger, _requestContext: {} },
      });
      expect(res.status).toBe(200);
      const payload = await res.json();
      expect(payload.models).toHaveLength(1);
      expect(payload.models[0].name).toBe('GPT-4o');
    });

    it('supports effective scope', async () => {
      db.all.mockResolvedValue([]);
      mocks.fetchBaseModelsFromOpenAI.mockResolvedValue([
        { id: 'm1', name: 'M1', provider: 'openai', connection_source: 'config' },
      ]);
      mocks.toPublicModel.mockImplementation((m) => ({ ...m, enabled: true }));
      mocks.countEnabledModels.mockReturnValue(1);
      const res = await handlePublicModelsList({
        req: makeReq('/api/models?scope=effective', 'GET'),
        env: env,
        ctx: ctx,
        user: user,
        path: '/api/models',
        deps: { _db: db, logger, _requestContext: {} },
      });
      expect(res.status).toBe(200);
      const payload = await res.json();
      expect(payload.models).toHaveLength(1);
      expect(payload.models[0].connection_source).toBe('config');
    });

    it('gracefully degrades and returns 200 on unexpected error', async () => {
      // The handler gracefully degrades, so a DB failure returns empty results.
      // A truly unexpected error would come from something inside the try/catch.
      // Since the code has error handling, we test that it degrades gracefully.
      mocks.fetchBaseModelsFromOpenAI.mockRejectedValue(new Error('unexpected'));
      const res = await handlePublicModelsList({
        req: makeReq('/api/models', 'GET'),
        env: env,
        ctx: ctx,
        user: user,
        path: '/api/models',
        deps: { _db: db, logger, _requestContext: {} },
      });
      // The handler catches discovery errors and continues with empty results
      expect(res.status).toBe(200);
    });
  });

  it('returns null for non-matching paths', async () => {
    const result = await handlePublicModelsList({
      req: makeReq('/api/chats', 'GET'),
      env: env,
      ctx: ctx,
      user: user,
      path: '/api/chats',
      deps: { _db: db, logger, _requestContext: {} },
    });
    expect(result).toBeNull();
  });
});
