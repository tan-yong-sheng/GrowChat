import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  createDB: vi.fn(),
  authorize: vi.fn(),
  logAuditEvent: vi.fn(),
  getConfigBool: vi.fn(),
  getConfigValue: vi.fn(),
  getAllOpenAIConnectionConfigs: vi.fn(),
  discoverConnectionModels: vi.fn(),
}));

vi.mock('../db.js', () => ({
  createDB: (...args) => mocks.createDB(...args),
}));

vi.mock('../utils/authorize.js', () => ({
  authorize: (...args) => mocks.authorize(...args),
  logAuditEvent: (...args) => mocks.logAuditEvent(...args),
}));

vi.mock('../utils/app-config.js', () => ({
  getConfigBool: (...args) => mocks.getConfigBool(...args),
  getConfigValue: (...args) => mocks.getConfigValue(...args),
}));

vi.mock('../llm/connections.js', () => ({
  dedupeConnectionConfigs: (connections) => connections,
  discoverConnectionModels: (...args) => mocks.discoverConnectionModels(...args),
  extractConnectionModelId: (item) => item?.id || item?.model || item?.name || '',
  getAllOpenAIConnectionConfigs: (...args) => mocks.getAllOpenAIConnectionConfigs(...args),
  normalizeConnectionManualModels: (value) => value,
  getConnectionDefaultBaseUrl: (providerType) => {
    const raw = String(providerType || '').toLowerCase();
    if (raw === 'google' || raw === 'gemini-compatible') return 'https://generativelanguage.googleapis.com/v1beta';
    if (raw === 'anthropic' || raw === 'claude-compatible') return 'https://api.anthropic.com/v1';
    return 'https://api.openai.com/v1';
  },
  isConnectionUrlRequired: (providerType) => {
    const raw = String(providerType || '').toLowerCase();
    return raw === 'openai-compatible' || raw === 'gemini-compatible' || raw === 'claude-compatible';
  },
}));

import { modelsRouter } from './models.js';

function makeReq(path, method, headers = {}) {
  return new Request(`https://example.com${path}`, { method, headers });
}

describe('modelsRouter', () => {
  beforeEach(() => {
    mocks.createDB.mockReturnValue({
      all: vi.fn().mockResolvedValue([]),
    });
    mocks.authorize.mockResolvedValue({ allow: true });
    mocks.logAuditEvent.mockResolvedValue(undefined);
    mocks.getConfigBool.mockResolvedValue(true);
    mocks.getConfigValue.mockResolvedValue('{}');
    mocks.getAllOpenAIConnectionConfigs.mockResolvedValue([]);
    mocks.discoverConnectionModels.mockResolvedValue({ items: [], url: 'https://example.com/models' });
  });

  it('returns 304 when If-None-Match matches for /api/models', async () => {
    const env = {};
    const res1 = await modelsRouter(makeReq('/api/models', 'GET'), env, {}, null, '/api/models');
    const etag = res1.headers.get('ETag');
    expect(etag).toBeTruthy();

    const res2 = await modelsRouter(
      makeReq('/api/models', 'GET', { 'If-None-Match': etag }),
      env,
      {},
      null,
      '/api/models'
    );

    expect(res2.status).toBe(304);
  });

  it('includes disabled connections when requested for admin models', async () => {
    const env = { DB: {} };
    await modelsRouter(
      makeReq('/api/admin/models?include_disabled=1', 'GET'),
      env,
      {},
      { sub: 'user-1' },
      '/api/admin/models'
    );

    expect(mocks.getAllOpenAIConnectionConfigs).toHaveBeenCalledWith(env, { includeDisabled: true });
  });

  it('includes manual models from a connection in admin models', async () => {
    const env = { DB: {} };
    mocks.getAllOpenAIConnectionConfigs.mockResolvedValue([
      {
        id: 'conn-1',
        name: 'Gateway',
        providerType: 'google',
        providerFamily: 'google',
        providerId: 'google/conn-1',
        baseUrl: 'https://example.com/v1beta',
        manualModels: [{ modelId: 'my-custom-model', name: 'My Custom Model' }],
      },
    ]);

    const res = await modelsRouter(
      makeReq('/api/admin/models?include_disabled=1', 'GET'),
      env,
      {},
      { sub: 'user-1' },
      '/api/admin/models'
    );
    const payload = await res.json();

    expect(res.status).toBe(200);
    expect(payload.models.some((model) => model.id === 'google/conn-1:my-custom-model')).toBe(true);
    expect(payload.models.some((model) => model.manual === true)).toBe(true);
  });

  it('returns active_total and orders active models before disabled ones', async () => {
    const env = { DB: {} };
    mocks.createDB.mockReturnValue({
      run: vi.fn().mockResolvedValue(undefined),
      all: vi.fn(async (sql) => {
        if (String(sql).includes('SELECT model_id, is_enabled FROM model_access')) {
          return [
            { model_id: 'google/conn-1:beta', is_enabled: 1 },
            { model_id: 'google/conn-1:alpha', is_enabled: 0 },
          ];
        }
        return [];
      }),
    });
    mocks.getAllOpenAIConnectionConfigs.mockResolvedValue([
      {
        id: 'conn-1',
        name: 'Gateway',
        providerType: 'google',
        providerFamily: 'google',
        providerId: 'google/conn-1',
        baseUrl: 'https://example.com/v1beta',
        manualModels: [],
      },
    ]);
    mocks.discoverConnectionModels.mockResolvedValue({
      items: [
        { id: 'beta' },
        { id: 'alpha' },
      ],
      url: 'https://example.com/models',
    });

    const res = await modelsRouter(
      makeReq('/api/admin/models?include_disabled=1', 'GET'),
      env,
      {},
      { sub: 'user-1' },
      '/api/admin/models'
    );
    const payload = await res.json();

    expect(res.status).toBe(200);
    expect(payload.active_total).toBe(1);
    expect(payload.models[0].id).toBe('google/conn-1:beta');
    expect(payload.models[1].id).toBe('google/conn-1:alpha');
  });
});
