import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  createDB: vi.fn(),
  authorize: vi.fn(),
  resolvePermissions: vi.fn(),
  loadPrimaryRole: vi.fn(),
  loadConnectionAclRules: vi.fn(),
  loadModelAclRules: vi.fn(),
  loadToolServerAclRules: vi.fn(),
  getAllOpenAIConnectionConfigs: vi.fn(),
  loadToolServers: vi.fn(),
  loadModelEnabledMap: vi.fn(),
  loadUserResourceOverrides: vi.fn(),
  normalizeAccountStatus: vi.fn(),
}));

vi.mock('../../db.js', () => ({
  createDB: (...args) => mocks.createDB(...args),
}));

vi.mock('../../utils/authorize.js', () => ({
  authorize: (...args) => mocks.authorize(...args),
  resolvePermissions: (...args) => mocks.resolvePermissions(...args),
}));

vi.mock('../../utils/user-role.js', () => ({
  loadPrimaryRole: (...args) => mocks.loadPrimaryRole(...args),
}));

vi.mock('../../utils/connection-acl.js', () => ({
  loadConnectionAclRules: (...args) => mocks.loadConnectionAclRules(...args),
}));

vi.mock('../../utils/model-acl.js', () => ({
  loadModelAclRules: (...args) => mocks.loadModelAclRules(...args),
}));

vi.mock('../../utils/tool-server-acl.js', () => ({
  loadToolServerAclRules: (...args) => mocks.loadToolServerAclRules(...args),
}));

vi.mock('../../llm/connections.js', () => ({
  getAllOpenAIConnectionConfigs: (...args) => mocks.getAllOpenAIConnectionConfigs(...args),
}));

vi.mock('../../admin/tool-servers.js', () => ({
  loadToolServers: (...args) => mocks.loadToolServers(...args),
}));

vi.mock('../../../public/js/shared/utils/user-resource-overrides.js', () => ({
  loadUserResourceOverrides: (...args) => mocks.loadUserResourceOverrides(...args),
}));

vi.mock('./users-helpers.js', () => ({
  loadModelEnabledMap: (...args) => mocks.loadModelEnabledMap(...args),
  normalizeAccountStatus: (...args) => mocks.normalizeAccountStatus(...args),
}));

import { handleUsersAdminAccess } from './users-admin-access.js';

function makeReq(path, method) {
  return new Request(`https://example.com${path}`, { method });
}

describe('handleUsersAdminAccess', () => {
  const user = { sub: 'admin-1' };
  const env = { DB: {} };
  const ctx = {};
  const db = {
    all: vi.fn(),
    run: vi.fn(),
    first: vi.fn(),
  };
  const logger = { error: vi.fn(), warn: vi.fn(), info: vi.fn() };

  beforeEach(() => {
    vi.resetAllMocks();
    mocks.createDB.mockReturnValue(db);
    mocks.authorize.mockResolvedValue({ allow: true });
    mocks.resolvePermissions.mockResolvedValue(['chat.read', 'chat.write']);
    mocks.loadPrimaryRole.mockResolvedValue('member');
    mocks.loadConnectionAclRules.mockResolvedValue([]);
    mocks.loadModelAclRules.mockResolvedValue([]);
    mocks.loadToolServerAclRules.mockResolvedValue([]);
    mocks.getAllOpenAIConnectionConfigs.mockResolvedValue([]);
    mocks.loadToolServers.mockResolvedValue([]);
    mocks.loadModelEnabledMap.mockResolvedValue(new Map());
    mocks.loadUserResourceOverrides.mockResolvedValue({});
    mocks.normalizeAccountStatus.mockReturnValue('active');
  });

  describe('GET /api/admin/users/:id/access', () => {
    it('rejects unauthorized access', async () => {
      mocks.authorize.mockResolvedValue({ allow: false, reason: 'Forbidden' });
      const res = await handleUsersAdminAccess(
        makeReq('/api/admin/users/u1/access', 'GET'),
        env,
        ctx,
        user,
        '/api/admin/users/u1/access',
        { _db: db, logger, _requestContext: {} }
      );
      expect(res.status).toBe(403);
    });

    it('returns 404 for non-existent user', async () => {
      db.first.mockResolvedValue(null);
      const res = await handleUsersAdminAccess(
        makeReq('/api/admin/users/nonexistent/access', 'GET'),
        env,
        ctx,
        user,
        '/api/admin/users/nonexistent/access',
        { _db: db, logger, _requestContext: {} }
      );
      expect(res.status).toBe(404);
    });

    it('returns user access info', async () => {
      db.first.mockResolvedValue({
        id: 'u1',
        email: 'user@example.com',
        name: 'User',
        account_status: 'active',
      });
      db.all.mockImplementation(async (sql, _params) => {
        if (sql.includes('group_members'))
          return [{ group_id: 'g1', name: 'Core', description: 'Core team', is_system: 0 }];
        return [];
      });
      const res = await handleUsersAdminAccess(
        makeReq('/api/admin/users/u1/access', 'GET'),
        env,
        ctx,
        user,
        '/api/admin/users/u1/access',
        { _db: db, logger, _requestContext: {} }
      );
      expect(res.status).toBe(200);
      const payload = await res.json();
      expect(payload.user.id).toBe('u1');
      expect(payload.user.account_status).toBe('active');
      expect(payload.access).toBeDefined();
    });

    it('returns 500 on error', async () => {
      db.first.mockRejectedValue(new Error('DB fail'));
      const res = await handleUsersAdminAccess(
        makeReq('/api/admin/users/u1/access', 'GET'),
        env,
        ctx,
        user,
        '/api/admin/users/u1/access',
        { _db: db, logger, _requestContext: {} }
      );
      expect(res.status).toBe(500);
    });
  });

  it('returns null for non-matching paths', async () => {
    const result = await handleUsersAdminAccess(
      makeReq('/api/admin/users', 'GET'),
      env,
      ctx,
      user,
      '/api/admin/users',
      { _db: db, logger, _requestContext: {} }
    );
    expect(result).toBeNull();
  });
});
