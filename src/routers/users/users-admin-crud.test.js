import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  createDB: vi.fn(),
  authorize: vi.fn(),
  logAuditEvent: vi.fn(),
  hashPassword: vi.fn(),
  validateEmail: vi.fn(),
  isValidEmail: vi.fn(),
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
  logAuditEvent: (...args) => mocks.logAuditEvent(...args),
}));

vi.mock('../../shared/auth.js', () => ({
  hashPassword: (...args) => mocks.hashPassword(...args),
}));

vi.mock('../../validation/request.js', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    validateEmail: (...args) => mocks.validateEmail(...args),
    isValidEmail: (...args) => mocks.isValidEmail(...args),
  };
});

vi.mock('../../errors/http-errors.js', () => ({
  ValidationError: class extends Error {
    constructor(msg) {
      super(msg);
    }
  },
  isHttpError: vi.fn(() => false),
  toHttpErrorPayload: vi.fn(),
}));

vi.mock('./users-helpers.js', () => ({
  normalizeAccountStatus: (...args) => mocks.normalizeAccountStatus(...args),
  resolveRequestedRole: (...args) => mocks.resolveRequestedRole(...args),
  syncGlobalRoleBinding: (...args) => mocks.syncGlobalRoleBinding(...args),
  parseSettings: (...args) => mocks.parseSettings(...args),
}));

import { handleUsersAdminCrud } from './users-admin-crud.js';

function makeReq(path, method, body) {
  const init = { method, headers: {} };
  if (body !== undefined) {
    init.body = typeof body === 'string' ? body : JSON.stringify(body);
    init.headers['Content-Type'] = 'application/json';
  }
  return new Request(`https://example.com${path}`, init);
}

describe('handleUsersAdminCrud', () => {
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
    mocks.hashPassword.mockResolvedValue('hashed-pw');
    mocks.validateEmail.mockImplementation((e) => e);
    mocks.isValidEmail.mockReturnValue(true);
    mocks.normalizeAccountStatus.mockImplementation((v) => v || 'active');
    mocks.resolveRequestedRole.mockResolvedValue('member');
    mocks.syncGlobalRoleBinding.mockResolvedValue(undefined);
    mocks.parseSettings.mockReturnValue({});
  });

  describe('POST /api/admin/users', () => {
    it('rejects unauthorized', async () => {
      mocks.authorize.mockResolvedValue({ allow: false, reason: 'no' });
      const res = await handleUsersAdminCrud(
        makeReq('/api/admin/users', 'POST', {
          email: 'u@e.com',
          name: 'U',
          password: 'password123',
        }),
        env,
        ctx,
        user,
        '/api/admin/users',
        { _db: db, logger, _requestContext: {} }
      );
      expect(res.status).toBe(403);
    });

    it('rejects missing fields', async () => {
      const res = await handleUsersAdminCrud(
        makeReq('/api/admin/users', 'POST', { email: '' }),
        env,
        ctx,
        user,
        '/api/admin/users',
        { _db: db, logger, _requestContext: {} }
      );
      expect(res.status).toBe(400);
    });

    it('rejects short password', async () => {
      const res = await handleUsersAdminCrud(
        makeReq('/api/admin/users', 'POST', { email: 'u@e.com', name: 'U', password: 'short' }),
        env,
        ctx,
        user,
        '/api/admin/users',
        { _db: db, logger, _requestContext: {} }
      );
      expect(res.status).toBe(400);
    });

    it('rejects invalid role', async () => {
      mocks.resolveRequestedRole.mockResolvedValue(null);
      const res = await handleUsersAdminCrud(
        makeReq('/api/admin/users', 'POST', {
          email: 'u@e.com',
          name: 'U',
          password: 'password123',
          primary_role: 'bad',
        }),
        env,
        ctx,
        user,
        '/api/admin/users',
        { _db: db, logger, _requestContext: {} }
      );
      expect(res.status).toBe(400);
    });

    it('rejects duplicate email', async () => {
      db.first.mockResolvedValue({ id: 'existing' });
      const res = await handleUsersAdminCrud(
        makeReq('/api/admin/users', 'POST', {
          email: 'u@e.com',
          name: 'U',
          password: 'password123',
        }),
        env,
        ctx,
        user,
        '/api/admin/users',
        { _db: db, logger, _requestContext: {} }
      );
      expect(res.status).toBe(409);
    });

    it('creates user successfully', async () => {
      db.first.mockImplementation(async (sql, params) => {
        if (sql.includes('SELECT id FROM users WHERE email')) return null;
        return {
          id: 'new-id',
          email: 'u@e.com',
          name: 'U',
          account_status: 'active',
          settings: '{}',
          created_at: 1,
          updated_at: 1,
          last_active_at: null,
        };
      });
      db.run.mockResolvedValue(undefined);
      const res = await handleUsersAdminCrud(
        makeReq('/api/admin/users', 'POST', {
          email: 'u@e.com',
          name: 'U',
          password: 'password123',
        }),
        env,
        ctx,
        user,
        '/api/admin/users',
        { _db: db, logger, _requestContext: {} }
      );
      expect(res.status).toBe(201);
      expect(mocks.logAuditEvent).toHaveBeenCalled();
    });
  });

  describe('POST /api/admin/users/import', () => {
    it('rejects unauthorized', async () => {
      mocks.authorize.mockResolvedValue({ allow: false, reason: 'no' });
      const res = await handleUsersAdminCrud(
        makeReq('/api/admin/users/import', 'POST', {
          csv: 'name,email,password,primary_role\nU,u@e.com,password123,member',
        }),
        env,
        ctx,
        user,
        '/api/admin/users/import',
        { _db: db, logger, _requestContext: {} }
      );
      expect(res.status).toBe(403);
    });

    it('rejects empty CSV', async () => {
      const res = await handleUsersAdminCrud(
        makeReq('/api/admin/users/import', 'POST', { csv: '' }),
        env,
        ctx,
        user,
        '/api/admin/users/import',
        { _db: db, logger, _requestContext: {} }
      );
      expect(res.status).toBe(400);
    });

    it('imports users from CSV', async () => {
      db.first.mockResolvedValue(null);
      db.run.mockResolvedValue(undefined);
      const res = await handleUsersAdminCrud(
        makeReq('/api/admin/users/import', 'POST', {
          csv: 'name,email,password,primary_role\nUser1,u1@e.com,password123,member',
        }),
        env,
        ctx,
        user,
        '/api/admin/users/import',
        { _db: db, logger, _requestContext: {} }
      );
      expect(res.status).toBe(201);
      const payload = await res.json();
      expect(payload.ok).toBe(true);
    });

    it('skips invalid rows in CSV', async () => {
      db.first.mockResolvedValue(null);
      db.run.mockResolvedValue(undefined);
      const res = await handleUsersAdminCrud(
        makeReq('/api/admin/users/import', 'POST', {
          csv: 'name,email,password,primary_role\n,missing-fields,,\nUser2,u2@e.com,password123,member',
        }),
        env,
        ctx,
        user,
        '/api/admin/users/import',
        { _db: db, logger, _requestContext: {} }
      );
      expect(res.status).toBe(201);
      const payload = await res.json();
      expect(payload.results.length).toBe(2);
    });
  });

  it('returns null for non-matching paths', async () => {
    const result = await handleUsersAdminCrud(
      makeReq('/api/admin/users/u1', 'GET'),
      env,
      ctx,
      user,
      '/api/admin/users/u1',
      { _db: db, logger, _requestContext: {} }
    );
    expect(result).toBeNull();
  });
});
