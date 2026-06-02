import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  createDB: vi.fn(),
  authorize: vi.fn(),
  createRealtimeEvent: vi.fn((e) => e),
  createRealtimeBus: vi.fn(),
  resolveDefaultModel: vi.fn(),
  requireOwnedChat: vi.fn(),
  handleListChats: vi.fn(),
  handleGetChat: vi.fn(),
  handleCloneChat: vi.fn(),
}));

vi.mock('../db.js', () => ({
  createDB: (...args) => mocks.createDB(...args),
}));

vi.mock('../utils/authorize.js', () => ({
  authorize: (...args) => mocks.authorize(...args),
}));

vi.mock('../utils/sanitize.js', () => ({
  stripHtml: vi.fn((v) => v),
}));

vi.mock('../features/realtime/realtime.js', () => ({
  createRealtimeEvent: (...args) => mocks.createRealtimeEvent(...args),
}));

vi.mock('../services/realtime-bus.js', () => ({
  createRealtimeBus: (...args) => mocks.createRealtimeBus(...args),
}));

vi.mock('./chat-core.js', () => ({
  resolveDefaultModel: (...args) => mocks.resolveDefaultModel(...args),
  requireOwnedChat: (...args) => mocks.requireOwnedChat(...args),
}));

vi.mock('./chat-collection-ops.js', () => ({
  handleListChats: (...args) => mocks.handleListChats(...args),
  handleGetChat: (...args) => mocks.handleGetChat(...args),
  handleCloneChat: (...args) => mocks.handleCloneChat(...args),
}));

import { chatCollectionRouter } from './chat-collection.js';

function makeReq(path, method, body) {
  const init = { method, headers: {} };
  if (body !== undefined) {
    init.body = typeof body === 'string' ? body : JSON.stringify(body);
    init.headers['Content-Type'] = 'application/json';
  }
  return new Request(`https://example.com${path}`, init);
}

