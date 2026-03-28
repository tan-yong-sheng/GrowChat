import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { signJWT, verifyJWT, hashPassword, verifyPassword } from './auth.js';

describe('auth.js - JWT Token Management', () => {
  const secret = 'test-secret-key-12345';

  describe('signJWT', () => {
    it('should sign a JWT with payload and expiration', async () => {
      const payload = { sub: 'user123', email: 'test@example.com' };
      const token = await signJWT(payload, secret, 3600);

      expect(token).toBeTruthy();
      expect(typeof token).toBe('string');
      expect(token.split('.').length).toBe(3);
    });

    it('should use default TTL of 15 minutes when not specified', async () => {
      const payload = { sub: 'user123' };
      const token = await signJWT(payload, secret);

      expect(token).toBeTruthy();
      const decoded = await verifyJWT(token, secret);
      const now = Math.floor(Date.now() / 1000);
      const expectedExp = now + 60 * 15;
      expect(Math.abs(decoded.exp - expectedExp)).toBeLessThan(2);
    });

    it('should include iat and exp claims', async () => {
      const payload = { sub: 'user123', primary_role: 'admin' };
      const token = await signJWT(payload, secret, 3600);
      const decoded = await verifyJWT(token, secret);

      expect(decoded).toHaveProperty('iat');
      expect(decoded).toHaveProperty('exp');
      expect(decoded.sub).toBe('user123');
      expect(decoded.primary_role).toBe('admin');
    });
  });

  describe('verifyJWT', () => {
    it('should verify a valid token', async () => {
      const payload = { sub: 'user456', email: 'user@example.com' };
      const token = await signJWT(payload, secret, 3600);
      const decoded = await verifyJWT(token, secret);

      expect(decoded.sub).toBe('user456');
      expect(decoded.email).toBe('user@example.com');
    });

    it('should throw on malformed token', async () => {
      await expect(verifyJWT('invalid.token', secret)).rejects.toThrow('Invalid token');
      await expect(verifyJWT('two.parts', secret)).rejects.toThrow('Invalid token');
      await expect(verifyJWT('', secret)).rejects.toThrow('Invalid token');
    });

    it('should throw on invalid signature', async () => {
      const payload = { sub: 'user789' };
      const token = await signJWT(payload, secret, 3600);
      const parts = token.split('.');
      const tamperedToken = parts[0] + '.' + parts[1] + '.invalidsignature';

      await expect(verifyJWT(tamperedToken, secret)).rejects.toThrow('Invalid signature');
    });

    it('should throw on expired token', async () => {
      const payload = { sub: 'user999' };
      const token = await signJWT(payload, secret, -1); // Expired 1 second ago

      await expect(verifyJWT(token, secret)).rejects.toThrow('Token expired');
    });

    it('should reject null or undefined tokens', async () => {
      await expect(verifyJWT(null, secret)).rejects.toThrow();
      await expect(verifyJWT(undefined, secret)).rejects.toThrow();
    });

    it('should reject token with wrong secret', async () => {
      const payload = { sub: 'user111' };
      const token = await signJWT(payload, secret, 3600);

      await expect(verifyJWT(token, 'wrong-secret')).rejects.toThrow('Invalid signature');
    });
  });

  describe('hashPassword', () => {
    it('should hash a password', async () => {
      const password = 'MySecurePassword123!';
      const hash = await hashPassword(password);

      expect(hash).toBeTruthy();
      expect(typeof hash).toBe('string');
      expect(hash).toMatch(/^pbkdf2:/);
    });

    it('should produce different hashes for same password (random salt)', async () => {
      const password = 'SamePassword123!';
      const hash1 = await hashPassword(password);
      const hash2 = await hashPassword(password);

      expect(hash1).not.toBe(hash2);
    });

    it('should produce consistent format: pbkdf2:salt:hash', async () => {
      const password = 'TestPassword456!';
      const hash = await hashPassword(password);
      const parts = hash.split(':');

      expect(parts.length).toBe(3);
      expect(parts[0]).toBe('pbkdf2');
      expect(parts[1].length).toBeGreaterThan(0); // salt
      expect(parts[2].length).toBeGreaterThan(0); // derived hash
    });

    it('should handle empty password', async () => {
      const hash = await hashPassword('');
      expect(hash).toMatch(/^pbkdf2:/);
    });

    it('should handle very long password', async () => {
      const longPassword = 'x'.repeat(1000);
      const hash = await hashPassword(longPassword);
      expect(hash).toMatch(/^pbkdf2:/);
    });

    it('should handle special characters in password', async () => {
      const specialPassword = '!@#$%^&*()_+-=[]{}|;:",.<>?/~`';
      const hash = await hashPassword(specialPassword);
      expect(hash).toMatch(/^pbkdf2:/);
    });
  });

  describe('verifyPassword', () => {
    it('should verify correct password', async () => {
      const password = 'CorrectPassword123!';
      const hash = await hashPassword(password);
      const isValid = await verifyPassword(password, hash);

      expect(isValid).toBe(true);
    });

    it('should reject incorrect password', async () => {
      const password = 'CorrectPassword123!';
      const hash = await hashPassword(password);
      const isValid = await verifyPassword('WrongPassword456!', hash);

      expect(isValid).toBe(false);
    });

    it('should handle case sensitivity', async () => {
      const password = 'MyPassword123';
      const hash = await hashPassword(password);
      const isValid = await verifyPassword('mypassword123', hash);

      expect(isValid).toBe(false);
    });

    it('should reject malformed hash', async () => {
      const result = await verifyPassword('password', 'invalid-hash-format');
      expect(result).toBe(false);
    });

    it('should reject hash without algorithm prefix', async () => {
      const result = await verifyPassword('password', 'somesalt:somehash');
      expect(result).toBe(false);
    });

    it('should reject invalid passwords of varying lengths', async () => {
      const password = 'TestPassword123!';
      const hash = await hashPassword(password);

      const result1 = await verifyPassword('w', hash);
      const result2 = await verifyPassword('WrongPassword123!', hash);

      expect(result1).toBe(false);
      expect(result2).toBe(false);
    });

    it('should reject password with wrong salt', async () => {
      const password = 'MyPassword123';
      const hash = await hashPassword(password);
      const [algo, _oldSalt, derivedHash] = hash.split(':');
      const wrongHash = `${algo}:0000000000000000000000000000000000000000:${derivedHash}`;

      const isValid = await verifyPassword(password, wrongHash);
      expect(isValid).toBe(false);
    });
  });

  describe('Edge cases and integration', () => {
    it('should sign and verify round-trip with complex payload', async () => {
      const complexPayload = {
        sub: 'user-with-uuid-123e4567-e89b-12d3-a456-426614174000',
        email: 'test+alias@example.co.uk',
        primary_role: 'admin',
        permissions: ['read', 'write', 'delete'],
        metadata: { org: 'acme', tier: 'enterprise' },
      };

      const token = await signJWT(complexPayload, secret, 7200);
      const decoded = await verifyJWT(token, secret);

      expect(decoded.sub).toBe(complexPayload.sub);
      expect(decoded.email).toBe(complexPayload.email);
      expect(decoded.primary_role).toBe(complexPayload.primary_role);
      expect(decoded.permissions).toEqual(complexPayload.permissions);
      expect(decoded.metadata).toEqual(complexPayload.metadata);
    });

    it('should handle password with unicode characters', async () => {
      const unicodePassword = 'пароль密码🔐';
      const hash = await hashPassword(unicodePassword);
      const isValid = await verifyPassword(unicodePassword, hash);

      expect(isValid).toBe(true);
    });
  });
});
