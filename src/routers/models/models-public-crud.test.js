import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  createDB: vi.fn(),
  authorize: vi.fn(),
  logAuditEvent: vi.fn(),
  getAllOpenAIConnectionConfigs: vi.fn(),
  fetchBaseModelsFromOpenAI: vi.fn(),
  toPublicModel: vi.fn(),
  loadCustomModels: vi.fn(),
}));

vi.mock('../../db.js', () => ({
  createDB: (...args) => mocks.createDB(...args),
}));

vi.mock('../../utils/authorize.js', () => ({
  authorize: (...args) => mocks.authorize(...args),
  logAuditEvent: (...args) => mocks.logAuditEvent(...args),
}));

vi.mock('../../llm/connections.js', () => ({
  getAllOpenAIConnectionConfigs: (...args) => mocks.getAllOpenAIConnectionConfigs(...args),
}));

vi.mock('./models-discovery.js', () => ({
  fetchBaseModelsFromOpenAI: (...args) => mocks.fetchBaseModelsFromOpenAI(...args),
  toPublicModel: (...args) => mocks.toPublicModel(...args),
  loadCustomModels: (...args) => mocks.loadCustomModels(...args),
}));

import { handlePublicModelsCrud } from './models-public-crud.js';

function makeReq(path, method, body) {
  const init = { method, headers: {} };
  if (body !== undefined) {
    init.body = typeof body === 'string' ? body : JSON.stringify(body);
    init.headers['Content-Type'] = 'application/json';
  }
  return new Request(`https://example.com${path}`, init);
}

