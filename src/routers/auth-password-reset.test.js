import { describe, expect, it, vi, beforeEach } from 'vitest';

const mockLogger = {
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
};

const mocks = vi.hoisted(() => ({
  hashPassword: vi.fn(async (pw) => `hashed_${pw}`),
  bumpSessionVersion: vi.fn(async () => {}),
  requireString: vi.fn(),
  validateEmail: vi.fn((email) => email.toLowerCase()),
  checkRateLimit: vi.fn(async () => ({ allowed: true })),
  resolveRateLimitSubject: vi.fn(() => 'subject'),
  emailSend: vi.fn(async () => ({ id: 'email-id' })),
  createEmailService: vi.fn(() => ({ send: (...args) => mocks.emailSend(...args) })),
  escapeHtml: vi.fn((s) => s),
  error: vi.fn((req, msg, status, extra) => ({ status, body: { error: msg, ...extra } })),
  json: vi.fn((req, data, status = 200) => ({ status, body: data })),
  createLogger: vi.fn(() => mockLogger),
  ValidationError: class ValidationError extends Error {},
}));

vi.mock('../shared/auth.js', () => ({
  hashPassword: (...args) => mocks.hashPassword(...args),
}));

vi.mock('../shared/session.js', () => ({
  bumpSessionVersion: (...args) => mocks.bumpSessionVersion(...args),
}));

vi.mock('../validation/request.js', () => ({
  requireString: (...args) => mocks.requireString(...args),
  validateEmail: (...args) => mocks.validateEmail(...args),
}));

vi.mock('../services/rate-limit.js', () => ({
  RATE_LIMITS: {
    authForgotPassword: { limit: 5, windowSeconds: 3600 },
    authResetPassword: { limit: 5, windowSeconds: 3600 },
  },
  checkRateLimit: (...args) => mocks.checkRateLimit(...args),
  resolveRateLimitSubject: (...args) => mocks.resolveRateLimitSubject(...args),
}));

vi.mock('../services/email/email-service.js', () => ({
  createEmailService: (...args) => mocks.createEmailService(...args),
}));

vi.mock('../utils/sanitize.js', () => ({
  escapeHtml: (...args) => mocks.escapeHtml(...args),
}));

vi.mock('../utils/response.js', () => ({
  error: (...args) => mocks.error(...args),
  json: (...args) => mocks.json(...args),
}));

vi.mock('../utils/logger.js', () => ({
  createLogger: (...args) => mocks.createLogger(...args),
}));

vi.mock('../errors/http-errors.js', () => ({
  ValidationError: mocks.ValidationError,
}));

import { handleForgotPassword, handleResetPassword } from './auth-password-reset.js';

function makeForgotReq(origin = 'https://untrusted-proxy.example.com') {
  return {
    url: `${origin}/api/auth/forgot-password`,
    json: vi.fn(async () => ({ email: 'test@example.com' })),
    headers: {
      get: vi.fn((name) => {
        if (name === 'Origin') return origin;
        return null;
      }),
    },
  };
}

function makeUsers(overrides = {}) {
  return {
    findByEmail: vi.fn(async () => ({
      id: 'user-123',
      name: 'Test',
      email: 'test@example.com',
    })),
    ...overrides,
  };
}

function makeDb(overrides = {}) {
  const prepared = [];
  const db = {
    first: vi.fn(async () => ({ user_id: 'user-123' })),
    run: vi.fn(async () => ({ success: true })),
    prepare: vi.fn((sql, params) => {
      prepared.push({ sql, params });
      return { sql, params };
    }),
    batch: vi.fn(async () => ({ success: true })),
    _prepared: prepared,
    ...overrides,
  };
  return db;
}

