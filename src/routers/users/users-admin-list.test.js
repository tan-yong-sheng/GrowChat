import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  createDB: vi.fn(),
  authorize: vi.fn(),
  logAuditEvent: vi.fn(),
  normalizeAccountStatus: vi.fn(),
  normalizeRole: vi.fn(),
  parseSettings: vi.fn(),
  parsePagination: vi.fn(),
}));

vi.mock('../../db.js', () => ({
  createDB: (...args) => mocks.createDB(...args),
}));

vi.mock('../../utils/authorize.js', () => ({
  authorize: (...args) => mocks.authorize(...args),
  logAuditEvent: (...args) => mocks.logAuditEvent(...args),
}));

vi.mock('../../validation/request.js', () => ({
  parsePagination: (...args) => mocks.parsePagination(...args),
}));

vi.mock('./users-helpers.js', () => ({
  normalizeAccountStatus: (...args) => mocks.normalizeAccountStatus(...args),
  normalizeRole: (...args) => mocks.normalizeRole(...args),
  parseSettings: (...args) => mocks.parseSettings(...args),
}));

import { handleUsersAdminList } from './users-admin-list.js';

function makeReq(path, method) {
  return new Request(`https://example.com${path}`, { method });
}

describe('handleUsersAdminList', () => {
  const user = { sub: 'admin-1' };
  const env = { DB: {} };
  const ctx = {};
  const db = { all: vi.fn(), run: vi.fn(), first: vi.fn() };
  const logger = { error: vi.fn(), warn: vi.fn(), info: vi.fn() };

  beforeEach(() => {
    vi.resetAllMocks();
    mocks.createDB.mockReturnValue(db);
    mocks.authorize.mockResolvedValue({ allow: true });
    mocks.logAuditEvent.mockResolvedValue(undefined);
    mocks.normalizeAccountStatus.mockReturnValue('active');
    mocks.normalizeRole.mockImplementation((r) => r || 'member');
    mocks.parseSettings.mockReturnValue({});
    mocks.parsePagination.mockReturnValue({ limit: 20, offset: 0 });
  });

  describe('GET /api/admin/users', () => {
    it('rejects unauthorized', async () => {
      mocks.authorize.mockResolvedValue({ allow: false, reason: 'no' });
      const res = await handleUsersAdminList(
        makeReq('/api/admin/users', 'GET'),
        env, ctx, user, '/api/admin/users',
        { _db: db, logger, _requestContext: {} },
      );
      expect(res.status).toBe(403);
    });

    it('returns paginated user list', async () => {
      db.first.mockResolvedValue({ count: 1 });
      db.all.mockResolvedValue([
        { id: 'u1', email: 'u@e.com', name: 'User', primary_role: 'member', account_status: 'active', settings: '{}', created_at: 1, updated_at: 1, last_active_at: null },
      ]);
      const res = await handleUsersAdminList(
        makeReq('/api/admin/users', 'GET'),
        env, ctx, user, '/api/admin/users',
        { _db: db, logger, _requestContext: {} },
      );
      expect(res.status).toBe(200);
      const payload = await res.json();
      expect(payload.users).toHaveLength(1);
      expect(payload.total).toBe(1);
      expect(mocks.logAuditEvent).toHaveBeenCalled();
    });

    it('supports search query', async () => {
      db.first.mockResolvedValue({ count: 0 });
      db.all.mockResolvedValue([]);
      const res = await handleUsersAdminList(
        makeReq('/api/admin/users?q=test', 'GET'),
        env, ctx, user, '/api/admin/users',
        { _db: db, logger, _requestContext: {} },
      );
      expect(res.status).toBe(200);
    });

    it('returns 500 on error', async () => {
      db.first.mockRejectedValue(new Error('fail'));
      const res = await handleUsersAdminList(
        makeReq('/api/admin/users', 'GET'),
        env, ctx, user, '/api/admin/users',
        { _db: db, logger, _requestContext: {} },
      );
      expect(res.status).toBe(500);
    });
  });

  it('returns null for non-matching paths', async () => {
    const result = await handleUsersAdminList(
      makeReq('/api/admin/users/u1', 'GET'),
      env, ctx, user, '/api/admin/users/u1',
      { _db: db, logger, _requestContext: {} },
    );
    expect(result).toBeNull();
  });
});
