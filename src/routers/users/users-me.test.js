import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  createDB: vi.fn(),
  getConfigValue: vi.fn(),
  resolvePermissions: vi.fn(),
  getUserRoles: vi.fn(),
  loadPrimaryRole: vi.fn(),
  normalizePublicRole: vi.fn(),
  buildUserProfileResponse: vi.fn(),
  buildSelfProfileUpdate: vi.fn(),
}));

vi.mock('../../db.js', () => ({
  createDB: (...args) => mocks.createDB(...args),
}));

vi.mock('../../utils/app-config.js', () => ({
  getConfigValue: (...args) => mocks.getConfigValue(...args),
}));

vi.mock('../../utils/authorize.js', () => ({
  resolvePermissions: (...args) => mocks.resolvePermissions(...args),
  getUserRoles: (...args) => mocks.getUserRoles(...args),
}));

vi.mock('../../utils/user-role.js', () => ({
  loadPrimaryRole: (...args) => mocks.loadPrimaryRole(...args),
  normalizePublicRole: (...args) => mocks.normalizePublicRole(...args),
}));

vi.mock('../user-profile.js', () => ({
  buildUserProfileResponse: (...args) => mocks.buildUserProfileResponse(...args),
  buildSelfProfileUpdate: (...args) => mocks.buildSelfProfileUpdate(...args),
}));

vi.mock('../../errors/http-errors.js', () => ({
  ValidationError: class extends Error {
    constructor(msg) {
      super(msg);
    }
  },
  isHttpError: vi.fn(() => false),
  toHttpErrorPayload: vi.fn(),
}));

import { handleUsersMe } from './users-me.js';

function makeReq(path, method, body) {
  const init = { method, headers: {} };
  if (body !== undefined) {
    init.body = typeof body === 'string' ? body : JSON.stringify(body);
    init.headers['Content-Type'] = 'application/json';
  }
  return new Request(`https://example.com${path}`, init);
}

