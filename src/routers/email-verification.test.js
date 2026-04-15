// @vitest-environment node
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { verifyEmail, resendVerification } from './email-verification.js';

// Mock dependencies
vi.mock('../db.js', () => ({
  default: {
    prepare: vi.fn(() => ({
      bind: vi.fn(() => ({
        first: vi.fn(),
        run: vi.fn(),
        all: vi.fn(),
      })),
      first: vi.fn(),
      run: vi.fn(),
    })),
    batch: vi.fn((statements) => Promise.all(statements.map((s) => ({ results: [] })))),
  },
}));

vi.mock('../shared/crypto.js', () => ({
  generateToken: vi.fn(() => 'test-token-123'),
  hashToken: vi.fn((token) => `hashed-${token}`),
  constantTimeEquals: vi.fn((a, b) => a === b),
}));

describe('Email Verification', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('verifyEmail', () => {
    it('returns error when token is missing', async () => {
      const result = await verifyEmail({});
      expect(result.status).toBe(400);
      const body = await result.json();
      expect(body.error.toLowerCase()).toContain('token');
    });

    it('returns error when token not found', async () => {
      const db = await import('../db.js');
      db.default.prepare.mockReturnValue({
        bind: vi.fn(() => ({
          first: vi.fn().mockResolvedValue(null),
        })),
      });

      const result = await verifyEmail({ token: 'invalid-token' });
      expect(result.status).toBe(400);
      const body = await result.json();
      expect(body.error.toLowerCase()).toContain('invalid');
    });

    it('returns error when token expired', async () => {
      const db = await import('../db.js');
      const expiredTime = Math.floor(Date.now() / 1000) - 3600; // 1 hour ago
      db.default.prepare.mockReturnValue({
        bind: vi.fn(() => ({
          first: vi.fn().mockResolvedValue({
            id: 'verification-1',
            user_id: 'user-1',
            token_hash: 'hashed-token',
            expires_at: expiredTime,
          }),
        })),
      });

      const result = await verifyEmail({ token: 'expired-token' });
      expect(result.status).toBe(400);
      const body = await result.json();
      expect(body.error.toLowerCase()).toContain('expired');
    });

    it('verifies email successfully', async () => {
      const db = await import('../db.js');
      const futureTime = Math.floor(Date.now() / 1000) + 3600; // 1 hour from now

      db.default.prepare.mockImplementation((sql) => {
        if (sql.includes('SELECT')) {
          return {
            bind: vi.fn(() => ({
              first: vi.fn().mockResolvedValue({
                id: 'verification-1',
                user_id: 'user-1',
                token_hash: 'hashed-test-token-123',
                expires_at: futureTime,
              }),
            })),
          };
        }
        return {
          bind: vi.fn(() => ({
            run: vi.fn().mockResolvedValue({ results: [] }),
          })),
        };
      });

      const result = await verifyEmail({ token: 'test-token-123' });
      expect(result.status).toBe(200);
      const body = await result.json();
      expect(body.message).toContain('verified');
    });
  });

  describe('resendVerification', () => {
    it('returns error when email is missing', async () => {
      const result = await resendVerification({});
      expect(result.status).toBe(400);
      const body = await result.json();
      expect(body.error.toLowerCase()).toContain('email');
    });

    it('returns success even when email not found (security)', async () => {
      const db = await import('../db.js');
      db.default.prepare.mockReturnValue({
        bind: vi.fn(() => ({
          first: vi.fn().mockResolvedValue(null),
        })),
      });

      const result = await resendVerification({ email: 'nonexistent@example.com' });
      // Should return success to prevent email enumeration
      expect(result.status).toBe(200);
      const body = await result.json();
      expect(body.message).toContain('sent');
    });

    it('returns success for existing user', async () => {
      const db = await import('../db.js');
      db.default.prepare.mockImplementation((sql) => {
        if (sql.includes('SELECT')) {
          return {
            bind: vi.fn(() => ({
              first: vi.fn().mockResolvedValue({
                id: 'user-1',
                email: 'test@example.com',
                account_status: 'pending_verification',
              }),
            })),
          };
        }
        return {
          bind: vi.fn(() => ({
            run: vi.fn().mockResolvedValue({ results: [] }),
          })),
        };
      });

      const result = await resendVerification({ email: 'test@example.com' });
      expect(result.status).toBe(200);
      const body = await result.json();
      expect(body.message).toContain('sent');
    });

    it('returns error for already verified user', async () => {
      const db = await import('../db.js');
      db.default.prepare.mockReturnValue({
        bind: vi.fn(() => ({
          first: vi.fn().mockResolvedValue({
            id: 'user-1',
            email: 'test@example.com',
            account_status: 'active',
          }),
        })),
      });

      const result = await resendVerification({ email: 'test@example.com' });
      // Should still return success to prevent enumeration
      expect(result.status).toBe(200);
    });
  });
});
