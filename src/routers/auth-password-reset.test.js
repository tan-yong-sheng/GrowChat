import { describe, expect, it, vi, beforeEach } from 'vitest';

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
  createLogger: vi.fn(() => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  })),
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
  return {
    first: vi.fn(async () => ({ user_id: 'user-123' })),
    run: vi.fn(async () => ({ success: true })),
    ...overrides,
  };
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

    expect(mocks.emailSend).toHaveBeenCalledTimes(1);
    const emailHtml = mocks.emailSend.mock.calls[0][0].html;
    expect(emailHtml).toContain('https://app.growchat.example.com/auth/reset-password?token=');
    expect(emailHtml).not.toContain('untrusted-proxy');
  });

  it('fails closed when APP_PUBLIC_ORIGIN is missing', async () => {
    const req = makeForgotReq('https://untrusted-proxy.example.com');
    const db = makeDb();
    const env = { CACHE: {} };

    await expect(handleForgotPassword(req, env, db, makeUsers())).rejects.toThrow(
      'APP_PUBLIC_ORIGIN is not configured'
    );
    expect(mocks.emailSend).not.toHaveBeenCalled();
  });

  it('does not derive reset link from request origin', async () => {
    const req = makeForgotReq('https://attacker.example.com');
    const db = makeDb();
    const env = { CACHE: {} };

    await expect(handleForgotPassword(req, env, db, makeUsers())).rejects.toThrow(
      'APP_PUBLIC_ORIGIN is not configured'
    );
  });

  it('deletes ALL reset tokens for the user, not just the presented one', async () => {
    const deleteCalls = [];
    const db = {
      first: vi.fn(async (sql, params) => {
        if (sql.includes('password_reset_tokens')) {
          return { user_id: 'user-123' };
        }
        return null;
      }),
      run: vi.fn(async (sql, params) => {
        deleteCalls.push({ sql, params });
        return { success: true };
      }),
    };

    const req = {
      json: vi.fn(async () => ({ token: 'valid-reset-token-hex', password: 'newpassword123' })),
      headers: { get: vi.fn(() => null) },
    };
    const env = { CACHE: {} };

    await handleResetPassword(req, env, db);

    const tokenDelete = deleteCalls.find((c) =>
      c.sql.includes('DELETE FROM password_reset_tokens')
    );
    expect(tokenDelete).toBeDefined();
    expect(tokenDelete.sql).toContain('user_id');
    expect(tokenDelete.sql).not.toContain('token_hash');
    expect(tokenDelete.params).toEqual(['user-123']);
  });

  it('requires session-version bump before password mutation', async () => {
    const db = {
      first: vi.fn(async () => ({ user_id: 'user-123' })),
      run: vi.fn(async () => ({ success: true })),
    };

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
    const updateCallIndex = db.run.mock.calls.findIndex(([sql]) =>
      String(sql).includes('UPDATE users SET password_hash')
    );
    const updateOrder = db.run.mock.invocationCallOrder[updateCallIndex];
    expect(bumpOrder).toBeGreaterThan(0);
    expect(updateOrder).toBeGreaterThan(0);
    expect(bumpOrder).toBeLessThan(updateOrder);
  });

  it('propagates session-version bump failures instead of ignoring them', async () => {
    mocks.bumpSessionVersion.mockRejectedValueOnce(new Error('KV down'));
    const db = {
      first: vi.fn(async () => ({ user_id: 'user-123' })),
      run: vi.fn(async () => ({ success: true })),
    };

    const req = {
      json: vi.fn(async () => ({ token: 'valid-reset-token', password: 'newpassword123' })),
      headers: { get: vi.fn(() => null) },
    };
    const env = { CACHE: {} };

    await expect(handleResetPassword(req, env, db)).rejects.toThrow('KV down');
  });

  it('does not delete from the vestigial refresh_tokens SQL table', async () => {
    const runCalls = [];
    const db = {
      first: vi.fn(async () => ({ user_id: 'user-123' })),
      run: vi.fn(async (sql, params) => {
        runCalls.push(sql);
        return { success: true };
      }),
    };

    const req = {
      json: vi.fn(async () => ({ token: 'valid-reset-token', password: 'newpassword123' })),
      headers: { get: vi.fn(() => null) },
    };
    const env = { CACHE: {} };

    await handleResetPassword(req, env, db);

    expect(runCalls.some((sql) => String(sql).includes('refresh_tokens'))).toBe(false);
  });
});
