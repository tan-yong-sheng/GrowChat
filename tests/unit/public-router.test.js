import { beforeEach, describe, expect, it, vi } from 'vitest';

const db = {
  first: vi.fn(),
  all: vi.fn(),
};

vi.mock('../../src/db.js', () => ({
  createDB: () => db,
}));

import { publicRouter } from '../../src/routers/public.js';

function makeReq(path, init = {}) {
  return new Request(`https://example.com${path}`, init);
}

describe('public router', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns health details without auth', async () => {
    const res = await publicRouter(
      makeReq('/api/health'),
      { APP_NAME: 'GrowChat', DB: {}, SESSIONS: {}, MESSAGE_QUEUE: {} },
      {},
      null,
      '/api/health'
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.service).toBe('GrowChat');
    expect(body.bindings).toMatchObject({
      db: true,
      sessions: true,
      realtime: true,
    });
    expect(typeof body.timestamp).toBe('string');
  });

  it('returns a sanitized shared chat payload', async () => {
    db.first.mockResolvedValueOnce({
      id: 'chat-1',
      user_id: 'user-1',
      title: 'Shared chat',
      model: 'gpt-5',
      pinned: 1,
      created_at: 10,
      updated_at: 20,
    });
    db.all.mockResolvedValueOnce([
      { id: 'm1', role: 'user', content: 'Hello', model: 'gpt-5', created_at: 11 },
      { id: 'm2', role: 'assistant', content: 'Hi', model: 'gpt-5', created_at: 12 },
    ]);

    const res = await publicRouter(
      makeReq('/s/share-123?format=json'),
      { DB: {}, ASSETS: {} },
      {},
      null,
      '/s/share-123'
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.shared).toBe(true);
    expect(body.chat).toMatchObject({
      id: 'chat-1',
      title: 'Shared chat',
      model: 'gpt-5',
      message_count: 2,
    });
    expect(body.chat.user_id).toBeUndefined();
    expect(body.chat.system_prompt).toBeUndefined();
    expect(body.messages).toHaveLength(2);
  });

  it('falls back to index.html for browser navigation', async () => {
    const assets = {
      fetch: vi.fn(async (request) => new Response(`asset:${new URL(request.url).pathname}`, {
        status: 200,
        headers: { 'Content-Type': 'text/html' },
      })),
    };

    const res = await publicRouter(
      makeReq('/s/share-123', { headers: { Accept: 'text/html' } }),
      { DB: {}, ASSETS: assets },
      {},
      null,
      '/s/share-123'
    );

    expect(res.status).toBe(200);
    expect(assets.fetch).toHaveBeenCalled();
    const calledRequest = assets.fetch.mock.calls[0][0];
    expect(new URL(calledRequest.url).pathname).toBe('/index.html');
  });
});


