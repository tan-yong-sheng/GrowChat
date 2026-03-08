import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  db: {
    all: vi.fn(),
    first: vi.fn(),
    run: vi.fn(),
    batch: vi.fn(),
    prepare: vi.fn(),
  },
  streamLLM: vi.fn(),
  queryFAQs: vi.fn(),
  queryDocumentChunks: vi.fn(),
  createRealtimeEvent: vi.fn((event) => event),
  getOriginSessionId: vi.fn(() => 's1'),
  publishRealtimeEvent: vi.fn().mockResolvedValue(true),
}));

vi.mock('../db.js', () => ({
  createDB: () => mocks.db,
}));

vi.mock('../llm.js', async () => {
  const actual = await vi.importActual('../llm.js');
  return {
    ...actual,
    streamLLM: (...args) => mocks.streamLLM(...args),
  };
});

vi.mock('../services/embeddings.js', () => ({
  queryFAQs: (...args) => mocks.queryFAQs(...args),
  queryDocumentChunks: (...args) => mocks.queryDocumentChunks(...args),
}));

vi.mock('../realtime.js', () => ({
  createRealtimeEvent: (...args) => mocks.createRealtimeEvent(...args),
  getOriginSessionId: (...args) => mocks.getOriginSessionId(...args),
  publishRealtimeEvent: (...args) => mocks.publishRealtimeEvent(...args),
}));

import { chatRouter } from './chat.js';

function makeReq(path, method, body) {
  const init = { method, headers: {} };
  if (body !== undefined) {
    init.body = typeof body === 'string' ? body : JSON.stringify(body);
    init.headers['Content-Type'] = 'application/json';
  }
  return new Request(`https://example.com${path}`, init);
}

describe('chatRouter', () => {
  const user = { sub: 'u1', role: 'user', email: 'u@example.com' };

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.queryFAQs.mockResolvedValue([]);
    mocks.queryDocumentChunks.mockResolvedValue([]);
    mocks.db.run.mockResolvedValue({ success: true });
    mocks.db.batch.mockResolvedValue([{ success: true }]);
    mocks.db.prepare.mockImplementation((sql) => ({
      sql,
      bind: (...params) => ({ sql, params }),
    }));
  });

  it('returns 401 for unauthenticated /api/chats', async () => {
    const res = await chatRouter(makeReq('/api/chats', 'GET'), { DB: {} }, {}, null, '/api/chats');
    expect(res.status).toBe(401);
  });

  it('returns 400 for invalid limit query', async () => {
    const res = await chatRouter(
      new Request('https://example.com/api/chats?limit=0', { method: 'GET' }),
      { DB: {} },
      {},
      user,
      '/api/chats'
    );

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toMatchObject({
      error: 'Query parameter "limit" must be a positive integer between 1 and 100',
    });
  });

  it('lists chats for authenticated user', async () => {
    mocks.db.all.mockResolvedValueOnce([{ id: 'c1', title: 'Chat 1' }]);

    const res = await chatRouter(
      new Request('https://example.com/api/chats?limit=10&offset=0', { method: 'GET' }),
      { DB: {} },
      {},
      user,
      '/api/chats'
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.chats).toEqual([{ id: 'c1', title: 'Chat 1' }]);
    expect(body.limit).toBe(10);
    expect(body.offset).toBe(0);
    expect(mocks.db.all).toHaveBeenCalled();
  });

  it('creates chat with default model and returns 201', async () => {
    mocks.db.first.mockResolvedValueOnce({
      id: 'c1',
      user_id: 'u1',
      title: 'New Chat',
      model: '@cf/meta/llama-3.1-8b-instruct',
    });

    const res = await chatRouter(
      makeReq('/api/chats', 'POST', {}),
      { DB: {} },
      {},
      user,
      '/api/chats'
    );

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.chat.id).toBe('c1');
    expect(mocks.db.run).toHaveBeenCalled();
  });

  it('returns 400 when posting empty message', async () => {
    mocks.db.first.mockResolvedValueOnce({ id: 'c1', user_id: 'u1', model: 'gpt-4' });

    const res = await chatRouter(
      makeReq('/api/chats/c1/messages', 'POST', { message: '   ' }),
      { DB: {} },
      {},
      user,
      '/api/chats/c1/messages'
    );

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toMatchObject({ error: 'message is required' });
  });

  it('returns SSE llm_unavailable payload when LLM setup fails', async () => {
    mocks.db.first
      .mockResolvedValueOnce({ id: 'c1', user_id: 'u1', model: 'gpt-4', current_message_id: null })
      .mockResolvedValueOnce({ id: 'm-user', role: 'user', content: 'hello' })
      .mockResolvedValueOnce({ id: 'c1', user_id: 'u1', model: 'gpt-4', current_message_id: 'm-user' });
    mocks.db.all.mockResolvedValueOnce([{ role: 'user', content: 'hello' }]);
    mocks.streamLLM.mockRejectedValueOnce(new Error('llm down'));

    const res = await chatRouter(
      makeReq('/api/chats/c1/messages', 'POST', { message: 'hello' }),
      { DB: {} },
      {},
      user,
      '/api/chats/c1/messages'
    );

    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toContain('text/event-stream');
    const text = await res.text();
    expect(text).toContain('"error":"llm_unavailable"');
    expect(text).toContain('data: [DONE]');
    expect(mocks.db.batch).toHaveBeenCalled();
  });
});
