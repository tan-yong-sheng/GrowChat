import { describe, it, expect, vi, beforeEach } from 'vitest';
import { handlePublicModelsCrud } from './models-public-crud.js';

const mocks = vi.hoisted(() => ({
  authorize: vi.fn(),
  logAuditEvent: vi.fn(),
  getAllOpenAIConnectionConfigs: vi.fn(),
  fetchBaseModelsFromOpenAI: vi.fn(),
  toPublicModel: vi.fn((m) => m),
  loadCustomModels: vi.fn(),
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

function makeReq(path, method = 'GET', body = null) {
  const init = { method };
  if (body !== null) {
    init.headers = { 'content-type': 'application/json' };
    init.body = JSON.stringify(body);
  }
  return new Request(`http://localhost${path}`, init);
}

function makeEnv(overrides = {}) {
  const cache = new Map();
  return {
    CACHE: {
      get: vi.fn(async (key) => cache.get(key) ?? null),
      put: vi.fn(async (key, value, opts) => {
        cache.set(key, value);
      }),
    },
    DB: {},
    ...overrides,
  };
}

const NULL_LOGGER = {
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
};

function makeUser(overrides = {}) {
  return { sub: 'user-1', email: 'admin@localhost', ...overrides };
}

describe('handlePublicModelsCrud', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.authorize.mockReturnValue({ allow: true });
    mocks.logAuditEvent.mockResolvedValue(undefined);
    mocks.getAllOpenAIConnectionConfigs.mockResolvedValue([]);
    mocks.fetchBaseModelsFromOpenAI.mockResolvedValue([]);
    mocks.loadCustomModels.mockResolvedValue([]);
  });

  // ─── POST /api/models ────────────────────────────────────────────────────────

  describe('POST /api/models', () => {
    const validBody = {
      id: 'gpt-4o-mini',
      name: 'GPT-4o Mini',
      provider: 'openai',
      base_url: 'https://api.openai.com/v1',
    };

    it('returns 403 when user lacks model.admin permission', async () => {
      mocks.authorize.mockReturnValue({ allow: false, reason: 'Forbidden' });
      const req = makeReq('/api/models', 'POST', validBody);
      const env = makeEnv();
      const result = await handlePublicModelsCrud(req, env, {}, makeUser(), '/api/models', {});
      expect(result.status).toBe(403);
    });

    it('returns 400 for invalid JSON', async () => {
      const req = new Request('http://localhost/api/models', {
        method: 'POST',
        headers: { 'content-type': 'text/plain' },
        body: 'not json',
      });
      const env = makeEnv();
      const result = await handlePublicModelsCrud(req, env, {}, makeUser(), '/api/models', {});
      expect(result.status).toBe(400);
    });

    it('returns 400 when id is missing', async () => {
      const req = makeReq('/api/models', 'POST', {
        name: 'X',
        provider: 'openai',
        base_url: 'https://a.com',
      });
      const env = makeEnv();
      const result = await handlePublicModelsCrud(req, env, {}, makeUser(), '/api/models', {});
      expect(result.status).toBe(400);
      const body = await result.json();
      expect(body.error).toContain('id');
    });

    it('returns 400 when name is missing', async () => {
      const req = makeReq('/api/models', 'POST', {
        id: 'x',
        provider: 'openai',
        base_url: 'https://a.com',
      });
      const env = makeEnv();
      const result = await handlePublicModelsCrud(req, env, {}, makeUser(), '/api/models', {});
      expect(result.status).toBe(400);
    });

    it('returns 400 when provider is missing', async () => {
      const req = makeReq('/api/models', 'POST', { id: 'x', name: 'X', base_url: 'https://a.com' });
      const env = makeEnv();
      const result = await handlePublicModelsCrud(req, env, {}, makeUser(), '/api/models', {});
      expect(result.status).toBe(400);
    });

    it('returns 400 when base_url is missing', async () => {
      const req = makeReq('/api/models', 'POST', { id: 'x', name: 'X', provider: 'openai' });
      const env = makeEnv();
      const result = await handlePublicModelsCrud(req, env, {}, makeUser(), '/api/models', {});
      expect(result.status).toBe(400);
    });

    it('returns 400 for invalid provider', async () => {
      const req = makeReq('/api/models', 'POST', { ...validBody, provider: 'invalid-provider' });
      const env = makeEnv();
      const result = await handlePublicModelsCrud(req, env, {}, makeUser(), '/api/models', {});
      expect(result.status).toBe(400);
      const body = await result.json();
      expect(body.error).toContain('Provider must be one of');
    });

    it('returns 400 when base_url does not start with http', async () => {
      const req = makeReq('/api/models', 'POST', {
        ...validBody,
        base_url: 'ftp://api.openai.com',
      });
      const env = makeEnv();
      const result = await handlePublicModelsCrud(req, env, {}, makeUser(), '/api/models', {});
      expect(result.status).toBe(400);
      const body = await result.json();
      expect(body.error).toContain('base_url must start with http');
    });

    it('returns 500 when CACHE binding is missing', async () => {
      const req = makeReq('/api/models', 'POST', validBody);
      const env = makeEnv({ CACHE: undefined });
      const result = await handlePublicModelsCrud(req, env, {}, makeUser(), '/api/models', {
        logger: NULL_LOGGER,
      });
      expect(result.status).toBe(500);
      const body = await result.json();
      expect(body.error).toContain('An error occurred'); // sanitized for 5xx
    });

    it('returns 409 when model ID already exists', async () => {
      mocks.loadCustomModels.mockResolvedValue([
        { id: 'gpt-4o-mini', name: 'Existing', provider: 'openai', base_url: 'https://a.com' },
      ]);
      const req = makeReq('/api/models', 'POST', validBody);
      const env = makeEnv();
      const result = await handlePublicModelsCrud(req, env, {}, makeUser(), '/api/models', {});
      expect(result.status).toBe(409);
      const body = await result.json();
      expect(body.error).toContain('ID already exists');
    });

    it('returns 409 when model name already exists', async () => {
      mocks.loadCustomModels.mockResolvedValue([
        { id: 'other-id', name: 'GPT-4o Mini', provider: 'openai', base_url: 'https://a.com' },
      ]);
      const req = makeReq('/api/models', 'POST', validBody);
      const env = makeEnv();
      const result = await handlePublicModelsCrud(req, env, {}, makeUser(), '/api/models', {});
      expect(result.status).toBe(409);
      const body = await result.json();
      expect(body.error).toContain('name already exists');
    });

    it('creates model and returns 201 with default max_tokens and temperature', async () => {
      const req = makeReq('/api/models', 'POST', validBody);
      const env = makeEnv();
      const result = await handlePublicModelsCrud(req, env, {}, makeUser(), '/api/models', {});
      expect(result.status).toBe(201);
      const body = await result.json();
      expect(body.model.id).toBe('gpt-4o-mini');
      expect(body.model.max_tokens).toBe(4096);
      expect(body.model.temperature).toBe(0.7);
      expect(body.message).toContain('successfully');
      expect(env.CACHE.put).toHaveBeenCalled();
    });

    it('creates model with custom max_tokens and temperature', async () => {
      const req = makeReq('/api/models', 'POST', {
        ...validBody,
        max_tokens: 8192,
        temperature: 0.9,
      });
      const env = makeEnv();
      const result = await handlePublicModelsCrud(req, env, {}, makeUser(), '/api/models', {});
      expect(result.status).toBe(201);
      const body = await result.json();
      expect(body.model.max_tokens).toBe(8192);
      expect(body.model.temperature).toBe(0.9);
    });

    it('uses provided description', async () => {
      const req = makeReq('/api/models', 'POST', { ...validBody, description: 'My custom model' });
      const env = makeEnv();
      const result = await handlePublicModelsCrud(req, env, {}, makeUser(), '/api/models', {});
      expect(result.status).toBe(201);
      const body = await result.json();
      expect(body.model.description).toBe('My custom model');
    });

    it('generates fallback description when not provided', async () => {
      const req = makeReq('/api/models', 'POST', validBody);
      const env = makeEnv();
      const result = await handlePublicModelsCrud(req, env, {}, makeUser(), '/api/models', {});
      expect(result.status).toBe(201);
      const body = await result.json();
      expect(body.model.description).toBe(`${validBody.name} - ${validBody.provider}`);
    });

    it('logs audit event on successful create', async () => {
      const req = makeReq('/api/models', 'POST', validBody);
      const env = makeEnv();
      await handlePublicModelsCrud(req, env, {}, makeUser(), '/api/models', {});
      expect(mocks.logAuditEvent).toHaveBeenCalledWith(
        env,
        expect.objectContaining({
          action: 'model_created',
          resource_type: 'model',
          resource_id: 'gpt-4o-mini',
        })
      );
    });

    it('returns 500 when KV put throws', async () => {
      mocks.loadCustomModels.mockResolvedValue([]);
      const req = makeReq('/api/models', 'POST', validBody);
      const env = makeEnv();
      env.CACHE.put.mockRejectedValue(new Error('KV error'));
      const result = await handlePublicModelsCrud(req, env, {}, makeUser(), '/api/models', {
        logger: NULL_LOGGER,
      });
      expect(result.status).toBe(500);
      const body = await result.json();
      expect(body.error).toContain('An error occurred'); // sanitized for 5xx
    });
  });

  // ─── GET /api/models/:id ─────────────────────────────────────────────────────

  describe('GET /api/models/:id', () => {
    it('returns base model when found in discovered models', async () => {
      const baseModel = { id: 'gpt-4o', name: 'GPT-4o', provider: 'openai' };
      mocks.fetchBaseModelsFromOpenAI.mockResolvedValue([baseModel]);
      mocks.toPublicModel.mockImplementation((m) => ({ ...m, public: true }));
      const req = makeReq('/api/models/gpt-4o', 'GET');
      const env = makeEnv();
      const result = await handlePublicModelsCrud(
        req,
        env,
        {},
        makeUser(),
        '/api/models/gpt-4o',
        {}
      );
      expect(result.status).toBe(200);
      const body = await result.json();
      expect(body.model.id).toBe('gpt-4o');
      expect(body.model.public).toBe(true);
    });

    it('returns 404 when base model not found', async () => {
      mocks.fetchBaseModelsFromOpenAI.mockResolvedValue([{ id: 'gpt-4o-mini', name: 'Mini' }]);
      mocks.loadCustomModels.mockResolvedValue([]);
      const req = makeReq('/api/models/gpt-4o', 'GET');
      const env = makeEnv();
      const result = await handlePublicModelsCrud(
        req,
        env,
        {},
        makeUser(),
        '/api/models/gpt-4o',
        {}
      );
      expect(result.status).toBe(404);
      const body = await result.json();
      expect(body.error).toBe('Model not found');
    });

    it('returns custom model from KV when not in base models', async () => {
      mocks.fetchBaseModelsFromOpenAI.mockResolvedValue([]);
      mocks.loadCustomModels.mockResolvedValue([
        { id: 'custom-1', name: 'Custom', provider: 'openai', base_url: 'https://a.com' },
      ]);
      const req = makeReq('/api/models/custom-1', 'GET');
      const env = makeEnv();
      const result = await handlePublicModelsCrud(
        req,
        env,
        {},
        makeUser(),
        '/api/models/custom-1',
        {}
      );
      expect(result.status).toBe(200);
      const body = await result.json();
      expect(body.model.id).toBe('custom-1');
    });

    it('returns 404 when custom model not found', async () => {
      mocks.fetchBaseModelsFromOpenAI.mockResolvedValue([]);
      mocks.loadCustomModels.mockResolvedValue([]);
      const req = makeReq('/api/models/not-exist', 'GET');
      const env = makeEnv();
      const result = await handlePublicModelsCrud(
        req,
        env,
        {},
        makeUser(),
        '/api/models/not-exist',
        {}
      );
      expect(result.status).toBe(404);
    });

    it('degrades gracefully when fetchBaseModelsFromOpenAI throws', async () => {
      mocks.fetchBaseModelsFromOpenAI.mockRejectedValue(new Error('Network error'));
      mocks.loadCustomModels.mockResolvedValue([{ id: 'fallback-model', name: 'Fallback' }]);
      const req = makeReq('/api/models/fallback-model', 'GET');
      const env = makeEnv();
      const result = await handlePublicModelsCrud(
        req,
        env,
        {},
        makeUser(),
        '/api/models/fallback-model',
        { logger: NULL_LOGGER }
      );
      expect(result.status).toBe(200);
      const body = await result.json();
      expect(body.model.id).toBe('fallback-model');
    });

    it('returns 500 when loadCustomModels throws', async () => {
      mocks.fetchBaseModelsFromOpenAI.mockResolvedValue([]);
      mocks.loadCustomModels.mockRejectedValue(new Error('KV error'));
      const req = makeReq('/api/models/some-id', 'GET');
      const env = makeEnv();
      const result = await handlePublicModelsCrud(req, env, {}, makeUser(), '/api/models/some-id', {
        logger: NULL_LOGGER,
      });
      expect(result.status).toBe(500);
      const body = await result.json();
      expect(body.error).toContain('An error occurred'); // sanitized for 5xx
    });
  });

  // ─── PUT /api/models/:id ─────────────────────────────────────────────────────

  describe('PUT /api/models/:id', () => {
    it('returns 403 when user lacks model.admin permission', async () => {
      mocks.authorize.mockReturnValue({ allow: false, reason: 'Forbidden' });
      const req = makeReq('/api/models/custom-1', 'PUT', { name: 'New Name' });
      const env = makeEnv();
      const result = await handlePublicModelsCrud(
        req,
        env,
        {},
        makeUser(),
        '/api/models/custom-1',
        {}
      );
      expect(result.status).toBe(403);
    });

    it('returns 400 for invalid JSON', async () => {
      const req = new Request('http://localhost/api/models/custom-1', {
        method: 'PUT',
        headers: { 'content-type': 'text/plain' },
        body: 'not json',
      });
      const env = makeEnv();
      const result = await handlePublicModelsCrud(
        req,
        env,
        {},
        makeUser(),
        '/api/models/custom-1',
        {}
      );
      expect(result.status).toBe(400);
    });

    it('returns 400 when updating a base model', async () => {
      mocks.fetchBaseModelsFromOpenAI.mockResolvedValue([{ id: 'gpt-4o-mini', name: 'Mini' }]);
      const req = makeReq('/api/models/gpt-4o-mini', 'PUT', { name: 'New Name' });
      const env = makeEnv();
      const result = await handlePublicModelsCrud(
        req,
        env,
        {},
        makeUser(),
        '/api/models/gpt-4o-mini',
        {}
      );
      expect(result.status).toBe(400);
      const body = await result.json();
      expect(body.error).toContain('Cannot update base model');
    });

    it('returns 500 when CACHE binding is missing', async () => {
      mocks.fetchBaseModelsFromOpenAI.mockResolvedValue([]);
      mocks.loadCustomModels.mockResolvedValue([{ id: 'custom-1', name: 'Custom' }]);
      const req = makeReq('/api/models/custom-1', 'PUT', { name: 'New' });
      const env = makeEnv({ CACHE: undefined });
      const result = await handlePublicModelsCrud(
        req,
        env,
        {},
        makeUser(),
        '/api/models/custom-1',
        { logger: NULL_LOGGER }
      );
      expect(result.status).toBe(500);
      const body = await result.json();
      expect(body.error).toContain('An error occurred'); // sanitized for 5xx
    });

    it('returns 404 when custom model not found', async () => {
      mocks.fetchBaseModelsFromOpenAI.mockResolvedValue([]);
      mocks.loadCustomModels.mockResolvedValue([]);
      const req = makeReq('/api/models/not-exist', 'PUT', { name: 'New' });
      const env = makeEnv();
      const result = await handlePublicModelsCrud(
        req,
        env,
        {},
        makeUser(),
        '/api/models/not-exist',
        {}
      );
      expect(result.status).toBe(404);
    });

    it('updates name field', async () => {
      mocks.fetchBaseModelsFromOpenAI.mockResolvedValue([]);
      mocks.loadCustomModels.mockResolvedValue([
        {
          id: 'custom-1',
          name: 'Old',
          description: 'Desc',
          base_url: 'https://a.com',
          max_tokens: 4096,
          temperature: 0.7,
        },
      ]);
      const req = makeReq('/api/models/custom-1', 'PUT', { name: 'New Name' });
      const env = makeEnv();
      const result = await handlePublicModelsCrud(
        req,
        env,
        {},
        makeUser(),
        '/api/models/custom-1',
        {}
      );
      expect(result.status).toBe(200);
      const body = await result.json();
      expect(body.model.name).toBe('New Name');
    });

    it('updates description field', async () => {
      mocks.fetchBaseModelsFromOpenAI.mockResolvedValue([]);
      mocks.loadCustomModels.mockResolvedValue([
        {
          id: 'custom-1',
          name: 'N',
          description: 'Old',
          base_url: 'https://a.com',
          max_tokens: 4096,
          temperature: 0.7,
        },
      ]);
      const req = makeReq('/api/models/custom-1', 'PUT', { description: 'New Description' });
      const env = makeEnv();
      const result = await handlePublicModelsCrud(
        req,
        env,
        {},
        makeUser(),
        '/api/models/custom-1',
        {}
      );
      expect(result.status).toBe(200);
      const body = await result.json();
      expect(body.model.description).toBe('New Description');
    });

    it('updates base_url and validates http prefix', async () => {
      mocks.fetchBaseModelsFromOpenAI.mockResolvedValue([]);
      mocks.loadCustomModels.mockResolvedValue([
        {
          id: 'custom-1',
          name: 'N',
          description: 'D',
          base_url: 'https://a.com',
          max_tokens: 4096,
          temperature: 0.7,
        },
      ]);
      const req = makeReq('/api/models/custom-1', 'PUT', { base_url: 'ftp://bad.com' });
      const env = makeEnv();
      const result = await handlePublicModelsCrud(
        req,
        env,
        {},
        makeUser(),
        '/api/models/custom-1',
        {}
      );
      expect(result.status).toBe(400);
      const body = await result.json();
      expect(body.error).toContain('base_url must start with http');
    });

    it('updates max_tokens', async () => {
      mocks.fetchBaseModelsFromOpenAI.mockResolvedValue([]);
      mocks.loadCustomModels.mockResolvedValue([
        {
          id: 'custom-1',
          name: 'N',
          description: 'D',
          base_url: 'https://a.com',
          max_tokens: 4096,
          temperature: 0.7,
        },
      ]);
      const req = makeReq('/api/models/custom-1', 'PUT', { max_tokens: 16384 });
      const env = makeEnv();
      const result = await handlePublicModelsCrud(
        req,
        env,
        {},
        makeUser(),
        '/api/models/custom-1',
        {}
      );
      expect(result.status).toBe(200);
      const body = await result.json();
      expect(body.model.max_tokens).toBe(16384);
    });

    it('updates temperature', async () => {
      mocks.fetchBaseModelsFromOpenAI.mockResolvedValue([]);
      mocks.loadCustomModels.mockResolvedValue([
        {
          id: 'custom-1',
          name: 'N',
          description: 'D',
          base_url: 'https://a.com',
          max_tokens: 4096,
          temperature: 0.7,
        },
      ]);
      const req = makeReq('/api/models/custom-1', 'PUT', { temperature: 1.5 });
      const env = makeEnv();
      const result = await handlePublicModelsCrud(
        req,
        env,
        {},
        makeUser(),
        '/api/models/custom-1',
        {}
      );
      expect(result.status).toBe(200);
      const body = await result.json();
      expect(body.model.temperature).toBe(1.5);
    });

    it('ignores NaN max_tokens and temperature values', async () => {
      mocks.fetchBaseModelsFromOpenAI.mockResolvedValue([]);
      mocks.loadCustomModels.mockResolvedValue([
        {
          id: 'custom-1',
          name: 'N',
          description: 'D',
          base_url: 'https://a.com',
          max_tokens: 4096,
          temperature: 0.7,
        },
      ]);
      const req = makeReq('/api/models/custom-1', 'PUT', {
        max_tokens: 'not-a-number',
        temperature: 'also-not',
      });
      const env = makeEnv();
      const result = await handlePublicModelsCrud(
        req,
        env,
        {},
        makeUser(),
        '/api/models/custom-1',
        {}
      );
      expect(result.status).toBe(200);
      const body = await result.json();
      // Original values preserved
      expect(body.model.max_tokens).toBe(4096);
      expect(body.model.temperature).toBe(0.7);
    });

    it('logs audit event on successful update', async () => {
      mocks.fetchBaseModelsFromOpenAI.mockResolvedValue([]);
      mocks.loadCustomModels.mockResolvedValue([
        {
          id: 'custom-1',
          name: 'Old',
          description: 'D',
          base_url: 'https://a.com',
          max_tokens: 4096,
          temperature: 0.7,
        },
      ]);
      const req = makeReq('/api/models/custom-1', 'PUT', { name: 'New' });
      const env = makeEnv();
      await handlePublicModelsCrud(req, env, {}, makeUser(), '/api/models/custom-1', {});
      expect(mocks.logAuditEvent).toHaveBeenCalledWith(
        env,
        expect.objectContaining({
          action: 'model_updated',
          resource_type: 'model',
          resource_id: 'custom-1',
        })
      );
    });
  });

  // ─── DELETE /api/models/:id ──────────────────────────────────────────────────

  describe('DELETE /api/models/:id', () => {
    it('returns 403 when user lacks model.admin permission', async () => {
      mocks.authorize.mockReturnValue({ allow: false, reason: 'Forbidden' });
      const req = makeReq('/api/models/custom-1', 'DELETE');
      const env = makeEnv();
      const result = await handlePublicModelsCrud(
        req,
        env,
        {},
        makeUser(),
        '/api/models/custom-1',
        {}
      );
      expect(result.status).toBe(403);
    });

    it('returns 400 when deleting a base model', async () => {
      mocks.fetchBaseModelsFromOpenAI.mockResolvedValue([{ id: 'gpt-4o-mini', name: 'Mini' }]);
      const req = makeReq('/api/models/gpt-4o-mini', 'DELETE');
      const env = makeEnv();
      const result = await handlePublicModelsCrud(
        req,
        env,
        {},
        makeUser(),
        '/api/models/gpt-4o-mini',
        {}
      );
      expect(result.status).toBe(400);
      const body = await result.json();
      expect(body.error).toContain('Cannot delete base model');
    });

    it('returns 500 when CACHE binding is missing', async () => {
      mocks.fetchBaseModelsFromOpenAI.mockResolvedValue([]);
      mocks.loadCustomModels.mockResolvedValue([{ id: 'custom-1', name: 'Custom' }]);
      const req = makeReq('/api/models/custom-1', 'DELETE');
      const env = makeEnv({ CACHE: undefined });
      const result = await handlePublicModelsCrud(
        req,
        env,
        {},
        makeUser(),
        '/api/models/custom-1',
        { logger: NULL_LOGGER }
      );
      expect(result.status).toBe(500);
      const body = await result.json();
      expect(body.error).toContain('An error occurred'); // sanitized for 5xx
    });

    it('returns 404 when custom model not found', async () => {
      mocks.fetchBaseModelsFromOpenAI.mockResolvedValue([]);
      mocks.loadCustomModels.mockResolvedValue([]);
      const req = makeReq('/api/models/not-exist', 'DELETE');
      const env = makeEnv();
      const result = await handlePublicModelsCrud(
        req,
        env,
        {},
        makeUser(),
        '/api/models/not-exist',
        {}
      );
      expect(result.status).toBe(404);
    });

    it('deletes model and returns 200', async () => {
      mocks.fetchBaseModelsFromOpenAI.mockResolvedValue([]);
      mocks.loadCustomModels.mockResolvedValue([
        { id: 'custom-1', name: 'Custom', provider: 'openai', base_url: 'https://a.com' },
      ]);
      const req = makeReq('/api/models/custom-1', 'DELETE');
      const env = makeEnv();
      const result = await handlePublicModelsCrud(
        req,
        env,
        {},
        makeUser(),
        '/api/models/custom-1',
        {}
      );
      expect(result.status).toBe(200);
      const body = await result.json();
      expect(body.success).toBe(true);
      expect(body.message).toContain('removed');
      expect(env.CACHE.put).toHaveBeenCalled();
    });

    it('logs audit event with deleted model metadata', async () => {
      mocks.fetchBaseModelsFromOpenAI.mockResolvedValue([]);
      mocks.loadCustomModels.mockResolvedValue([
        { id: 'custom-1', name: 'Custom', provider: 'openai', base_url: 'https://a.com' },
      ]);
      const req = makeReq('/api/models/custom-1', 'DELETE');
      const env = makeEnv();
      await handlePublicModelsCrud(req, env, {}, makeUser(), '/api/models/custom-1', {});
      expect(mocks.logAuditEvent).toHaveBeenCalledWith(
        env,
        expect.objectContaining({
          action: 'model_deleted',
          resource_type: 'model',
          resource_id: 'custom-1',
          metadata: expect.objectContaining({ provider: 'openai', name: 'Custom' }),
        })
      );
    });

    it('returns 500 when KV put throws', async () => {
      mocks.fetchBaseModelsFromOpenAI.mockResolvedValue([]);
      mocks.loadCustomModels.mockResolvedValue([
        { id: 'custom-1', name: 'C', provider: 'o', base_url: 'https://a.com' },
      ]);
      const req = makeReq('/api/models/custom-1', 'DELETE');
      const env = makeEnv();
      env.CACHE.put.mockRejectedValue(new Error('KV error'));
      const result = await handlePublicModelsCrud(
        req,
        env,
        {},
        makeUser(),
        '/api/models/custom-1',
        { logger: NULL_LOGGER }
      );
      expect(result.status).toBe(500);
    });
  });

  // ─── Non-matching routes return null ────────────────────────────────────────

  describe('non-matching routes', () => {
    it('returns null for /api/models (POST with different path)', async () => {
      const req = makeReq('/api/models/wrong', 'POST', { id: 'x' });
      const env = makeEnv();
      const result = await handlePublicModelsCrud(
        req,
        env,
        {},
        makeUser(),
        '/api/models/wrong',
        {}
      );
      expect(result).toBeNull();
    });

    it('returns null for unhandled method', async () => {
      const req = makeReq('/api/models/gpt-4o', 'PATCH');
      const env = makeEnv();
      const result = await handlePublicModelsCrud(
        req,
        env,
        {},
        makeUser(),
        '/api/models/gpt-4o',
        {}
      );
      expect(result).toBeNull();
    });
  });
});
