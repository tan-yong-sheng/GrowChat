import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  createDB: vi.fn(),
  ensureAdminAclAccess: vi.fn(),
  getConfigValue: vi.fn(),
  getAllOpenAIConnectionConfigs: vi.fn(),
  buildConnectionHeaders: vi.fn(),
  discoverConnectionModels: vi.fn(),
  extractConnectionModelId: vi.fn(),
  normalizeProviderFamily: vi.fn(),
  isConnectionUrlRequired: vi.fn(),
  getConnectionDefaultBaseUrl: vi.fn(),
  isSafeOutboundUrl: vi.fn(),
  isValidHttpUrl: vi.fn(),
  normalizeBaseUrl: vi.fn(),
  parseHeadersForRequest: vi.fn(),
  getConnectionTestFailureMessage: vi.fn(),
}));

vi.mock('../../db.js', () => ({
  createDB: (...args) => mocks.createDB(...args),
}));

vi.mock('../../utils/app-config.js', () => ({
  getConfigValue: (...args) => mocks.getConfigValue(...args),
}));

vi.mock('../../llm/connections.js', () => ({
  getAllOpenAIConnectionConfigs: (...args) => mocks.getAllOpenAIConnectionConfigs(...args),
  buildConnectionHeaders: (...args) => mocks.buildConnectionHeaders(...args),
  discoverConnectionModels: (...args) => mocks.discoverConnectionModels(...args),
  extractConnectionModelId: (...args) => mocks.extractConnectionModelId(...args),
  isConnectionUrlRequired: (...args) => mocks.isConnectionUrlRequired(...args),
  getConnectionDefaultBaseUrl: (...args) => mocks.getConnectionDefaultBaseUrl(...args),
  ensureConnectionId: vi.fn((conn, index = 0) => conn?.id || `conn-${index}`),
  normalizeConnectionManualModels: vi.fn((value) => value || []),
}));

vi.mock('../../llm/provider-registry.js', () => ({
  normalizeProviderFamily: (...args) => mocks.normalizeProviderFamily(...args),
}));

vi.mock('../../utils/validation.js', () => ({
  isSafeOutboundUrl: (...args) => mocks.isSafeOutboundUrl(...args),
}));

vi.mock('../../admin/tool-servers.js', () => ({
  isValidHttpUrl: (...args) => mocks.isValidHttpUrl(...args),
  normalizeBaseUrl: (...args) => mocks.normalizeBaseUrl(...args),
  parseHeadersForRequest: (...args) => mocks.parseHeadersForRequest(...args),
}));

vi.mock('./admin-helpers.js', () => ({
  ensureAdminAclAccess: (...args) => mocks.ensureAdminAclAccess(...args),
  isValidModelAccessId: vi.fn((id) => !!id && id.length <= 200 && !/\s/.test(id)),
}));

vi.mock('../../utils/response.js', () => ({
  json: (req, data, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } }),
  error: (req, message, status = 500, details) => {
    const body = { error: message };
    if (details !== undefined) body.details = details;
    return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
  },
  getConnectionTestFailureMessage: (...args) => mocks.getConnectionTestFailureMessage(...args),
}));

import { handleAdminConnectionsList } from './admin-connections-list.js';

function makeReq(path, method, body) {
  const init = { method, headers: {} };
  if (body !== undefined) {
    init.body = typeof body === 'string' ? body : JSON.stringify(body);
    init.headers['Content-Type'] = 'application/json';
  }
  return new Request(`https://example.com${path}`, init);
}

