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

function makeReq(path, method, bodyOrHeaders, headers = {}) {
  const hasExplicitHeaders = arguments.length >= 4;
  const init = { method, headers };
  const shouldTreatAsHeaders =
    !hasExplicitHeaders && method === 'GET' && bodyOrHeaders && typeof bodyOrHeaders === 'object' && !Array.isArray(bodyOrHeaders);

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
            { id: 'g1', name: 'Team Alpha', description: 'Core team', is_system: 0, created_at: 1, updated_at: 1 },
            { id: 'g2', name: 'Team Beta', description: 'Review team', is_system: 0, created_at: 1, updated_at: 1 },
          ];
        }
        if (String(sql).includes('FROM model_acl_rules')) {
          return [{
            id: 'rule-1',
            model_id: 'gpt-5-mini',
            principal_type: 'group',
            principal_id: 'g2',
            effect: 'allow',
            action: 'use',
            created_at: 1,
            updated_at: 1,
          }];
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
        return [{
          id: 'rule-1',
          model_id: 'openai/env-openai-0:deepseek-v3.2',
          principal_type: 'group',
          principal_id: 'g1',
          effect: 'allow',
          action: 'use',
          created_at: 1,
          updated_at: 1,
        }];
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
        return [{
          id: 'rule-1',
          model_id: 'openai%2Fenv-openai-0%3Adeepseek-v3.2',
          principal_type: 'group',
          principal_id: 'g1',
          effect: 'allow',
          action: 'use',
          created_at: 1,
          updated_at: 1,
        }];
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
        return [{ id: 'g1', name: 'Team Alpha', description: 'Core team', is_system: 0, created_at: 1, updated_at: 1 }];
      }
      return [];
    });
    mocks.createDB.mockReturnValue({ all, run: vi.fn() });

    const res = await modelsRouter(
      makeReq('/api/admin/models/gpt-5-mini/access', 'PUT', {
        rules: [
          { principal_type: 'group', principal_id: 'g1', effect: 'allow', action: 'use' },
        ],
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
    const prepare = vi.fn((sql, params = []) => ({ sql, params, bind: (...bindArgs) => ({ sql, params: bindArgs }) }));
    const all = vi.fn(async (sql) => {
      if (String(sql).includes('FROM groups')) {
        return [
          { id: 'g1', name: 'Team Alpha', description: 'Core team', is_system: 0, created_at: 1, updated_at: 1 },
          { id: 'g2', name: 'Team Beta', description: 'Review team', is_system: 0, created_at: 1, updated_at: 1 },
          { id: 'g3', name: 'Team Gamma', description: 'Ops team', is_system: 0, created_at: 1, updated_at: 1 },
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
    mocks.createDB.mockReturnValue({ all, batch, prepare, run: vi.fn().mockResolvedValue(undefined) });

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
    expect(prepare).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO model_acl_rules'), expect.any(Array));
  });

  it('decodes encoded model ids when saving access rules', async () => {
    const env = { DB: {} };
    const batch = vi.fn().mockResolvedValue(undefined);
    const prepare = vi.fn((sql, params = []) => ({ sql, params, bind: (...bindArgs) => ({ sql, params: bindArgs }) }));
    const all = vi.fn(async (sql) => {
      if (String(sql).includes('FROM groups')) {
        return [
          { id: 'g1', name: 'Team Alpha', description: 'Core team', is_system: 0, created_at: 1, updated_at: 1 },
        ];
      }
      if (String(sql).includes('FROM model_acl_rules')) {
        return [];
      }
      return [];
    });
    mocks.createDB.mockReturnValue({ all, batch, prepare, run: vi.fn().mockResolvedValue(undefined) });

    const res = await modelsRouter(
      makeReq('/api/admin/models/openai%2Fenv-openai-0%3Adeepseek-v3.2/access', 'PUT', {
        rules: [
          { principal_type: 'group', principal_id: 'g1', effect: 'allow', action: 'use' },
        ],
      }),
      env,
      {},
      { sub: 'user-1' },
      '/api/admin/models/openai%2Fenv-openai-0%3Adeepseek-v3.2/access'
    );

    expect(res.status).toBe(200);
    expect(batch).toHaveBeenCalledTimes(1);
    expect(prepare).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO model_acl_rules'), expect.arrayContaining([
      expect.any(String),
      'openai/env-openai-0:deepseek-v3.2',
      'group',
      'g1',
      'allow',
      'use',
    ]));
  });

  it('updates model access rules in bulk for policies saves', async () => {
    const env = { DB: {} };
    const batch = vi.fn().mockResolvedValue(undefined);
    const prepare = vi.fn((sql, params = []) => ({ sql, params, bind: (...bindArgs) => ({ sql, params: bindArgs }) }));
    const all = vi.fn(async (sql) => {
      if (String(sql).includes('SELECT model_id, is_enabled FROM model_access')) {
        return [
          { model_id: 'm1', is_enabled: 1 },
          { model_id: 'm2', is_enabled: 1 },
        ];
      }
      if (String(sql).includes('FROM groups')) {
        return [
          { id: 'g1', name: 'Team Alpha', description: 'Core team', is_system: 0, created_at: 1, updated_at: 1 },
          { id: 'g2', name: 'Team Beta', description: 'Review team', is_system: 0, created_at: 1, updated_at: 1 },
        ];
      }
      return [];
    });
    mocks.createDB.mockReturnValue({ all, batch, prepare, run: vi.fn().mockResolvedValue(undefined) });

    const res = await modelsRouter(
      makeReq('/api/admin/models/access', 'PUT', {
        updates: [
          {
            model_id: 'm1',
            rules: [{ principal_type: 'group', principal_id: 'g1', effect: 'allow', action: 'use' }],
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
    expect(prepare).toHaveBeenCalledWith(expect.stringContaining('DELETE FROM model_acl_rules'), expect.arrayContaining(['m1']));
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
          { id: 'g1', name: 'Team Alpha', description: 'Core team', is_system: 0, created_at: 1, updated_at: 1 },
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
      if (String(sql).includes('FROM app_config') && String(sql).includes('model_attachment_caps_v1')) {
        return { value: JSON.stringify({}) };
      }
      return null;
    });
    const prepare = vi.fn((sql, params = []) => ({ sql, params, bind: (...bindArgs) => ({ sql, params: bindArgs }) }));
    mocks.createDB.mockReturnValue({ all, first, batch, prepare, run: vi.fn().mockResolvedValue(undefined) });

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
});