describe('chatCollectionRouter', () => {
  const user = { sub: 'u1', role: 'user' };
  const env = { DB: {} };
  const db = {
    all: vi.fn(), run: vi.fn(), first: vi.fn(), batch: vi.fn(),
    prepare: vi.fn((sql, params = []) => ({ sql, params, bind: (...args) => ({ sql, params: args }) })),
  };

  beforeEach(() => {
    vi.resetAllMocks();
    mocks.createDB.mockReturnValue(db);
    mocks.authorize.mockResolvedValue({ allow: true });
    mocks.createRealtimeBus.mockReturnValue({ publish: vi.fn().mockResolvedValue(true) });
    mocks.resolveDefaultModel.mockResolvedValue('gpt-4o');
    mocks.requireOwnedChat.mockResolvedValue({ chat: { id: 'c1', user_id: 'u1', title: 'Test', model: 'gpt-4o', pinned: 0 } });
  });

  describe('GET /api/chats', () => {
    it('delegates to handleListChats', async () => {
      mocks.handleListChats.mockResolvedValue(new Response(JSON.stringify({ chats: [] }), { status: 200 }));
      const res = await chatCollectionRouter(
        makeReq('/api/chats', 'GET'), env, user, '/api/chats', 's1',
      );
      expect(mocks.handleListChats).toHaveBeenCalled();
    });
  });

  describe('POST /api/chats', () => {
    it('rejects unauthorized', async () => {
      mocks.authorize.mockResolvedValue({ allow: false, reason: 'no' });
      const res = await chatCollectionRouter(
        makeReq('/api/chats', 'POST', { title: 'New Chat' }), env, user, '/api/chats', 's1',
      );
      expect(res.status).toBe(403);
    });

    it('creates a new chat', async () => {
      db.run.mockResolvedValue(undefined);
      db.first.mockResolvedValue({ id: 'new-id', user_id: 'u1', title: 'New Chat', model: 'gpt-4o' });
      const res = await chatCollectionRouter(
        makeReq('/api/chats', 'POST', { title: 'New Chat' }), env, user, '/api/chats', 's1',
      );
      expect(res.status).toBe(201);
    });
  });

  describe('GET /api/chats/shared', () => {
    it('rejects unauthorized', async () => {
      mocks.authorize.mockResolvedValue({ allow: false, reason: 'no' });
      const res = await chatCollectionRouter(
        makeReq('/api/chats/shared', 'GET'), env, user, '/api/chats/shared', 's1',
      );
      expect(res.status).toBe(403);
    });

    it('returns shared chats', async () => {
      db.all.mockResolvedValue([]);
      const res = await chatCollectionRouter(
        makeReq('/api/chats/shared', 'GET'), env, user, '/api/chats/shared', 's1',
      );
      expect(res.status).toBe(200);
    });
  });

  describe('GET /api/chats/archived', () => {
    it('returns archived chats', async () => {
      db.all.mockResolvedValue([]);
      const res = await chatCollectionRouter(
        makeReq('/api/chats/archived', 'GET'), env, user, '/api/chats/archived', 's1',
      );
      expect(res.status).toBe(200);
    });
  });

  describe('PUT /api/chats/:id', () => {
    it('rejects unauthorized', async () => {
      mocks.authorize.mockResolvedValue({ allow: false, reason: 'no' });
      const res = await chatCollectionRouter(
        makeReq('/api/chats/c1', 'PUT', { title: 'Updated' }), env, user, '/api/chats/c1', 's1',
      );
      expect(res.status).toBe(403);
    });

    it('updates chat', async () => {
      db.run.mockResolvedValue(undefined);
      mocks.requireOwnedChat.mockResolvedValue({ chat: { id: 'c1', user_id: 'u1', title: 'Test', model: 'gpt-4o', pinned: 0 } });
      const res = await chatCollectionRouter(
        makeReq('/api/chats/c1', 'PUT', { title: 'Updated', pinned: true }), env, user, '/api/chats/c1', 's1',
      );
      expect(db.run).toHaveBeenCalled();
    });
  });

  describe('DELETE /api/chats/:id', () => {
    it('rejects unauthorized', async () => {
      mocks.authorize.mockResolvedValue({ allow: false, reason: 'no' });
      const res = await chatCollectionRouter(
        makeReq('/api/chats/c1', 'DELETE'), env, user, '/api/chats/c1', 's1',
      );
      expect(res.status).toBe(403);
    });

    it('deletes chat', async () => {
      db.run.mockResolvedValue(undefined);
      const res = await chatCollectionRouter(
        makeReq('/api/chats/c1', 'DELETE'), env, user, '/api/chats/c1', 's1',
      );
      expect(res.status).toBe(200);
    });
  });

  describe('POST /api/chats/:id/pin', () => {
    it('toggles pin state', async () => {
      db.run.mockResolvedValue(undefined);
      const res = await chatCollectionRouter(
        makeReq('/api/chats/c1/pin', 'POST'), env, user, '/api/chats/c1/pin', 's1',
      );
      expect(db.run).toHaveBeenCalled();
    });
  });

  describe('POST /api/chats/:id/share', () => {
    it('creates share id', async () => {
      db.run.mockResolvedValue(undefined);
      const res = await chatCollectionRouter(
        makeReq('/api/chats/c1/share', 'POST'), env, user, '/api/chats/c1/share', 's1',
      );
      expect(res.status).toBe(200);
    });
  });

  describe('DELETE /api/chats/:id/share', () => {
    it('removes share id', async () => {
      db.run.mockResolvedValue(undefined);
      const res = await chatCollectionRouter(
        makeReq('/api/chats/c1/share', 'DELETE'), env, user, '/api/chats/c1/share', 's1',
      );
      expect(res.status).toBe(200);
    });
  });

  describe('POST /api/chats/:id/archive', () => {
    it('toggles archive state', async () => {
      db.run.mockResolvedValue(undefined);
      const res = await chatCollectionRouter(
        makeReq('/api/chats/c1/archive', 'POST'), env, user, '/api/chats/c1/archive', 's1',
      );
      expect(res.status).toBe(200);
    });
  });

  it('returns null for unknown path', async () => {
    const result = await chatCollectionRouter(
      makeReq('/api/unknown', 'GET'), env, user, '/api/unknown', 's1',
    );
    expect(result).toBeNull();
  });
});
