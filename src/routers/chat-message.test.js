import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  createDB: vi.fn(),
  authorize: vi.fn(),
  requireOwnedChat: vi.fn(),
  getMessageSnapshot: vi.fn(),
  resolveDefaultModel: vi.fn(),
  ensureModelAllowed: vi.fn(),
  normalizeSelectedToolNames: vi.fn(),
  publishRealtimeNow: vi.fn(),
  requireChatPermission: vi.fn(),
  handleSendMessage: vi.fn(),
  handleBranchMessage: vi.fn(),
  createRealtimeEvent: vi.fn((e) => e),
  trimTrailingAssistantMessages: vi.fn(),
}));

vi.mock('../db.js', () => ({
  createDB: (...args) => mocks.createDB(...args),
}));

vi.mock('../utils/authorize.js', () => ({
  authorize: (...args) => mocks.authorize(...args),
}));

vi.mock('../features/realtime/realtime.js', () => ({
  createRealtimeEvent: (...args) => mocks.createRealtimeEvent(...args),
}));

vi.mock('./chat-history.js', () => ({
  trimTrailingAssistantMessages: (...args) => mocks.trimTrailingAssistantMessages(...args),
}));

vi.mock('./chat-core.js', () => ({
  requireOwnedChat: (...args) => mocks.requireOwnedChat(...args),
  getMessageSnapshot: (...args) => mocks.getMessageSnapshot(...args),
  resolveDefaultModel: (...args) => mocks.resolveDefaultModel(...args),
}));

vi.mock('./chat-message-helpers.js', () => ({
  ensureModelAllowed: (...args) => mocks.ensureModelAllowed(...args),
  normalizeSelectedToolNames: (...args) => mocks.normalizeSelectedToolNames(...args),
  publishRealtimeNow: (...args) => mocks.publishRealtimeNow(...args),
  requireChatPermission: (...args) => mocks.requireChatPermission(...args),
  requireOwnedChatWithPermission: async (req, env, db, user, action, chatId) => {
    const permissionError = await mocks.requireChatPermission(req, env, user, action, chatId);
    if (permissionError) return { error: permissionError };
    const owned = await mocks.requireOwnedChat(req, db, chatId, user.sub);
    if (owned.error) return { error: owned.error };
    return { chat: owned.chat };
  },
}));

vi.mock('./chat-message-send.js', () => ({
  handleSendMessage: (...args) => mocks.handleSendMessage(...args),
}));

vi.mock('./chat-message-branch.js', () => ({
  handleBranchMessage: (...args) => mocks.handleBranchMessage(...args),
}));

import { chatMessageRouter } from './chat-message.js';

function makeReq(path, method, body) {
  const init = { method, headers: {} };
  if (body !== undefined) {
    init.body = typeof body === 'string' ? body : JSON.stringify(body);
    init.headers['Content-Type'] = 'application/json';
  }
  return new Request(`https://example.com${path}`, init);
}

