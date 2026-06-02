import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  createDB: vi.fn(),
  authorize: vi.fn(),
  isLastOwnerOfRole: vi.fn(),
  logAuditEvent: vi.fn(),
  loadPrimaryRole: vi.fn(),
  hashPassword: vi.fn(),
  validateEmail: vi.fn(),
  normalizeAccountStatus: vi.fn(),
  resolveRequestedRole: vi.fn(),
  syncGlobalRoleBinding: vi.fn(),
  parseSettings: vi.fn(),
}));

vi.mock('../../db.js', () => ({
  createDB: (...args) => mocks.createDB(...args),
}));

vi.mock('../../utils/authorize.js', () => ({
  authorize: (...args) => mocks.authorize(...args),
  isLastOwnerOfRole: (...args) => mocks.isLastOwnerOfRole(...args),
  logAuditEvent: (...args) => mocks.logAuditEvent(...args),
}));

vi.mock('../../utils/user-role.js', () => ({
  loadPrimaryRole: (...args) => mocks.loadPrimaryRole(...args),
}));

vi.mock('../../shared/auth.js', () => ({
  hashPassword: (...args) => mocks.hashPassword(...args),
}));

vi.mock('../../validation/request.js', () => ({
  requireString: vi.fn((v) => v),
  validateEmail: (...args) => mocks.validateEmail(...args),
  requirePlainObject: vi.fn((v) => v),
}));

vi.mock('../../utils/sanitize.js', () => ({
  stripHtml: vi.fn((v) => v),
  escapeHtml: vi.fn((v) => v),
}));

vi.mock('../../errors/http-errors.js', () => ({
  ValidationError: class extends Error { constructor(msg) { super(msg); } },
  isHttpError: vi.fn(() => false),
  toHttpErrorPayload: vi.fn(),
}));

vi.mock('./users-helpers.js', () => ({
  normalizeAccountStatus: (...args) => mocks.normalizeAccountStatus(...args),
  resolveRequestedRole: (...args) => mocks.resolveRequestedRole(...args),
  syncGlobalRoleBinding: (...args) => mocks.syncGlobalRoleBinding(...args),
  parseSettings: (...args) => mocks.parseSettings(...args),
}));

import { handleUsersAdminById } from './users-admin-by-id.js';

function makeReq(path, method, body) {
  const init = { method, headers: {} };
  if (body !== undefined) {
    init.body = typeof body === 'string' ? body : JSON.stringify(body);
    init.headers['Content-Type'] = 'application/json';
  }
  return new Request(`https://example.com${path}`, init);
}

