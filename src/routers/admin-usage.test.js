import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  createDB: vi.fn(),
  authorize: vi.fn(),
  logAuditEvent: vi.fn(),
  getConfigBool: vi.fn(),
  getConfigValue: vi.fn(),
  setConfigValue: vi.fn(),
  getAllOpenAIConnectionConfigs: vi.fn(),
  buildConnectionHeaders: vi.fn(),
  discoverConnectionModels: vi.fn(),
  mcpRequest: vi.fn(),
  mcpNotify: vi.fn(),
  isSafeOutboundUrl: vi.fn(() => ({ safe: true })),
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
  setConfigValue: (...args) => mocks.setConfigValue(...args),
}));
vi.mock('../llm/connections.js', () => ({
  buildConnectionHeaders: (...args) => mocks.buildConnectionHeaders(...args),
  discoverConnectionModels: (...args) => mocks.discoverConnectionModels(...args),
  ensureConnectionId: (conn, index = 0) => conn?.id || `conn-${index}`,
  extractConnectionModelId: vi.fn((item) => item?.id || item?.model || item?.name || ''),
  getAllOpenAIConnectionConfigs: (...args) => mocks.getAllOpenAIConnectionConfigs(...args),
  getConnectionApiType: vi.fn(() => 'chat-completions'),
  getConnectionDefaultBaseUrl: vi.fn(() => 'https://api.openai.com/v1'),
  isConnectionUrlRequired: vi.fn(() => false),
  normalizeConnectionManualModels: (value) => value || [],
  normalizeProviderFamily: vi.fn(() => 'openai'),
}));
vi.mock('../mcp/client.js', () => ({
  MCP_PROTOCOL_VERSION: '2024-11-05',
  mcpNotify: (...args) => mocks.mcpNotify(...args),
  mcpRequest: (...args) => mocks.mcpRequest(...args),
}));
vi.mock('../utils/validation.js', () => ({
  isSafeOutboundUrl: (...args) => mocks.isSafeOutboundUrl(...args),
}));
vi.mock('../admin/tool-servers.js', () => ({
  buildAuthorizationUrl: vi.fn(),
  discoverAuthorizationMetadata: vi.fn(),
  isValidHttpUrl: vi.fn(() => true),
  loadToolServers: vi.fn(),
  mergeToolServer: vi.fn(),
  mergeToolSpecs: vi.fn(),
  normalizeAuthType: vi.fn(),
  normalizeAttachmentCaps: vi.fn(),
  normalizeBaseUrl: vi.fn(),
  normalizeHeaders: vi.fn(),
  normalizeModelId: vi.fn(),
  normalizeTokenAuthMethod: vi.fn(),
  parseHeadersForRequest: vi.fn(() => ({})),
  randomString: vi.fn(() => 'test-random'),
  redactToolServer: vi.fn(),
  saveToolServers: vi.fn(),
  selectTokenAuthMethod: vi.fn(),
  sha256Base64Url: vi.fn(() => 'test-hash'),
}));
vi.mock('../../public/js/shared/utils/connection-model-selection.js', () => ({
  normalizeConnectionModelSelectionMode: vi.fn(() => 'all'),
}));
vi.mock('../utils/connection-acl.js', () => ({
  buildConnectionAclRuleSaveStatements: vi.fn(() => ({ statements: [] })),
  loadConnectionAclRules: vi.fn(() => []),
  normalizeConnectionAclRule: vi.fn(),
  saveConnectionAclRulesForConnection: vi.fn(() => []),
}));
vi.mock('../utils/tool-server-acl.js', () => ({
  buildToolServerAclRuleSaveStatements: vi.fn(() => ({ statements: [] })),
  loadToolServerAclRules: vi.fn(() => []),
  normalizeToolServerAclRule: vi.fn(),
  saveToolServerAclRulesForToolServer: vi.fn(() => []),
}));

import { adminRouter } from './admin.js';

function makeReq(path, method = 'GET') {
  return new Request(`https://example.com${path}`, { method });
}

/**
 * Creates a mock DB that supports db.batch() for the usage endpoint.
 * Returns D1-style batch results: [{results: [{count: N}]}, {results: [{day, count}]}]
 */
function makeMockDb(o = {}) {
  const batchResults = [
    { results: [{ count: o.totalUsers ?? 10 }] }, // 0: total users
    { results: [{ count: o.activeUsers7d ?? 5 }] }, // 1: active 7d
    { results: [{ count: o.activeUsers30d ?? 8 }] }, // 2: active 30d
    { results: [{ count: o.prevActiveUsers7d ?? 3 }] }, // 3: prev active 7d
    { results: [{ count: o.prevActiveUsers30d ?? 6 }] }, // 4: prev active 30d
    { results: o.dailyMessages ?? [{ day: '2026-05-19', count: 42 }] }, // 5: daily messages
    { results: o.weeklyMessages ?? [{ week: '2026-W20', count: 150 }] }, // 6: weekly messages
    { results: [{ count: o.prevDailyTotal ?? 30 }] }, // 7: prev daily total
    { results: [{ count: o.prevWeeklyTotal ?? 120 }] }, // 8: prev weekly total
    { results: [{ count: o.sparks30d ?? 25 }] }, // 9: sparks 30d
    { results: [{ count: o.prevSparks30d ?? 20 }] }, // 10: prev sparks 30d
    { results: [{ count: o.totalSparks ?? 100 }] }, // 11: total sparks
  ];
  return {
    prepare: vi.fn(() => ({ bind: vi.fn() })), // stub for .prepare().bind() in batch array
    batch: vi.fn(() => Promise.resolve(batchResults)),
  };
}

