import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  createDB: vi.fn(),
}));

vi.mock('../db.js', () => ({
  createDB: (...args) => mocks.createDB(...args),
}));

import { publicRouter } from './public.js';

function makeReq(path, method) {
  return new Request(`https://example.com${path}`, { method });
}

describe('publicRouter', () => {
  const env = { DB: {}, APP_NAME: 'GrowChat' };
  const ctx = {};
  const user = null;
  const db = { all: vi.fn(), run: vi.fn(), first: vi.fn() };
  const logger = { error: vi.fn(), warn: vi.fn(), info: vi.fn() };

  beforeEach(() => {
    vi.resetAllMocks();
    mocks.createDB.mockReturnValue(db);
  });

  describe('GET /api/health', () => {
    it('returns health status', async () => {
      db.first.mockResolvedValue({ count: 1 });
      const res = await publicRouter(
        makeReq('/api/health', 'GET'),
        { ...env, SESSIONS: {}, MESSAGE_QUEUE: {} },
        ctx,
        user,
        '/api/health',
        { logger }
      );
      expect(res.status).toBe(200);
      const payload = await res.json();
      expect(payload.ok).toBe(true);
      expect(payload.initialized).toBe(true);
      expect(payload.service).toBe('GrowChat');
    });

    it('reports uninitialized when no users', async () => {
      db.first.mockResolvedValue({ count: 0 });
      const res = await publicRouter(makeReq('/api/health', 'GET'), env, ctx, user, '/api/health', {
        logger,
      });
      expect(res.status).toBe(200);
      const payload = await res.json();
      expect(payload.initialized).toBe(false);
    });

    it('handles DB error gracefully', async () => {
      db.first.mockRejectedValue(new Error('no such table: users'));
      const res = await publicRouter(makeReq('/api/health', 'GET'), env, ctx, user, '/api/health', {
        logger,
      });
      expect(res.status).toBe(200);
      const payload = await res.json();
      expect(payload.ok).toBe(true);
    });

    it('rejects non-GET methods', async () => {
      const res = await publicRouter(
        makeReq('/api/health', 'POST'),
        env,
        ctx,
        user,
        '/api/health',
        { logger }
      );
      expect(res.status).toBe(405);
    });
  });

  describe('GET /s/:share_id', () => {
    it('returns shared chat with messages', async () => {
      db.first.mockResolvedValue({
        id: 'c1',
        user_id: 'u1',
        title: 'Shared',
        model: 'gpt-4o',
        pinned: 0,
        created_at: 1,
        updated_at: 1,
      });
      db.all.mockResolvedValue([
        { id: 'm1', role: 'user', content: 'Hello', model: null, created_at: 1 },
      ]);
      const res = await publicRouter(
        makeReq('/s/abc123?format=json', 'GET'),
        env,
        ctx,
        user,
        '/s/abc123',
        { logger }
      );
      expect(res.status).toBe(200);
      const payload = await res.json();
      expect(payload.shared).toBe(true);
      expect(payload.chat.id).toBe('c1');
      expect(payload.messages).toHaveLength(1);
    });

    it('returns 404 for non-existent share', async () => {
      db.first.mockResolvedValue(null);
      const res = await publicRouter(
        makeReq('/s/nonexistent?format=json', 'GET'),
        env,
        ctx,
        user,
        '/s/nonexistent',
        { logger }
      );
      expect(res.status).toBe(404);
    });

    it('returns 500 on DB error', async () => {
      db.first.mockRejectedValue(new Error('fail'));
      const res = await publicRouter(
        makeReq('/s/abc?format=json', 'GET'),
        env,
        ctx,
        user,
        '/s/abc',
        { logger }
      );
      expect(res.status).toBe(500);
    });

    it('rejects non-GET methods', async () => {
      const res = await publicRouter(makeReq('/s/abc', 'POST'), env, ctx, user, '/s/abc', {
        logger,
      });
      expect(res.status).toBe(405);
    });
  });

  it('returns null for unrecognized paths', async () => {
    const result = await publicRouter(
      makeReq('/api/unknown', 'GET'),
      env,
      ctx,
      user,
      '/api/unknown',
      { logger }
    );
    expect(result).toBeNull();
  });
});
