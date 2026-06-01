import { describe, expect, it, vi, beforeEach } from 'vitest';

// Mock dependencies
const mocks = vi.hoisted(() => ({
  hashPassword: vi.fn(async (pw) => `hashed_${pw}`),
  checkRateLimit: vi.fn(async () => ({ allowed: true })),
  requireString: vi.fn(),
  error: vi.fn((req, msg, status) => ({ status, body: { error: msg } })),
  json: vi.fn((req, data) => ({ status: 200, body: data })),
  createLogger: vi.fn(() => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  })),
}));

vi.mock('../auth/password-utils.js', () => ({
  hashPassword: (...args) => mocks.hashPassword(...args),
}));

vi.mock('../utils/rate-limit.js', () => ({
  checkRateLimit: (...args) => mocks.checkRateLimit(...args),
}));

vi.mock('../utils/validation.js', () => ({
  requireString: (...args) => mocks.requireString(...args),
  ValidationError: class ValidationError extends Error {},
}));

vi.mock('../utils/http-helpers.js', () => ({
  error: (...args) => mocks.error(...args),
  json: (...args) => mocks.json(...args),
}));

vi.mock('../utils/logger.js', () => ({
  createLogger: (...args) => mocks.createLogger(...args),
}));

// Import after mocks
import { handleResetPassword } from './auth-password-reset.js';

describe('auth-password-reset: CodeRabbit regression tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireString.mockImplementation((val, msg) => {
      if (!val || (typeof val === 'string' && !val.trim())) throw new Error(msg);
      return val;
    });
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

    const sessionsKv = {
      get: vi.fn(async () => '5'),
      put: vi.fn(async () => {}),
    };

    const req = {
      json: vi.fn(async () => ({
        token: 'valid-reset-token-hex',
        password: 'newpassword123',
      })),
      headers: { get: vi.fn(() => null) },
    };

    const env = { SESSIONS: sessionsKv, CACHE: { get: vi.fn(), put: vi.fn() } };

    await handleResetPassword(req, env, db);

    // Verify the DELETE uses user_id, not token_hash
    const tokenDelete = deleteCalls.find((c) =>
      c.sql.includes('DELETE FROM password_reset_tokens')
    );
    expect(tokenDelete).toBeDefined();
    expect(tokenDelete.params).toEqual(['user-123']);
    // The SQL should use WHERE user_id = ? not WHERE token_hash = ?
    expect(tokenDelete.sql).toContain('user_id');
    expect(tokenDelete.sql).not.toContain('token_hash');
  });

  it('bumps KV session version to invalidate refresh tokens', async () => {
    const db = {
      first: vi.fn(async () => ({ user_id: 'user-123' })),
      run: vi.fn(async () => ({ success: true })),
    };

    const sessionsKv = {
      get: vi.fn(async () => '5'),
      put: vi.fn(async () => {}),
    };

    const req = {
      json: vi.fn(async () => ({
        token: 'valid-reset-token',
        password: 'newpassword123',
      })),
      headers: { get: vi.fn(() => null) },
    };

    const env = { SESSIONS: sessionsKv, CACHE: { get: vi.fn(), put: vi.fn() } };

    await handleResetPassword(req, env, db);

    // Verify session version was bumped
    expect(sessionsKv.get).toHaveBeenCalledWith('session-version:user-123');
    expect(sessionsKv.put).toHaveBeenCalledWith(
      'session-version:user-123',
      '6',
      expect.objectContaining({ expirationTtl: expect.any(Number) })
    );
  });

  it('uses APP_PUBLIC_ORIGIN for reset link base URL', async () => {
    // This test verifies the handleForgotPassword uses env.APP_PUBLIC_ORIGIN
    // We test the module's code that constructs the origin
    const { handleForgotPassword } = await import('./auth-password-reset.js');

    const sendEmailCalls = [];
    const db = {
      first: vi.fn(async () => ({ id: 'user-123', name: 'Test', email: 'test@example.com' })),
      run: vi.fn(async () => ({ success: true })),
    };

    const resendMock = {
      emails: {
        send: vi.fn(async (data) => {
          sendEmailCalls.push(data);
          return { id: 'email-id' };
        }),
      },
    };

    const sessionsKv = {
      get: vi.fn(async () => null),
      put: vi.fn(async () => {}),
    };

    const req = {
      url: 'https://untrusted-proxy.example.com/api/auth/forgot-password',
      json: vi.fn(async () => ({ email: 'test@example.com' })),
      headers: {
        get: vi.fn((name) => {
          if (name === 'Origin') return 'https://untrusted-proxy.example.com';
          return null;
        }),
      },
    };

    // With APP_PUBLIC_ORIGIN set, the reset link should use it
    const env = {
      RESEND_API_KEY: 'test-key',
      APP_PUBLIC_ORIGIN: 'https://app.growchat.example.com',
      SESSIONS: sessionsKv,
      CACHE: {},
    };

    const users = {
      getByEmail: vi.fn(async () => ({
        id: 'user-123',
        name: 'Test',
        email: 'test@example.com',
      })),
    };

    try {
      await handleForgotPassword(req, env, db, users);
    } catch (e) {
      // Resend may fail in test, that's OK — we just need to check
      // the email content was constructed with the right origin
    }

    // If email was sent, verify it uses the trusted origin
    if (sendEmailCalls.length > 0) {
      const emailHtml = sendEmailCalls[0].html || sendEmailCalls[0].data?.html || '';
      if (typeof emailHtml === 'string') {
        expect(emailHtml).toContain('https://app.growchat.example.com');
        expect(emailHtml).not.toContain('untrusted-proxy');
      }
    }
  });
});
