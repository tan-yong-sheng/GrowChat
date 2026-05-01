import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  sha256Hex,
  generateOpaqueToken,
  createRefreshToken,
  consumeRefreshToken,
  revokeRefreshToken,
} from './session.js';

describe('session.js - Refresh Token Management', () => {
  let mockEnv;

  beforeEach(() => {
    mockEnv = {
      SESSIONS: {
        put: vi.fn().mockResolvedValue(undefined),
        get: vi.fn(),
        delete: vi.fn().mockResolvedValue(undefined),
      },
    };
  });

  describe('sha256Hex', () => {
    it('should hash input to SHA-256 hex string', async () => {
      const input = 'test-input';
      const result = await sha256Hex(input);

      expect(typeof result).toBe('string');
      expect(result.length).toBe(64); // SHA-256 is 256 bits = 64 hex chars
      expect(/^[0-9a-f]{64}$/.test(result)).toBe(true);
    });

    it('should produce consistent hash for same input', async () => {
      const input = 'consistent-hash-test';
      const hash1 = await sha256Hex(input);
      const hash2 = await sha256Hex(input);

      expect(hash1).toBe(hash2);
    });

    it('should produce different hash for different inputs', async () => {
      const hash1 = await sha256Hex('input1');
      const hash2 = await sha256Hex('input2');

      expect(hash1).not.toBe(hash2);
    });

    it('should handle empty string', async () => {
      const result = await sha256Hex('');

      expect(result.length).toBe(64);
      expect(/^[0-9a-f]{64}$/.test(result)).toBe(true);
    });

    it('should handle long input', async () => {
      const longInput = 'x'.repeat(10000);
      const result = await sha256Hex(longInput);

      expect(result.length).toBe(64);
    });

    it('should handle Unicode input', async () => {
      const result = await sha256Hex('你好世界🌍');

      expect(result.length).toBe(64);
      expect(/^[0-9a-f]{64}$/.test(result)).toBe(true);
    });

    it('should handle special characters', async () => {
      const result = await sha256Hex('!@#$%^&*()[]{}|;:,.<>?"\\');

      expect(result.length).toBe(64);
    });
  });

  describe('generateOpaqueToken', () => {
    it('should generate a base64url-encoded token', () => {
      const token = generateOpaqueToken();

      expect(typeof token).toBe('string');
      expect(token.length).toBeGreaterThan(0);
      // Base64url only contains [A-Za-z0-9-_]
      expect(/^[A-Za-z0-9\-_]+$/.test(token)).toBe(true);
    });

    it('should generate tokens that are 32 bytes when decoded', () => {
      const token = generateOpaqueToken();

      // Token is base64url-encoded 32 bytes, typically ~43 characters
      expect(token.length).toBeGreaterThan(35);
      expect(token.length).toBeLessThan(50);
    });

    it('should generate different tokens on each call', () => {
      const token1 = generateOpaqueToken();
      const token2 = generateOpaqueToken();
      const token3 = generateOpaqueToken();

      expect(token1).not.toBe(token2);
      expect(token2).not.toBe(token3);
      expect(token1).not.toBe(token3);
    });

    it('should not contain + or / characters (base64url safe)', () => {
      const tokens = Array.from({ length: 100 }, () => generateOpaqueToken());

      tokens.forEach((token) => {
        expect(token).not.toContain('+');
        expect(token).not.toContain('/');
        expect(token).not.toContain('=');
      });
    });

    it('should generate valid tokens repeatedly', () => {
      const tokens = Array.from({ length: 100 }, () => generateOpaqueToken());
      tokens.forEach((token) => {
        expect(/^[A-Za-z0-9\-_]+$/.test(token)).toBe(true);
      });
    });
  });

  describe('createRefreshToken', () => {
    it('should create refresh token and store in KV', async () => {
      const userId = 'user-123';
      const result = await createRefreshToken(mockEnv, userId);

      expect(result).toHaveProperty('token');
      expect(result).toHaveProperty('expiresAt');
      expect(typeof result.token).toBe('string');
      expect(typeof result.expiresAt).toBe('number');
    });

    it('should store hashed token in KV under refresh: key', async () => {
      const userId = 'user-456';
      await createRefreshToken(mockEnv, userId);

      expect(mockEnv.SESSIONS.put).toHaveBeenCalled();
      const call = mockEnv.SESSIONS.put.mock.calls[0];
      expect(call[0]).toMatch(/^refresh:/);
    });

    it('should set expiration to 7 days from now', async () => {
      const userId = 'user-789';
      const beforeTime = Math.floor(Date.now() / 1000);
      const result = await createRefreshToken(mockEnv, userId);
      const afterTime = Math.floor(Date.now() / 1000);

      const sevenDaysSeconds = 60 * 60 * 24 * 7;
      const expectedMin = beforeTime + sevenDaysSeconds;
      const expectedMax = afterTime + sevenDaysSeconds;

      expect(result.expiresAt).toBeGreaterThanOrEqual(expectedMin);
      expect(result.expiresAt).toBeLessThanOrEqual(expectedMax);
    });

    it('should store gate key and data key in KV', async () => {
      const userId = 'user-abc';
      await createRefreshToken(mockEnv, userId);

      expect(mockEnv.SESSIONS.put).toHaveBeenCalledTimes(2);
      // Gate key: refresh:HASH = '1'
      const gateCall = mockEnv.SESSIONS.put.mock.calls[0];
      expect(gateCall[0]).toMatch(/^refresh:/);
      expect(gateCall[1]).toBe('1');
      // Data key: refresh-data:HASH = { userId, expiresAt }
      const dataCall = mockEnv.SESSIONS.put.mock.calls[1];
      expect(dataCall[0]).toMatch(/^refresh-data:/);
      const storedData = JSON.parse(dataCall[1]);
      expect(storedData.userId).toBe(userId);
      expect(storedData.expiresAt).toBeTruthy();
    });

    it('should set KV TTL to 7 days on both keys', async () => {
      await createRefreshToken(mockEnv, 'user-xyz');

      const gateCall = mockEnv.SESSIONS.put.mock.calls[0];
      const dataCall = mockEnv.SESSIONS.put.mock.calls[1];
      expect(gateCall[2].expirationTtl).toBe(60 * 60 * 24 * 7);
      expect(dataCall[2].expirationTtl).toBe(60 * 60 * 24 * 7);
    });

    it('should generate opaque token each time', async () => {
      const userId = 'user-def';
      const result1 = await createRefreshToken(mockEnv, userId);
      const result2 = await createRefreshToken(mockEnv, userId);

      expect(result1.token).not.toBe(result2.token);
    });

    it('should handle null userId gracefully', async () => {
      await expect(createRefreshToken(mockEnv, null)).resolves.toHaveProperty('token');
    });
  });

  describe('consumeRefreshToken', () => {
    it('should delete gate key then read data key from KV', async () => {
      const tokenHash = await sha256Hex('test-token');
      const userData = { userId: 'user-123', expiresAt: Math.floor(Date.now() / 1000) + 3600 };

      mockEnv.SESSIONS.get.mockResolvedValue(userData);

      const token = 'test-token';
      const result = await consumeRefreshToken(mockEnv, token);

      expect(result).toEqual(userData);
      // Gate deleted first
      expect(mockEnv.SESSIONS.delete).toHaveBeenNthCalledWith(1, `refresh:${tokenHash}`);
      // Data read from separate key
      expect(mockEnv.SESSIONS.get).toHaveBeenCalledWith(`refresh-data:${tokenHash}`, 'json');
    });

    it('should return null for missing data', async () => {
      mockEnv.SESSIONS.get.mockResolvedValue(null);

      const result = await consumeRefreshToken(mockEnv, 'nonexistent-token');

      expect(result).toBeNull();
    });

    it('should return null for null token', async () => {
      const result = await consumeRefreshToken(mockEnv, null);

      expect(result).toBeNull();
      expect(mockEnv.SESSIONS.get).not.toHaveBeenCalled();
    });

    it('should return null for expired token', async () => {
      const expiredData = { userId: 'user-123', expiresAt: Math.floor(Date.now() / 1000) - 1 };
      mockEnv.SESSIONS.get.mockResolvedValue(expiredData);

      const result = await consumeRefreshToken(mockEnv, 'expired-token');

      expect(result).toBeNull();
    });

    it('should delete gate key on consumption', async () => {
      const userData = { userId: 'user-456', expiresAt: Math.floor(Date.now() / 1000) + 3600 };
      mockEnv.SESSIONS.get.mockResolvedValue(userData);

      const token = 'valid-token';
      await consumeRefreshToken(mockEnv, token);

      const tokenHash = await sha256Hex(token);
      expect(mockEnv.SESSIONS.delete).toHaveBeenCalledWith(`refresh:${tokenHash}`);
    });

    it('should handle undefined token', async () => {
      const result = await consumeRefreshToken(mockEnv, undefined);

      expect(result).toBeNull();
    });
  });

  describe('revokeRefreshToken', () => {
    it('should delete both gate and data keys from KV', async () => {
      const token = 'token-to-revoke';
      const tokenHash = await sha256Hex(token);

      await revokeRefreshToken(mockEnv, token);

      expect(mockEnv.SESSIONS.delete).toHaveBeenCalledTimes(2);
      expect(mockEnv.SESSIONS.delete).toHaveBeenCalledWith(`refresh:${tokenHash}`);
      expect(mockEnv.SESSIONS.delete).toHaveBeenCalledWith(`refresh-data:${tokenHash}`);
    });

    it('should handle null token gracefully', async () => {
      await revokeRefreshToken(mockEnv, null);

      expect(mockEnv.SESSIONS.delete).not.toHaveBeenCalled();
    });

    it('should handle undefined token gracefully', async () => {
      await revokeRefreshToken(mockEnv, undefined);

      expect(mockEnv.SESSIONS.delete).not.toHaveBeenCalled();
    });

    it('should be idempotent (safe to call multiple times)', async () => {
      const token = 'token-to-revoke';

      await revokeRefreshToken(mockEnv, token);
      await revokeRefreshToken(mockEnv, token);
      await revokeRefreshToken(mockEnv, token);

      expect(mockEnv.SESSIONS.delete).toHaveBeenCalledTimes(6);
    });

    it('should hash token before deletion', async () => {
      const token = 'secret-token';
      const hash = await sha256Hex(token);

      await revokeRefreshToken(mockEnv, token);

      expect(mockEnv.SESSIONS.delete).toHaveBeenCalledWith(`refresh:${hash}`);
      expect(mockEnv.SESSIONS.delete).toHaveBeenCalledWith(`refresh-data:${hash}`);
    });
  });

  describe('Integration scenarios', () => {
    it('should create and consume token successfully', async () => {
      const userId = 'user-integration';
      const { token } = await createRefreshToken(mockEnv, userId);

      // Data is stored in the second put call (refresh-data key)
      const dataCall = mockEnv.SESSIONS.put.mock.calls[1];
      const storedData = JSON.parse(dataCall[1]);

      mockEnv.SESSIONS.get.mockResolvedValue(storedData);

      const consumed = await consumeRefreshToken(mockEnv, token);

      expect(consumed.userId).toBe(userId);
      expect(consumed.expiresAt).toBe(storedData.expiresAt);
    });

    it('should revoke token before consumption', async () => {
      const userId = 'user-revoke-test';
      const { token } = await createRefreshToken(mockEnv, userId);

      await revokeRefreshToken(mockEnv, token);
      mockEnv.SESSIONS.get.mockResolvedValue(null);

      const result = await consumeRefreshToken(mockEnv, token);

      expect(result).toBeNull();
    });

    it('should handle token rotation (old token revoked, new generated)', async () => {
      const userId = 'user-rotation';

      // Old token
      const { token: oldToken } = await createRefreshToken(mockEnv, userId);
      await revokeRefreshToken(mockEnv, oldToken);

      // New token
      const { token: newToken } = await createRefreshToken(mockEnv, userId);
      expect(newToken).not.toBe(oldToken);
    });
  });
});
