// @vitest-environment jsdom

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

vi.mock('../../src/db.js', () => ({
  createDB: (...args) => mocks.createDB(...args),
}));

vi.mock('../../src/utils/authorize.js', () => ({
  authorize: (...args) => mocks.authorize(...args),
}));

vi.mock('../../src/utils/sanitize.js', () => ({
  stripHtml: vi.fn((v) => v),
}));

vi.mock('../../src/features/realtime/realtime.js', () => ({
  createRealtimeEvent: (...args) => mocks.createRealtimeEvent(...args),
}));

vi.mock('../../src/services/realtime-bus.js', () => ({
  createRealtimeBus: (...args) => mocks.createRealtimeBus(...args),
}));

vi.mock('../../src/routers/chat-core.js', () => ({
  resolveDefaultModel: (...args) => mocks.resolveDefaultModel(...args),
  requireOwnedChat: (...args) => mocks.requireOwnedChat(...args),
}));

vi.mock('../../src/routers/chat-collection-ops.js', () => ({
  handleListChats: (...args) => mocks.handleListChats(...args),
  handleGetChat: (...args) => mocks.handleGetChat(...args),
  handleCloneChat: (...args) => mocks.handleCloneChat(...args),
}));

import { chatCollectionRouter } from '../../src/routers/chat-collection.js';

function makeReq(path, method, body) {
  const init = { method, headers: {} };
  if (body !== undefined) {
    init.body = typeof body === 'string' ? body : JSON.stringify(body);
    init.headers['Content-Type'] = 'application/json';
  }
  return new Request(`https://example.com${path}`, init);
}