describe('handleUsersMe', () => {
  const user = { sub: 'u1' };
  const env = { DB: {} };
  const ctx = {};
  const db = { all: vi.fn(), run: vi.fn(), first: vi.fn() };
  const logger = { error: vi.fn(), warn: vi.fn(), info: vi.fn() };

  beforeEach(() => {
    vi.resetAllMocks();
    mocks.createDB.mockReturnValue(db);
    mocks.resolvePermissions.mockResolvedValue(['chat.read']);
    mocks.getUserRoles.mockResolvedValue([{ name: 'member' }]);
    mocks.loadPrimaryRole.mockResolvedValue('member');
    mocks.normalizePublicRole.mockImplementation((r) => r || 'member');
    mocks.getConfigValue.mockResolvedValue(null);
    mocks.buildUserProfileResponse.mockReturnValue({
      user: { id: 'u1', primary_role: 'member' },
      app_config: {},
    });
    mocks.buildSelfProfileUpdate.mockReturnValue({
      updates: ['name = ?'],
      values: ['New'],
      updatedFields: ['name'],
    });
  });

  describe('GET /api/users/me/permissions', () => {
    it('returns resolved permissions', async () => {
      const res = await handleUsersMe({
        req: makeReq('/api/users/me/permissions', 'GET'),
        env: env,
        ctx: ctx,
        user: user,
        path: '/api/users/me/permissions',
        deps: { _db: db, _logger: logger, _requestContext: {} },
      });
      expect(res.status).toBe(200);
      const payload = await res.json();
      expect(payload.permissions).toEqual(['chat.read']);
    });
  });

  describe('GET /api/users/me/roles', () => {
    it('returns user roles', async () => {
      const res = await handleUsersMe({
        req: makeReq('/api/users/me/roles', 'GET'),
        env: env,
        ctx: ctx,
        user: user,
        path: '/api/users/me/roles',
        deps: { _db: db, _logger: logger, _requestContext: {} },
      });
      expect(res.status).toBe(200);
      const payload = await res.json();
      expect(payload.roles).toEqual([{ name: 'member' }]);
    });
  });

  describe('GET /api/users/me', () => {
    it('returns user profile', async () => {
      db.first.mockResolvedValue({
        id: 'u1',
        email: 'u@e.com',
        name: 'User',
        primary_role: 'member',
        account_status: 'active',
        settings: '{}',
        avatar: null,
        avatar_emoji: null,
        status: 'offline',
        preferences: '{}',
        created_at: 1,
        updated_at: 1,
        last_active_at: null,
      });
      const res = await handleUsersMe({
        req: makeReq('/api/users/me', 'GET'),
        env: env,
        ctx: ctx,
        user: user,
        path: '/api/users/me',
        deps: { _db: db, _logger: logger, _requestContext: {} },
      });
      expect(res.status).toBe(200);
    });

    it('returns 404 for missing user row', async () => {
      db.first.mockResolvedValue(null);
      const res = await handleUsersMe({
        req: makeReq('/api/users/me', 'GET'),
        env: env,
        ctx: ctx,
        user: user,
        path: '/api/users/me',
        deps: { _db: db, _logger: logger, _requestContext: {} },
      });
      expect(res.status).toBe(404);
    });

    it('includes permissions and roles with include param', async () => {
      db.first.mockResolvedValue({
        id: 'u1',
        email: 'u@e.com',
        name: 'User',
        primary_role: 'member',
        account_status: 'active',
        settings: '{}',
        avatar: null,
        avatar_emoji: null,
        status: 'offline',
        preferences: '{}',
        created_at: 1,
        updated_at: 1,
        last_active_at: null,
      });
      const res = await handleUsersMe({
        req: makeReq('/api/users/me?include=permissions,roles', 'GET'),
        env: env,
        ctx: ctx,
        user: user,
        path: '/api/users/me',
        deps: { _db: db, _logger: logger, _requestContext: {} },
      });
      expect(res.status).toBe(200);
    });
  });

  describe('PUT /api/users/me', () => {
    it('updates user profile', async () => {
      db.first.mockImplementation(async (sql) => {
        if (sql.includes('SELECT id, email, name'))
          return {
            id: 'u1',
            email: 'u@e.com',
            name: 'Updated',
            account_status: 'active',
            settings: '{}',
            avatar: null,
            avatar_emoji: null,
            status: 'online',
            preferences: '{}',
            created_at: 1,
            updated_at: 2,
            last_active_at: null,
          };
        return null;
      });
      db.run.mockResolvedValue(undefined);
      const res = await handleUsersMe({
        req: makeReq('/api/users/me', 'PUT', { name: 'Updated' }),
        env: env,
        ctx: ctx,
        user: user,
        path: '/api/users/me',
        deps: { _db: db, _logger: logger, _requestContext: {} },
      });
      expect(res.status).toBe(200);
    });

    it('handles validation error', async () => {
      const { ValidationError } = await import('../../errors/http-errors.js');
      mocks.buildSelfProfileUpdate.mockImplementation(() => {
        throw new ValidationError('bad input');
      });
      const res = await handleUsersMe({
        req: makeReq('/api/users/me', 'PUT', { name: '' }),
        env: env,
        ctx: ctx,
        user: user,
        path: '/api/users/me',
        deps: { _db: db, _logger: logger, _requestContext: {} },
      });
      expect(res.status).toBe(400);
    });
  });

  describe('POST /api/users/me/update', () => {
    it('updates profile without settings', async () => {
      db.first.mockImplementation(async (sql) => {
        if (sql.includes('SELECT id, email, name'))
          return {
            id: 'u1',
            email: 'u@e.com',
            name: 'Updated',
            account_status: 'active',
            settings: '{}',
            avatar: null,
            avatar_emoji: null,
            status: 'online',
            preferences: '{}',
            created_at: 1,
            updated_at: 2,
            last_active_at: null,
          };
        return null;
      });
      db.run.mockResolvedValue(undefined);
      const res = await handleUsersMe({
        req: makeReq('/api/users/me/update', 'POST', { name: 'Updated' }),
        env: env,
        ctx: ctx,
        user: user,
        path: '/api/users/me/update',
        deps: { _db: db, _logger: logger, _requestContext: {} },
      });
      expect(res.status).toBe(200);
    });
  });

  describe('pending account_status', () => {
    const pendingUser = { sub: 'u1', account_status: 'pending' };

    it('rejects GET /api/users/me with 403', async () => {
      const res = await handleUsersMe({
        req: makeReq('/api/users/me', 'GET'),
        env: env,
        ctx: ctx,
        user: pendingUser,
        path: '/api/users/me',
        deps: { _db: db, _logger: logger, _requestContext: {} },
      });
      expect(res.status).toBe(403);
      const payload = await res.json();
      expect(payload.error).toBe('Account pending approval.');
    });

    it('rejects GET /api/users/me/permissions with 403', async () => {
      const res = await handleUsersMe({
        req: makeReq('/api/users/me/permissions', 'GET'),
        env: env,
        ctx: ctx,
        user: pendingUser,
        path: '/api/users/me/permissions',
        deps: { _db: db, _logger: logger, _requestContext: {} },
      });
      expect(res.status).toBe(403);
    });

    it('rejects GET /api/users/me/roles with 403', async () => {
      const res = await handleUsersMe({
        req: makeReq('/api/users/me/roles', 'GET'),
        env: env,
        ctx: ctx,
        user: pendingUser,
        path: '/api/users/me/roles',
        deps: { _db: db, _logger: logger, _requestContext: {} },
      });
      expect(res.status).toBe(403);
    });

    it('rejects PUT /api/users/me with 403', async () => {
      const res = await handleUsersMe({
        req: makeReq('/api/users/me', 'PUT', { name: 'Updated' }),
        env: env,
        ctx: ctx,
        user: pendingUser,
        path: '/api/users/me',
        deps: { _db: db, _logger: logger, _requestContext: {} },
      });
      expect(res.status).toBe(403);
    });

    it('rejects POST /api/users/me/update with 403', async () => {
      const res = await handleUsersMe({
        req: makeReq('/api/users/me/update', 'POST', { name: 'Updated' }),
        env: env,
        ctx: ctx,
        user: pendingUser,
        path: '/api/users/me/update',
        deps: { _db: db, _logger: logger, _requestContext: {} },
      });
      expect(res.status).toBe(403);
    });
  });

  it('returns null for unrecognized paths', async () => {
    const result = await handleUsersMe({
      req: makeReq('/api/unknown', 'GET'),
      env: env,
      ctx: ctx,
      user: user,
      path: '/api/unknown',
      deps: { _db: db, _logger: logger, _requestContext: {} },
    });
    expect(result).toBeNull();
  });
});
