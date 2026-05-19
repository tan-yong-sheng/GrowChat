import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  createDB: vi.fn(),
  authorize: vi.fn(),
  logAuditEvent: vi.fn(),
  getConfigBool: vi.fn(),
  getConfigValue: vi.fn(),
  getAllOpenAIConnectionConfigs: vi.fn(),
  discoverConnectionModels: vi.fn(),
  loadUserResourceOverrides: vi.fn()
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
    if (raw === 'google' || raw === 'gemini-compatible')
      return 'https://generativelanguage.googleapis.com/v1beta';
    if (raw === 'anthropic' || raw === 'claude-compatible') return 'https://api.anthropic.com/v1';
    return 'https://api.openai.com/v1';
  },
  isConnectionUrlRequired: (providerType) => {
    const raw = String(providerType || '').toLowerCase();
    return (
      raw === 'openai-compatible' || raw === 'gemini-compatible' || raw === 'claude-compatible'
    );
  },
}));

vi.mock('../../public/js/shared/utils/user-resource-overrides.js', () => ({
  loadUserResourceOverrides: (...args) => mocks.loadUserResourceOverrides(...args),
}));

import { applyUserModelVisibilityOverrides, modelsRouter } from './models.js';

function makeReq(path, method, bodyOrHeaders, headers = {}) {
  const hasExplicitHeaders = arguments.length >= 4;
  const init = { method, headers };
  const shouldTreatAsHeaders =
    !hasExplicitHeaders &&
    method === 'GET' &&
    bodyOrHeaders &&
    typeof bodyOrHeaders === 'object' &&
    !Array.isArray(bodyOrHeaders);

  if (shouldTreatAsHeaders) {
    init.headers = bodyOrHeaders;
  } else if (bodyOrHeaders !== undefined) {
    init.body = typeof bodyOrHeaders === 'string' ? bodyOrHeaders : JSON.stringify(bodyOrHeaders);
    init.headers = { ...headers, 'Content-Type': 'application/json' };
    init.duplex = 'half';
  }
  return new Request(`https://example.com${path}`, init);
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
    mocks.discoverConnectionModels.mockResolvedValue({
      items: [],
      url: 'https://example.com/models',
    });
    mocks.loadUserResourceOverrides.mockResolvedValue({
      models: { hidden_ids: [] },
      connections: { hidden_ids: [] },
      tool_servers: { hidden_ids: [], tools: {} },
    });
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

  it('does not warn for expected 401 discovery on unauthenticated connections', async () => {
    const env = {};
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    mocks.getAllOpenAIConnectionConfigs.mockResolvedValue([
      {
        id: 'conn-public',
        name: 'Public Proxy',
        providerType: 'openai-compatible',
        providerFamily: 'openai',
        baseUrl: 'http://localhost:11434/v1',
        key: '',
        headers: {},
        manualModels: [],
      },
      {
        id: 'conn-auth',
        name: 'Primary',
        providerType: 'openai-compatible',
        providerFamily: 'openai',
        baseUrl: 'https://api.openai.com/v1',
        key: 'secret',
        headers: {},
        manualModels: [],
      },
    ]);
    mocks.discoverConnectionModels
      .mockResolvedValueOnce({
        items: [],
        url: null,
        error: { status: 401, message: 'Unauthorized' },
      })
      .mockResolvedValueOnce({
        items: [{ id: 'gpt-4o-mini' }],
        url: 'https://api.openai.com/v1/models',
      });

    const res = await modelsRouter(makeReq('/api/models', 'GET'), env, {}, null, '/api/models');
    const payload = await res.json();

    expect(res.status).toBe(200);
    expect(payload.models.map((model) => model.id)).toContain('openai/conn-auth:gpt-4o-mini');
    expect(warnSpy).not.toHaveBeenCalledWith(
      expect.stringContaining('Model discovery failed for your provider: 401')
    );

    warnSpy.mockRestore();
  });

  it('keeps warning for 401 discovery when credentials are present', async () => {
    const env = {};
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    mocks.getAllOpenAIConnectionConfigs.mockResolvedValue([
      {
        id: 'conn-auth',
        name: 'Primary',
        providerType: 'openai-compatible',
        providerFamily: 'openai',
        baseUrl: 'http://localhost:11434/v1',
        key: 'invalid-key',
        headers: {},
        manualModels: [],
      },
    ]);
    mocks.discoverConnectionModels.mockResolvedValue({
      items: [],
      url: null,
      error: { status: 401, message: 'Unauthorized' },
    });

    const res = await modelsRouter(makeReq('/api/models', 'GET'), env, {}, null, '/api/models');

    expect(res.status).toBe(200);
    // Structured logger emits JSON string via console.warn
    const warnCalls = warnSpy.mock.calls.map(call => call[0]);
    const matchedCall = warnCalls.find(call => {
      try {
        const parsed = JSON.parse(call);
        return parsed.message === 'Model discovery failed'
          && parsed.baseUrl === 'http://localhost:11434/v1'
          && parsed.errorLabel === '401';
      } catch { return false; }
    });
    expect(matchedCall).toBeTruthy();

    warnSpy.mockRestore();
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

    expect(mocks.getAllOpenAIConnectionConfigs).toHaveBeenCalledWith(env, {
      includeDisabled: true,
    });
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

  it('respects a connection manual selection subset when listing admin models', async () => {
    const env = { DB: {} };
    mocks.getAllOpenAIConnectionConfigs.mockResolvedValue([
      {
        id: 'conn-1',
        name: 'Gateway',
        source: 'user',
        providerType: 'google',
        providerFamily: 'google',
        providerId: 'google/conn-1',
        baseUrl: 'https://example.com/v1beta',
        manualModelsMode: 'some',
        manualModels: [
          { modelId: 'alpha', name: 'Alpha' },
          { modelId: 'gamma', name: 'Gamma' },
        ],
      },
    ]);
    mocks.discoverConnectionModels.mockResolvedValue({
      items: [{ id: 'alpha' }, { id: 'beta' }, { id: 'gamma' }],
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
    expect(payload.active_total).toBe(2);
    expect(payload.models).toHaveLength(3);
    expect(payload.models.map((model) => model.id)).toEqual([
      'google/conn-1:alpha',
      'google/conn-1:gamma',
      'google/conn-1:beta',
    ]);
    expect(payload.models.find((model) => model.id === 'google/conn-1:beta')?.enabled).toBe(false);
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
      items: [{ id: 'beta' }, { id: 'alpha' }],
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

  it('returns an effective-scoped catalog with hidden rows separated from visible rows', async () => {
    const env = { DB: {} };
    mocks.createDB.mockReturnValue({
      run: vi.fn().mockResolvedValue(undefined),
      all: vi.fn(async (sql) => {
        const text = String(sql);
        if (text.includes('SELECT model_id FROM model_access WHERE is_enabled = 0')) {
          return [{ model_id: 'google/conn-1:gamma' }];
        }
        if (text.includes('SELECT model_id, is_enabled FROM model_access')) {
          return [{ model_id: 'google/conn-1:gamma', is_enabled: 0 }];
        }
        if (text.includes('SELECT group_id FROM group_members WHERE user_id = ?')) {
          return [];
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
      items: [{ id: 'alpha' }, { id: 'beta' }, { id: 'gamma' }],
      url: 'https://example.com/models',
    });
    mocks.loadUserResourceOverrides.mockResolvedValue({
      models: { hidden_ids: ['google/conn-1:beta'] },
      connections: { hidden_ids: [] },
      tool_servers: { hidden_ids: [], tools: {} },
    });

    const res = await modelsRouter(
      makeReq('/api/models?scope=effective', 'GET'),
      env,
      {},
      { sub: 'user-1', primary_role: 'admin' },
      '/api/models'
    );
    const payload = await res.json();

    expect(res.status).toBe(200);
    expect(payload.total).toBe(1);
    expect(payload.active_total).toBe(1);
    expect(payload.models.map((model) => model.id)).toEqual(['google/conn-1:alpha']);
    expect(payload.hidden_models.map((model) => model.id)).toEqual(['google/conn-1:beta']);
    expect(payload.visibility).toEqual(
      expect.objectContaining({
        disabled_model_ids: ['google/conn-1:gamma'],
        hidden_model_ids: ['google/conn-1:beta'],
      })
    );
  });

  it('marks user-hidden models as unavailable even when they are otherwise enabled', async () => {
    const models = applyUserModelVisibilityOverrides(
      [
        { id: 'google/conn-1:alpha', enabled: false },
        { id: 'google/conn-1:beta', enabled: true },
      ],
      new Set(['google/conn-1:beta'])
    );

    expect(models).toEqual([
      expect.objectContaining({
        id: 'google/conn-1:alpha',
        enabled: false,
        hidden_for_user: false,
        visible_for_user: true,
      }),
      expect.objectContaining({
        id: 'google/conn-1:beta',
        enabled: false,
        hidden_for_user: true,
        visible_for_user: false,
      }),
    ]);
  });

  it('returns model visibility metadata for fallback reasoning', async () => {
    const env = { DB: {} };
    mocks.createDB.mockReturnValue({
      all: vi.fn(async (sql) => {
        if (String(sql).includes('SELECT model_id FROM model_access WHERE is_enabled = 0')) {
          return [{ model_id: 'google/conn-1:alpha' }];
        }
        return [];
      }),
    });
    mocks.loadUserResourceOverrides.mockResolvedValue({
      models: { hidden_ids: ['google/conn-1:beta'] },
      connections: { hidden_ids: [] },
      tool_servers: { hidden_ids: [], tools: {} },
    });
    mocks.getAllOpenAIConnectionConfigs.mockResolvedValue([
      {
        id: 'conn-1',
        name: 'Gateway',
        providerType: 'google',
        providerFamily: 'google',
        providerId: 'google/conn-1',
        baseUrl: 'https://example.com/v1beta',
        manualModels: [
          { modelId: 'alpha', name: 'Alpha' },
          { modelId: 'beta', name: 'Beta' },
        ],
      },
    ]);

    const res = await modelsRouter(
      makeReq('/api/models', 'GET'),
      env,
      {},
      { sub: 'user-1' },
      '/api/models'
    );
    const payload = await res.json();

    expect(res.status).toBe(200);
    expect(payload.visibility).toEqual(
      expect.objectContaining({
        disabled_model_ids: ['google/conn-1:alpha'],
        hidden_model_ids: [],
      })
    );
  });

  it('filters admin models by provider and returns provider stats', async () => {
    const env = { DB: {} };
    mocks.getAllOpenAIConnectionConfigs.mockResolvedValue([
      {
        id: 'conn-openai',
        name: 'OpenAI Main',
        providerType: 'openai',
        providerFamily: 'openai',
        providerId: 'openai/conn-openai',
        baseUrl: 'https://api.openai.com/v1',
        manualModels: [{ modelId: 'gpt-4o', name: 'GPT-4o' }],
      },
      {
        id: 'conn-google',
        name: 'Gemini',
        providerType: 'google',
        providerFamily: 'google',
        providerId: 'google/conn-google',
        baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
        manualModels: [{ modelId: 'gemini-1.5-pro', name: 'Gemini 1.5 Pro' }],
      },
    ]);

    const res = await modelsRouter(
      makeReq('/api/admin/models?include_disabled=1&provider=gemini', 'GET'),
      env,
      {},
      { sub: 'user-1' },
      '/api/admin/models'
    );
    const payload = await res.json();

    expect(res.status).toBe(200);
    expect(payload.models).toHaveLength(1);
    expect(payload.models[0].provider_family).toBe('google');
    const openai = payload.providers.find((item) => item.value === 'openai main');
    const google = payload.providers.find((item) => item.value === 'gemini');
    expect(openai).toBeTruthy();
    expect(google).toBeTruthy();
    expect(google.total).toBe(1);
    expect(google.active).toBe(1);
  });

  it('returns model access rules for an admin model', async () => {
    const env = { DB: {} };
    mocks.createDB.mockReturnValue({
      all: vi.fn(async (sql) => {
        if (String(sql).includes('FROM groups')) {
          return [
            {
              id: 'g1',
              name: 'Team Alpha',
              description: 'Core team',
              is_system: 0,
              created_at: 1,
              updated_at: 1,
            },
            {
              id: 'g2',
              name: 'Team Beta',
              description: 'Review team',
              is_system: 0,
              created_at: 1,
              updated_at: 1,
            },
          ];
        }
        if (String(sql).includes('FROM model_acl_rules')) {
          return [
            {
              id: 'rule-1',
              model_id: 'gpt-5-mini',
              principal_type: 'group',
              principal_id: 'g2',
              effect: 'allow',
              action: 'use',
              created_at: 1,
              updated_at: 1,
            },
          ];
        }
        return [];
      }),
    });

    const res = await modelsRouter(
      makeReq('/api/admin/models/gpt-5-mini/access', 'GET'),
      env,
      {},
      { sub: 'user-1' },
      '/api/admin/models/gpt-5-mini/access'
    );

    expect(res.status).toBe(200);
    const payload = await res.json();
    expect(payload.model_id).toBe('gpt-5-mini');
    expect(payload.rules).toEqual([
      expect.objectContaining({
        principal_type: 'group',
        principal_id: 'g2',
        effect: 'allow',
        action: 'use',
      }),
    ]);
    expect(payload.groups).toHaveLength(2);
  });

  it('decodes encoded model ids when loading access rules', async () => {
    const env = { DB: {} };
    const all = vi.fn(async (sql) => {
      if (String(sql).includes('FROM groups')) {
        return [];
      }
      if (String(sql).includes('FROM model_acl_rules')) {
        return [
          {
            id: 'rule-1',
            model_id: 'openai/env-openai-0:deepseek-v3.2',
            principal_type: 'group',
            principal_id: 'g1',
            effect: 'allow',
            action: 'use',
            created_at: 1,
            updated_at: 1,
          },
        ];
      }
      return [];
    });
    mocks.createDB.mockReturnValue({ all });

    const res = await modelsRouter(
      makeReq('/api/admin/models/openai%2Fenv-openai-0%3Adeepseek-v3.2/access', 'GET'),
      env,
      {},
      { sub: 'user-1' },
      '/api/admin/models/openai%2Fenv-openai-0%3Adeepseek-v3.2/access'
    );

    expect(res.status).toBe(200);
    const payload = await res.json();
    expect(payload.model_id).toBe('openai/env-openai-0:deepseek-v3.2');
    expect(payload.rules).toHaveLength(1);
    expect(payload.rules[0].model_id).toBe('openai/env-openai-0:deepseek-v3.2');
  });

  it('loads encoded model ids through the single access endpoint filter', async () => {
    const env = { DB: {} };
    const all = vi.fn(async (sql) => {
      if (String(sql).includes('FROM groups')) {
        return [];
      }
      if (String(sql).includes('FROM model_acl_rules') && String(sql).includes('IN (')) {
        return [
          {
            id: 'rule-1',
            model_id: 'openai%2Fenv-openai-0%3Adeepseek-v3.2',
            principal_type: 'group',
            principal_id: 'g1',
            effect: 'allow',
            action: 'use',
            created_at: 1,
            updated_at: 1,
          },
        ];
      }
      return [];
    });
    mocks.createDB.mockReturnValue({ all });

    const res = await modelsRouter(
      makeReq('/api/admin/models/openai%2Fenv-openai-0%3Adeepseek-v3.2/access', 'GET'),
      env,
      {},
      { sub: 'user-1' },
      '/api/admin/models/openai%2Fenv-openai-0%3Adeepseek-v3.2/access'
    );

    expect(res.status).toBe(200);
    const payload = await res.json();
    expect(payload.rules).toHaveLength(1);
    expect(payload.rules[0]).toMatchObject({
      model_id: 'openai/env-openai-0:deepseek-v3.2',
      principal_type: 'group',
      principal_id: 'g1',
      effect: 'allow',
      action: 'use',
    });
  });

  it('rejects model access updates for disabled models', async () => {
    const env = { DB: {} };
    const all = vi.fn(async (sql) => {
      if (String(sql).includes('SELECT model_id, is_enabled FROM model_access')) {
        return [{ model_id: 'gpt-5-mini', is_enabled: 0 }];
      }
      if (String(sql).includes('FROM groups')) {
        return [
          {
            id: 'g1',
            name: 'Team Alpha',
            description: 'Core team',
            is_system: 0,
            created_at: 1,
            updated_at: 1,
          },
        ];
      }
      return [];
    });
    mocks.createDB.mockReturnValue({ all, run: vi.fn() });

    const res = await modelsRouter(
      makeReq('/api/admin/models/gpt-5-mini/access', 'PUT', {
        rules: [{ principal_type: 'group', principal_id: 'g1', effect: 'allow', action: 'use' }],
      }),
      env,
      {},
      { sub: 'user-1' },
      '/api/admin/models/gpt-5-mini/access'
    );

    expect(res.status).toBe(409);
  });

  it('updates model access rules for an admin model', async () => {
    const env = { DB: {} };
    const batch = vi.fn().mockResolvedValue(undefined);
    const prepare = vi.fn((sql, params = []) => ({
      sql,
      params,
      bind: (...bindArgs) => ({ sql, params: bindArgs }),
    }));
    const all = vi.fn(async (sql) => {
      if (String(sql).includes('FROM groups')) {
        return [
          {
            id: 'g1',
            name: 'Team Alpha',
            description: 'Core team',
            is_system: 0,
            created_at: 1,
            updated_at: 1,
          },
          {
            id: 'g2',
            name: 'Team Beta',
            description: 'Review team',
            is_system: 0,
            created_at: 1,
            updated_at: 1,
          },
          {
            id: 'g3',
            name: 'Team Gamma',
            description: 'Ops team',
            is_system: 0,
            created_at: 1,
            updated_at: 1,
          },
        ];
      }
      if (String(sql).includes('FROM model_acl_rules')) {
        return [
          {
            id: 'rule-1',
            model_id: 'gpt-5-mini',
            principal_type: 'group',
            principal_id: 'g1',
            effect: 'allow',
            action: 'use',
            created_at: 1,
            updated_at: 1,
          },
          {
            id: 'rule-2',
            model_id: 'gpt-5-mini',
            principal_type: 'group',
            principal_id: 'g3',
            effect: 'deny',
            action: 'use',
            created_at: 1,
            updated_at: 1,
          },
        ];
      }
      return [];
    });
    mocks.createDB.mockReturnValue({
      all,
      batch,
      prepare,
      run: vi.fn().mockResolvedValue(undefined),
    });

    const res = await modelsRouter(
      makeReq('/api/admin/models/gpt-5-mini/access', 'PUT', {
        rules: [
          { principal_type: 'group', principal_id: 'g1', effect: 'allow', action: 'use' },
          { principal_type: 'group', principal_id: 'g3', effect: 'deny', action: 'use' },
        ],
      }),
      env,
      {},
      { sub: 'user-1' },
      '/api/admin/models/gpt-5-mini/access'
    );

    expect(res.status).toBe(200);
    const payload = await res.json();
    expect(payload.rules).toEqual([
      expect.objectContaining({
        principal_type: 'group',
        principal_id: 'g1',
        effect: 'allow',
        action: 'use',
      }),
      expect.objectContaining({
        principal_type: 'group',
        principal_id: 'g3',
        effect: 'deny',
        action: 'use',
      }),
    ]);
    expect(batch).toHaveBeenCalledTimes(1);
    expect(prepare).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO model_acl_rules'),
      expect.any(Array)
    );
  });

  it('decodes encoded model ids when saving access rules', async () => {
    const env = { DB: {} };
    const batch = vi.fn().mockResolvedValue(undefined);
    const prepare = vi.fn((sql, params = []) => ({
      sql,
      params,
      bind: (...bindArgs) => ({ sql, params: bindArgs }),
    }));
    const all = vi.fn(async (sql) => {
      if (String(sql).includes('FROM groups')) {
        return [
          {
            id: 'g1',
            name: 'Team Alpha',
            description: 'Core team',
            is_system: 0,
            created_at: 1,
            updated_at: 1,
          },
        ];
      }
      if (String(sql).includes('FROM model_acl_rules')) {
        return [];
      }
      return [];
    });
    mocks.createDB.mockReturnValue({
      all,
      batch,
      prepare,
      run: vi.fn().mockResolvedValue(undefined),
    });

    const res = await modelsRouter(
      makeReq('/api/admin/models/openai%2Fenv-openai-0%3Adeepseek-v3.2/access', 'PUT', {
        rules: [{ principal_type: 'group', principal_id: 'g1', effect: 'allow', action: 'use' }],
      }),
      env,
      {},
      { sub: 'user-1' },
      '/api/admin/models/openai%2Fenv-openai-0%3Adeepseek-v3.2/access'
    );

    expect(res.status).toBe(200);
    expect(batch).toHaveBeenCalledTimes(1);
    expect(prepare).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO model_acl_rules'),
      expect.arrayContaining([
        expect.any(String),
        'openai/env-openai-0:deepseek-v3.2',
        'group',
        'g1',
        'allow',
        'use',
      ])
    );
  });

  it('updates model access rules in bulk for policies saves', async () => {
    const env = { DB: {} };
    const batch = vi.fn().mockResolvedValue(undefined);
    const prepare = vi.fn((sql, params = []) => ({
      sql,
      params,
      bind: (...bindArgs) => ({ sql, params: bindArgs }),
    }));
    const all = vi.fn(async (sql) => {
      if (String(sql).includes('SELECT model_id, is_enabled FROM model_access')) {
        return [
          { model_id: 'm1', is_enabled: 1 },
          { model_id: 'm2', is_enabled: 1 },
        ];
      }
      if (String(sql).includes('FROM groups')) {
        return [
          {
            id: 'g1',
            name: 'Team Alpha',
            description: 'Core team',
            is_system: 0,
            created_at: 1,
            updated_at: 1,
          },
          {
            id: 'g2',
            name: 'Team Beta',
            description: 'Review team',
            is_system: 0,
            created_at: 1,
            updated_at: 1,
          },
        ];
      }
      return [];
    });
    mocks.createDB.mockReturnValue({
      all,
      batch,
      prepare,
      run: vi.fn().mockResolvedValue(undefined),
    });

    const res = await modelsRouter(
      makeReq('/api/admin/models/access', 'PUT', {
        updates: [
          {
            model_id: 'm1',
            rules: [
              { principal_type: 'group', principal_id: 'g1', effect: 'allow', action: 'use' },
            ],
          },
          {
            model_id: 'm2',
            rules: [{ principal_type: 'group', principal_id: 'g2', effect: 'deny', action: 'use' }],
          },
        ],
      }),
      env,
      {},
      { sub: 'user-1', primary_role: 'admin' },
      '/api/admin/models/access'
    );

    expect(res.status).toBe(200);
    const payload = await res.json();
    expect(payload.updates).toHaveLength(2);
    expect(batch).toHaveBeenCalledTimes(1);
    expect(prepare).toHaveBeenCalledWith(
      expect.stringContaining('DELETE FROM model_acl_rules'),
      expect.arrayContaining(['m1'])
    );
  });

  it('updates model access and attachment caps together through the main models save contract', async () => {
    const env = { DB: {} };
    const batch = vi.fn().mockResolvedValue(undefined);
    const all = vi.fn(async (sql) => {
      const text = String(sql);
      if (text.includes('SELECT model_id, is_enabled FROM model_access')) {
        return [{ model_id: 'openai/env-openai-0:gemini-2.5-flash', is_enabled: 1 }];
      }
      if (text.includes('FROM groups')) {
        return [
          {
            id: 'g1',
            name: 'Team Alpha',
            description: 'Core team',
            is_system: 0,
            created_at: 1,
            updated_at: 1,
          },
        ];
      }
      if (text.includes('FROM model_acl_rules')) {
        return [
          {
            id: 'rule-1',
            model_id: 'openai/env-openai-0:gemini-2.5-flash',
            principal_type: 'group',
            principal_id: 'g1',
            effect: 'allow',
            action: 'use',
            created_at: 1,
            updated_at: 1,
          },
        ];
      }
      return [];
    });
    const first = vi.fn(async (sql) => {
      if (
        String(sql).includes('FROM app_config') &&
        String(sql).includes('model_attachment_caps_v1')
      ) {
        return { value: JSON.stringify({}) };
      }
      return null;
    });
    const prepare = vi.fn((sql, params = []) => ({
      sql,
      params,
      bind: (...bindArgs) => ({ sql, params: bindArgs }),
    }));
    mocks.createDB.mockReturnValue({
      all,
      first,
      batch,
      prepare,
      run: vi.fn().mockResolvedValue(undefined),
    });

    const res = await modelsRouter(
      makeReq('/api/admin/models', 'PUT', {
        attachment_updates: [
          {
            model_id: 'openai/env-openai-0:gemini-2.5-flash',
            attachments: { image: true },
          },
        ],
        access_updates: [
          {
            modelId: 'openai/env-openai-0:gemini-2.5-flash',
            rules: [],
          },
        ],
      }),
      env,
      {},
      { sub: 'user-1', primary_role: 'admin' },
      '/api/admin/models'
    );

    expect(res.status).toBe(200);
    const payload = await res.json();
    expect(payload).toEqual({
      ok: true,
      updates: 0,
      attachment_updates: 1,
      access_updates: [
        {
          model_id: 'openai/env-openai-0:gemini-2.5-flash',
          rules: [],
        },
      ],
    });
    expect(batch).toHaveBeenCalledTimes(1);
    expect(prepare).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO app_config'),
      expect.arrayContaining(['model_attachment_caps_v1', expect.any(String)])
    );
    expect(prepare).toHaveBeenCalledWith(
      expect.stringContaining('DELETE FROM model_acl_rules'),
      expect.arrayContaining(['openai/env-openai-0:gemini-2.5-flash'])
    );
  });

  it('rejects model ACL updates unless the user has admin.rbac.admin', async () => {
    const env = { DB: {} };
    mocks.authorize.mockClear();
    const batch = vi.fn().mockResolvedValue(undefined);
    const prepare = vi.fn((sql, params = []) => ({
      sql,
      params,
      bind: (...bindArgs) => ({ sql, params: bindArgs }),
    }));
    mocks.createDB.mockReturnValue({
      all: vi.fn(async (sql) => {
        if (String(sql).includes('SELECT model_id, is_enabled FROM model_access')) {
          return [{ model_id: 'openai/env-openai-0:gemini-2.5-flash', is_enabled: 1 }];
        }
        if (String(sql).includes('FROM groups')) {
          return [
            {
              id: 'g1',
              name: 'Team Alpha',
              description: 'Core team',
              is_system: 0,
              created_at: 1,
              updated_at: 1,
            },
          ];
        }
        return [];
      }),
      batch,
      prepare,
      run: vi.fn().mockResolvedValue(undefined),
      first: vi.fn().mockResolvedValue({ value: '{}' }),
    });
    mocks.authorize
      .mockResolvedValueOnce({ allow: true })
      .mockResolvedValueOnce({ allow: false, reason: 'missing_permission', code: 'forbidden' });

    const res = await modelsRouter(
      makeReq('/api/admin/models', 'PUT', {
        access_updates: [
          {
            modelId: 'openai/env-openai-0:gemini-2.5-flash',
            rules: [],
          },
        ],
      }),
      env,
      {},
      { sub: 'user-1', primary_role: 'member' },
      '/api/admin/models'
    );

    expect(res.status).toBe(403);
    expect(await res.text()).toContain('missing_permission');
    expect(batch).not.toHaveBeenCalled();
    expect(mocks.authorize).toHaveBeenCalledTimes(2);
    expect(mocks.authorize).toHaveBeenNthCalledWith(
      1,
      env,
      { sub: 'user-1', primary_role: 'member' },
      { action: 'model.admin', resource: 'model' }
    );
    expect(mocks.authorize).toHaveBeenNthCalledWith(
      2,
      env,
      { sub: 'user-1', primary_role: 'member' },
      { action: 'admin.rbac.admin', resource: 'model' }
    );
  });
});
