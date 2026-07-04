import { describe, expect, it, vi, beforeEach } from 'vitest';
import { handleChangePassword } from './auth-change-password.js';

const mockLogger = {
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
};

const mocks = vi.hoisted(() => ({
  verifyPassword: vi.fn(async () => true),
  hashPassword: vi.fn(async (pw) => `hashed_${pw}`),
  bumpSessionVersion: vi.fn(async () => {}),
  requireString: vi.fn(),
  checkRateLimit: vi.fn(async () => ({ allowed: true })),
  resolveRateLimitSubject: vi.fn(() => 'subject'),
  createLogger: vi.fn(() => mockLogger),
  error: vi.fn((req, msg, status, extra) => ({ status, body: { error: msg, ...extra } })),
  json: vi.fn((req, data, status = 200) => ({ status, body: data })),
  ValidationError: class ValidationError extends Error {},
  HttpErrorsModule: vi.fn(),
}));

vi.mock('../shared/auth.js', () => ({
  verifyPassword: (...args) => mocks.verifyPassword(...args),
  hashPassword: (...args) => mocks.hashPassword(...args),
}));

vi.mock('../shared/session.js', () => ({
  bumpSessionVersion: (...args) => mocks.bumpSessionVersion(...args),
}));

vi.mock('../validation/request.js', () => ({
  requireString: (...args) => mocks.requireString(...args),
}));

vi.mock('../services/rate-limit.js', () => ({
  RATE_LIMITS: {
    authChangePassword: { limit: 5, windowSeconds: 3600 },
  },
  checkRateLimit: (...args) => mocks.checkRateLimit(...args),
  resolveRateLimitSubject: (...args) => mocks.resolveRateLimitSubject(...args),
}));

vi.mock('../utils/logger.js', () => ({
  createLogger: (...args) => mocks.createLogger(...args),
}));

vi.mock('../utils/response.js', () => ({
  error: (...args) => mocks.error(...args),
  json: (...args) => mocks.json(...args),
}));

// Mock http-errors so the handler sees the same ValidationError class as mocks
vi.mock('../errors/http-errors.js', () => ({
  ValidationError: mocks.ValidationError,
}));

function makeDb(overrides = {}) {
  const prepared = [];
  const db = {
    first: vi.fn(async () => ({ id: 'user-123', password_hash: 'pbkdf2:salt:hash' })),
    run: vi.fn(async () => ({ success: true })),
    prepare: vi.fn((sql, params) => {
      prepared.push({ sql, params });
      return { sql, params };
    }),
    ...overrides,
  };
  return db;
}

function makeAuthUser(userId = 'user-123') {
  return { sub: userId };
}

describe('auth-change-password', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireString.mockImplementation((val, msg) => {
      if (!val || (typeof val === 'string' && !val.trim())) {
        throw new mocks.ValidationError(msg || 'value is required');
      }
      return val;
    });
  });

  it('returns 200 for a successful password change', async () => {
    const req = {
      json: vi.fn(async () => ({
        currentPassword: 'correct-current',
        newPassword: 'new-password-8',
        confirmNewPassword: 'new-password-8',
      })),
    };
    const db = makeDb();
    const env = { CACHE: {} };
    const authUser = makeAuthUser('user-123');

    await handleChangePassword(req, env, db, authUser);

    expect(mocks.json).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ message: 'Password changed successfully' })
    );
    expect(mocks.bumpSessionVersion).toHaveBeenCalledWith(env, 'user-123', { required: true });
    expect(db.run).toHaveBeenCalled();
  });

  it('rejects a missing currentPassword field with 400', async () => {
    const req = {
      json: vi.fn(async () => ({ newPassword: 'new-password-8' })),
    };
    const db = makeDb();
    const env = { CACHE: {} };
    const authUser = makeAuthUser('user-123');

    await handleChangePassword(req, env, db, authUser);

    expect(mocks.error).toHaveBeenCalledWith(
      expect.anything(),
      'currentPassword and newPassword are required',
      400
    );
  });

  it('rejects a new password shorter than 8 characters', async () => {
    const req = {
      json: vi.fn(async () => ({
        currentPassword: 'correct-current',
        newPassword: 'short',
        confirmNewPassword: 'short',
      })),
    };
    const db = makeDb();
    const env = { CACHE: {} };
    const authUser = makeAuthUser('user-123');

    await handleChangePassword(req, env, db, authUser);

    expect(mocks.error).toHaveBeenCalledWith(
      expect.anything(),
      'Password must be at least 8 characters',
      400
    );
  });

  it('rejects a wrong current password with 401', async () => {
    mocks.verifyPassword.mockImplementationOnce(async () => false);

    const req = {
      json: vi.fn(async () => ({
        currentPassword: 'wrong-current',
        newPassword: 'new-password-8',
        confirmNewPassword: 'new-password-8',
      })),
    };
    const db = makeDb();
    const env = { CACHE: {} };
    const authUser = makeAuthUser('user-123');

    await handleChangePassword(req, env, db, authUser);

    expect(mocks.error).toHaveBeenCalledWith(
      expect.anything(),
      'Current password is incorrect',
      401
    );
  });

  it('rejects requests when rate-limited with 429', async () => {
    mocks.checkRateLimit.mockImplementationOnce(async () => ({
      allowed: false,
      resetAt: Date.now() + 3600000,
    }));

    const req = {
      json: vi.fn(async () => ({
        currentPassword: 'correct',
        newPassword: 'new-password-8',
        confirmNewPassword: 'new-password-8',
      })),
    };
    const db = makeDb();
    const env = { CACHE: {} };
    const authUser = makeAuthUser('user-123');

    await handleChangePassword(req, env, db, authUser);

    expect(mocks.error).toHaveBeenCalledWith(
      expect.anything(),
      expect.stringContaining('Too many'),
      429,
      expect.objectContaining({ retry_after: expect.any(Number) })
    );
  });

  it('rejects mismatched confirmNewPassword with 400', async () => {
    const req = {
      json: vi.fn(async () => ({
        currentPassword: 'correct',
        newPassword: 'new-password-8',
        confirmNewPassword: 'different',
      })),
    };
    const db = makeDb();
    const env = { CACHE: {} };
    const authUser = makeAuthUser('user-123');

    await handleChangePassword(req, env, db, authUser);

    expect(mocks.error).toHaveBeenCalledWith(
      expect.anything(),
      'New password and confirmation do not match',
      400
    );
  });

  it('calls bumpSessionVersion before updating the password in the DB', async () => {
    const req = {
      json: vi.fn(async () => ({
        currentPassword: 'correct',
        newPassword: 'new-password-8',
        confirmNewPassword: 'new-password-8',
      })),
    };
    const db = makeDb();
    const env = { CACHE: {} };
    const authUser = makeAuthUser('user-123');

    await handleChangePassword(req, env, db, authUser);

    const bumpCallOrder = mocks.bumpSessionVersion.mock.invocationCallOrder[0];
    const runCallOrder = db.run.mock.invocationCallOrder[0];
    expect(bumpCallOrder).toBeLessThan(runCallOrder);
  });
});