describe('auth-password-reset: security regressions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireString.mockImplementation((val, msg) => {
      if (!val || (typeof val === 'string' && !val.trim())) {
        throw new mocks.ValidationError(msg);
      }
      return val;
    });
  });

  it('uses APP_PUBLIC_ORIGIN and strips trailing slash for reset link base URL', async () => {
    const req = makeForgotReq('https://untrusted-proxy.example.com');
    const db = makeDb();
    const env = {
      APP_PUBLIC_ORIGIN: 'https://app.growchat.example.com/',
      CACHE: {},
    };

    await handleForgotPassword(req, env, db, makeUsers());

    expect(mocks.checkRateLimit).toHaveBeenCalledWith(
      env,
      expect.objectContaining({ action: 'auth-forgot-password' })
    );
    expect(mocks.emailSend).toHaveBeenCalledTimes(1);
    const emailHtml = mocks.emailSend.mock.calls[0][0].html;
    expect(emailHtml).toContain('https://app.growchat.example.com/auth/reset-password?token=');
    expect(emailHtml).not.toContain('untrusted-proxy');
  });

  it('fails closed when APP_PUBLIC_ORIGIN is missing without generating a token', async () => {
    const req = makeForgotReq('https://untrusted-proxy.example.com');
    const db = makeDb();
    const env = { CACHE: {} };

    const result = await handleForgotPassword(req, env, db, makeUsers());

    expect(result.body.message).toContain('If an account exists');
    expect(mockLogger.error).toHaveBeenCalledWith(
      'APP_PUBLIC_ORIGIN is not configured — password reset link origin unknown'
    );
    expect(db.run).not.toHaveBeenCalled();
    expect(mocks.emailSend).not.toHaveBeenCalled();
  });

  it('does not derive reset link from request origin', async () => {
    const req = makeForgotReq('https://attacker.example.com');
    const db = makeDb();
    const env = { CACHE: {} };

    const result = await handleForgotPassword(req, env, db, makeUsers());

    expect(result.body.message).toContain('If an account exists');
    expect(mocks.emailSend).not.toHaveBeenCalled();
  });

  it('deletes ALL reset tokens for the user, not just the presented one', async () => {
    const db = makeDb();

    const req = {
      json: vi.fn(async () => ({ token: 'valid-reset-token-hex', password: 'newpassword123' })),
      headers: { get: vi.fn(() => null) },
    };
    const env = { CACHE: {} };

    await handleResetPassword(req, env, db);

    expect(db.batch).toHaveBeenCalledTimes(1);
    const batched = db.batch.mock.calls[0][0];
    const tokenDelete = batched.find((stmt) =>
      String(stmt.sql).includes('DELETE FROM password_reset_tokens')
    );
    expect(tokenDelete).toBeDefined();
    expect(tokenDelete.sql).toContain('user_id');
    expect(tokenDelete.sql).not.toContain('token_hash');
    expect(tokenDelete.params).toEqual(['user-123']);
  });

  it('passes full env object to reset rate limit check', async () => {
    const db = makeDb();

    const req = {
      json: vi.fn(async () => ({ token: 'valid-reset-token', password: 'newpassword123' })),
      headers: { get: vi.fn(() => null) },
    };
    const env = { CACHE: {} };

    await handleResetPassword(req, env, db);

    expect(mocks.checkRateLimit).toHaveBeenCalledWith(
      env,
      expect.objectContaining({ action: 'auth-reset-password' })
    );
  });

  it('requires session-version bump before any DB mutation', async () => {
    const db = makeDb();

    const req = {
      json: vi.fn(async () => ({ token: 'valid-reset-token', password: 'newpassword123' })),
      headers: { get: vi.fn(() => null) },
    };
    const env = { CACHE: {} };

    await handleResetPassword(req, env, db);

    expect(mocks.bumpSessionVersion).toHaveBeenCalledWith(
      env,
      'user-123',
      expect.objectContaining({ required: true })
    );

    const bumpOrder = mocks.bumpSessionVersion.mock.invocationCallOrder[0];
    const batchOrder = db.batch.mock.invocationCallOrder[0];
    expect(bumpOrder).toBeGreaterThan(0);
    expect(batchOrder).toBeGreaterThan(0);
    expect(bumpOrder).toBeLessThan(batchOrder);
  });

  it('batches token deletion and password update atomically', async () => {
    const db = makeDb();

    const req = {
      json: vi.fn(async () => ({ token: 'valid-reset-token', password: 'newpassword123' })),
      headers: { get: vi.fn(() => null) },
    };
    const env = { CACHE: {} };

    await handleResetPassword(req, env, db);

    expect(db.batch).toHaveBeenCalledTimes(1);
    const batched = db.batch.mock.calls[0][0];
    expect(
      batched.some((stmt) => String(stmt.sql).includes('DELETE FROM password_reset_tokens'))
    ).toBe(true);
    expect(
      batched.some((stmt) => String(stmt.sql).includes('UPDATE users SET password_hash'))
    ).toBe(true);
  });

  it('propagates session-version bump failures instead of ignoring them', async () => {
    mocks.bumpSessionVersion.mockRejectedValueOnce(new Error('KV down'));
    const db = makeDb();

    const req = {
      json: vi.fn(async () => ({ token: 'valid-reset-token', password: 'newpassword123' })),
      headers: { get: vi.fn(() => null) },
    };
    const env = { CACHE: {} };

    await expect(handleResetPassword(req, env, db)).rejects.toThrow('KV down');

    // No DB mutations should occur when the session-version bump fails, so
    // the user's reset token remains usable for a retry.
    expect(db.batch).not.toHaveBeenCalled();
  });

  it('does not delete from the vestigial refresh_tokens SQL table', async () => {
    const db = makeDb();

    const req = {
      json: vi.fn(async () => ({ token: 'valid-reset-token', password: 'newpassword123' })),
      headers: { get: vi.fn(() => null) },
    };
    const env = { CACHE: {} };

    await handleResetPassword(req, env, db);

    const allSql = [
      ...db.run.mock.calls.map(([sql]) => String(sql)),
      ...db._prepared.map((stmt) => String(stmt.sql)),
    ];
    expect(allSql.some((sql) => sql.includes('refresh_tokens'))).toBe(false);
  });
});
