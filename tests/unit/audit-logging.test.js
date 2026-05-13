import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  logSecurityEvent,
  trackFailedLoginAttempt,
  clearFailedLoginAttempts,
  shouldLockAccount,
  SecurityEventTypes,
} from '../../src/services/audit-logging.js';

describe('Audit Logging Service', () => {
  let mockKV;
  let env;

  beforeEach(() => {
    mockKV = {
      get: vi.fn(),
      put: vi.fn(),
      delete: vi.fn(),
    };

    env = {
      SESSIONS: mockKV,
    };
  });

  describe('logSecurityEvent', () => {
    it('logs security event to KV', async () => {
      await logSecurityEvent(env, SecurityEventTypes.LOGIN_SUCCESS, {
        userId: 'user-123',
        ip: '192.168.1.1',
      });

      expect(mockKV.put).toHaveBeenCalledWith(
        expect.stringContaining('audit:'),
        expect.stringContaining('login_success'),
        { expirationTtl: 90 * 24 * 60 * 60 }
      );
    });

    it('handles missing SESSIONS binding gracefully', async () => {
      const envWithoutSessions = {};

      // Should not throw
      await logSecurityEvent(envWithoutSessions, SecurityEventTypes.LOGIN_FAILURE);
      expect(true).toBe(true);
    });
  });

  describe('trackFailedLoginAttempt', () => {
    it('tracks failed login attempts', async () => {
      mockKV.get.mockResolvedValue(null);

      const attempts = await trackFailedLoginAttempt(env, 'user@example.com');

      expect(attempts).toBe(1);
      expect(mockKV.put).toHaveBeenCalled();
    });

    it('increments existing attempts', async () => {
      const now = Date.now();
      mockKV.get.mockResolvedValue({
        email: 'user@example.com',
        attempts: [now - 1000, now - 500],
      });

      const attempts = await trackFailedLoginAttempt(env, 'user@example.com');

      expect(attempts).toBe(3);
    });

    it('filters out attempts older than 1 hour', async () => {
      const now = Date.now();
      const oneHourAgo = now - 60 * 60 * 1000;
      mockKV.get.mockResolvedValue({
        email: 'user@example.com',
        attempts: [
          oneHourAgo - 1000, // older than 1 hour
          now - 1000, // within 1 hour
          now - 500, // within 1 hour
        ],
      });

      const attempts = await trackFailedLoginAttempt(env, 'user@example.com');

      expect(attempts).toBe(3); // 2 valid + 1 new
    });
  });

  describe('clearFailedLoginAttempts', () => {
    it('clears failed login attempts', async () => {
      await clearFailedLoginAttempts(env, 'user@example.com');

      expect(mockKV.delete).toHaveBeenCalledWith('login_attempts:user@example.com');
    });
  });

  describe('shouldLockAccount', () => {
    it('returns false when attempts are below threshold', () => {
      expect(shouldLockAccount(3, 5)).toBe(false);
      expect(shouldLockAccount(4, 5)).toBe(false);
    });

    it('returns true when attempts meet or exceed threshold', () => {
      expect(shouldLockAccount(5, 5)).toBe(true);
      expect(shouldLockAccount(6, 5)).toBe(true);
    });

    it('uses default threshold of 5', () => {
      expect(shouldLockAccount(4)).toBe(false);
      expect(shouldLockAccount(5)).toBe(true);
    });
  });
});
