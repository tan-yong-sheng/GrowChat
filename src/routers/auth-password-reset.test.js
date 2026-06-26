import { describe, expect, it, vi, beforeEach } from 'vitest';

// All mocks must be defined with vi.hoisted so they're hoisted to the top
const { ValidationError } = vi.hoisted(() => {
  class ValidationError extends Error {}
  return { ValidationError };
});

const mocks = vi.hoisted(() => ({
  hashPassword: vi.fn(async (pw) => `hashed_${pw}`),
  checkRateLimit: vi.fn(async () => ({ allowed: true })),
  requireString: vi.fn(),
  validateEmail: vi.fn(),
  error: vi.fn((req, msg, status) => ({ status, body: { error: msg } })),
  json: vi.fn((req, data) => ({ status: 200, body: data })),
  createLogger: vi.fn(() => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  })),
  emailSend: vi.fn(),
}));

vi.mock('../shared/auth.js', () => ({
  hashPassword: (...args) => mocks.hashPassword(...args),
}));

vi.mock('../services/rate-limit.js', () => ({
  checkRateLimit: (...args) => mocks.checkRateLimit(...args),
  RATE_LIMITS: {
    authForgotPassword: { limit: 5, windowSeconds: 900 },
    authResetPassword: { limit: 5, windowSeconds: 3600 },
  },
  resolveRateLimitSubject: vi.fn(() => 'test-subject'),
}));

vi.mock('../validation/request.js', () => ({
  requireString: (...args) => mocks.requireString(...args),
  validateEmail: (...args) => mocks.validateEmail(...args),
}));

vi.mock('../utils/response.js', () => ({
  error: (...args) => mocks.error(...args),
  json: (...args) => mocks.json(...args),
}));

vi.mock('../utils/logger.js', () => ({
  createLogger: (...args) => mocks.createLogger(...args),
}));

vi.mock('../services/email/email-service.js', () => ({
  createEmailService: () => ({
    send: (...args) => mocks.emailSend(...args),
  }),
}));

vi.mock('../errors/http-errors.js', () => ({
  ValidationError,
}));

import { handleForgotPassword, handleResetPassword } from './auth-password-reset.js';

