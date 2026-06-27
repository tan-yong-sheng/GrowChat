// @vitest-environment node
import { describe, expect, it, vi, beforeEach } from 'vitest';

// Create mock using vi.hoisted so it's properly hoisted
const mocks = vi.hoisted(() => ({
  prepare: vi.fn(),
}));

vi.mock('../db.js', () => ({
  default: {
    prepare: mocks.prepare,
  },
}));

import { logAuditEvent, getAuditLogs, AuditActions } from './audit-log.js';

describe('Audit Logging', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('logAuditEvent', () => {
    it('logs audit event with required fields', async () => {
      const bindMock = vi.fn(() => ({
        run: vi.fn().mockResolvedValue({ results: [] }),
      }));
      mocks.prepare.mockReturnValue({ bind: bindMock });

      await logAuditEvent({
        action: 'user.login',
        userId: 'user-1',
        resourceType: 'session',
        resourceId: 'session-1',
        ipAddress: '1.2.3.4',
        userAgent: 'Chrome',
        details: { method: 'password' },
      });

      expect(mocks.prepare).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO audit_logs'));
      expect(bindMock).toHaveBeenCalledWith(
        expect.any(String), // id
        'user-1', // userId
        'user.login', // action
        'session', // resourceType
        'session-1', // resourceId
        '1.2.3.4', // ipAddress
        'Chrome', // userAgent
        expect.any(String), // details JSON
        expect.any(Number) // createdAt
      );
    });

    it('logs audit event without user (anonymous action)', async () => {
      const bindMock = vi.fn(() => ({
        run: vi.fn().mockResolvedValue({ results: [] }),
      }));
      mocks.prepare.mockReturnValue({ bind: bindMock });

      await logAuditEvent({
        action: 'auth.register',
        resourceType: 'user',
        resourceId: 'new-user-1',
        ipAddress: '1.2.3.4',
      });

      expect(bindMock).toHaveBeenCalledWith(
        expect.any(String),
        null, // userId is null
        'auth.register',
        'user',
        'new-user-1',
        '1.2.3.4',
        null, // userAgent is null
        null, // details is null
        expect.any(Number)
      );
    });

    it('sets all optional fields to null by default', async () => {
      const bindMock = vi.fn(() => ({
        run: vi.fn().mockResolvedValue({ results: [] }),
      }));
      mocks.prepare.mockReturnValue({ bind: bindMock });

      await logAuditEvent({
        action: 'test.action',
      });

      expect(bindMock).toHaveBeenCalledWith(
        expect.any(String),
        null,
        'test.action',
        null,
        null,
        null,
        null,
        null,
        expect.any(Number)
      );
    });

    it('generates unique UUID for each event', async () => {
      const bindMock = vi.fn(() => ({
        run: vi.fn().mockResolvedValue({ results: [] }),
      }));
      mocks.prepare.mockReturnValue({ bind: bindMock });

      await logAuditEvent({ action: 'test.1' });
      await logAuditEvent({ action: 'test.2' });

      const firstId = bindMock.mock.calls[0][0];
      const secondId = bindMock.mock.calls[1][0];
      expect(firstId).not.toBe(secondId);
    });

    it('generates current timestamp for created_at', async () => {
      const bindMock = vi.fn(() => ({
        run: vi.fn().mockResolvedValue({ results: [] }),
      }));
      mocks.prepare.mockReturnValue({ bind: bindMock });

      const beforeTime = Math.floor(Date.now() / 1000);
      await logAuditEvent({ action: 'test' });
      const afterTime = Math.floor(Date.now() / 1000);

      const createdAt = bindMock.mock.calls[0][8];
      expect(createdAt).toBeGreaterThanOrEqual(beforeTime);
      expect(createdAt).toBeLessThanOrEqual(afterTime);
    });

    it('JSON-stringifies details when provided', async () => {
      const bindMock = vi.fn(() => ({
        run: vi.fn().mockResolvedValue({ results: [] }),
      }));
      mocks.prepare.mockReturnValue({ bind: bindMock });

      const details = { nested: { value: 123 }, array: [1, 2, 3] };
      await logAuditEvent({ action: 'test', details });

      const detailsArg = bindMock.mock.calls[0][7];
      expect(detailsArg).toBe(JSON.stringify(details));
    });

    it('handles details with special characters', async () => {
      const bindMock = vi.fn(() => ({
        run: vi.fn().mockResolvedValue({ results: [] }),
      }));
      mocks.prepare.mockReturnValue({ bind: bindMock });

      const details = {
        message: 'Hello \'World\' with "quotes" and \n newlines',
        unicode: '日本語 emoji 🎉',
      };
      await logAuditEvent({ action: 'test', details });

      const detailsArg = bindMock.mock.calls[0][7];
      expect(JSON.parse(detailsArg)).toEqual(details);
    });

    it('handles null details (no JSON stringify)', async () => {
      const bindMock = vi.fn(() => ({
        run: vi.fn().mockResolvedValue({ results: [] }),
      }));
      mocks.prepare.mockReturnValue({ bind: bindMock });

      await logAuditEvent({ action: 'test', details: null });

      const detailsArg = bindMock.mock.calls[0][7];
      expect(detailsArg).toBeNull();
    });
  });

  describe('getAuditLogs', () => {
    it('returns paginated audit logs with defaults', async () => {
      const allMock = vi.fn().mockResolvedValue({
        results: [
          { id: 'log-1', action: 'user.login', created_at: 1234567890 },
          { id: 'log-2', action: 'user.logout', created_at: 1234567891 },
        ],
      });
      const bindMock = vi.fn(() => ({ all: allMock }));
      mocks.prepare.mockReturnValue({ bind: bindMock });

      const result = await getAuditLogs({});

      expect(result.status).toBe(200);
      const body = await result.json();
      expect(body.logs).toHaveLength(2);
      expect(body.pagination.limit).toBe(50);
      expect(body.pagination.offset).toBe(0);
    });

    it('uses provided limit and offset', async () => {
      const allMock = vi.fn().mockResolvedValue({ results: [] });
      const bindMock = vi.fn(() => ({ all: allMock }));
      mocks.prepare.mockReturnValue({ bind: bindMock });

      await getAuditLogs({ limit: 25, offset: 100 });

      // The bind is called with (limit, offset) since there are no filters
      expect(bindMock).toHaveBeenCalledWith(25, 100);
    });

    it('filters by userId when provided', async () => {
      const allMock = vi.fn().mockResolvedValue({ results: [] });
      const bindMock = vi.fn(() => ({ all: allMock }));
      mocks.prepare.mockReturnValue({ bind: bindMock });

      await getAuditLogs({ userId: 'user-123', limit: 10, offset: 0 });

      expect(mocks.prepare).toHaveBeenCalledWith(expect.stringContaining('user_id = ?'));
      expect(bindMock).toHaveBeenCalledWith('user-123', 10, 0);
    });

    it('filters by action when provided', async () => {
      const allMock = vi.fn().mockResolvedValue({ results: [] });
      const bindMock = vi.fn(() => ({ all: allMock }));
      mocks.prepare.mockReturnValue({ bind: bindMock });

      await getAuditLogs({ action: 'user.login', limit: 10, offset: 0 });

      expect(mocks.prepare).toHaveBeenCalledWith(expect.stringContaining('action = ?'));
      expect(bindMock).toHaveBeenCalledWith('user.login', 10, 0);
    });

    it('combines multiple filters', async () => {
      const allMock = vi.fn().mockResolvedValue({ results: [] });
      const bindMock = vi.fn(() => ({ all: allMock }));
      mocks.prepare.mockReturnValue({ bind: bindMock });

      await getAuditLogs({
        userId: 'user-123',
        action: 'user.login',
        limit: 10,
        offset: 5,
      });

      expect(mocks.prepare).toHaveBeenCalledWith(expect.stringContaining('user_id = ?'));
      expect(mocks.prepare).toHaveBeenCalledWith(expect.stringContaining('action = ?'));
      expect(bindMock).toHaveBeenCalledWith('user-123', 'user.login', 10, 5);
    });

    it('sets hasMore true when results equal limit', async () => {
      const allMock = vi.fn().mockResolvedValue({
        results: Array(10).fill({ id: 'log' }),
      });
      const bindMock = vi.fn(() => ({ all: allMock }));
      mocks.prepare.mockReturnValue({ bind: bindMock });

      const result = await getAuditLogs({ limit: 10, offset: 0 });
      const body = await result.json();

      expect(body.pagination.hasMore).toBe(true);
    });

    it('sets hasMore false when results less than limit', async () => {
      const allMock = vi.fn().mockResolvedValue({
        results: Array(5).fill({ id: 'log' }),
      });
      const bindMock = vi.fn(() => ({ all: allMock }));
      mocks.prepare.mockReturnValue({ bind: bindMock });

      const result = await getAuditLogs({ limit: 10, offset: 0 });
      const body = await result.json();

      expect(body.pagination.hasMore).toBe(false);
    });

    it('sets hasMore false when results empty', async () => {
      const allMock = vi.fn().mockResolvedValue({ results: [] });
      const bindMock = vi.fn(() => ({ all: allMock }));
      mocks.prepare.mockReturnValue({ bind: bindMock });

      const result = await getAuditLogs({ limit: 10, offset: 0 });
      const body = await result.json();

      expect(body.pagination.hasMore).toBe(false);
    });

    it('handles null results gracefully', async () => {
      const allMock = vi.fn().mockResolvedValue({ results: null });
      const bindMock = vi.fn(() => ({ all: allMock }));
      mocks.prepare.mockReturnValue({ bind: bindMock });

      const result = await getAuditLogs({ limit: 10, offset: 0 });
      const body = await result.json();

      expect(body.logs).toEqual([]);
      expect(body.pagination.hasMore).toBe(false);
    });

    it('handles empty string userId as no filter', async () => {
      const allMock = vi.fn().mockResolvedValue({ results: [] });
      const bindMock = vi.fn(() => ({ all: allMock }));
      mocks.prepare.mockReturnValue({ bind: bindMock });

      await getAuditLogs({ userId: '', limit: 10, offset: 0 });

      expect(mocks.prepare).toHaveBeenCalledWith(expect.not.stringContaining('user_id = ?'));
    });

    it('orders by created_at DESC', async () => {
      const allMock = vi.fn().mockResolvedValue({ results: [] });
      const bindMock = vi.fn(() => ({ all: allMock }));
      mocks.prepare.mockReturnValue({ bind: bindMock });

      await getAuditLogs({ limit: 10, offset: 0 });

      expect(mocks.prepare).toHaveBeenCalledWith(
        expect.stringContaining('ORDER BY created_at DESC')
      );
    });

    it('respects limit and offset boundary values', async () => {
      const allMock = vi.fn().mockResolvedValue({ results: [] });
      const bindMock = vi.fn(() => ({ all: allMock }));
      mocks.prepare.mockReturnValue({ bind: bindMock });

      await getAuditLogs({ limit: 1, offset: 0 });
      await getAuditLogs({ limit: 1000, offset: 999999 });

      expect(allMock).toHaveBeenCalledTimes(2);
    });

    it('handles empty string action as no filter', async () => {
      const allMock = vi.fn().mockResolvedValue({ results: [] });
      const bindMock = vi.fn(() => ({ all: allMock }));
      mocks.prepare.mockReturnValue({ bind: bindMock });

      await getAuditLogs({ action: '', limit: 10, offset: 0 });

      expect(mocks.prepare).toHaveBeenCalledWith(expect.not.stringContaining('action = ?'));
    });

    it('throws when db.run fails during logAuditEvent', async () => {
      const runMock = vi.fn().mockRejectedValue(new Error('DB insert failed'));
      const bindMock = vi.fn(() => ({ run: runMock }));
      mocks.prepare.mockReturnValue({ bind: bindMock });

      await expect(logAuditEvent({ action: 'test.action' })).rejects.toThrow('DB insert failed');
    });

    it('throws when db.all fails during getAuditLogs', async () => {
      const allMock = vi.fn().mockRejectedValue(new Error('DB query failed'));
      const bindMock = vi.fn(() => ({ all: allMock }));
      mocks.prepare.mockReturnValue({ bind: bindMock });

      await expect(getAuditLogs({ limit: 10, offset: 0 })).rejects.toThrow('DB query failed');
    });
  });

  describe('AuditActions enum', () => {
    it('contains authentication action types', () => {
      expect(AuditActions.AUTH_LOGIN).toBe('auth.login');
      expect(AuditActions.AUTH_LOGOUT).toBe('auth.logout');
      expect(AuditActions.AUTH_REGISTER).toBe('auth.register');
      expect(AuditActions.AUTH_PASSWORD_RESET).toBe('auth.password_reset');
      expect(AuditActions.AUTH_EMAIL_VERIFY).toBe('auth.email_verify');
    });

    it('contains user management action types', () => {
      expect(AuditActions.USER_CREATE).toBe('user.create');
      expect(AuditActions.USER_UPDATE).toBe('user.update');
      expect(AuditActions.USER_DELETE).toBe('user.delete');
      expect(AuditActions.USER_ROLE_CHANGE).toBe('user.role_change');
    });

    it('contains chat action types', () => {
      expect(AuditActions.CHAT_CREATE).toBe('chat.create');
      expect(AuditActions.CHAT_DELETE).toBe('chat.delete');
      expect(AuditActions.CHAT_UPDATE).toBe('chat.update');
    });

    it('contains message action types', () => {
      expect(AuditActions.MESSAGE_CREATE).toBe('message.create');
      expect(AuditActions.MESSAGE_EDIT).toBe('message.edit');
      expect(AuditActions.MESSAGE_DELETE).toBe('message.delete');
    });

    it('contains file action types', () => {
      expect(AuditActions.FILE_UPLOAD).toBe('file.upload');
      expect(AuditActions.FILE_DELETE).toBe('file.delete');
    });

    it('contains admin action types', () => {
      expect(AuditActions.ADMIN_SETTINGS_CHANGE).toBe('admin.settings_change');
      expect(AuditActions.ADMIN_USER_BAN).toBe('admin.user_ban');
      expect(AuditActions.ADMIN_USER_UNBAN).toBe('admin.user_unban');
    });
  });
});
