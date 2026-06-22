// @vitest-environment node
import { describe, expect, it, vi, beforeEach } from 'vitest';
import {
  logSecurityEvent,
  trackFailedLoginAttempt,
  clearFailedLoginAttempts,
  shouldLockAccount,
  SecurityEventTypes,
} from './audit-logging.js';

// Create mock using vi.hoisted so it's properly hoisted
const mockLogger = vi.hoisted(() => ({
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
}));

vi.mock('../utils/logger.js', () => ({
  createRootLogger: () => mockLogger,
}));

describe('audit-logging', () => {
  let mockKV;

  beforeEach(() => {
    vi.clearAllMocks();
    mockLogger.warn.mockClear();
    mockLogger.error.mockClear();
    mockKV = {
      get: vi.fn(),
      put: vi.fn(),
      delete: vi.fn(),
    };
  });

  describe('logSecurityEvent', () => {
    it('logs event to KV with correct prefix and TTL', async () => {
      await logSecurityEvent({ SESSIONS: mockKV }, SecurityEventTypes.LOGIN_SUCCESS, {
        userId: 'user-123',
      });

      expect(mockKV.put).toHaveBeenCalledWith(
        expect.stringMatching(/^audit:/),
        expect.any(String),
        expect.objectContaining({ expirationTtl: expect.any(Number) })
      );
    });

    it('includes event type, timestamp, and details in stored event', async () => {
      await logSecurityEvent({ SESSIONS: mockKV }, SecurityEventTypes.LOGIN_FAILURE, {
        userId: 'user-123',
        ip: '1.2.3.4',
      });

      const putCall = mockKV.put.mock.calls[0];
      const storedEvent = JSON.parse(putCall[1]);

      expect(storedEvent.type).toBe(SecurityEventTypes.LOGIN_FAILURE);
      expect(storedEvent.timestamp).toBeDefined();
      expect(storedEvent.userId).toBe('user-123');
      expect(storedEvent.ip).toBe('1.2.3.4');
    });

    it('warns and returns when SESSIONS KV is not available', async () => {
      await logSecurityEvent({}, SecurityEventTypes.LOGIN_SUCCESS, { userId: 'user-123' });

      expect(mockLogger.warn).toHaveBeenCalledWith(
        'SESSIONS KV binding required for audit logging'
      );
    });

    it('does not throw when KV put fails', async () => {
      mockKV.put.mockRejectedValue(new Error('KV error'));

      await expect(
        logSecurityEvent({ SESSIONS: mockKV }, SecurityEventTypes.LOGIN_SUCCESS, {
          userId: 'user-123',
        })
      ).resolves.not.toThrow();
    });

    it('generates unique event IDs', async () => {
      await logSecurityEvent({ SESSIONS: mockKV }, SecurityEventTypes.LOGIN_SUCCESS, {});
      await logSecurityEvent({ SESSIONS: mockKV }, SecurityEventTypes.LOGIN_SUCCESS, {});

      const firstId = mockKV.put.mock.calls[0][0];
      const secondId = mockKV.put.mock.calls[1][0];
      expect(firstId).not.toBe(secondId);
    });

    it('accepts empty details object', async () => {
      await logSecurityEvent({ SESSIONS: mockKV }, SecurityEventTypes.SUSPICIOUS_ACTIVITY, {});

      expect(mockKV.put).toHaveBeenCalled();
      const storedEvent = JSON.parse(mockKV.put.mock.calls[0][1]);
      expect(storedEvent.userId).toBeUndefined();
    });

    it('uses 90 day TTL (90 * 24 * 60 * 60 seconds)', async () => {
      await logSecurityEvent({ SESSIONS: mockKV }, SecurityEventTypes.LOGIN_SUCCESS, {});

      const ttl = mockKV.put.mock.calls[0][2].expirationTtl;
      expect(ttl).toBe(90 * 24 * 60 * 60);
    });
  });

  describe('trackFailedLoginAttempt', () => {
    it('returns 0 when SESSIONS KV is not available', async () => {
      const result = await trackFailedLoginAttempt({}, 'test@example.com');
      expect(result).toBe(0);
    });

    it('returns 0 when KV get fails', async () => {
      mockKV.get.mockRejectedValue(new Error('KV error'));

      const result = await trackFailedLoginAttempt({ SESSIONS: mockKV }, 'test@example.com');
      expect(result).toBe(0);
    });

    it('creates new entry for first failed attempt', async () => {
      mockKV.get.mockResolvedValue(null);

      const result = await trackFailedLoginAttempt({ SESSIONS: mockKV }, 'test@example.com');

      expect(result).toBe(1);
      expect(mockKV.put).toHaveBeenCalledWith(
        'login_attempts:test@example.com',
        expect.any(String),
        expect.objectContaining({ expirationTtl: 3600 })
      );
    });

    it('filters out attempts older than 1 hour', async () => {
      // Use a fixed reference time for determinism
      const now = 1000000000000;
      const oneHourInMs = 60 * 60 * 1000;
      const oldAttempt = now - oneHourInMs - 1000; // Just over 1 hour ago
      const recentAttempt = now - 1000; // 1 second ago

      // Mock Date.now() to return our fixed reference time
      const dateNowSpy = vi.spyOn(Date, 'now').mockReturnValue(now);

      mockKV.get.mockResolvedValue({
        attempts: [oldAttempt, recentAttempt],
        email: 'test@example.com',
      });

      const result = await trackFailedLoginAttempt({ SESSIONS: mockKV }, 'test@example.com');

      // Result = 1 recent attempt kept + 1 new attempt added = 2
      expect(result).toBe(2);
      const stored = JSON.parse(mockKV.put.mock.calls[0][1]);
      expect(stored.attempts).toHaveLength(2);
      expect(stored.attempts[0]).toBe(recentAttempt);
      expect(stored.attempts[1]).toBe(now);

      dateNowSpy.mockRestore();
    });

    it('adds new attempt to existing list', async () => {
      mockKV.get.mockResolvedValue({
        attempts: [Date.now() - 300000],
        email: 'test@example.com',
      });

      const result = await trackFailedLoginAttempt({ SESSIONS: mockKV }, 'test@example.com');

      expect(result).toBe(2);
      const stored = JSON.parse(mockKV.put.mock.calls[0][1]);
      expect(stored.attempts).toHaveLength(2);
    });

    it('handles null/undefined attempts in stored data', async () => {
      mockKV.get.mockResolvedValue({
        attempts: null,
        email: 'test@example.com',
      });

      const result = await trackFailedLoginAttempt({ SESSIONS: mockKV }, 'test@example.com');
      expect(result).toBe(1);
    });

    it('handles malformed stored data', async () => {
      mockKV.get.mockResolvedValue({ notAttempts: [] });

      const result = await trackFailedLoginAttempt({ SESSIONS: mockKV }, 'test@example.com');
      expect(result).toBe(1);
    });

    it('returns 0 on KV put failure', async () => {
      mockKV.get.mockResolvedValue(null);
      mockKV.put.mockRejectedValue(new Error('KV error'));

      const result = await trackFailedLoginAttempt({ SESSIONS: mockKV }, 'test@example.com');
      expect(result).toBe(0);
    });
  });

  describe('clearFailedLoginAttempts', () => {
    it('returns early when SESSIONS KV is not available', async () => {
      await clearFailedLoginAttempts({}, 'test@example.com');
      expect(mockKV.delete).not.toHaveBeenCalled();
    });

    it('deletes the login attempts key', async () => {
      await clearFailedLoginAttempts({ SESSIONS: mockKV }, 'test@example.com');
      expect(mockKV.delete).toHaveBeenCalledWith('login_attempts:test@example.com');
    });

    it('does not throw when KV delete fails', async () => {
      mockKV.delete.mockRejectedValue(new Error('KV error'));

      await expect(
        clearFailedLoginAttempts({ SESSIONS: mockKV }, 'test@example.com')
      ).resolves.not.toThrow();
    });

    it('handles special characters in email', async () => {
      await clearFailedLoginAttempts({ SESSIONS: mockKV }, 'test+special@example.com');
      expect(mockKV.delete).toHaveBeenCalledWith('login_attempts:test+special@example.com');
    });
  });

  describe('shouldLockAccount', () => {
    it('returns true when failed attempts >= maxAttempts', () => {
      expect(shouldLockAccount(5, 5)).toBe(true);
      expect(shouldLockAccount(6, 5)).toBe(true);
      expect(shouldLockAccount(100, 5)).toBe(true);
    });

    it('returns false when failed attempts < maxAttempts', () => {
      expect(shouldLockAccount(0, 5)).toBe(false);
      expect(shouldLockAccount(4, 5)).toBe(false);
      expect(shouldLockAccount(-1, 5)).toBe(false);
    });

    it('uses default maxAttempts of 5', () => {
      expect(shouldLockAccount(5)).toBe(true);
      expect(shouldLockAccount(4)).toBe(false);
    });

    it('handles edge cases', () => {
      expect(shouldLockAccount(1, 1)).toBe(true);
      expect(shouldLockAccount(0, 1)).toBe(false);
      expect(shouldLockAccount(1000, 1000)).toBe(true);
    });
  });

  describe('SecurityEventTypes enum', () => {
    it('contains login event types', () => {
      expect(SecurityEventTypes.LOGIN_SUCCESS).toBe('login_success');
      expect(SecurityEventTypes.LOGIN_FAILURE).toBe('login_failure');
      expect(SecurityEventTypes.LOGIN_ATTEMPT_BLOCKED).toBe('login_attempt_blocked');
    });

    it('contains password reset event types', () => {
      expect(SecurityEventTypes.PASSWORD_RESET_REQUESTED).toBe('password_reset_requested');
      expect(SecurityEventTypes.PASSWORD_RESET_SUCCESS).toBe('password_reset_success');
    });

    it('contains API key event types', () => {
      expect(SecurityEventTypes.API_KEY_CREATED).toBe('api_key_created');
      expect(SecurityEventTypes.API_KEY_REVOKED).toBe('api_key_revoked');
    });

    it('contains security event types', () => {
      expect(SecurityEventTypes.UNAUTHORIZED_ACCESS_ATTEMPT).toBe('unauthorized_access_attempt');
      expect(SecurityEventTypes.CSRF_TOKEN_VALIDATION_FAILED).toBe('csrf_token_validation_failed');
      expect(SecurityEventTypes.SUSPICIOUS_ACTIVITY).toBe('suspicious_activity');
    });
  });

  describe('mutation gaps', () => {
    it('logSecurityEvent warns and returns when env exists but SESSIONS is falsy', async () => {
      await logSecurityEvent({ SESSIONS: null }, SecurityEventTypes.LOGIN_SUCCESS, {
        userId: 'u1',
      });

      expect(mockLogger.warn).toHaveBeenCalledWith(
        'SESSIONS KV binding required for audit logging'
      );
    });

    it('trackFailedLoginAttempt handles null stored data', async () => {
      mockKV.get.mockResolvedValue(null);

      const result = await trackFailedLoginAttempt({ SESSIONS: mockKV }, 'test@example.com');

      expect(result).toBe(1);
      expect(mockKV.put).toHaveBeenCalledWith(
        'login_attempts:test@example.com',
        expect.any(String),
        expect.objectContaining({ expirationTtl: 3600 })
      );
    });

    it('trackFailedLoginAttempt handles stored object without attempts property', async () => {
      mockKV.get.mockResolvedValue({ email: 'test@example.com' });

      const result = await trackFailedLoginAttempt({ SESSIONS: mockKV }, 'test@example.com');

      expect(result).toBe(1);
      const stored = JSON.parse(mockKV.put.mock.calls[0][1]);
      expect(stored.attempts).toHaveLength(1);
    });

    it('trackFailedLoginAttempt handles empty attempts array', async () => {
      mockKV.get.mockResolvedValue({ attempts: [], email: 'test@example.com' });

      const result = await trackFailedLoginAttempt({ SESSIONS: mockKV }, 'test@example.com');

      expect(result).toBe(1);
      const stored = JSON.parse(mockKV.put.mock.calls[0][1]);
      expect(stored.attempts).toHaveLength(1);
    });

    it('trackFailedLoginAttempt returns 0 when KV get throws', async () => {
      mockKV.get.mockRejectedValue(new Error('KV unreachable'));

      const result = await trackFailedLoginAttempt({ SESSIONS: mockKV }, 'test@example.com');

      expect(result).toBe(0);
      expect(mockLogger.error).toHaveBeenCalledWith(
        'Failed to track login attempt',
        expect.anything()
      );
    });

    it('logSecurityEvent logs error but does not throw when KV put fails', async () => {
      mockKV.put.mockRejectedValue(new Error('KV write failed'));

      await expect(
        logSecurityEvent({ SESSIONS: mockKV }, SecurityEventTypes.LOGIN_SUCCESS, { userId: 'u1' })
      ).resolves.not.toThrow();

      expect(mockLogger.error).toHaveBeenCalledWith(
        'Failed to log security event',
        expect.anything()
      );
    });

    it('shouldLockAccount handles negative attempts', () => {
      expect(shouldLockAccount(-1, 5)).toBe(false);
      expect(shouldLockAccount(-5, 5)).toBe(false);
    });

    it('shouldLockAccount handles custom maxAttempts of 1', () => {
      expect(shouldLockAccount(1, 1)).toBe(true);
      expect(shouldLockAccount(0, 1)).toBe(false);
    });
  });
});