describe('chat-collection input sanitization', () => {
  const user = { sub: 'u1', role: 'user' };
  const env = { DB: {} };
  const db = {
    all: vi.fn(),
    run: vi.fn(),
    first: vi.fn(),
    batch: vi.fn(),
    prepare: vi.fn((sql, params = []) => ({
      sql,
      params,
      bind: (...args) => ({ sql, params: args }),
    })),
  };

  beforeEach(() => {
    vi.resetAllMocks();
    mocks.createDB.mockReturnValue(db);
    mocks.authorize.mockResolvedValue({ allow: true });
    mocks.createRealtimeBus.mockReturnValue({ publish: vi.fn().mockResolvedValue(true) });
    mocks.resolveDefaultModel.mockResolvedValue('gpt-4o');
    mocks.requireOwnedChat.mockResolvedValue({
      chat: { id: 'c1', user_id: 'u1', title: 'Old', model: 'gpt-4o', pinned: 0 },
    });
    db.run.mockResolvedValue(undefined);
  });

  describe('POST /api/chats — model coercion (QAF-012)', () => {
    it('coerces an empty body to the fallback model (no literal "null")', async () => {
      db.first.mockResolvedValue({
        id: 'new-id',
        user_id: 'u1',
        title: 'New Chat',
        model: 'gpt-4o',
      });
      const res = await chatCollectionRouter(
        makeReq('/api/chats', 'POST', {}),
        env,
        user,
        '/api/chats',
        's1'
      );
      expect(res.status).toBe(201);
      const insertCall = db.run.mock.calls[0];
      expect(insertCall[1][3]).toBe('gpt-4o');
    });

    it('coerces the literal string "null" to the fallback model', async () => {
      db.first.mockResolvedValue({
        id: 'new-id',
        user_id: 'u1',
        title: 'New Chat',
        model: 'gpt-4o',
      });
      const res = await chatCollectionRouter(
        makeReq('/api/chats', 'POST', { model: 'null' }),
        env,
        user,
        '/api/chats',
        's1'
      );
      expect(res.status).toBe(201);
      const insertCall = db.run.mock.calls[0];
      expect(insertCall[1][3]).toBe('gpt-4o');
    });

    it('coerces the literal string "undefined" to the fallback model', async () => {
      db.first.mockResolvedValue({
        id: 'new-id',
        user_id: 'u1',
        title: 'New Chat',
        model: 'gpt-4o',
      });
      const res = await chatCollectionRouter(
        makeReq('/api/chats', 'POST', { model: 'undefined' }),
        env,
        user,
        '/api/chats',
        's1'
      );
      expect(res.status).toBe(201);
      const insertCall = db.run.mock.calls[0];
      expect(insertCall[1][3]).toBe('gpt-4o');
    });

    it('coerces a non-string model value (number) to the fallback model', async () => {
      db.first.mockResolvedValue({
        id: 'new-id',
        user_id: 'u1',
        title: 'New Chat',
        model: 'gpt-4o',
      });
      const res = await chatCollectionRouter(
        makeReq('/api/chats', 'POST', { model: 42 }),
        env,
        user,
        '/api/chats',
        's1'
      );
      expect(res.status).toBe(201);
      const insertCall = db.run.mock.calls[0];
      expect(insertCall[1][3]).toBe('gpt-4o');
    });

    it('coerces a model longer than 200 chars to the fallback model', async () => {
      db.first.mockResolvedValue({
        id: 'new-id',
        user_id: 'u1',
        title: 'New Chat',
        model: 'gpt-4o',
      });
      const tooLong = 'a'.repeat(500);
      const res = await chatCollectionRouter(
        makeReq('/api/chats', 'POST', { model: tooLong }),
        env,
        user,
        '/api/chats',
        's1'
      );
      expect(res.status).toBe(201);
      const insertCall = db.run.mock.calls[0];
      expect(insertCall[1][3]).toBe('gpt-4o');
    });

    it('accepts a valid string model id', async () => {
      db.first.mockResolvedValue({
        id: 'new-id',
        user_id: 'u1',
        title: 'New Chat',
        model: 'openai/conn_1:gpt-4',
      });
      const res = await chatCollectionRouter(
        makeReq('/api/chats', 'POST', { model: 'openai/conn_1:gpt-4' }),
        env,
        user,
        '/api/chats',
        's1'
      );
      expect(res.status).toBe(201);
      const insertCall = db.run.mock.calls[0];
      expect(insertCall[1][3]).toBe('openai/conn_1:gpt-4');
    });
  });

  describe('POST /api/chats — title length limit (QAF-008)', () => {
    it('caps a 10,000-char title at 200 chars', async () => {
      db.first.mockResolvedValue({
        id: 'new-id',
        user_id: 'u1',
        title: 'x'.repeat(200),
        model: 'gpt-4o',
      });
      const longTitle = 'A'.repeat(10000);
      const res = await chatCollectionRouter(
        makeReq('/api/chats', 'POST', { title: longTitle }),
        env,
        user,
        '/api/chats',
        's1'
      );
      expect(res.status).toBe(201);
      const insertCall = db.run.mock.calls[0];
      expect(insertCall[1][2].length).toBe(200);
    });

    it('falls back to "New Chat" when title is empty after sanitization', async () => {
      db.first.mockResolvedValue({
        id: 'new-id',
        user_id: 'u1',
        title: 'New Chat',
        model: 'gpt-4o',
      });
      const res = await chatCollectionRouter(
        makeReq('/api/chats', 'POST', { title: '   ' }),
        env,
        user,
        '/api/chats',
        's1'
      );
      expect(res.status).toBe(201);
      const insertCall = db.run.mock.calls[0];
      expect(insertCall[1][2]).toBe('New Chat');
    });
  });

  describe('PUT /api/chats/:id — title length limit', () => {
    it('caps the updated title at 200 chars', async () => {
      const res = await chatCollectionRouter(
        makeReq('/api/chats/c1', 'PUT', { title: 'B'.repeat(10000) }),
        env,
        user,
        '/api/chats/c1',
        's1'
      );
      expect(res.status).toBe(200);
      const updateCall = db.run.mock.calls.find((c) => c[0].startsWith('UPDATE chats'));
      expect(updateCall).toBeDefined();
      expect(updateCall[1][0].length).toBe(200);
    });

    it('falls back to "New Chat" when updated title sanitizes to empty', async () => {
      const res = await chatCollectionRouter(
        makeReq('/api/chats/c1', 'PUT', { title: '' }),
        env,
        user,
        '/api/chats/c1',
        's1'
      );
      expect(res.status).toBe(200);
      const updateCall = db.run.mock.calls.find((c) => c[0].startsWith('UPDATE chats'));
      expect(updateCall).toBeDefined();
      expect(updateCall[1][0]).toBe('New Chat');
    });
  });
});
