import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  createDB: vi.fn(),
  ensureAdminAclAccess: vi.fn(),
  logAuditEvent: vi.fn(),
  getAllOpenAIConnectionConfigs: vi.fn(),
  normalizeProviderFamily: vi.fn(),
  isConnectionUrlRequired: vi.fn(),
  getConnectionDefaultBaseUrl: vi.fn(),
  getConnectionApiType: vi.fn(),
  isSafeOutboundUrl: vi.fn(),
  isValidHttpUrl: vi.fn(),
  normalizeHeaders: vi.fn(),
  normalizeConnectionManualModels: vi.fn(),
  normalizeConnectionModelSelectionMode: vi.fn(),
  normalizeConnectionAclRule: vi.fn(),
}));

vi.mock('../../db.js', () => ({
  createDB: (...args) => mocks.createDB(...args),
}));

vi.mock('../../utils/authorize.js', () => ({
  logAuditEvent: (...args) => mocks.logAuditEvent(...args),
}));

vi.mock('../../llm/connections.js', () => ({
  getAllOpenAIConnectionConfigs: (...args) => mocks.getAllOpenAIConnectionConfigs(...args),
  getConnectionApiType: (...args) => mocks.getConnectionApiType(...args),
  getConnectionDefaultBaseUrl: (...args) => mocks.getConnectionDefaultBaseUrl(...args),
  isConnectionUrlRequired: (...args) => mocks.isConnectionUrlRequired(...args),
  normalizeConnectionManualModels: (...args) => mocks.normalizeConnectionManualModels(...args),
}));

vi.mock('../../llm/provider-registry.js', () => ({
  normalizeProviderFamily: (...args) => mocks.normalizeProviderFamily(...args),
}));

vi.mock('../../../public/js/shared/utils/connection-model-selection.js', () => ({
  normalizeConnectionModelSelectionMode: (...args) =>
    mocks.normalizeConnectionModelSelectionMode(...args),
}));

vi.mock('../../utils/validation.js', () => ({
  isSafeOutboundUrl: (...args) => mocks.isSafeOutboundUrl(...args),
}));

vi.mock('../../utils/connection-acl.js', () => ({
  normalizeConnectionAclRule: (...args) => mocks.normalizeConnectionAclRule(...args),
}));

vi.mock('../../admin/tool-servers.js', () => ({
  isValidHttpUrl: (...args) => mocks.isValidHttpUrl(...args),
  normalizeHeaders: (...args) => mocks.normalizeHeaders(...args),
}));

vi.mock('./admin-helpers.js', () => ({
  ensureAdminAclAccess: (...args) => mocks.ensureAdminAclAccess(...args),
  isValidModelAccessId: vi.fn((id) => !!id && id.length <= 200 && !/\s/.test(id)),
}));

import { handleAdminConnectionsSave } from './admin-connections-save.js';

function makeReq(path, method, body) {
  const init = { method, headers: {} };
  if (body !== undefined) {
    init.body = typeof body === 'string' ? body : JSON.stringify(body);
    init.headers['Content-Type'] = 'application/json';
  }
  return new Request(`https://example.com${path}`, init);
}