describe('adminRouter GET /api/admin/usage', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.authorize.mockResolvedValue({ allow: true });
    mocks.logAuditEvent.mockResolvedValue(undefined);
    mocks.getConfigBool.mockResolvedValue(true);
    mocks.getConfigValue.mockResolvedValue('[]');
    mocks.setConfigValue.mockResolvedValue(undefined);
    mocks.getAllOpenAIConnectionConfigs.mockResolvedValue([]);
    mocks.buildConnectionHeaders.mockReturnValue({});
    mocks.discoverConnectionModels.mockResolvedValue({ items: [], url: '' });
  });

  it('returns 403 when authorization fails', async () => {
    mocks.authorize.mockResolvedValue({ allow: false, reason: 'Forbidden' });
    const db = makeMockDb();
    mocks.createDB.mockReturnValue(db);
    const res = await adminRouter(
      makeReq('/api/admin/usage'),
      {},
      {},
      { sub: 'user-1' },
      '/api/admin/usage'
    );
    expect(res.status).toBe(403);
  });

  it('returns usage metrics with correct structure', async () => {
    const db = makeMockDb();
    mocks.createDB.mockReturnValue(db);
    const res = await adminRouter(
      makeReq('/api/admin/usage'),
      {},
      {},
      { sub: 'admin-1' },
      '/api/admin/usage'
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty('users');
    expect(body).toHaveProperty('messages');
    expect(body).toHaveProperty('sparks');
    expect(body.users).toHaveProperty('total');
    expect(body.users).toHaveProperty('active_7d');
    expect(body.users).toHaveProperty('active_30d');
    expect(body.users).toHaveProperty('prev_active_7d');
    expect(body.users).toHaveProperty('prev_active_30d');
    expect(body.messages).toHaveProperty('daily');
    expect(body.messages).toHaveProperty('weekly');
    expect(body.messages).toHaveProperty('daily_total');
    expect(body.messages).toHaveProperty('prev_daily_total');
    expect(body.messages).toHaveProperty('weekly_total');
    expect(body.messages).toHaveProperty('prev_weekly_total');
    expect(body.sparks).toHaveProperty('total');
    expect(body.sparks).toHaveProperty('last_30d');
    expect(body.sparks).toHaveProperty('prev_30d');
  });

  it('returns numeric values for user metrics', async () => {
    const db = makeMockDb({
      totalUsers: 42,
      activeUsers7d: 10,
      activeUsers30d: 25,
    });
    mocks.createDB.mockReturnValue(db);
    const res = await adminRouter(
      makeReq('/api/admin/usage'),
      {},
      {},
      { sub: 'admin-1' },
      '/api/admin/usage'
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.users.total).toBe(42);
    expect(typeof body.users.active_7d).toBe('number');
    expect(typeof body.users.active_30d).toBe('number');
  });

  it('returns array data for daily and weekly messages', async () => {
    const db = makeMockDb({
      dailyMessages: [
        { day: '2026-05-19', count: 42 },
        { day: '2026-05-18', count: 30 },
      ],
      weeklyMessages: [{ week: '2026-W20', count: 150 }],
    });
    mocks.createDB.mockReturnValue(db);
    const res = await adminRouter(
      makeReq('/api/admin/usage'),
      {},
      {},
      { sub: 'admin-1' },
      '/api/admin/usage'
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body.messages.daily)).toBe(true);
    expect(Array.isArray(body.messages.weekly)).toBe(true);
  });

  it('calls db.batch with 12 statements for single round-trip', async () => {
    const db = makeMockDb();
    mocks.createDB.mockReturnValue(db);
    await adminRouter(makeReq('/api/admin/usage'), {}, {}, { sub: 'admin-1' }, '/api/admin/usage');
    expect(db.batch).toHaveBeenCalledTimes(1);
    const statements = db.batch.mock.calls[0][0];
    expect(statements.length).toBe(12);
  });

  it('returns 500 when database queries fail', async () => {
    const db = {
      prepare: vi.fn(() => ({
        bind: vi.fn(() => ({})),
      })),
      batch: vi.fn(async () => {
        throw new Error('Database error');
      }),
    };
    mocks.createDB.mockReturnValue(db);
    const res = await adminRouter(
      makeReq('/api/admin/usage'),
      {},
      {},
      { sub: 'admin-1' },
      '/api/admin/usage'
    );
    expect(res.status).toBe(500);
  });

  it('returns null for unrecognized admin paths', async () => {
    mocks.createDB.mockReturnValue(makeMockDb());
    const res = await adminRouter(
      makeReq('/api/admin/nonexistent'),
      {},
      {},
      { sub: 'admin-1' },
      '/api/admin/nonexistent'
    );
    expect(res).toBeNull();
  });
});
