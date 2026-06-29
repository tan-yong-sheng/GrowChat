import { describe, it, expect, beforeEach, vi } from 'vitest';
import { generateCsrfToken, validateCsrfToken, requireCsrfToken } from '../../src/services/csrf.js';

describe('CSRF Protection Service', () => {
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

  describe('generateCsrfToken', () => {
    it('generates a new token and stores it in KV', async () => {
      const sessionId = 'test-session-123';

      const token = await generateCsrfToken(env, sessionId);

      expect(token).toBeTruthy();
      expect(typeof token).toBe('string');
      expect(mockKV.put).toHaveBeenCalledWith(
        expect.stringContaining('csrf:'),
        expect.stringContaining(sessionId),
        { expirationTtl: 3600 }
      );
    });

    it('throws error if SESSIONS binding is missing', async () => {
      const envWithoutSessions = {};

      await expect(generateCsrfToken(envWithoutSessions, 'session')).rejects.toThrow(
        'SESSIONS KV binding is required'
      );
    });
  });

  describe('validateCsrfToken', () => {
    it('returns true for valid token', async () => {
      const token = 'test-token';
      const sessionId = 'test-session-123';

      mockKV.get.mockResolvedValue({ sessionId, createdAt: Date.now() });

      const isValid = await validateCsrfToken({ env, token, sessionId });

      expect(isValid).toBe(true);
      expect(mockKV.delete).toHaveBeenCalledWith(expect.stringContaining(token));
    });

    it('returns false for missing token', async () => {
      const isValid = await validateCsrfToken({ env, token: '', sessionId: 'session-123' });

      expect(isValid).toBe(false);
      expect(mockKV.get).not.toHaveBeenCalled();
    });

    it('returns false for expired/non-existent token', async () => {
      mockKV.get.mockResolvedValue(null);

      const isValid = await validateCsrfToken({
        env,
        token: 'invalid-token',
        sessionId: 'session-123',
      });

      expect(isValid).toBe(false);
      expect(mockKV.delete).not.toHaveBeenCalled();
    });

    it('returns false if session ID does not match', async () => {
      mockKV.get.mockResolvedValue({ sessionId: 'other-session' });

      const isValid = await validateCsrfToken({ env, token: 'token', sessionId: 'my-session' });

      expect(isValid).toBe(false);
    });

    it('returns false if SESSIONS binding is missing', async () => {
      const envWithoutSessions = {};
      const isValid = await validateCsrfToken({
        env: envWithoutSessions,
        token: 'token',
        sessionId: 'session',
      });

      expect(isValid).toBe(false);
    });
  });

  describe('requireCsrfToken', () => {
    it('skips validation for GET requests', async () => {
      const req = new Request('http://localhost/api/data', { method: 'GET' });

      const result = await requireCsrfToken({ req, env, sessionId: 'session-123' });

      expect(result).toBeNull();
      expect(mockKV.get).not.toHaveBeenCalled();
    });

    it('requires token for POST requests', async () => {
      const req = new Request('http://localhost/api/data', {
        method: 'POST',
        headers: { 'X-CSRF-Token': '' },
      });

      const result = await requireCsrfToken({ req, env, sessionId: 'session-123' });

      expect(result).not.toBeNull();
      expect(result.status).toBe(403);
    });

    it('validates token for POST requests', async () => {
      mockKV.get.mockResolvedValue({ sessionId: 'session-123' });

      const req = new Request('http://localhost/api/data', {
        method: 'POST',
        headers: { 'X-CSRF-Token': 'valid-token' },
      });

      const result = await requireCsrfToken({ req, env, sessionId: 'session-123' });

      expect(result).toBeNull();
    });
  });
});
