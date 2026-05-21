// @vitest-environment node
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { getSessions, revokeSession, sessionManagementRouter } from './session-management.js';

// Mock KV namespace
const mockKV = {
  get: vi.fn(),
  put: vi.fn(),
  delete: vi.fn(),
  list: vi.fn(),
};

// Mock db
vi.mock('../db.js', () => ({
  default: {
    prepare: vi.fn(() => ({
      bind: vi.fn(() => ({
        first: vi.fn(),
        run: vi.fn(),
      })),
    })),
  },
}));

describe('Session Management', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getSessions', () => {
    it('returns empty array when no sessions', async () => {
      mockKV.list.mockResolvedValue({ keys: [] });
      const result = await getSessions({ userId: 'user-1', kv: mockKV });
      expect(result.status).toBe(200);
      const body = await result.json();
      expect(body.sessions).toEqual([]);
    });

    it('returns sessions with metadata', async () => {
      mockKV.list.mockResolvedValue({
        keys: [
          { name: 'session:user-1:session-1' },
          { name: 'session:user-1:session-2' },
        ],
      });
      mockKV.get
        .mockResolvedValueOnce(JSON.stringify({ device: 'Chrome', ip: '1.2.3.4', lastActive: 1234567890 }))
        .mockResolvedValueOnce(JSON.stringify({ device: 'Firefox', ip: '5.6.7.8', lastActive: 1234567891 }));

      const result = await getSessions({ userId: 'user-1', kv: mockKV });
      expect(result.status).toBe(200);
      const body = await result.json();
      expect(body.sessions).toHaveLength(2);
      expect(body.sessions[0]).toHaveProperty('id');
      expect(body.sessions[0]).toHaveProperty('device');
    });
  });

  describe('revokeSession', () => {
    it('returns error when session ID is missing', async () => {
      const result = await revokeSession({});
      expect(result.status).toBe(400);
      const body = await result.json();
      expect(body.error.toLowerCase()).toContain('session');
    });

    it('returns 404 when session not found', async () => {
      mockKV.get.mockResolvedValue(null);
      const result = await revokeSession({ sessionId: 'nonexistent', userId: 'user-1', kv: mockKV });
      expect(result.status).toBe(404);
    });

    it('returns 403 when session belongs to another user', async () => {
      mockKV.get.mockResolvedValue(JSON.stringify({ userId: 'other-user' }));
      const result = await revokeSession({ sessionId: 'session-1', userId: 'user-1', kv: mockKV });
      expect(result.status).toBe(403);
    });

    it('revokes session successfully', async () => {
      mockKV.get.mockResolvedValue(JSON.stringify({ userId: 'user-1', device: 'Chrome' }));
      mockKV.delete.mockResolvedValue(undefined);
      const result = await revokeSession({ sessionId: 'session-1', userId: 'user-1', kv: mockKV });
      expect(result.status).toBe(200);
      const body = await result.json();
      expect(body.message).toContain('revoked');
    });
  });

  describe('sessionManagementRouter', () => {
    const mockReq = { method: 'GET', headers: { get: vi.fn(() => null) } };
    const mockDeleteReq = { method: 'DELETE', headers: { get: vi.fn(() => null) } };

    it('returns null for non-session paths', async () => {
      const result = await sessionManagementRouter(mockReq, {}, {}, null, '/api/users/me');
      expect(result).toBeNull();
    });

    it('returns 401 when not authenticated', async () => {
      const result = await sessionManagementRouter(mockReq, {}, {}, null, '/api/user/sessions');
      expect(result.status).toBe(401);
    });

    it('handles GET /api/user/sessions', async () => {
      const env = { SESSIONS: mockKV };
      const user = { sub: 'user-1' };
      mockKV.list.mockResolvedValue({ keys: [] });
      const result = await sessionManagementRouter(mockReq, env, {}, user, '/api/user/sessions');
      expect(result.status).toBe(200);
      const body = await result.json();
      expect(body.sessions).toEqual([]);
    });

    it('handles DELETE /api/user/sessions/:id', async () => {
      const env = { SESSIONS: mockKV };
      const user = { sub: 'user-1' };
      mockKV.get.mockResolvedValue(JSON.stringify({ userId: 'user-1', device: 'Chrome' }));
      mockKV.delete.mockResolvedValue(undefined);
      const result = await sessionManagementRouter(mockDeleteReq, env, {}, user, '/api/user/sessions/session-1');
      expect(result.status).toBe(200);
    });
  });
});