describe('chatMessageRouter', () => {
  const user = { sub: 'u1' };
  const env = { DB: {} };
  const ctx = {};
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
  const originSessionId = 's1';

  beforeEach(() => {
    vi.resetAllMocks();
    mocks.authorize.mockResolvedValue({ allow: true });
    mocks.requireOwnedChat.mockResolvedValue({
      chat: { id: 'c1', user_id: 'u1', model: 'gpt-4o', current_message_id: null },
    });
    mocks.requireChatPermission.mockResolvedValue(null);
    mocks.resolveDefaultModel.mockResolvedValue('gpt-4o');
    mocks.ensureModelAllowed.mockResolvedValue({
      providerInfo: { providerFamily: 'openai', connection: { source: 'config' } },
    });
    mocks.getMessageSnapshot.mockResolvedValue({ id: 'm1', model: 'gpt-4o' });
    mocks.normalizeSelectedToolNames.mockReturnValue(null);
    mocks.publishRealtimeNow.mockResolvedValue(true);
  });

  describe('POST /api/chats/:id/messages', () => {
    it('delegates to handleSendMessage', async () => {
      mocks.handleSendMessage.mockResolvedValue(new Response('ok'));
      await chatMessageRouter({
        req: makeReq('/api/chats/c1/messages', 'POST', { message: 'hello' }),
        env,
        ctx,
        db,
        user,
        path: '/api/chats/c1/messages',
        originSessionId,
        assistantStreamRunner: vi.fn(),
      });
      expect(mocks.handleSendMessage).toHaveBeenCalled();
    });
  });

  describe('POST /api/chats/:id/messages/:msgId/branch', () => {
    it('delegates to handleBranchMessage', async () => {
      mocks.handleBranchMessage.mockResolvedValue(new Response('ok'));
      await chatMessageRouter({
        req: makeReq('/api/chats/c1/messages/m1/branch', 'POST', { content: 'branch' }),
        env,
        ctx,
        db,
        user,
        path: '/api/chats/c1/messages/m1/branch',
        originSessionId,
        assistantStreamRunner: vi.fn(),
      });
      expect(mocks.handleBranchMessage).toHaveBeenCalled();
    });
  });

  describe('POST /api/chats/:id/messages/:msgId/regenerate', () => {
    it('rejects non-assistant messages', async () => {
      db.first.mockResolvedValue({ role: 'user', parent_id: null });
      const res = await chatMessageRouter({
        req: makeReq('/api/chats/c1/messages/m1/regenerate', 'POST'),
        env,
        ctx,
        db,
        user,
        path: '/api/chats/c1/messages/m1/regenerate',
        originSessionId,
        assistantStreamRunner: vi.fn(),
      });
      expect(res.status).toBe(400);
    });

    it('returns 404 for missing message', async () => {
      db.first.mockResolvedValue(null);
      const res = await chatMessageRouter({
        req: makeReq('/api/chats/c1/messages/m1/regenerate', 'POST'),
        env,
        ctx,
        db,
        user,
        path: '/api/chats/c1/messages/m1/regenerate',
        originSessionId,
        assistantStreamRunner: vi.fn(),
      });
      expect(res.status).toBe(404);
    });
  });

  describe('POST /api/chats/:id/messages/:msgId/cancel', () => {
    it('returns 404 for missing message', async () => {
      db.first.mockResolvedValue(null);
      const res = await chatMessageRouter({
        req: makeReq('/api/chats/c1/messages/m1/cancel', 'POST'),
        env,
        ctx,
        db,
        user,
        path: '/api/chats/c1/messages/m1/cancel',
        originSessionId,
        assistantStreamRunner: vi.fn(),
      });
      expect(res.status).toBe(404);
    });

    it('rejects non-assistant messages', async () => {
      db.first.mockResolvedValue({ id: 'm1', role: 'user', status: 'completed' });
      const res = await chatMessageRouter({
        req: makeReq('/api/chats/c1/messages/m1/cancel', 'POST'),
        env,
        ctx,
        db,
        user,
        path: '/api/chats/c1/messages/m1/cancel',
        originSessionId,
        assistantStreamRunner: vi.fn(),
      });
      expect(res.status).toBe(400);
    });

    it('cancels streaming message', async () => {
      db.first.mockResolvedValue({ id: 'm1', role: 'assistant', status: 'streaming' });
      db.run.mockResolvedValue(undefined);
      const res = await chatMessageRouter({
        req: makeReq('/api/chats/c1/messages/m1/cancel', 'POST'),
        env,
        ctx,
        db,
        user,
        path: '/api/chats/c1/messages/m1/cancel',
        originSessionId,
        assistantStreamRunner: vi.fn(),
      });
      expect(res.status).toBe(200);
      const payload = await res.json();
      expect(payload.cancelled).toBe(true);
    });

    it('returns ok=false for non-cancellable status', async () => {
      db.first.mockResolvedValue({ id: 'm1', role: 'assistant', status: 'completed' });
      const res = await chatMessageRouter({
        req: makeReq('/api/chats/c1/messages/m1/cancel', 'POST'),
        env,
        ctx,
        db,
        user,
        path: '/api/chats/c1/messages/m1/cancel',
        originSessionId,
        assistantStreamRunner: vi.fn(),
      });
      expect(res.status).toBe(200);
      const payload = await res.json();
      expect(payload.cancelled).toBe(false);
    });
  });

  describe('PUT /api/chats/:id/messages/:msgId', () => {
    it('edits assistant message content', async () => {
      db.first.mockImplementation(async (sql) => {
        if (sql.includes('SELECT id, chat_id, role, content'))
          return { id: 'm1', chat_id: 'c1', role: 'assistant', content: 'old' };
        return {
          id: 'm1',
          chat_id: 'c1',
          role: 'assistant',
          content: 'new content',
          model: 'gpt-4o',
          citations: null,
          parent_id: null,
          created_at: 1,
        };
      });
      db.batch.mockResolvedValue(undefined);
      const res = await chatMessageRouter({
        req: makeReq('/api/chats/c1/messages/m1', 'PUT', { content: 'new content' }),
        env,
        ctx,
        db,
        user,
        path: '/api/chats/c1/messages/m1',
        originSessionId,
        assistantStreamRunner: vi.fn(),
      });
      expect(res.status).toBe(200);
    });

    it('rejects non-assistant messages', async () => {
      db.first.mockResolvedValue({ id: 'm1', chat_id: 'c1', role: 'user', content: 'hi' });
      const res = await chatMessageRouter({
        req: makeReq('/api/chats/c1/messages/m1', 'PUT', { content: 'edit' }),
        env,
        ctx,
        db,
        user,
        path: '/api/chats/c1/messages/m1',
        originSessionId,
        assistantStreamRunner: vi.fn(),
      });
      expect(res.status).toBe(400);
    });

    it('requires non-empty content', async () => {
      db.first.mockResolvedValue({ id: 'm1', chat_id: 'c1', role: 'assistant', content: 'old' });
      const res = await chatMessageRouter({
        req: makeReq('/api/chats/c1/messages/m1', 'PUT', { content: '' }),
        env,
        ctx,
        db,
        user,
        path: '/api/chats/c1/messages/m1',
        originSessionId,
        assistantStreamRunner: vi.fn(),
      });
      expect(res.status).toBe(400);
    });
  });

  describe('DELETE /api/chats/:id/messages/:msgId', () => {
    it('deletes message', async () => {
      db.first.mockResolvedValue({ id: 'm1' });
      db.all.mockResolvedValue([]);
      db.run.mockResolvedValue(undefined);
      const res = await chatMessageRouter({
        req: makeReq('/api/chats/c1/messages/m1', 'DELETE'),
        env,
        ctx,
        db,
        user,
        path: '/api/chats/c1/messages/m1',
        originSessionId,
        assistantStreamRunner: vi.fn(),
      });
      expect(res.status).toBe(200);
    });

    it('returns 404 for missing message', async () => {
      db.first.mockResolvedValue(null);
      const res = await chatMessageRouter({
        req: makeReq('/api/chats/c1/messages/nonexistent', 'DELETE'),
        env,
        ctx,
        db,
        user,
        path: '/api/chats/c1/messages/nonexistent',
        originSessionId,
        assistantStreamRunner: vi.fn(),
      });
      expect(res.status).toBe(404);
    });
  });

  describe('GET /api/chats/:id/messages/:msgId/status', () => {
    it('returns message status', async () => {
      db.first.mockResolvedValue({
        id: 'm1',
        role: 'assistant',
        content: 'text',
        model: 'gpt-4o',
        status: 'completed',
      });
      const res = await chatMessageRouter({
        req: makeReq('/api/chats/c1/messages/m1/status', 'GET'),
        env,
        ctx,
        db,
        user,
        path: '/api/chats/c1/messages/m1/status',
        originSessionId,
        assistantStreamRunner: vi.fn(),
      });
      expect(res.status).toBe(200);
    });

    it('returns 404 for missing message', async () => {
      db.first.mockResolvedValue(null);
      const res = await chatMessageRouter({
        req: makeReq('/api/chats/c1/messages/nonexistent/status', 'GET'),
        env,
        ctx,
        db,
        user,
        path: '/api/chats/c1/messages/nonexistent/status',
        originSessionId,
        assistantStreamRunner: vi.fn(),
      });
      expect(res.status).toBe(404);
    });
  });

  it('returns null for unknown path', async () => {
    const result = await chatMessageRouter({
      req: makeReq('/api/unknown', 'GET'),
      env,
      ctx,
      db,
      user,
      path: '/api/unknown',
      originSessionId,
      assistantStreamRunner: vi.fn(),
    });
    expect(result).toBeNull();
  });
});