describe('handleAdminConnectionsSave', () => {
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
    mocks.getAllOpenAIConnectionConfigs.mockResolvedValue([]);
    mocks.normalizeProviderFamily.mockReturnValue('openai');
    mocks.isConnectionUrlRequired.mockReturnValue(false);
    mocks.getConnectionDefaultBaseUrl.mockReturnValue('https://api.openai.com/v1');
    mocks.getConnectionApiType.mockReturnValue('chat-completions');
    mocks.isSafeOutboundUrl.mockReturnValue({ safe: true });
    mocks.isValidHttpUrl.mockReturnValue(true);
    mocks.normalizeHeaders.mockReturnValue('');
    mocks.normalizeConnectionManualModels.mockReturnValue([]);
    mocks.normalizeConnectionModelSelectionMode.mockReturnValue('all');
    mocks.normalizeConnectionAclRule.mockImplementation((rule) => ({
      ...rule,
      principal_type: 'group',
    }));
    db.all.mockResolvedValue([]);
    db.batch.mockResolvedValue(undefined);
  });

  it('rejects ACL denied', async () => {
    mocks.ensureAdminAclAccess.mockResolvedValue({ allow: false, reason: 'no' });
    const res = await handleAdminConnectionsSave(
      makeReq('/api/admin/openai/connections', 'PUT', { connections: [] }),
      env,
      ctx,
      user,
      '/api/admin/openai/connections',
      { db, logger, _requestContext: {} }
    );
    expect(res.status).toBe(403);
  });

  it('rejects too many connections (>100)', async () => {
    const connections = Array.from({ length: 101 }, (_, i) => ({
      id: `c${i}`,
      name: `C${i}`,
      providerType: 'openai',
      url: 'https://example.com',
    }));
    const res = await handleAdminConnectionsSave(
      makeReq('/api/admin/openai/connections', 'PUT', { connections }),
      env,
      ctx,
      user,
      '/api/admin/openai/connections',
      { db, logger, _requestContext: {} }
    );
    expect(res.status).toBe(400);
  });

  it('rejects too many model updates (>500)', async () => {
    const model_updates = Array.from({ length: 501 }, (_, i) => ({
      id: `model-${i}`,
      enabled: true,
    }));
    const res = await handleAdminConnectionsSave(
      makeReq('/api/admin/openai/connections', 'PUT', { connections: [], model_updates }),
      env,
      ctx,
      user,
      '/api/admin/openai/connections',
      { db, logger, _requestContext: {} }
    );
    expect(res.status).toBe(400);
  });

  it('rejects invalid provider type', async () => {
    const res = await handleAdminConnectionsSave(
      makeReq('/api/admin/openai/connections', 'PUT', {
        connections: [
          { id: 'c1', name: 'Bad', providerType: 'invalid-provider', url: 'https://example.com' },
        ],
      }),
      env,
      ctx,
      user,
      '/api/admin/openai/connections',
      { db, logger, _requestContext: {} }
    );
    expect(res.status).toBe(400);
  });

  it('rejects invalid URL', async () => {
    mocks.isValidHttpUrl.mockReturnValue(false);
    const res = await handleAdminConnectionsSave(
      makeReq('/api/admin/openai/connections', 'PUT', {
        connections: [{ id: 'c1', name: 'Bad', providerType: 'openai', url: 'not-url' }],
      }),
      env,
      ctx,
      user,
      '/api/admin/openai/connections',
      { db, logger, _requestContext: {} }
    );
    expect(res.status).toBe(400);
  });

  it('rejects unsafe URL', async () => {
    mocks.isSafeOutboundUrl.mockReturnValue({ safe: false, reason: 'blocked' });
    const res = await handleAdminConnectionsSave(
      makeReq('/api/admin/openai/connections', 'PUT', {
        connections: [
          { id: 'c1', name: 'Bad', providerType: 'openai', url: 'https://evil.com/v1' },
        ],
      }),
      env,
      ctx,
      user,
      '/api/admin/openai/connections',
      { db, logger, _requestContext: {} }
    );
    expect(res.status).toBe(400);
  });

  it('requires URL for compatible providers', async () => {
    mocks.isConnectionUrlRequired.mockReturnValue(true);
    const res = await handleAdminConnectionsSave(
      makeReq('/api/admin/openai/connections', 'PUT', {
        connections: [{ id: 'c1', name: 'No URL', providerType: 'openai-compatible', url: '' }],
      }),
      env,
      ctx,
      user,
      '/api/admin/openai/connections',
      { db, logger, _requestContext: {} }
    );
    expect(res.status).toBe(400);
  });

  it('rejects API key too long', async () => {
    const res = await handleAdminConnectionsSave(
      makeReq('/api/admin/openai/connections', 'PUT', {
        connections: [
          {
            id: 'c1',
            name: 'Long Key',
            providerType: 'openai',
            url: 'https://example.com',
            key: 'x'.repeat(4097),
          },
        ],
      }),
      env,
      ctx,
      user,
      '/api/admin/openai/connections',
      { db, logger, _requestContext: {} }
    );
    expect(res.status).toBe(400);
  });

  it('rejects headers too long', async () => {
    mocks.normalizeHeaders.mockReturnValue('x'.repeat(4097));
    const res = await handleAdminConnectionsSave(
      makeReq('/api/admin/openai/connections', 'PUT', {
        connections: [
          { id: 'c1', name: 'Long Headers', providerType: 'openai', url: 'https://example.com' },
        ],
      }),
      env,
      ctx,
      user,
      '/api/admin/openai/connections',
      { db, logger, _requestContext: {} }
    );
    expect(res.status).toBe(400);
  });

  it('saves valid connections', async () => {
    const res = await handleAdminConnectionsSave(
      makeReq('/api/admin/openai/connections', 'PUT', {
        enabled: true,
        connections: [
          {
            id: 'c1',
            name: 'OpenAI',
            providerType: 'openai',
            url: 'https://api.openai.com/v1',
            key: 'secret',
          },
        ],
      }),
      env,
      ctx,
      user,
      '/api/admin/openai/connections',
      { db, logger, _requestContext: {} }
    );
    expect(res.status).toBe(200);
    const payload = await res.json();
    expect(payload.ok).toBe(true);
    expect(mocks.logAuditEvent).toHaveBeenCalled();
    expect(db.batch).toHaveBeenCalled();
  });

  it('rejects invalid model id in model_updates', async () => {
    const res = await handleAdminConnectionsSave(
      makeReq('/api/admin/openai/connections', 'PUT', {
        connections: [],
        model_updates: [{ id: '', enabled: true }],
      }),
      env,
      ctx,
      user,
      '/api/admin/openai/connections',
      { db, logger, _requestContext: {} }
    );
    expect(res.status).toBe(400);
  });

  it('rejects disabled connections in access_updates', async () => {
    mocks.getAllOpenAIConnectionConfigs.mockResolvedValue([
      { id: 'c1', name: 'Disabled', enabled: false },
    ]);
    const res = await handleAdminConnectionsSave(
      makeReq('/api/admin/openai/connections', 'PUT', {
        connections: [],
        access_updates: [{ connection_id: 'c1', rules: [] }],
      }),
      env,
      ctx,
      user,
      '/api/admin/openai/connections',
      { db, logger, _requestContext: {} }
    );
    expect(res.status).toBe(409);
  });

  it('rejects invalid JSON body', async () => {
    const res = await handleAdminConnectionsSave(
      new Request('https://example.com/api/admin/openai/connections', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: 'not-json',
      }),
      env,
      ctx,
      user,
      '/api/admin/openai/connections',
      { db, logger, _requestContext: {} }
    );
    expect(res.status).toBe(400);
  });

  it('returns 500 on batch failure', async () => {
    db.batch.mockRejectedValue(new Error('batch fail'));
    const res = await handleAdminConnectionsSave(
      makeReq('/api/admin/openai/connections', 'PUT', {
        connections: [
          { id: 'c1', name: 'OpenAI', providerType: 'openai', url: 'https://api.openai.com/v1' },
        ],
      }),
      env,
      ctx,
      user,
      '/api/admin/openai/connections',
      { db, logger, _requestContext: {} }
    );
    expect(res.status).toBe(500);
  });

  it('returns null for non-matching path', async () => {
    const result = await handleAdminConnectionsSave(
      makeReq('/api/admin/unknown', 'PUT'),
      env,
      ctx,
      user,
      '/api/admin/unknown',
      { db, logger, _requestContext: {} }
    );
    expect(result).toBeNull();
  });
});
