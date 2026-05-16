// @vitest-environment node
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { logAuditEvent, getAuditLogs } from './audit-log.js';

// Mock db
vi.mock('../db.js', () => ({
  default: {
    prepare: vi.fn(() => ({
      bind: vi.fn(() => ({
        run: vi.fn(),
        all: vi.fn(),
      })),
    })),
  },
}));

describe('Audit Logging', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('logAuditEvent', () => {
    it('logs audit event with required fields', async () => {
      const db = await import('../db.js');
      db.default.prepare.mockReturnValue({
        bind: vi.fn(() => ({
          run: vi.fn().mockResolvedValue({ results: [] }),
        })),
      });

      await logAuditEvent({
        action: 'user.login',
        userId: 'user-1',
        resourceType: 'session',
        resourceId: 'session-1',
        ipAddress: '1.2.3.4',
        userAgent: 'Chrome',
      });

      expect(db.default.prepare).toHaveBeenCalled();
    });

    it('logs audit event without user (anonymous action)', async () => {
      const db = await import('../db.js');
      db.default.prepare.mockReturnValue({
        bind: vi.fn(() => ({
          run: vi.fn().mockResolvedValue({ results: [] }),
        })),
      });

      await logAuditEvent({
        action: 'auth.register',
        resourceType: 'user',
        resourceId: 'new-user-1',
        ipAddress: '1.2.3.4',
      });

      expect(db.default.prepare).toHaveBeenCalled();
    });
  });

  describe('getAuditLogs', () => {
    it('returns paginated audit logs', async () => {
      const db = await import('../db.js');
      db.default.prepare.mockReturnValue({
        bind: vi.fn(() => ({
          all: vi.fn().mockResolvedValue({
            results: [
              { id: 'log-1', action: 'user.login', created_at: 1234567890 },
              { id: 'log-2', action: 'user.logout', created_at: 1234567891 },
            ],
          }),
        })),
      });

      const result = await getAuditLogs({ limit: 10, offset: 0 });
      expect(result.status).toBe(200);
      const body = await result.json();
      expect(body.logs).toHaveLength(2);
    });

    it('filters by user ID', async () => {
      const db = await import('../db.js');
      db.default.prepare.mockReturnValue({
        bind: vi.fn(() => ({
          all: vi.fn().mockResolvedValue({ results: [] }),
        })),
      });

      await getAuditLogs({ userId: 'user-1', limit: 10, offset: 0 });
      expect(db.default.prepare).toHaveBeenCalled();
    });

    it('filters by action', async () => {
      const db = await import('../db.js');
      db.default.prepare.mockReturnValue({
        bind: vi.fn(() => ({
          all: vi.fn().mockResolvedValue({ results: [] }),
        })),
      });

      await getAuditLogs({ action: 'user.login', limit: 10, offset: 0 });
      expect(db.default.prepare).toHaveBeenCalled();
    });
  });
});