describe('auth-password-reset: handleForgotPassword', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireString.mockImplementation((val, msg) => {
      if (!val || (typeof val === 'string' && !val.trim())) throw new ValidationError(msg);
      return val;
    });
    mocks.validateEmail.mockImplementation((val) => val.toLowerCase());
    mocks.checkRateLimit.mockResolvedValue({ allowed: true });
    mocks.error.mockImplementation((req, msg, status) => ({ status, body: { error: msg } }));
    mocks.json.mockImplementation((req, data) => ({ status: 200, body: data }));
  });

  describe('invalid JSON body', () => {
    it('returns 400 when body is not valid JSON', async () => {
      const req = {
        json: vi.fn(async () => {
          throw new SyntaxError('Unexpected token');
        }),
        headers: { get: vi.fn(() => null) },
      };

      await handleForgotPassword(req, {}, {}, {});

      expect(mocks.error).toHaveBeenCalledWith(req, 'Invalid JSON body', 400);
    });
  });

  describe('validation errors', () => {
    it('returns 400 when email validation fails', async () => {
      const req = {
        json: vi.fn(async () => ({ email: 'invalid-email' })),
        headers: { get: vi.fn(() => null) },
      };

      mocks.validateEmail.mockImplementation(() => {
        throw new ValidationError('Invalid email format');
      });

      await handleForgotPassword(req, {}, {}, {});

      expect(mocks.error).toHaveBeenCalledWith(req, 'Invalid email format', 400);
    });

    it('re-throws non-ValidationError from email validation', async () => {
      const req = {
        json: vi.fn(async () => ({ email: 'test@example.com' })),
        headers: { get: vi.fn(() => null) },
      };

      mocks.validateEmail.mockImplementation(() => {
        throw new Error('Unexpected error');
      });

      await expect(handleForgotPassword(req, {}, {}, {})).rejects.toThrow('Unexpected error');
    });
  });

  describe('rate limiting', () => {
    it('returns 429 when rate limit is exceeded', async () => {
      const req = {
        json: vi.fn(async () => ({ email: 'test@example.com' })),
        headers: { get: vi.fn(() => null) },
      };

      mocks.checkRateLimit.mockResolvedValueOnce({
        allowed: false,
        resetAt: Date.now() + 60000,
      });

      await handleForgotPassword(req, {}, {}, {});

      expect(mocks.error).toHaveBeenCalledWith(
        req,
        'Too many password reset requests',
        429,
        expect.objectContaining({ retry_after: expect.any(Number) })
      );
    });
  });

  describe('user not found', () => {
    it('returns fake success message to prevent email enumeration', async () => {
      const req = {
        json: vi.fn(async () => ({ email: 'nonexistent@example.com' })),
        headers: { get: vi.fn(() => null) },
      };

      const users = {
        findByEmail: vi.fn(async () => null),
      };

      const result = await handleForgotPassword(
        req,
        { APP_PUBLIC_ORIGIN: 'https://app.example.com' },
        {},
        users
      );

      expect(result.body.message).toContain('If an account exists');
      expect(users.findByEmail).toHaveBeenCalled();
    });
  });

  describe('missing APP_PUBLIC_ORIGIN', () => {
    it('logs error and returns fake success when origin is not configured', async () => {
      const req = {
        json: vi.fn(async () => ({ email: 'test@example.com' })),
        headers: { get: vi.fn(() => null) },
      };

      const users = {
        findByEmail: vi.fn(async () => ({
          id: 'user-123',
          name: 'Test User',
          email: 'test@example.com',
        })),
      };

      const mockLogger = { error: vi.fn(), info: vi.fn(), warn: vi.fn() };
      mocks.createLogger.mockReturnValue(mockLogger);

      const db = { run: vi.fn(async () => ({ success: true })) };

      const result = await handleForgotPassword(req, { APP_PUBLIC_ORIGIN: '' }, db, users);

      expect(mockLogger.error).toHaveBeenCalledWith(
        'APP_PUBLIC_ORIGIN is not configured — password reset link origin unknown'
      );
      expect(result.body.message).toContain('If an account exists');
    });

    it('strips trailing slash from APP_PUBLIC_ORIGIN', async () => {
      const req = {
        json: vi.fn(async () => ({ email: 'test@example.com' })),
        headers: { get: vi.fn(() => null) },
      };

      const users = {
        findByEmail: vi.fn(async () => ({
          id: 'user-123',
          name: 'Test User',
          email: 'test@example.com',
        })),
      };

      const db = { run: vi.fn(async () => ({ success: true })) };

      mocks.emailSend.mockResolvedValue({ id: 'email-123' });

      await handleForgotPassword(req, { APP_PUBLIC_ORIGIN: 'https://app.example.com/' }, db, users);

      expect(mocks.emailSend).toHaveBeenCalled();
    });
  });

  describe('email sending failure', () => {
    it('still returns success when email fails to send', async () => {
      const req = {
        json: vi.fn(async () => ({ email: 'test@example.com' })),
        headers: { get: vi.fn(() => null) },
      };

      const users = {
        findByEmail: vi.fn(async () => ({
          id: 'user-123',
          name: 'Test User',
          email: 'test@example.com',
        })),
      };

      const mockLogger = { error: vi.fn(), info: vi.fn(), warn: vi.fn() };
      mocks.createLogger.mockReturnValue(mockLogger);
      mocks.emailSend.mockRejectedValue(new Error('SMTP error'));

      const db = { run: vi.fn(async () => ({ success: true })) };

      const result = await handleForgotPassword(
        req,
        { APP_PUBLIC_ORIGIN: 'https://app.example.com' },
        db,
        users
      );

      expect(mockLogger.error).toHaveBeenCalledWith(
        'Failed to send password reset email',
        expect.anything()
      );
      expect(result.body.message).toContain('If an account exists');
    });
  });

  describe('successful flow', () => {
    it('creates token and sends email on valid request', async () => {
      const req = {
        json: vi.fn(async () => ({ email: 'test@example.com' })),
        headers: { get: vi.fn(() => null) },
      };

      const users = {
        findByEmail: vi.fn(async () => ({
          id: 'user-123',
          name: 'Test User',
          email: 'test@example.com',
        })),
      };

      const db = {
        run: vi.fn(async () => ({ success: true })),
      };

      mocks.emailSend.mockResolvedValue({ id: 'email-123' });

      const result = await handleForgotPassword(
        req,
        { APP_PUBLIC_ORIGIN: 'https://app.example.com' },
        db,
        users
      );

      expect(db.run).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO password_reset_tokens'),
        expect.any(Array)
      );
      expect(mocks.emailSend).toHaveBeenCalledWith(
        expect.objectContaining({
          to: 'test@example.com',
          subject: 'Reset Your Password',
        })
      );
      expect(result.body.message).toContain('If an account exists');
    });
  });
});