describe('handleAdminConnectionsList', () => {
  const user = { sub: 'admin-1' };
  const env = { DB: {} };
  const ctx = {};
  const db = { all: vi.fn(), run: vi.fn(), first: vi.fn() };
  const logger = { error: vi.fn(), warn: vi.fn(), info: vi.fn() };

  beforeEach(() => {
    vi.resetAllMocks();
    mocks.createDB.mockReturnValue(db);
    mocks.ensureAdminAclAccess.mockResolvedValue({ allow: true });
    mocks.getConfigValue.mockImplementation(async (_db, key, fallback) => {
      if (key === 'openai_connections') return JSON.stringify([]);
      if (key === 'openai_enabled') return 'true';
      return fallback;
    });
    mocks.getAllOpenAIConnectionConfigs.mockResolvedValue([]);
    mocks.normalizeProviderFamily.mockReturnValue('openai');
    mocks.isConnectionUrlRequired.mockReturnValue(false);
    mocks.getConnectionDefaultBaseUrl.mockReturnValue('https://api.openai.com/v1');
    mocks.isValidHttpUrl.mockReturnValue(true);
    mocks.isSafeOutboundUrl.mockReturnValue({ safe: true });
    mocks.normalizeBaseUrl.mockImplementation((url) => url);
    mocks.parseHeadersForRequest.mockReturnValue({});
    mocks.extractConnectionModelId.mockImplementation((item) => item?.id || '');
    mocks.getConnectionTestFailureMessage.mockReturnValue('Connection failed');
  });

  describe('GET /api/admin/openai/connections', () => {
    it('returns connections list', async () => {
      mocks.getConfigValue.mockImplementation(async (_db, key) => {
        if (key === 'openai_connections') return JSON.stringify([
          { id: 'c1', name: 'OpenAI', key: 'secret-key-1234', providerType: 'openai', enabled: true },
        ]);
        if (key === 'openai_enabled') return 'true';
        return '[]';
      });
      const res = await handleAdminConnectionsList(
        makeReq('/api/admin/openai/connections', 'GET'),
        env, ctx, user, '/api/admin/openai/connections',
        { db, logger, _requestContext: {} },
      );
      expect(res.status).toBe(200);
      const payload = await res.json();
      expect(payload.enabled).toBe(true);
      expect(payload.connections).toHaveLength(1);
      expect(payload.connections[0].key).toBeUndefined();
      expect(payload.connections[0].hasKey).toBe(true);
    });

    it('filters disabled connections by default', async () => {
      mocks.getConfigValue.mockImplementation(async (_db, key) => {
        if (key === 'openai_connections') return JSON.stringify([
          { id: 'c1', name: 'Enabled', providerType: 'openai', enabled: true },
          { id: 'c2', name: 'Disabled', providerType: 'openai', enabled: false },
        ]);
        if (key === 'openai_enabled') return 'true';
        return '[]';
      });
      const res = await handleAdminConnectionsList(
        makeReq('/api/admin/openai/connections', 'GET'),
        env, ctx, user, '/api/admin/openai/connections',
        { db, logger, _requestContext: {} },
      );
      const payload = await res.json();
      expect(payload.connections).toHaveLength(1);
      expect(payload.connections[0].id).toBe('c1');
    });

    it('includes disabled when include_disabled=true', async () => {
      mocks.getConfigValue.mockImplementation(async (_db, key) => {
        if (key === 'openai_connections') return JSON.stringify([
          { id: 'c1', name: 'Enabled', providerType: 'openai', enabled: true },
          { id: 'c2', name: 'Disabled', providerType: 'openai', enabled: false },
        ]);
        if (key === 'openai_enabled') return 'true';
        return '[]';
      });
      const res = await handleAdminConnectionsList(
        makeReq('/api/admin/openai/connections?include_disabled=true', 'GET'),
        env, ctx, user, '/api/admin/openai/connections',
        { db, logger, _requestContext: {} },
      );
      const payload = await res.json();
      expect(payload.connections).toHaveLength(2);
    });

    it('returns 500 on error', async () => {
      mocks.getConfigValue.mockRejectedValue(new Error('DB fail'));
      const res = await handleAdminConnectionsList(
        makeReq('/api/admin/openai/connections', 'GET'),
        env, ctx, user, '/api/admin/openai/connections',
        { db, logger, _requestContext: {} },
      );
      expect(res.status).toBe(500);
    });
  });

  describe('POST /api/admin/openai/connections/test', () => {
    it('rejects ACL denied', async () => {
      mocks.ensureAdminAclAccess.mockResolvedValue({ allow: false, reason: 'no' });
      const res = await handleAdminConnectionsList(
        makeReq('/api/admin/openai/connections/test', 'POST', {
          providerType: 'openai', url: 'https://api.openai.com/v1', key: 'test',
        }),
        env, ctx, user, '/api/admin/openai/connections/test',
        { db, logger, _requestContext: {} },
      );
      expect(res.status).toBe(403);
    });

    it('rejects invalid URL', async () => {
      mocks.isValidHttpUrl.mockReturnValue(false);
      const res = await handleAdminConnectionsList(
        makeReq('/api/admin/openai/connections/test', 'POST', {
          providerType: 'openai', url: 'not-a-url',
        }),
        env, ctx, user, '/api/admin/openai/connections/test',
        { db, logger, _requestContext: {} },
      );
      expect(res.status).toBe(400);
    });

    it('rejects unsafe URL', async () => {
      mocks.isSafeOutboundUrl.mockReturnValue({ safe: false, reason: 'Blocked URL' });
      const res = await handleAdminConnectionsList(
        makeReq('/api/admin/openai/connections/test', 'POST', {
          providerType: 'openai', url: 'https://evil.com/v1',
        }),
        env, ctx, user, '/api/admin/openai/connections/test',
        { db, logger, _requestContext: {} },
      );
      expect(res.status).toBe(400);
    });

    it('requires URL for compatible providers', async () => {
      mocks.isConnectionUrlRequired.mockReturnValue(true);
      const res = await handleAdminConnectionsList(
        makeReq('/api/admin/openai/connections/test', 'POST', {
          providerType: 'openai-compatible', url: '',
        }),
        env, ctx, user, '/api/admin/openai/connections/test',
        { db, logger, _requestContext: {} },
      );
      expect(res.status).toBe(400);
    });

    it('rejects invalid headers JSON', async () => {
      mocks.parseHeadersForRequest.mockImplementation(() => { throw new Error('Bad headers'); });
      const res = await handleAdminConnectionsList(
        makeReq('/api/admin/openai/connections/test', 'POST', {
          providerType: 'openai', url: 'https://api.openai.com/v1', headers: 'not-json',
        }),
        env, ctx, user, '/api/admin/openai/connections/test',
        { db, logger, _requestContext: {} },
      );
      expect(res.status).toBe(400);
    });

    it('returns 502 when no models discovered', async () => {
      mocks.discoverConnectionModels.mockResolvedValue({
        items: [], error: { status: 401, message: 'Bad key' },
      });
      mocks.buildConnectionHeaders.mockReturnValue({});
      const res = await handleAdminConnectionsList(
        makeReq('/api/admin/openai/connections/test', 'POST', {
          providerType: 'openai', url: 'https://api.openai.com/v1', key: 'bad',
        }),
        env, ctx, user, '/api/admin/openai/connections/test',
        { db, logger, _requestContext: {} },
      );
      expect(res.status).toBe(502);
    });

    it('returns successful connection test', async () => {
      mocks.discoverConnectionModels.mockResolvedValue({
        items: [{ id: 'gpt-4o', name: 'GPT-4o' }], url: 'https://api.openai.com/v1/models',
      });
      mocks.buildConnectionHeaders.mockReturnValue({ Authorization: 'Bearer test' });
      mocks.extractConnectionModelId.mockImplementation((item) => item?.id || '');
      const res = await handleAdminConnectionsList(
        makeReq('/api/admin/openai/connections/test', 'POST', {
          providerType: 'openai', url: 'https://api.openai.com/v1', key: 'test',
        }),
        env, ctx, user, '/api/admin/openai/connections/test',
        { db, logger, _requestContext: {} },
      );
      expect(res.status).toBe(200);
      const payload = await res.json();
      expect(payload.ok).toBe(true);
      expect(payload.models.length).toBeGreaterThan(0);
    });

    it('returns 502 on exception', async () => {
      mocks.buildConnectionHeaders.mockReturnValue({});
      mocks.discoverConnectionModels.mockRejectedValue(new Error('Network error'));
      const res = await handleAdminConnectionsList(
        makeReq('/api/admin/openai/connections/test', 'POST', {
          providerType: 'openai', url: 'https://api.openai.com/v1', key: 'test',
        }),
        env, ctx, user, '/api/admin/openai/connections/test',
        { db, logger, _requestContext: {} },
      );
      expect(res.status).toBe(502);
    });

    it('rejects invalid JSON body', async () => {
      const res = await handleAdminConnectionsList(
        new Request('https://example.com/api/admin/openai/connections/test', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: 'not-json',
        }),
        env, ctx, user, '/api/admin/openai/connections/test',
        { db, logger, _requestContext: {} },
      );
      expect(res.status).toBe(400);
    });
  });

  it('returns null for unrecognized paths', async () => {
    const result = await handleAdminConnectionsList(
      makeReq('/api/admin/unknown', 'GET'),
      env, ctx, user, '/api/admin/unknown',
      { db, logger, _requestContext: {} },
    );
    expect(result).toBeNull();
  });
});