describe('handlePublicModelsCrud', () => {
  const user = { sub: 'admin-1' };
  const env = { DB: {}, CACHE: { get: vi.fn(), put: vi.fn() } };
  const ctx = {};
  const db = { all: vi.fn(), run: vi.fn(), first: vi.fn() };
  const logger = { error: vi.fn(), warn: vi.fn(), info: vi.fn() };

  beforeEach(() => {
    vi.resetAllMocks();
    mocks.createDB.mockReturnValue(db);
    mocks.authorize.mockResolvedValue({ allow: true });
    mocks.logAuditEvent.mockResolvedValue(undefined);
    mocks.getAllOpenAIConnectionConfigs.mockResolvedValue([]);
    mocks.fetchBaseModelsFromOpenAI.mockResolvedValue([]);
    mocks.toPublicModel.mockImplementation((m) => ({ ...m, enabled: true }));
    mocks.loadCustomModels.mockResolvedValue([]);
  });

  describe('POST /api/models', () => {
    it('rejects unauthorized', async () => {
      mocks.authorize.mockResolvedValue({ allow: false, reason: 'no' });
      const res = await handlePublicModelsCrud(
        makeReq('/api/models', 'POST', {
          id: 'm1',
          name: 'M1',
          provider: 'openai',
          base_url: 'https://example.com',
        }),
        env,
        ctx,
        user,
        '/api/models',
        { _db: db, logger, _requestContext: {} }
      );
      expect(res.status).toBe(403);
    });

    it('rejects missing required fields', async () => {
      const res = await handlePublicModelsCrud(
        makeReq('/api/models', 'POST', { id: 'm1' }),
        env,
        ctx,
        user,
        '/api/models',
        { _db: db, logger, _requestContext: {} }
      );
      expect(res.status).toBe(400);
    });

    it('rejects invalid provider', async () => {
      const res = await handlePublicModelsCrud(
        makeReq('/api/models', 'POST', {
          id: 'm1',
          name: 'M1',
          provider: 'bad',
          base_url: 'https://example.com',
        }),
        env,
        ctx,
        user,
        '/api/models',
        { _db: db, logger, _requestContext: {} }
      );
      expect(res.status).toBe(400);
    });

    it('rejects invalid base_url', async () => {
      const res = await handlePublicModelsCrud(
        makeReq('/api/models', 'POST', {
          id: 'm1',
          name: 'M1',
          provider: 'openai',
          base_url: 'not-http',
        }),
        env,
        ctx,
        user,
        '/api/models',
        { _db: db, logger, _requestContext: {} }
      );
      expect(res.status).toBe(400);
    });

    it('rejects when CACHE binding missing', async () => {
      const noCacheEnv = { DB: {} };
      const res = await handlePublicModelsCrud(
        makeReq('/api/models', 'POST', {
          id: 'm1',
          name: 'M1',
          provider: 'openai',
          base_url: 'https://example.com',
        }),
        noCacheEnv,
        ctx,
        user,
        '/api/models',
        { _db: db, logger, _requestContext: {} }
      );
      expect(res.status).toBe(500);
    });

    it('creates model successfully', async () => {
      mocks.loadCustomModels.mockResolvedValue([]);
      env.CACHE.put.mockResolvedValue(undefined);
      const res = await handlePublicModelsCrud(
        makeReq('/api/models', 'POST', {
          id: 'm1',
          name: 'M1',
          provider: 'openai',
          base_url: 'https://example.com',
        }),
        env,
        ctx,
        user,
        '/api/models',
        { _db: db, logger, _requestContext: {} }
      );
      expect(res.status).toBe(201);
      expect(mocks.logAuditEvent).toHaveBeenCalled();
    });

    it('rejects duplicate model id', async () => {
      mocks.loadCustomModels.mockResolvedValue([{ id: 'm1' }]);
      const res = await handlePublicModelsCrud(
        makeReq('/api/models', 'POST', {
          id: 'm1',
          name: 'M1',
          provider: 'openai',
          base_url: 'https://example.com',
        }),
        env,
        ctx,
        user,
        '/api/models',
        { _db: db, logger, _requestContext: {} }
      );
      expect(res.status).toBe(409);
    });
  });

  describe('GET /api/models/:id', () => {
    it('returns model from base models', async () => {
      mocks.fetchBaseModelsFromOpenAI.mockResolvedValue([
        { id: 'gpt-4o', name: 'GPT-4o', provider: 'openai' },
      ]);
      mocks.toPublicModel.mockImplementation((m) => ({ ...m, enabled: true }));
      const res = await handlePublicModelsCrud(
        makeReq('/api/models/gpt-4o', 'GET'),
        env,
        ctx,
        user,
        '/api/models/gpt-4o',
        { _db: db, logger, _requestContext: {} }
      );
      expect(res.status).toBe(200);
    });

    it('returns model from custom models', async () => {
      mocks.fetchBaseModelsFromOpenAI.mockResolvedValue([]);
      mocks.loadCustomModels.mockResolvedValue([
        { id: 'custom-1', name: 'Custom', provider: 'custom' },
      ]);
      mocks.toPublicModel.mockImplementation((m) => ({ ...m, enabled: true }));
      const res = await handlePublicModelsCrud(
        makeReq('/api/models/custom-1', 'GET'),
        env,
        ctx,
        user,
        '/api/models/custom-1',
        { _db: db, logger, _requestContext: {} }
      );
      expect(res.status).toBe(200);
    });

    it('returns 404 for unknown model', async () => {
      mocks.fetchBaseModelsFromOpenAI.mockResolvedValue([]);
      mocks.loadCustomModels.mockResolvedValue([]);
      const res = await handlePublicModelsCrud(
        makeReq('/api/models/nonexistent', 'GET'),
        env,
        ctx,
        user,
        '/api/models/nonexistent',
        { _db: db, logger, _requestContext: {} }
      );
      expect(res.status).toBe(404);
    });
  });

  describe('PUT /api/models/:id', () => {
    it('rejects unauthorized', async () => {
      mocks.authorize.mockResolvedValue({ allow: false, reason: 'no' });
      const res = await handlePublicModelsCrud(
        makeReq('/api/models/m1', 'PUT', { name: 'Updated' }),
        env,
        ctx,
        user,
        '/api/models/m1',
        { _db: db, logger, _requestContext: {} }
      );
      expect(res.status).toBe(403);
    });

    it('rejects update of base models', async () => {
      mocks.fetchBaseModelsFromOpenAI.mockResolvedValue([{ id: 'm1' }]);
      const res = await handlePublicModelsCrud(
        makeReq('/api/models/m1', 'PUT', { name: 'Updated' }),
        env,
        ctx,
        user,
        '/api/models/m1',
        { _db: db, logger, _requestContext: {} }
      );
      expect(res.status).toBe(400);
    });

    it('returns 404 for unknown custom model', async () => {
      mocks.loadCustomModels.mockResolvedValue([]);
      const res = await handlePublicModelsCrud(
        makeReq('/api/models/nonexistent', 'PUT', { name: 'Updated' }),
        env,
        ctx,
        user,
        '/api/models/nonexistent',
        { _db: db, logger, _requestContext: {} }
      );
      expect(res.status).toBe(404);
    });

    it('updates custom model', async () => {
      mocks.fetchBaseModelsFromOpenAI.mockResolvedValue([]);
      mocks.loadCustomModels.mockResolvedValue([
        {
          id: 'm1',
          name: 'M1',
          provider: 'custom',
          base_url: 'https://example.com',
          description: 'desc',
          max_tokens: 4096,
          temperature: 0.7,
        },
      ]);
      env.CACHE.put.mockResolvedValue(undefined);
      const res = await handlePublicModelsCrud(
        makeReq('/api/models/m1', 'PUT', { name: 'Updated' }),
        env,
        ctx,
        user,
        '/api/models/m1',
        { _db: db, logger, _requestContext: {} }
      );
      expect(res.status).toBe(200);
      expect(mocks.logAuditEvent).toHaveBeenCalled();
    });
  });

  describe('DELETE /api/models/:id', () => {
    it('rejects unauthorized', async () => {
      mocks.authorize.mockResolvedValue({ allow: false, reason: 'no' });
      const res = await handlePublicModelsCrud(
        makeReq('/api/models/m1', 'DELETE'),
        env,
        ctx,
        user,
        '/api/models/m1',
        { _db: db, logger, _requestContext: {} }
      );
      expect(res.status).toBe(403);
    });

    it('rejects delete of base models', async () => {
      mocks.fetchBaseModelsFromOpenAI.mockResolvedValue([{ id: 'm1' }]);
      const res = await handlePublicModelsCrud(
        makeReq('/api/models/m1', 'DELETE'),
        env,
        ctx,
        user,
        '/api/models/m1',
        { _db: db, logger, _requestContext: {} }
      );
      expect(res.status).toBe(400);
    });

    it('deletes custom model', async () => {
      mocks.fetchBaseModelsFromOpenAI.mockResolvedValue([]);
      mocks.loadCustomModels.mockResolvedValue([{ id: 'm1', name: 'M1', provider: 'custom' }]);
      env.CACHE.put.mockResolvedValue(undefined);
      const res = await handlePublicModelsCrud(
        makeReq('/api/models/m1', 'DELETE'),
        env,
        ctx,
        user,
        '/api/models/m1',
        { _db: db, logger, _requestContext: {} }
      );
      expect(res.status).toBe(200);
      expect(mocks.logAuditEvent).toHaveBeenCalled();
    });
  });

  it('returns null for non-matching paths', async () => {
    const result = await handlePublicModelsCrud(
      makeReq('/api/chats', 'GET'),
      env,
      ctx,
      user,
      '/api/chats',
      { _db: db, logger, _requestContext: {} }
    );
    expect(result).toBeNull();
  });
});