describe('auth-password-reset: handleResetPassword', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireString.mockImplementation((val, msg) => {
      if (!val || (typeof val === 'string' && !val.trim())) throw new ValidationError(msg);
      return val;
    });
    mocks.checkRateLimit.mockResolvedValue({ allowed: true });
    mocks.error.mockImplementation((req, msg, status) => ({ status, body: { error: msg } }));
    mocks.json.mockImplementation((req, data) => ({ status: 200, body: data }));
  });

  describe('invalid JSON body', () => {
    it('returns 400 when body is not valid JSON', async () => {
      const req = {
        json: vi.fn(async () => {
          throw new SyntaxError('Unexpected token');
        }),
      };

      const _result = await handleResetPassword(req, {}, {});

      expect(mocks.error).toHaveBeenCalledWith(req, 'Invalid JSON body', 400);
    });
  });

  describe('validation errors', () => {
    it('returns 400 when token is missing', async () => {
      const req = {
        json: vi.fn(async () => ({ password: 'newpassword123' })),
      };

      let callCount = 0;
      mocks.requireString.mockImplementation((val, msg) => {
        callCount++;
        if (callCount === 1) {
          // token is missing
          throw new ValidationError(msg);
        }
        return val;
      });

      const _result = await handleResetPassword(req, {}, {});

      expect(mocks.error).toHaveBeenCalledWith(req, 'token and password are required', 400);
    });

    it('returns 400 when password is missing', async () => {
      const req = {
        json: vi.fn(async () => ({ token: 'valid-token' })),
      };

      let callCount = 0;
      mocks.requireString.mockImplementation((val, msg) => {
        callCount++;
        if (callCount === 2) throw new ValidationError(msg); // password
        return val;
      });

      const _result = await handleResetPassword(req, {}, {});

      expect(mocks.error).toHaveBeenCalledWith(req, 'token and password are required', 400);
    });

    it('re-throws non-ValidationError from requireString', async () => {
      const req = {
        json: vi.fn(async () => ({ token: 'valid-token', password: 'pass' })),
      };

      mocks.requireString.mockImplementation(() => {
        throw new Error('Unexpected error');
      });

      await expect(handleResetPassword(req, {}, {})).rejects.toThrow('Unexpected error');
    });
  });

  describe('password validation', () => {
    it('returns 400 when password is too short (less than 8 chars)', async () => {
      const req = {
        json: vi.fn(async () => ({ token: 'valid-token', password: 'short' })),
      };

      mocks.requireString.mockReturnValueOnce('valid-token').mockReturnValueOnce('short');

      const _result = await handleResetPassword(req, {}, {});

      expect(mocks.error).toHaveBeenCalledWith(req, 'Password must be at least 8 characters', 400);
    });

    it('accepts password of exactly 8 characters', async () => {
      const req = {
        json: vi.fn(async () => ({ token: 'valid-token', password: '12345678' })),
      };

      mocks.requireString.mockReturnValueOnce('valid-token').mockReturnValueOnce('12345678');

      const db = {
        first: vi.fn(async () => ({ user_id: 'user-123' })),
        run: vi.fn(async () => ({ success: true })),
      };

      const sessionsKv = {
        get: vi.fn(async () => null),
        put: vi.fn(async () => {}),
      };

      const _result = await handleResetPassword(req, { SESSIONS: sessionsKv }, db);

      expect(mocks.error).not.toHaveBeenCalledWith(
        req,
        'Password must be at least 8 characters',
        expect.anything()
      );
    });
  });

  describe('rate limiting', () => {
    it('returns 429 when rate limit is exceeded', async () => {
      const req = {
        json: vi.fn(async () => ({ token: 'valid-token', password: 'newpassword123' })),
      };

      mocks.requireString.mockReturnValueOnce('valid-token').mockReturnValueOnce('newpassword123');

      mocks.checkRateLimit.mockResolvedValueOnce({
        allowed: false,
        resetAt: Date.now() + 60000,
      });

      const _result = await handleResetPassword(req, {}, {});

      expect(mocks.error).toHaveBeenCalledWith(
        req,
        'Too many password reset attempts',
        429,
        expect.objectContaining({ retry_after: expect.any(Number) })
      );
    });
  });

  describe('invalid/expired token', () => {
    it('returns 400 when token is not found in database', async () => {
      const req = {
        json: vi.fn(async () => ({ token: 'invalid-token', password: 'newpassword123' })),
      };

      mocks.requireString
        .mockReturnValueOnce('invalid-token')
        .mockReturnValueOnce('newpassword123');

      const db = {
        first: vi.fn(async () => null),
      };

      const _result = await handleResetPassword(req, {}, db);

      expect(mocks.error).toHaveBeenCalledWith(req, 'Invalid or expired reset token', 400);
    });

    it('returns 400 when token has expired', async () => {
      const req = {
        json: vi.fn(async () => ({ token: 'expired-token', password: 'newpassword123' })),
      };

      mocks.requireString
        .mockReturnValueOnce('expired-token')
        .mockReturnValueOnce('newpassword123');

      const db = {
        first: vi.fn(async () => null),
      };

      const _result = await handleResetPassword(req, {}, db);

      expect(mocks.error).toHaveBeenCalledWith(req, 'Invalid or expired reset token', 400);
    });
  });

  describe('KV session version bump failure', () => {
    it('still returns success when KV session version bump fails', async () => {
      const req = {
        json: vi.fn(async () => ({ token: 'valid-token', password: 'newpassword123' })),
      };

      mocks.requireString.mockReturnValueOnce('valid-token').mockReturnValueOnce('newpassword123');

      const db = {
        first: vi.fn(async () => ({ user_id: 'user-123' })),
        run: vi.fn(async () => ({ success: true })),
      };

      const sessionsKv = {
        get: vi.fn(async () => '5'),
        put: vi.fn(async () => {
          throw new Error('KV error');
        }),
      };

      const _result = await handleResetPassword(req, { SESSIONS: sessionsKv }, db);

      expect(mocks.json).toHaveBeenCalledWith(
        req,
        expect.objectContaining({ message: expect.stringContaining('successful') })
      );
    });

    it('defaults to 0 when currentVersion is null', async () => {
      const req = {
        json: vi.fn(async () => ({ token: 'valid-token', password: 'newpassword123' })),
      };

      mocks.requireString.mockReturnValueOnce('valid-token').mockReturnValueOnce('newpassword123');

      const db = {
        first: vi.fn(async () => ({ user_id: 'user-123' })),
        run: vi.fn(async () => ({ success: true })),
      };

      const sessionsKv = {
        get: vi.fn(async () => null),
        put: vi.fn(async () => {}),
      };

      await handleResetPassword(req, { SESSIONS: sessionsKv }, db);

      expect(sessionsKv.put).toHaveBeenCalledWith(
        'session-version:user-123',
        '1',
        expect.anything()
      );
    });
  });

  describe('successful flow', () => {
    it('updates password and invalidates all sessions', async () => {
      const req = {
        json: vi.fn(async () => ({ token: 'valid-token', password: 'newpassword123' })),
      };

      mocks.requireString.mockReturnValueOnce('valid-token').mockReturnValueOnce('newpassword123');

      const db = {
        first: vi.fn(async () => ({ user_id: 'user-123' })),
        run: vi.fn(async () => ({ success: true })),
      };

      const sessionsKv = {
        get: vi.fn(async () => '5'),
        put: vi.fn(async () => {}),
      };

      const result = await handleResetPassword(req, { SESSIONS: sessionsKv }, db);

      expect(db.run).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE users SET password_hash'),
        expect.any(Array)
      );

      expect(db.run).toHaveBeenCalledWith(
        expect.stringContaining('DELETE FROM password_reset_tokens'),
        ['user-123']
      );

      expect(sessionsKv.put).toHaveBeenCalledWith(
        'session-version:user-123',
        '6',
        expect.anything()
      );

      expect(result.body.message).toContain('Password reset successful');
    });
  });

  describe('mutation gaps', () => {
    it('forgot password db.run throws during token insert propagates error', async () => {
      const req = {
        json: vi.fn(async () => ({ email: 'test@example.com' })),
        headers: { get: vi.fn(() => null) },
      };

      const users = {
        findByEmail: vi.fn(async () => ({
          id: 'user-123',
          name: 'Test User',
          email: 'test@example.com',
        })),
      };

      const db = {
        run: vi.fn(async () => {
          throw new Error('DB failed');
        }),
      };

      await expect(
        handleForgotPassword(req, { APP_PUBLIC_ORIGIN: 'https://app.example.com' }, db, users)
      ).rejects.toThrow('DB failed');
    });

    it('forgot password missing origin returns same message as missing user', async () => {
      const req = {
        json: vi.fn(async () => ({ email: 'test@example.com' })),
        headers: { get: vi.fn(() => null) },
      };

      const users = {
        findByEmail: vi.fn(async () => ({
          id: 'user-123',
          name: 'Test User',
          email: 'test@example.com',
        })),
      };

      const db = { run: vi.fn(async () => ({ success: true })) };
      const mockLogger = { error: vi.fn(), info: vi.fn(), warn: vi.fn() };
      mocks.createLogger.mockReturnValue(mockLogger);

      const result = await handleForgotPassword(req, { APP_PUBLIC_ORIGIN: undefined }, db, users);

      expect(mockLogger.error).toHaveBeenCalledWith(
        'APP_PUBLIC_ORIGIN is not configured — password reset link origin unknown'
      );
      expect(result.body.message).toContain('If an account exists');
    });

    it('reset password throws when rate limit check fails', async () => {
      const req = {
        json: vi.fn(async () => ({ token: 'valid-token', password: 'newpassword123' })),
      };

      mocks.requireString.mockReturnValueOnce('valid-token').mockReturnValueOnce('newpassword123');

      mocks.checkRateLimit.mockRejectedValue(new Error('Rate limit service down'));

      await expect(handleResetPassword(req, {}, {})).rejects.toThrow('Rate limit service down');
    });

    it('reset password db.first throws during token lookup', async () => {
      const req = {
        json: vi.fn(async () => ({ token: 'valid-token', password: 'newpassword123' })),
      };

      mocks.requireString.mockReturnValueOnce('valid-token').mockReturnValueOnce('newpassword123');

      const db = {
        first: vi.fn(async () => {
          throw new Error('DB timeout');
        }),
      };

      await expect(handleResetPassword(req, {}, db)).rejects.toThrow('DB timeout');
    });

    it('reset password db.run throws during password update', async () => {
      const req = {
        json: vi.fn(async () => ({ token: 'valid-token', password: 'newpassword123' })),
      };

      mocks.requireString.mockReturnValueOnce('valid-token').mockReturnValueOnce('newpassword123');

      const db = {
        first: vi.fn(async () => ({ user_id: 'user-123' })),
        run: vi.fn(async () => {
          throw new Error('DB write failed');
        }),
      };

      await expect(handleResetPassword(req, {}, db)).rejects.toThrow('DB write failed');
    });

    it('reset password still succeeds when SESSIONS.get throws', async () => {
      const req = {
        json: vi.fn(async () => ({ token: 'valid-token', password: 'newpassword123' })),
      };

      mocks.requireString.mockReturnValueOnce('valid-token').mockReturnValueOnce('newpassword123');

      const db = {
        first: vi.fn(async () => ({ user_id: 'user-123' })),
        run: vi.fn(async () => ({ success: true })),
      };

      const sessionsKv = {
        get: vi.fn(async () => {
          throw new Error('KV unavailable');
        }),
      };

      const result = await handleResetPassword(req, { SESSIONS: sessionsKv }, db);

      expect(result.body.message).toContain('Password reset successful');
    });

    it('forgot password users.findByEmail throws', async () => {
      const req = {
        json: vi.fn(async () => ({ email: 'test@example.com' })),
        headers: { get: vi.fn(() => null) },
      };

      const users = {
        findByEmail: vi.fn(async () => {
          throw new Error('User lookup failed');
        }),
      };

      await expect(
        handleForgotPassword(req, { APP_PUBLIC_ORIGIN: 'https://app.example.com' }, {}, users)
      ).rejects.toThrow('User lookup failed');
    });
  });
});
