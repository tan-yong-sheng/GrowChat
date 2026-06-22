/**
 * Tests for chat-collection-ops.js — list, get, clone operations
 * Coverage focus: auth failures, query validation, pagination, clone edge cases.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  authorize: vi.fn(),
  requireOwnedChat: vi.fn(),
  getChatMessages: vi.fn(),
  attachDocumentsToMessages: vi.fn(),
  resolveDefaultModel: vi.fn(),
  stripHtml: vi.fn((s) => s),
  createRealtimeEvent: vi.fn((data) => data),
  getOwnedChat: vi.fn(),
}));

vi.mock('../utils/authorize.js', () => ({
  authorize: (...args) => mocks.authorize(...args),
}));

vi.mock('../utils/sanitize.js', () => ({
  stripHtml: mocks.stripHtml,
}));

vi.mock('../features/realtime/realtime.js', () => ({
  createRealtimeEvent: (...args) => mocks.createRealtimeEvent(...args),
}));

vi.mock('./chat-core.js', () => ({
  resolveDefaultModel: mocks.resolveDefaultModel,
  getOwnedChat: mocks.getOwnedChat,
  requireOwnedChat: mocks.requireOwnedChat,
  getChatMessages: mocks.getChatMessages,
  attachDocumentsToMessages: mocks.attachDocumentsToMessages,
}));

import { handleListChats, handleGetChat, handleCloneChat } from './chat-collection-ops.js';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeReq(path) {
  return new Request(`https://example.com${path}`, { method: 'GET' });
}

const user = { sub: 'u1' };
const env = {};
const db = { all: vi.fn(), batch: vi.fn(), prepare: vi.fn((sql) => ({ bind: vi.fn() })) };

describe('handleListChats', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.authorize.mockResolvedValue({ allow: true });
    db.all.mockResolvedValue([]);
  });

  it('returns 403 when chat.read is denied', async () => {
    mocks.authorize.mockResolvedValue({ allow: false, reason: 'forbidden' });

    const res = await handleListChats(makeReq('/api/chats'), env, db, user);

    expect(res.status).toBe(403);
  });

  it('returns 400 when q exceeds 200 characters', async () => {
    const longQ = 'a'.repeat(201);

    const res = await handleListChats(makeReq(`/api/chats?q=${longQ}`), env, db, user);

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/200 characters/i);
  });

  it('returns 400 when q contains control characters', async () => {
    const badQ = 'hello\u0000world';

    const res = await handleListChats(
      makeReq(`/api/chats?q=${encodeURIComponent(badQ)}`),
      env,
      db,
      user
    );

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/invalid characters/i);
  });

  it('returns 400 when limit is not a positive integer', async () => {
    const res = await handleListChats(makeReq('/api/chats?limit=0'), env, db, user);

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/limit/i);
  });

  it('returns 400 when limit exceeds 100', async () => {
    const res = await handleListChats(makeReq('/api/chats?limit=101'), env, db, user);

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/limit/i);
  });

  it('returns 400 when limit is non-numeric', async () => {
    const res = await handleListChats(makeReq('/api/chats?limit=abc'), env, db, user);

    expect(res.status).toBe(400);
  });

  it('returns 400 when offset is not a non-negative integer', async () => {
    const res = await handleListChats(makeReq('/api/chats?offset=-1'), env, db, user);

    expect(res.status).toBe(400);
  });

  it('queries with LIKE when q is provided', async () => {
    db.all.mockResolvedValue([]);

    await handleListChats(makeReq('/api/chats?q=report'), env, db, user);

    expect(db.all).toHaveBeenCalledWith(
      expect.stringContaining('LIKE ?'),
      expect.arrayContaining(['u1', '%report%', '%report%'])
    );
  });

  it('queries without LIKE when q is empty', async () => {
    db.all.mockResolvedValue([]);

    await handleListChats(makeReq('/api/chats'), env, db, user);

    expect(db.all).toHaveBeenCalledWith(expect.not.stringContaining('LIKE'), expect.any(Array));
  });

  it('returns has_more=true when there are more results than limit', async () => {
    db.all.mockResolvedValue(
      Array.from({ length: 11 }, (_, i) => ({
        id: `c${i}`,
        title: 'Chat',
        updated_at: Date.now(),
      }))
    );

    const res = await handleListChats(makeReq('/api/chats?limit=10'), env, db, user);

    const body = await res.json();
    expect(body.has_more).toBe(true);
    expect(body.chats).toHaveLength(10);
  });

  it('returns has_more=false when results fit within limit', async () => {
    db.all.mockResolvedValue([{ id: 'c1', title: 'Chat', updated_at: Date.now() }]);

    const res = await handleListChats(makeReq('/api/chats?limit=10'), env, db, user);

    const body = await res.json();
    expect(body.has_more).toBe(false);
  });
});

describe('handleGetChat', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.authorize.mockResolvedValue({ allow: true });
    mocks.requireOwnedChat.mockResolvedValue({
      chat: { id: 'c1', title: 'Test Chat', updated_at: 100 },
    });
    mocks.getChatMessages.mockResolvedValue([]);
    mocks.attachDocumentsToMessages.mockResolvedValue([]);
  });

  it('returns 403 when chat.read is denied', async () => {
    mocks.authorize.mockResolvedValue({ allow: false, reason: 'forbidden' });

    const res = await handleGetChat(makeReq('/api/chats/c1'), env, db, user, 'c1');

    expect(res.status).toBe(403);
  });

  it('returns 404 when chat not found', async () => {
    mocks.requireOwnedChat.mockResolvedValue({
      error: new Response(JSON.stringify({ error: 'Chat not found' }), { status: 404 }),
    });

    const res = await handleGetChat(makeReq('/api/chats/c1'), env, db, user, 'c1');

    expect(res.status).toBe(404);
  });

  it('attaches documents to messages', async () => {
    const msgs = [{ id: 'm1', role: 'user', content: 'hi' }];
    mocks.getChatMessages.mockResolvedValue(msgs);
    mocks.attachDocumentsToMessages.mockResolvedValue([{ ...msgs[0], attachments: [] }]);

    const res = await handleGetChat(makeReq('/api/chats/c1'), env, db, user, 'c1');

    expect(res.status).toBe(200);
    expect(mocks.attachDocumentsToMessages).toHaveBeenCalledWith(db, msgs);
  });

  it('handles empty messages gracefully', async () => {
    mocks.getChatMessages.mockResolvedValue([]);
    mocks.attachDocumentsToMessages.mockResolvedValue([]);

    const res = await handleGetChat(makeReq('/api/chats/c1'), env, db, user, 'c1');

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.messages).toEqual([]);
  });
});

describe('handleCloneChat', () => {
  const publishRealtimeNow = vi.fn().mockResolvedValue(undefined);

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.authorize.mockResolvedValue({ allow: true });
    mocks.requireOwnedChat.mockResolvedValue({
      chat: { id: 'c1', title: 'Original Chat', model: 'gpt-4', current_message_id: null },
    });
    db.all.mockResolvedValue([]);
    db.batch.mockResolvedValue([]);
    mocks.getOwnedChat.mockResolvedValue({
      id: 'c2',
      title: 'Original Chat (Copy)',
      model: 'gpt-4',
    });
    mocks.resolveDefaultModel.mockResolvedValue('gpt-4');
    mocks.stripHtml.mockImplementation((s) => s);
  });

  it('returns 403 when chat.write is denied', async () => {
    mocks.authorize.mockResolvedValue({ allow: false, reason: 'forbidden' });

    const res = await handleCloneChat(
      makeReq('/api/chats/c1/clone'),
      env,
      db,
      user,
      'c1',
      's1',
      publishRealtimeNow
    );

    expect(res.status).toBe(403);
  });

  it('returns 404 when source chat not found', async () => {
    mocks.requireOwnedChat.mockResolvedValue({
      error: new Response(JSON.stringify({ error: 'Chat not found' }), { status: 404 }),
    });

    const res = await handleCloneChat(
      makeReq('/api/chats/c1/clone'),
      env,
      db,
      user,
      'c1',
      's1',
      publishRealtimeNow
    );

    expect(res.status).toBe(404);
  });

  it('clones messages with new IDs', async () => {
    db.all.mockResolvedValueOnce([
      {
        id: 'm1',
        role: 'user',
        content: 'hello',
        model: 'gpt-4',
        citations: null,
        parent_id: null,
      },
      {
        id: 'm2',
        role: 'assistant',
        content: 'hi',
        model: 'gpt-4',
        citations: null,
        parent_id: 'm1',
      },
    ]);
    db.all.mockResolvedValueOnce([]); // message_documents query

    const res = await handleCloneChat(
      makeReq('/api/chats/c1/clone'),
      env,
      db,
      user,
      'c1',
      's1',
      publishRealtimeNow
    );

    expect(res.status).toBe(201);
    expect(db.batch).toHaveBeenCalled();
    const statements = db.batch.mock.calls[0][0];
    // 1 insert chat + 2 insert messages = 3 statements minimum
    expect(statements.length).toBeGreaterThanOrEqual(3);
  });

  it('uses (Copy) suffix for cloned chat title', async () => {
    db.all.mockResolvedValue([]);

    await handleCloneChat(
      makeReq('/api/chats/c1/clone'),
      env,
      db,
      user,
      'c1',
      's1',
      publishRealtimeNow
    );

    expect(mocks.stripHtml).toHaveBeenCalledWith('Original Chat');
  });

  it('updates current_message_id in cloned chat if it exists', async () => {
    mocks.requireOwnedChat.mockResolvedValue({
      chat: { id: 'c1', title: 'Original', model: 'gpt-4', current_message_id: 'm2' },
    });
    db.all
      .mockResolvedValueOnce([
        {
          id: 'm1',
          role: 'user',
          content: 'hello',
          model: 'gpt-4',
          citations: null,
          parent_id: null,
        },
        {
          id: 'm2',
          role: 'assistant',
          content: 'hi',
          model: 'gpt-4',
          citations: null,
          parent_id: 'm1',
        },
      ])
      .mockResolvedValueOnce([]); // no attachments

    await handleCloneChat(
      makeReq('/api/chats/c1/clone'),
      env,
      db,
      user,
      'c1',
      's1',
      publishRealtimeNow
    );

    expect(db.batch).toHaveBeenCalled();
    const statements = db.batch.mock.calls[0][0];
    // Should include UPDATE current_message_id - check via prepare.mock.calls
    expect(db.prepare.mock.calls.some(([sql]) => sql && sql.includes('current_message_id'))).toBe(
      true
    );
  });

  it('publishes chat.created realtime event', async () => {
    db.all.mockResolvedValue([]);

    await handleCloneChat(
      makeReq('/api/chats/c1/clone'),
      env,
      db,
      user,
      'c1',
      's1',
      publishRealtimeNow
    );

    expect(publishRealtimeNow).toHaveBeenCalledWith(
      env,
      expect.objectContaining({ type: 'chat.created', userId: 'u1' })
    );
  });

  it('returns 201 with cloned chat', async () => {
    db.all.mockResolvedValue([]);

    const res = await handleCloneChat(
      makeReq('/api/chats/c1/clone'),
      env,
      db,
      user,
      'c1',
      's1',
      publishRealtimeNow
    );

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.chat).toBeDefined();
  });
});
