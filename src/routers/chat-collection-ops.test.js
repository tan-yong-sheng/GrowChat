import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  authorize: vi.fn(),
  createRealtimeEvent: vi.fn((e) => e),
  requireOwnedChat: vi.fn(),
  getChatMessages: vi.fn(),
  attachDocumentsToMessages: vi.fn(),
  resolveDefaultModel: vi.fn(),
  getOwnedChat: vi.fn(),
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

vi.mock('./chat-core.js', () => ({
  requireOwnedChat: (...args) => mocks.requireOwnedChat(...args),
  getChatMessages: (...args) => mocks.getChatMessages(...args),
  attachDocumentsToMessages: (...args) => mocks.attachDocumentsToMessages(...args),
  resolveDefaultModel: (...args) => mocks.resolveDefaultModel(...args),
  getOwnedChat: (...args) => mocks.getOwnedChat(...args),
}));

import { handleListChats, handleGetChat, handleCloneChat } from './chat-collection-ops.js';

function makeReq(path, method) {
  return new Request(`https://example.com${path}`, { method });
}

describe('handleListChats', () => {
  const env = {};
  const user = { sub: 'u1' };
  const db = { all: vi.fn(), run: vi.fn(), first: vi.fn() };

  beforeEach(() => {
    vi.resetAllMocks();
    mocks.authorize.mockResolvedValue({ allow: true });
    db.all.mockResolvedValue([]);
  });

  it('rejects unauthorized', async () => {
    mocks.authorize.mockResolvedValue({ allow: false, reason: 'no' });
    const res = await handleListChats(makeReq('/api/chats', 'GET'), env, db, user);
    expect(res.status).toBe(403);
  });

  it('returns chats list with pagination', async () => {
    db.all.mockResolvedValue([
      { id: 'c1', title: 'Chat 1', model: 'gpt-4o', pinned: 0, created_at: 1, updated_at: 2 },
    ]);
    const res = await handleListChats(makeReq('/api/chats', 'GET'), env, db, user);
    expect(res.status).toBe(200);
    const payload = await res.json();
    expect(payload.chats).toHaveLength(1);
    expect(payload.has_more).toBe(false);
  });

  it('supports query parameter', async () => {
    db.all.mockResolvedValue([]);
    const res = await handleListChats(makeReq('/api/chats?q=test', 'GET'), env, db, user);
    expect(res.status).toBe(200);
  });

  it('validates limit parameter', async () => {
    const res = await handleListChats(makeReq('/api/chats?limit=0', 'GET'), env, db, user);
    expect(res.status).toBe(400);
  });

  it('validates offset parameter', async () => {
    const res = await handleListChats(makeReq('/api/chats?offset=-1', 'GET'), env, db, user);
    expect(res.status).toBe(400);
  });

  it('validates query length', async () => {
    const res = await handleListChats(
      makeReq('/api/chats?q=' + 'a'.repeat(201), 'GET'),
      env,
      db,
      user
    );
    expect(res.status).toBe(400);
  });
});

describe('handleGetChat', () => {
  const env = {};
  const user = { sub: 'u1' };
  const db = { all: vi.fn(), run: vi.fn(), first: vi.fn() };

  beforeEach(() => {
    vi.resetAllMocks();
    mocks.authorize.mockResolvedValue({ allow: true });
    mocks.requireOwnedChat.mockResolvedValue({
      chat: {
        id: 'c1',
        user_id: 'u1',
        title: 'Test',
        model: 'gpt-4o',
        updated_at: 1,
        current_message_id: null,
      },
    });
    mocks.getChatMessages.mockResolvedValue([]);
    mocks.attachDocumentsToMessages.mockResolvedValue([]);
  });

  it('rejects unauthorized', async () => {
    mocks.authorize.mockResolvedValue({ allow: false, reason: 'no' });
    const res = await handleGetChat(makeReq('/api/chats/c1', 'GET'), env, db, user, 'c1');
    expect(res.status).toBe(403);
  });

  it('returns chat with messages', async () => {
    const res = await handleGetChat(makeReq('/api/chats/c1', 'GET'), env, db, user, 'c1');
    expect(res.status).toBe(200);
    const payload = await res.json();
    expect(payload.chat).toBeDefined();
    expect(payload.messages).toBeDefined();
  });

  it('returns 404 when chat not owned', async () => {
    mocks.requireOwnedChat.mockResolvedValue({
      error: new Response(JSON.stringify({ error: 'Not found' }), { status: 404 }),
    });
    const res = await handleGetChat(makeReq('/api/chats/c1', 'GET'), env, db, user, 'c1');
    expect(res.status).toBe(404);
  });
});

describe('handleCloneChat', () => {
  const env = {};
  const user = { sub: 'u1' };
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
    mocks.authorize.mockResolvedValue({ allow: true });
    mocks.requireOwnedChat.mockResolvedValue({
      chat: {
        id: 'c1',
        user_id: 'u1',
        title: 'Original',
        model: 'gpt-4o',
        current_message_id: null,
      },
    });
    mocks.resolveDefaultModel.mockResolvedValue('gpt-4o');
    mocks.getOwnedChat.mockResolvedValue({
      id: 'new-id',
      title: 'Original (Copy)',
      model: 'gpt-4o',
    });
    db.all.mockResolvedValue([]);
    db.batch.mockResolvedValue(undefined);
  });

  it('rejects unauthorized', async () => {
    mocks.authorize.mockResolvedValue({ allow: false, reason: 'no' });
    const res = await handleCloneChat(
      makeReq('/api/chats/c1/clone', 'POST'),
      env,
      db,
      user,
      'c1',
      's1',
      vi.fn().mockResolvedValue(true)
    );
    expect(res.status).toBe(403);
  });

  it('clones chat successfully', async () => {
    db.all.mockResolvedValue([]);
    const res = await handleCloneChat(
      makeReq('/api/chats/c1/clone', 'POST'),
      env,
      db,
      user,
      'c1',
      's1',
      vi.fn().mockResolvedValue(true)
    );
    expect(res.status).toBe(201);
    expect(db.batch).toHaveBeenCalled();
  });
});