describe('handleUsersAdminById', () => {
  const user = { sub: 'admin-1' };
  const env = { DB: {} };
  const ctx = {};
  const db = { all: vi.fn(), run: vi.fn(), first: vi.fn() };
  const logger = { error: vi.fn(), warn: vi.fn(), info: vi.fn() };

  beforeEach(() => {
    vi.resetAllMocks();
    mocks.createDB.mockReturnValue(db);
    mocks.authorize.mockResolvedValue({ allow: true });
    mocks.isLastOwnerOfRole.mockResolvedValue(false);
    mocks.logAuditEvent.mockResolvedValue(undefined);
    mocks.loadPrimaryRole.mockResolvedValue('member');
    mocks.hashPassword.mockResolvedValue('hashed-pw');
    mocks.validateEmail.mockImplementation((e) => e);
    mocks.normalizeAccountStatus.mockImplementation((v) => v || 'active');
    mocks.resolveRequestedRole.mockResolvedValue('member');
    mocks.syncGlobalRoleBinding.mockResolvedValue(undefined);
    mocks.parseSettings.mockReturnValue({});
  });

  describe('GET /api/admin/users/:id', () => {
    it('rejects unauthorized', async () => {
      mocks.authorize.mockResolvedValue({ allow: false, reason: 'no' });
      const res = await handleUsersAdminById(
        makeReq('/api/admin/users/u1', 'GET'),
        env, ctx, user, '/api/admin/users/u1',
        { _db: db, logger, _requestContext: {} },
      );
      expect(res.status).toBe(403);
    });

    it('returns 404 for non-existent user', async () => {
      db.first.mockResolvedValue(null);
      const res = await handleUsersAdminById(
        makeReq('/api/admin/users/nonexistent', 'GET'),
        env, ctx, user, '/api/admin/users/nonexistent',
        { _db: db, logger, _requestContext: {} },
      );
      expect(res.status).toBe(404);
    });

    it('returns user data', async () => {
      db.first.mockResolvedValue({
        id: 'u1', email: 'user@example.com', name: 'User',
        account_status: 'active', settings: '{}', created_at: 1, updated_at: 1,
      });
      const res = await handleUsersAdminById(
        makeReq('/api/admin/users/u1', 'GET'),
        env, ctx, user, '/api/admin/users/u1',
        { _db: db, logger, _requestContext: {} },
      );
      expect(res.status).toBe(200);
      const payload = await res.json();
      expect(payload.user.id).toBe('u1');
      expect(mocks.logAuditEvent).toHaveBeenCalled();
    });

    it('returns 500 on error', async () => {
      db.first.mockRejectedValue(new Error('fail'));
      const res = await handleUsersAdminById(
        makeReq('/api/admin/users/u1', 'GET'),
        env, ctx, user, '/api/admin/users/u1',
        { _db: db, logger, _requestContext: {} },
      );
      expect(res.status).toBe(500);
    });
  });

  describe('PUT /api/admin/users/:id', () => {
    it('rejects unauthorized', async () => {
      mocks.authorize.mockResolvedValue({ allow: false, reason: 'no' });
      const res = await handleUsersAdminById(
        makeReq('/api/admin/users/u1', 'PUT', { name: 'New' }),
        env, ctx, user, '/api/admin/users/u1',
        { _db: db, logger, _requestContext: {} },
      );
      expect(res.status).toBe(403);
    });

    it('returns 404 for non-existent user', async () => {
      db.first.mockResolvedValue(null);
      const res = await handleUsersAdminById(
        makeReq('/api/admin/users/nonexistent', 'PUT', { name: 'New' }),
        env, ctx, user, '/api/admin/users/nonexistent',
        { _db: db, logger, _requestContext: {} },
      );
      expect(res.status).toBe(404);
    });

    it('rejects invalid primary_role', async () => {
      db.first.mockResolvedValue({ id: 'u1', account_status: 'active', email: 'u@e.com', name: 'U' });
      mocks.resolveRequestedRole.mockResolvedValue(null);
      const res = await handleUsersAdminById(
        makeReq('/api/admin/users/u1', 'PUT', { primary_role: 'nonexistent_role' }),
        env, ctx, user, '/api/admin/users/u1',
        { _db: db, logger, _requestContext: {} },
      );
      expect(res.status).toBe(400);
    });

    it('prevents demoting last admin', async () => {
      db.first.mockResolvedValue({ id: 'u1', account_status: 'active', email: 'a@e.com', name: 'Admin' });
      mocks.loadPrimaryRole.mockResolvedValue('admin');
      mocks.isLastOwnerOfRole.mockResolvedValue(true);
      const res = await handleUsersAdminById(
        makeReq('/api/admin/users/u1', 'PUT', { primary_role: 'member' }),
        env, ctx, user, '/api/admin/users/u1',
        { _db: db, logger, _requestContext: {} },
      );
      expect(res.status).toBe(409);
    });

    it('rejects empty name after sanitization', async () => {
      db.first.mockResolvedValue({ id: 'u1', account_status: 'active', email: 'u@e.com', name: 'U' });
      // stripHtml is mocked to pass through, so empty string stays empty
      const res = await handleUsersAdminById(
        makeReq('/api/admin/users/u1', 'PUT', { name: '' }),
        env, ctx, user, '/api/admin/users/u1',
        { _db: db, logger, _requestContext: {} },
      );
      // When name is empty after stripHtml, the handler returns 400
      expect(res.status).toBe(400);
    });

    it('rejects duplicate email', async () => {
      db.first.mockImplementation(async (sql, params) => {
        if (sql.includes('SELECT id, account_status')) return { id: 'u1', account_status: 'active', email: 'u@e.com', name: 'U' };
        if (sql.includes('id != ?')) return { id: 'other' };
        return null;
      });
      mocks.validateEmail.mockReturnValue('duplicate@e.com');
      const res = await handleUsersAdminById(
        makeReq('/api/admin/users/u1', 'PUT', { email: 'duplicate@e.com' }),
        env, ctx, user, '/api/admin/users/u1',
        { _db: db, logger, _requestContext: {} },
      );
      expect(res.status).toBe(409);
    });

    it('rejects short password', async () => {
      db.first.mockResolvedValue({ id: 'u1', account_status: 'active', email: 'u@e.com', name: 'U' });
      const res = await handleUsersAdminById(
        makeReq('/api/admin/users/u1', 'PUT', { password: 'short' }),
        env, ctx, user, '/api/admin/users/u1',
        { _db: db, logger, _requestContext: {} },
      );
      expect(res.status).toBe(400);
    });

    it('rejects no valid fields to update', async () => {
      db.first.mockResolvedValue({ id: 'u1', account_status: 'active', email: 'u@e.com', name: 'U' });
      const res = await handleUsersAdminById(
        makeReq('/api/admin/users/u1', 'PUT', {}),
        env, ctx, user, '/api/admin/users/u1',
        { _db: db, logger, _requestContext: {} },
      );
      expect(res.status).toBe(400);
    });

    it('updates user successfully', async () => {
      db.first.mockImplementation(async (sql) => {
        if (sql.includes('SELECT id, account_status')) return { id: 'u1', account_status: 'active', email: 'u@e.com', name: 'U' };
        return { id: 'u1', email: 'u@e.com', name: 'Updated', account_status: 'active', settings: '{}', created_at: 1, updated_at: 2 };
      });
      db.run.mockResolvedValue(undefined);
      const res = await handleUsersAdminById(
        makeReq('/api/admin/users/u1', 'PUT', { name: 'Updated' }),
        env, ctx, user, '/api/admin/users/u1',
        { _db: db, logger, _requestContext: {} },
      );
      expect(res.status).toBe(200);
      expect(mocks.logAuditEvent).toHaveBeenCalled();
    });
  });

  describe('DELETE /api/admin/users/:id', () => {
    it('rejects unauthorized', async () => {
      mocks.authorize.mockResolvedValue({ allow: false, reason: 'no' });
      const res = await handleUsersAdminById(
        makeReq('/api/admin/users/u1', 'DELETE'),
        env, ctx, user, '/api/admin/users/u1',
        { _db: db, logger, _requestContext: {} },
      );
      expect(res.status).toBe(403);
    });

    it('prevents deleting yourself', async () => {
      const res = await handleUsersAdminById(
        makeReq('/api/admin/users/admin-1', 'DELETE'),
        env, ctx, user, '/api/admin/users/admin-1',
        { _db: db, logger, _requestContext: {} },
      );
      expect(res.status).toBe(400);
    });

    it('returns 404 for non-existent user', async () => {
      db.first.mockResolvedValue(null);
      const res = await handleUsersAdminById(
        makeReq('/api/admin/users/nonexistent', 'DELETE'),
        env, ctx, user, '/api/admin/users/nonexistent',
        { _db: db, logger, _requestContext: {} },
      );
      expect(res.status).toBe(404);
    });

    it('prevents deleting last admin', async () => {
      db.first.mockResolvedValue({ id: 'u1', account_status: 'active' });
      mocks.loadPrimaryRole.mockResolvedValue('admin');
      mocks.isLastOwnerOfRole.mockResolvedValue(true);
      const res = await handleUsersAdminById(
        makeReq('/api/admin/users/u1', 'DELETE'),
        env, ctx, user, '/api/admin/users/u1',
        { _db: db, logger, _requestContext: {} },
      );
      expect(res.status).toBe(400);
    });

    it('deletes user successfully', async () => {
      db.first.mockResolvedValue({ id: 'u1', account_status: 'active' });
      mocks.loadPrimaryRole.mockResolvedValue('member');
      mocks.isLastOwnerOfRole.mockResolvedValue(false);
      db.run.mockResolvedValue(undefined);
      const res = await handleUsersAdminById(
        makeReq('/api/admin/users/u1', 'DELETE'),
        env, ctx, user, '/api/admin/users/u1',
        { _db: db, logger, _requestContext: {} },
      );
      expect(res.status).toBe(200);
      expect(mocks.logAuditEvent).toHaveBeenCalled();
    });

    it('returns 500 on error', async () => {
      db.first.mockResolvedValue({ id: 'u1', account_status: 'active' });
      mocks.loadPrimaryRole.mockResolvedValue('member');
      db.run.mockRejectedValue(new Error('fail'));
      const res = await handleUsersAdminById(
        makeReq('/api/admin/users/u1', 'DELETE'),
        env, ctx, user, '/api/admin/users/u1',
        { _db: db, logger, _requestContext: {} },
      );
      expect(res.status).toBe(500);
    });
  });

  it('returns null for non-matching paths', async () => {
    const result = await handleUsersAdminById(
      makeReq('/api/admin/users', 'GET'),
      env, ctx, user, '/api/admin/users',
      { _db: db, logger, _requestContext: {} },
    );
    expect(result).toBeNull();
  });
});
