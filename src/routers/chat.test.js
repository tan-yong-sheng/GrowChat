// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createProviderTestEnv } from '../../tests/unit/provider-test-env.js';

const mocks = vi.hoisted(() => ({
  db: {
    all: vi.fn(),
    first: vi.fn(),
    run: vi.fn(),
    batch: vi.fn(),
    prepare: vi.fn(),
  },
  streamLLM: vi.fn(),
  loadToolServers: vi.fn(),
  createRealtimeEvent: vi.fn((event) => event),
  getOriginSessionId: vi.fn(() => 's1'),
  publishRealtimeEvent: vi.fn().mockResolvedValue(true),
  authorize: vi.fn(),
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

vi.mock('../utils/authorize.js', () => ({
  authorize: (...args) => mocks.authorize(...args),
}));

vi.mock('../chat/mcp.js', async () => {
  const actual = await vi.importActual('../chat/mcp.js');
  return {
    ...actual,
    loadToolServers: (...args) => mocks.loadToolServers(...args),
  };
});

vi.mock('../features/realtime/realtime.js', () => ({
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
    mocks.loadToolServers.mockResolvedValue([]);
    mocks.db.run.mockResolvedValue({ success: true });
    mocks.db.batch.mockResolvedValue([{ success: true }]);
    mocks.db.prepare.mockImplementation((sql) => ({
      sql,
      bind: (...params) => ({ sql, params }),
    }));
    mocks.authorize.mockResolvedValue({ allow: true, code: 'ok', action: 'chat.read' });
  });

  it('returns 401 for unauthenticated /api/chats', async () => {
    const res = await chatRouter({
      req: makeReq('/api/chats', 'GET'),
      env: { DB: {} },
      ctx: {},
      user: null,
      path: '/api/chats',
    });
    expect(res.status).toBe(401);
  });

  it('returns 400 for invalid limit query', async () => {
    const res = await chatRouter({
      req: new Request('https://example.com/api/chats?limit=0', { method: 'GET' }),
      env: { DB: {} },
      ctx: {},
      user: user,
      path: '/api/chats',
    });

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toMatchObject({
      error: 'Query parameter "limit" must be a positive integer between 1 and 100',
    });
  });

  it('lists chats for authenticated user', async () => {
    mocks.db.all.mockResolvedValueOnce([{ id: 'c1', title: 'Chat 1' }]);

    const res = await chatRouter({
      req: new Request('https://example.com/api/chats?limit=10&offset=0', { method: 'GET' }),
      env: { DB: {} },
      ctx: {},
      user: user,
      path: '/api/chats',
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.chats).toEqual([{ id: 'c1', title: 'Chat 1' }]);
    expect(body.limit).toBe(10);
    expect(body.offset).toBe(0);
    expect(body.has_more).toBe(false);
    expect(mocks.db.all).toHaveBeenCalled();
  });

  it('lists enabled tool servers for the chat composer', async () => {
    mocks.loadToolServers.mockResolvedValueOnce([
      {
        id: 'server-1',
        name: 'Weather',
        url: 'https://example.invalid',
        enabled: true,
        tools: [
          {
            name: 'weather_lookup',
            title: 'Weather Lookup',
            description: 'Lookup weather',
            enabled: true,
          },
          { name: 'news_lookup', title: 'News Lookup', description: 'Lookup news', enabled: false },
        ],
      },
      {
        id: 'server-2',
        name: 'Hidden',
        url: 'https://example.invalid',
        enabled: false,
        tools: [{ name: 'hidden_tool', enabled: true }],
      },
    ]);

    const res = await chatRouter({
      req: makeReq('/api/tool-servers', 'GET'),
      env: { DB: {} },
      ctx: {},
      user: user,
      path: '/api/tool-servers',
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.servers).toEqual([
      expect.objectContaining({
        id: 'server-1',
        name: 'Weather',
        access_label: 'Admin',
        access_variant: 'admin',
        enabled: true,
        tools: [
          {
            name: 'weather_lookup',
            title: 'Weather Lookup',
            description: 'Lookup weather',
            enabled: true,
            visible_for_user: true,
            hidden_for_user: false,
          },
        ],
      }),
    ]);
  });

  it('returns 304 for cached chat list when ETag matches', async () => {
    mocks.db.all.mockResolvedValue([{ id: 'c1', title: 'Chat 1', updated_at: 10, created_at: 9 }]);

    const res1 = await chatRouter({
      req: new Request('https://example.com/api/chats?limit=10&offset=0', { method: 'GET' }),
      env: { DB: {} },
      ctx: {},
      user: user,
      path: '/api/chats',
    });
    const etag = res1.headers.get('ETag');
    expect(etag).toBeTruthy();

    const res2 = await chatRouter({
      req: new Request('https://example.com/api/chats?limit=10&offset=0', {
        method: 'GET',
        headers: { 'If-None-Match': etag },
      }),
      env: { DB: {} },
      ctx: {},
      user: user,
      path: '/api/chats',
    });

    expect(res2.status).toBe(304);
  });

  it('returns 304 for cached chat detail when ETag matches', async () => {
    mocks.db.first.mockResolvedValue({
      id: 'c1',
      user_id: 'u1',
      updated_at: 20,
      current_message_id: 'm1',
    });
    mocks.db.all.mockImplementation((sql) => {
      if (String(sql).includes('FROM messages')) {
        return Promise.resolve([{ id: 'm1', role: 'user', content: 'Hello', created_at: 5 }]);
      }
      if (String(sql).includes('message_documents')) {
        return Promise.reject(new Error('no such table: message_documents'));
      }
      return Promise.resolve([]);
    });

    const res1 = await chatRouter({
      req: new Request('https://example.com/api/chats/c1', { method: 'GET' }),
      env: { DB: {} },
      ctx: {},
      user: user,
      path: '/api/chats/c1',
    });
    const etag = res1.headers.get('ETag');
    expect(etag).toBeTruthy();

    const res2 = await chatRouter({
      req: new Request('https://example.com/api/chats/c1', {
        method: 'GET',
        headers: { 'If-None-Match': etag },
      }),
      env: { DB: {} },
      ctx: {},
      user: user,
      path: '/api/chats/c1',
    });

    expect(res2.status).toBe(304);
  });

  it('creates chat with default model and returns 201', async () => {
    mocks.db.first.mockResolvedValueOnce({
      id: 'c1',
      user_id: 'u1',
      title: 'New Chat',
      model: 'gpt-4',
    });

    const res = await chatRouter({
      req: makeReq('/api/chats', 'POST', {}),
      env: { DB: {} },
      ctx: {},
      user: user,
      path: '/api/chats',
    });

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.chat.id).toBe('c1');
    expect(mocks.db.run).toHaveBeenCalled();
  });

  it('toggles chat pinned state', async () => {
    mocks.db.first
      .mockResolvedValueOnce({ id: 'c1', user_id: 'u1', pinned: 0, title: 'Chat 1' })
      .mockResolvedValueOnce({ id: 'c1', user_id: 'u1', pinned: 1, title: 'Chat 1' });

    const res = await chatRouter({
      req: makeReq('/api/chats/c1/pin', 'POST'),
      env: { DB: {} },
      ctx: {},
      user: user,
      path: '/api/chats/c1/pin',
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.chat.pinned).toBe(1);
    expect(mocks.db.run).toHaveBeenCalledWith(
      'UPDATE chats SET pinned = ?, updated_at = unixepoch() WHERE id = ? AND user_id = ?',
      [1, 'c1', 'u1']
    );
  });

  it('creates a share link for a chat', async () => {
    mocks.db.first
      .mockResolvedValueOnce({ id: 'c1', user_id: 'u1', title: 'Chat 1', share_id: null })
      .mockResolvedValueOnce({ id: 'c1', user_id: 'u1', title: 'Chat 1', share_id: 'share-1' });

    const randomUUIDSpy = vi.spyOn(crypto, 'randomUUID').mockReturnValue('share-1');

    try {
      const res = await chatRouter({
        req: makeReq('/api/chats/c1/share', 'POST'),
        env: { DB: {} },
        ctx: {},
        user: user,
        path: '/api/chats/c1/share',
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body).toMatchObject({
        share_id: 'share-1',
        share_url: '/s/share-1',
        chat_id: 'c1',
      });
      expect(mocks.db.run).toHaveBeenCalledWith(
        'UPDATE chats SET share_id = ?, updated_at = unixepoch() WHERE id = ? AND user_id = ?',
        ['share-1', 'c1', 'u1']
      );
    } finally {
      randomUUIDSpy.mockRestore();
    }
  });

  it('branches an assistant message without calling the LLM when no_reply is true', async () => {
    const branchChat = {
      id: 'c1',
      user_id: 'u1',
      title: 'Chat 1',
      model: 'gpt-4',
      current_message_id: 'm0',
    };
    const sourceMessage = {
      role: 'assistant',
      parent_id: 'm-parent',
      model: 'gpt-4',
      citations: '[{}]',
    };
    const createdMessage = {
      id: 'm-branch',
      chat_id: 'c1',
      role: 'assistant',
      content: 'Updated assistant answer',
      model: 'gpt-4',
      citations: '[{}]',
      parent_id: 'm-parent',
      created_at: 123,
    };
    mocks.db.first
      .mockResolvedValueOnce(branchChat)
      .mockResolvedValueOnce(sourceMessage)
      .mockResolvedValueOnce(createdMessage)
      .mockResolvedValueOnce({ ...branchChat, current_message_id: 'm-branch' });

    const res = await chatRouter({
      req: makeReq('/api/chats/c1/messages/m1/branch', 'POST', {
        role: 'assistant',
        no_reply: true,
        content: 'Updated assistant answer',
      }),
      env: { DB: {} },
      ctx: {},
      user: user,
      path: '/api/chats/c1/messages/m1/branch',
    });

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({
      message: {
        id: 'm-branch',
        role: 'assistant',
        content: 'Updated assistant answer',
      },
    });
    expect(mocks.streamLLM).not.toHaveBeenCalled();
    expect(mocks.db.batch).toHaveBeenCalled();
  });

  it('cancels a streaming assistant message', async () => {
    mocks.db.first
      .mockResolvedValueOnce({ id: 'c1', user_id: 'u1', title: 'Chat 1' })
      .mockResolvedValueOnce({ id: 'm1', role: 'assistant', status: 'streaming' })
      .mockResolvedValueOnce({ id: 'm1', role: 'assistant', model: 'gpt-4', status: 'cancelled' });

    const res = await chatRouter({
      req: makeReq('/api/chats/c1/messages/m1/cancel', 'POST'),
      env: { DB: {} },
      ctx: {},
      user: user,
      path: '/api/chats/c1/messages/m1/cancel',
    });

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ ok: true, cancelled: true });
    expect(mocks.db.run).toHaveBeenCalledWith(
      "UPDATE messages SET status = 'cancelled', error_code = 'cancelled', error_message = ? WHERE id = ? AND chat_id = ?",
      ['Cancelled by user', 'm1', 'c1']
    );
  });

  it('resumes a streaming assistant message and emits deltas', async () => {
    mocks.db.first
      .mockResolvedValueOnce({ id: 'c1', user_id: 'u1', title: 'Chat 1' })
      .mockResolvedValueOnce({ id: 'm1', role: 'assistant', status: 'streaming' })
      .mockResolvedValueOnce({ status: 'streaming' })
      .mockResolvedValueOnce({ status: 'done' });
    mocks.db.all
      .mockResolvedValueOnce([{ seq: 1, payload: JSON.stringify({ response: 'hello' }) }])
      .mockResolvedValueOnce([]);

    const res = await chatRouter({
      req: new Request('https://example.com/api/chats/c1/messages/m1/resume?after_seq=0', {
        method: 'GET',
      }),
      env: { DB: {} },
      ctx: {},
      user: user,
      path: '/api/chats/c1/messages/m1/resume',
    });

    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toContain('text/event-stream');
    const text = await res.text();
    expect(text).toContain('"response":"hello"');
    expect(text).toContain('data: [DONE]');
  });

  it('returns 400 when posting empty message', async () => {
    mocks.db.first.mockResolvedValueOnce({ id: 'c1', user_id: 'u1', model: 'gpt-4' });

    const res = await chatRouter({
      req: makeReq('/api/chats/c1/messages', 'POST', { message: '   ' }),
      env: { DB: {} },
      ctx: {},
      user: user,
      path: '/api/chats/c1/messages',
    });

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toMatchObject({ error: 'message is required' });
  });

  it('denies chat send when model access is not granted', async () => {
    const adminUser = { ...user, role: 'admin' };
    mocks.authorize.mockImplementation(async (_env, _user, options = {}) => {
      if (options.action === 'chat.write') {
        return { allow: true, code: 'ok', action: 'chat.write' };
      }
      if (options.action === 'model.use') {
        return {
          allow: false,
          code: 'forbidden',
          reason: 'missing_permission',
          action: 'model.use',
        };
      }
      return { allow: true, code: 'ok', action: options.action };
    });
    mocks.db.first
      .mockResolvedValueOnce({ id: 'c1', user_id: 'u1', model: 'gpt-4', current_message_id: null })
      .mockResolvedValueOnce({ id: 'm-user', role: 'user', content: 'hello' })
      .mockResolvedValueOnce({
        id: 'c1',
        user_id: 'u1',
        model: 'gpt-4',
        current_message_id: 'm-user',
      });
    mocks.db.all.mockImplementation(async (sql) => {
      const query = String(sql || '');
      if (query.includes('FROM group_members')) {
        return [];
      }
      if (query.includes('FROM model_acl_rules')) {
        return [
          {
            id: 'rule-1',
            model_id: 'gpt-4',
            principal_type: 'user',
            principal_id: 'u1',
            effect: 'allow',
            action: 'use',
            created_at: 1,
            updated_at: 1,
          },
        ];
      }
      if (query.includes('FROM connection_acl_rules')) {
        return [
          {
            id: 'conn-rule-1',
            connection_id: 'env-openai-0',
            principal_type: 'user',
            principal_id: 'u1',
            effect: 'allow',
            action: 'use',
            created_at: 1,
            updated_at: 1,
          },
        ];
      }
      if (query.includes('FROM messages') || query.includes('FROM chat_messages')) {
        return [{ role: 'user', content: 'hello' }];
      }
      return [];
    });
    mocks.streamLLM.mockRejectedValueOnce(new Error('llm down'));
    const env = {
      DB: {
        prepare: () => ({
          bind: () => ({
            all: vi.fn().mockResolvedValue({ results: [] }),
          }),
        }),
      },
      ...createProviderTestEnv({
        GEMINI_BASE_URL: '',
        GEMINI_API_KEY: '',
        ANTHROPIC_BASE_URL: '',
        ANTHROPIC_API_KEY: '',
      }),
    };

    const res = await chatRouter({
      req: makeReq('/api/chats/c1/messages', 'POST', { message: 'hello' }),
      env: env,
      ctx: {},
      user: adminUser,
      path: '/api/chats/c1/messages',
    });

    expect(res.status).toBe(403);
    expect(res.headers.get('Content-Type')).toContain('application/json');
    await expect(res.json()).resolves.toMatchObject({ error: 'missing_permission' });
    expect(mocks.streamLLM).not.toHaveBeenCalled();
  });
});
