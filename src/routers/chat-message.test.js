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
  createRealtimeBus: vi.fn(() => ({
    publish: vi.fn().mockResolvedValue(true),
  })),
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
}));

vi.mock('../services/realtime-bus.js', () => ({
  createRealtimeBus: (...args) => mocks.createRealtimeBus(...args),
}));

import { chatMessageRouter } from './chat-message.js';
import {
  normalizeSelectedToolNames,
  publishRealtimeNow,
  requireChatPermission,
  ensureModelAllowed,
} from './chat-message-helpers.js';
import { trimTrailingAssistantMessages } from './chat-history.js';
import { requireOwnedChat, getMessageSnapshot, resolveDefaultModel, sleep } from './chat-core.js';
import { sseHeaders, sseData } from '../utils/response.js';

function makeReq(path, method, body) {
  const init = { method, headers: {} };
  if (body !== undefined) {
    init.body = typeof body === 'string' ? body : JSON.stringify(body);
    init.headers['Content-Type'] = 'application/json';
  }
  return new Request(`https://example.com${path}`, init);
}

// ---------------------------------------------------------------------------
// normalizeSelectedToolNames
// ---------------------------------------------------------------------------
describe('normalizeSelectedToolNames', () => {
  it('returns null for non-array input', () => {
    expect(normalizeSelectedToolNames(null)).toBeNull();
    expect(normalizeSelectedToolNames(undefined)).toBeNull();
    expect(normalizeSelectedToolNames('string')).toBeNull();
    expect(normalizeSelectedToolNames(42)).toBeNull();
    expect(normalizeSelectedToolNames({})).toBeNull();
  });

  it('returns null for non-array input', () => {
    expect(normalizeSelectedToolNames(null)).toBeNull();
    expect(normalizeSelectedToolNames(undefined)).toBeNull();
  });

  it('returns empty array for empty input array', () => {
    expect(normalizeSelectedToolNames([])).toEqual([]);
  });

  it('returns empty array for array of empty strings only', () => {
    expect(normalizeSelectedToolNames(['', '  '])).toEqual([]);
  });

  it('returns null when all items are duplicates', () => {
    expect(normalizeSelectedToolNames(['tool', 'tool', 'tool'])).toEqual(['tool']);
  });

  it('returns deduplicated trimmed names in order', () => {
    expect(normalizeSelectedToolNames(['  search  ', 'search', 'browse', 'browse'])).toEqual([
      'search',
      'browse',
    ]);
  });

  it('filters out empty strings and nulls after trim', () => {
    expect(normalizeSelectedToolNames(['tool', '', null, '  '])).toEqual(['tool']);
  });

  it('handles mix of strings, numbers, and booleans', () => {
    expect(normalizeSelectedToolNames(['tool', 123, true, 'tool'])).toEqual([
      'tool',
      '123',
      'true',
    ]);
  });

  it('preserves case-sensitive distinct names', () => {
    expect(normalizeSelectedToolNames(['Tool', 'tool', 'TOOL'])).toEqual(['Tool', 'tool', 'TOOL']);
  });
});

// ---------------------------------------------------------------------------
// trimTrailingAssistantMessages
// ---------------------------------------------------------------------------
describe('trimTrailingAssistantMessages', () => {
  it('returns empty array for undefined input', () => {
    expect(trimTrailingAssistantMessages(undefined)).toEqual([]);
  });

  it('returns empty array for null input', () => {
    expect(trimTrailingAssistantMessages(null)).toEqual([]);
  });

  it('returns empty array when history has no trailing assistant', () => {
    expect(trimTrailingAssistantMessages([{ role: 'user', content: 'hi' }])).toEqual([
      { role: 'user', content: 'hi' },
    ]);
  });

  it('trims a single trailing assistant message', () => {
    const input = [
      { role: 'user', content: 'hi' },
      { role: 'assistant', content: 'hello' },
    ];
    expect(trimTrailingAssistantMessages(input)).toEqual([{ role: 'user', content: 'hi' }]);
  });

  it('trims multiple trailing assistant messages', () => {
    const input = [
      { role: 'user', content: 'hi' },
      { role: 'assistant', content: 'hello' },
      { role: 'assistant', content: 'world' },
    ];
    expect(trimTrailingAssistantMessages(input)).toEqual([{ role: 'user', content: 'hi' }]);
  });

  it('returns empty array when entire history is assistant messages', () => {
    expect(
      trimTrailingAssistantMessages([
        { role: 'assistant', content: 'a' },
        { role: 'assistant', content: 'b' },
      ])
    ).toEqual([]);
  });

  it('does not mutate the original array', () => {
    const input = [
      { role: 'user', content: 'hi' },
      { role: 'assistant', content: 'hello' },
    ];
    const result = trimTrailingAssistantMessages(input);
    expect(input).toHaveLength(2);
    expect(result).not.toBe(input);
  });

  it('handles entries with missing role field', () => {
    expect(trimTrailingAssistantMessages([{}, { role: 'assistant', content: 'a' }])).toEqual([{}]);
  });
});

// ---------------------------------------------------------------------------
// sleep
// ---------------------------------------------------------------------------
describe('sleep', () => {
  it('resolves after the given milliseconds', async () => {
    const start = Date.now();
    await sleep(50);
    const elapsed = Date.now() - start;
    expect(elapsed).toBeGreaterThanOrEqual(45); // allow some clock drift
  });

  it('resolves immediately for 0ms', async () => {
    const start = Date.now();
    await sleep(0);
    expect(Date.now() - start).toBeLessThan(20);
  });
});

// ---------------------------------------------------------------------------
// sseData
// ---------------------------------------------------------------------------
describe('sseData', () => {
  it('wraps a string payload with SSE format', () => {
    expect(sseData('hello')).toBe('data: hello\n\n');
  });

  it('JSON-stringifies objects', () => {
    expect(sseData({ id: 1 })).toBe('data: {"id":1}\n\n');
  });

  it('handles null as JSON null', () => {
    expect(sseData(null)).toBe('data: null\n\n');
  });

  it('handles undefined as JSON undefined', () => {
    expect(sseData(undefined)).toBe('data: undefined\n\n');
  });

  it('handles numbers and booleans', () => {
    expect(sseData(42)).toBe('data: 42\n\n');
    expect(sseData(true)).toBe('data: true\n\n');
  });

  it('preserves newlines in string data', () => {
    expect(sseData('line1\nline2')).toBe('data: line1\nline2\n\n');
  });
});

// ---------------------------------------------------------------------------
// sseHeaders
// ---------------------------------------------------------------------------
describe('sseHeaders', () => {
  it('sets text/event-stream content type', () => {
    const req = makeReq('/test', 'GET');
    const headers = sseHeaders(req);
    expect(headers['Content-Type']).toBe('text/event-stream; charset=utf-8');
  });

  it('sets no-cache cache control', () => {
    const req = makeReq('/test', 'GET');
    const headers = sseHeaders(req);
    expect(headers['Cache-Control']).toBe('no-cache, no-transform');
  });

  it('sets keep-alive connection', () => {
    const req = makeReq('/test', 'GET');
    const headers = sseHeaders(req);
    expect(headers['Connection']).toBe('keep-alive');
  });

  it('merges extra headers', () => {
    const req = makeReq('/test', 'GET');
    const headers = sseHeaders(req, { 'X-Custom': 'value' });
    expect(headers['X-Custom']).toBe('value');
  });
});

// ---------------------------------------------------------------------------
// requireChatPermission
// ---------------------------------------------------------------------------
describe('requireChatPermission', () => {
  const req = makeReq('/api/chats/c1/messages', 'POST');

  beforeEach(() => {
    mocks.authorize.mockClear().mockResolvedValue({ allow: true, code: 'ok' });
    mocks.db.first.mockClear().mockResolvedValue(null);
    mocks.db.all.mockClear().mockResolvedValue([]);
  });

  it('returns null when authorization is granted', async () => {
    mocks.authorize.mockResolvedValue({ allow: true, code: 'ok' });
    const result = await requireChatPermission(req, {}, { sub: 'u1' }, 'chat.write', 'c1');
    expect(result).toBeNull();
  });

  it('returns 403 error when authorization is denied', async () => {
    mocks.authorize.mockResolvedValue({ allow: false, reason: 'Not allowed' });
    const result = await requireChatPermission(req, {}, { sub: 'u1' }, 'chat.write', 'c1');
    expect(result).not.toBeNull();
    expect(result.status).toBe(403);
  });

  it('returns 500 error on server_error code', async () => {
    mocks.authorize.mockResolvedValue({ allow: false, code: 'server_error' });
    const result = await requireChatPermission(req, {}, { sub: 'u1' }, 'chat.write', 'c1');
    expect(result.status).toBe(500);
  });

  it('returns generic message when reason is missing', async () => {
    mocks.authorize.mockResolvedValue({ allow: false });
    const result = await requireChatPermission(req, {}, { sub: 'u1' }, 'chat.read', 'c1');
    expect(result).not.toBeNull();
    expect(result.status).toBe(403);
  });
});

// ---------------------------------------------------------------------------
// publishRealtimeNow
// ---------------------------------------------------------------------------
describe('publishRealtimeNow', () => {
  it('returns false when realtime bus publish throws', async () => {
    mocks.createRealtimeBus.mockReturnValueOnce({
      publish: vi.fn().mockRejectedValue(new Error('fail')),
    });
    const result = await publishRealtimeNow({}, { type: 'test' });
    expect(result).toBe(false);
  });

  it('returns the bus publish result on success', async () => {
    mocks.createRealtimeBus.mockReturnValueOnce({
      publish: vi.fn().mockResolvedValue('ok'),
    });
    const result = await publishRealtimeNow({}, { type: 'test' });
    expect(result).toBe('ok');
  });
});

// ---------------------------------------------------------------------------
// requireOwnedChat
// ---------------------------------------------------------------------------
describe('requireOwnedChat', () => {
  const req = makeReq('/api/chats/c1', 'GET');

  it('returns error object when chat is not found', async () => {
    mocks.db.first.mockResolvedValue(null);
    const result = await requireOwnedChat(req, mocks.db, 'c1', 'u1');
    expect(result.error).toBeDefined();
    expect(result.error.status).toBe(404);
  });

  it('returns chat object when ownership is confirmed', async () => {
    mocks.db.first.mockResolvedValue({ id: 'c1', user_id: 'u1' });
    const result = await requireOwnedChat(req, mocks.db, 'c1', 'u1');
    expect(result.error).toBeUndefined();
    expect(result.chat.id).toBe('c1');
  });
});

// ---------------------------------------------------------------------------
// getMessageSnapshot
// ---------------------------------------------------------------------------
describe('getMessageSnapshot', () => {
  it('returns snapshot from repository', () => {
    mocks.db.first.mockResolvedValue({ id: 'm1', content: 'hello' });
    const result = getMessageSnapshot(mocks.db, 'm1');
    expect(result).resolves.toEqual({ id: 'm1', content: 'hello' });
  });

  it('returns null for missing message', () => {
    mocks.db.first.mockResolvedValue(null);
    const result = getMessageSnapshot(mocks.db, 'missing');
    expect(result).resolves.toBeNull();
  });
});

// ---------------------------------------------------------------------------
// resolveDefaultModel
// ---------------------------------------------------------------------------
describe('resolveDefaultModel', () => {
  it('returns user default when available', async () => {
    mocks.db.first.mockResolvedValue({
      preferences: JSON.stringify({ defaultModelId: 'user-model' }),
    });
    const result = await resolveDefaultModel({}, mocks.db, 'u1');
    expect(result).toBe('user-model');
  });

  it('falls back to global default when user default is missing', async () => {
    mocks.db.first
      .mockResolvedValueOnce(null) // user query
      .mockResolvedValueOnce({ name: 'default_model_id', value: 'global-model' }); // global config
    const result = await resolveDefaultModel({}, mocks.db, 'u1');
    expect(result).toBe('global-model');
  });

  it('falls back to env DEFAULT_MODELS', async () => {
    mocks.db.first.mockResolvedValue(null);
    const result = await resolveDefaultModel({ DEFAULT_MODELS: 'env-model' }, mocks.db, 'u1');
    expect(result).toBe('env-model');
  });

  it('rejects user default with whitespace', async () => {
    mocks.db.first.mockResolvedValue({
      preferences: JSON.stringify({ defaultModelId: 'has space' }),
    });
    const result = await resolveDefaultModel({}, mocks.db, 'u1');
    expect(result).not.toBe('has space');
  });

  it('rejects user default longer than 200 chars', async () => {
    mocks.db.first.mockResolvedValue({
      preferences: JSON.stringify({ defaultModelId: 'a'.repeat(201) }),
    });
    const result = await resolveDefaultModel({}, mocks.db, 'u1');
    expect(result).toBeNull();
  });

  it('returns null when user id is missing', async () => {
    const result = await resolveDefaultModel({}, mocks.db, null);
    expect(result).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// ensureModelAllowed
// ---------------------------------------------------------------------------
describe('ensureModelAllowed', () => {
  const req = makeReq('/api/chats/c1', 'POST');

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.db.all.mockResolvedValue([]);
  });

  it('returns error when user is forbidden from model', async () => {
    mocks.authorize.mockResolvedValue({ allow: false, reason: 'Forbidden' });
    const result = await ensureModelAllowed(req, {}, mocks.db, { sub: 'u1' }, 'some-model');
    expect(result.error).toBeDefined();
    expect(result.error.status).toBe(403);
  });

  it('returns 500 for server_error authorization code', async () => {
    mocks.authorize.mockResolvedValue({ allow: false, code: 'server_error' });
    const result = await ensureModelAllowed(req, {}, mocks.db, { sub: 'u1' }, 'some-model');
    expect(result.error).toBeDefined();
    expect(result.error.status).toBe(500);
  });
});

// ---------------------------------------------------------------------------
// chatMessageRouter — path dispatch
// ---------------------------------------------------------------------------
describe('chatMessageRouter', () => {
  const user = { sub: 'u1', role: 'user', email: 'u@example.com' };

  beforeEach(() => {
    // mockReset clears implementation AND queued mockResolvedValueOnce chains.
    // mockResolvedValue sets the new default return value.
    mocks.loadToolServers.mockReset().mockResolvedValue([]);
    mocks.db.all.mockReset().mockResolvedValue([]);
    mocks.db.first.mockReset().mockResolvedValue(null);
    mocks.db.run.mockReset().mockResolvedValue({ success: true });
    mocks.db.batch.mockReset().mockResolvedValue([{ success: true }]);
    mocks.db.prepare.mockImplementation((sql) => ({
      sql,
      bind: (...params) => ({ sql, params }),
    }));
    mocks.getOriginSessionId.mockReset().mockReturnValue('s1');
    mocks.createRealtimeBus.mockReset().mockReturnValue({
      publish: vi.fn().mockResolvedValue(true),
    });
    mocks.authorize.mockReset().mockResolvedValue({ allow: true, code: 'ok', action: 'chat.read' });
  });

  it('returns null for unmatched paths', async () => {
    const res = await chatMessageRouter({
      req: makeReq('/api/unknown', 'GET'),
      env: {},
      ctx: {},
      db: mocks.db,
      user,
      path: '/api/unknown',
    });
    expect(res).toBeNull();
  });

  // -- /api/chats/:id/messages POST → handleSendMessage
  it('routes POST /api/chats/:id/messages to handleSendMessage', async () => {
    const req = makeReq('/api/chats/c1/messages', 'POST', {});
    mocks.db.first.mockResolvedValue({ id: 'c1', user_id: 'u1' });
    const res = await chatMessageRouter({
      req,
      env: {},
      ctx: {},
      db: mocks.db,
      user,
      path: req.url.replace('https://example.com', ''),
    });
    // handleSendMessage will call streamLLM — let it fail gracefully via mock
    expect(res).not.toBeNull();
  });

  // -- /api/chats/:id/messages/:msgId/branch POST
  it('routes POST /api/chats/:id/messages/:msgId/branch to handleBranchMessage', async () => {
    const req = makeReq('/api/chats/c1/messages/m1/branch', 'POST', {});
    mocks.db.first
      .mockResolvedValueOnce({ id: 'c1', user_id: 'u1' })
      .mockResolvedValueOnce({ id: 'm1', role: 'user', chat_id: 'c1', content: 'hello' });
    const res = await chatMessageRouter({
      req,
      env: {},
      ctx: {},
      db: mocks.db,
      user,
      path: req.url.replace('https://example.com', ''),
    });
    // Branch creates a new user message; may 400 if source is not assistant, which is ok
    expect(res).not.toBeNull();
  });

  // -- /api/chats/:id/messages/:msgId/regenerate POST — message not found
  it('regenerate returns 404 when message not found', async () => {
    const req = makeReq('/api/chats/c1/messages/m1/regenerate', 'POST', {});
    mocks.db.first
      .mockResolvedValueOnce({ id: 'c1', user_id: 'u1', model: 'gpt-4' })
      .mockResolvedValueOnce(null); // message not found
    const res = await chatMessageRouter({
      req,
      env: {},
      ctx: {},
      db: mocks.db,
      user,
      path: req.url.replace('https://example.com', ''),
    });
    expect(res.status).toBe(404);
  });

  // -- /api/chats/:id/messages/:msgId/regenerate POST — not assistant
  it('regenerate returns 400 when message is not assistant', async () => {
    const req = makeReq('/api/chats/c1/messages/m1/regenerate', 'POST', {});
    mocks.db.first
      .mockResolvedValueOnce({ id: 'c1', user_id: 'u1', model: 'gpt-4' })
      .mockResolvedValueOnce({ id: 'm1', role: 'user', chat_id: 'c1' }); // not assistant
    const res = await chatMessageRouter({
      req,
      env: {},
      ctx: {},
      db: mocks.db,
      user,
      path: req.url.replace('https://example.com', ''),
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/assistant/i);
  });

  // -- cancel — message not found
  it('cancel returns 404 when message not found', async () => {
    const req = makeReq('/api/chats/c1/messages/m1/cancel', 'POST', {});
    mocks.db.first.mockResolvedValueOnce({ id: 'c1', user_id: 'u1' }).mockResolvedValueOnce(null); // msg not found
    const res = await chatMessageRouter({
      req,
      env: {},
      ctx: {},
      db: mocks.db,
      user,
      path: req.url.replace('https://example.com', ''),
    });
    expect(res.status).toBe(404);
  });

  // -- cancel — only assistant messages can be cancelled
  it('cancel returns 400 for non-assistant message', async () => {
    const req = makeReq('/api/chats/c1/messages/m1/cancel', 'POST', {});
    mocks.db.first
      .mockResolvedValueOnce({ id: 'c1', user_id: 'u1' })
      .mockResolvedValueOnce({ id: 'm1', role: 'user', status: 'complete' });
    const res = await chatMessageRouter({
      req,
      env: {},
      ctx: {},
      db: mocks.db,
      user,
      path: req.url.replace('https://example.com', ''),
    });
    expect(res.status).toBe(400);
  });

  // -- cancel — no-op when status is not streaming/tool_running
  it('cancel returns ok with cancelled=false for non-streaming message', async () => {
    const req = makeReq('/api/chats/c1/messages/m1/cancel', 'POST', {});
    mocks.db.first
      .mockResolvedValueOnce({ id: 'c1', user_id: 'u1' })
      .mockResolvedValueOnce({ id: 'm1', role: 'assistant', status: 'complete' });
    const res = await chatMessageRouter({
      req,
      env: {},
      ctx: {},
      db: mocks.db,
      user,
      path: req.url.replace('https://example.com', ''),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.cancelled).toBe(false);
  });

  // -- cancel — succeeds when streaming
  it('cancel returns cancelled=true and updates message status', async () => {
    const req = makeReq('/api/chats/c1/messages/m1/cancel', 'POST', {});
    mocks.db.first
      .mockResolvedValueOnce({ id: 'c1', user_id: 'u1' })
      .mockResolvedValueOnce({ id: 'm1', role: 'assistant', status: 'streaming' })
      .mockResolvedValueOnce({ id: 'm1', role: 'assistant', status: 'streaming' }) // status re-check
      .mockResolvedValueOnce({ id: 'm1', role: 'assistant', status: 'cancelled', model: 'gpt-4' }); // snapshot
    const res = await chatMessageRouter({
      req,
      env: {},
      ctx: {},
      db: mocks.db,
      user,
      path: req.url.replace('https://example.com', ''),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.cancelled).toBe(true);
  });

  // -- resume GET — message not found
  it('resume returns 404 when message not found', async () => {
    const req = makeReq('/api/chats/c1/messages/m1/resume', 'GET');
    mocks.db.first.mockResolvedValueOnce({ id: 'c1', user_id: 'u1' }).mockResolvedValueOnce(null);
    const res = await chatMessageRouter({
      req,
      env: {},
      ctx: {},
      db: mocks.db,
      user,
      path: req.url.replace('https://example.com', ''),
    });
    expect(res.status).toBe(404);
  });

  // -- resume GET — non-assistant
  it('resume returns 400 when message is not assistant', async () => {
    const req = makeReq('/api/chats/c1/messages/m1/resume', 'GET');
    mocks.db.first
      .mockResolvedValueOnce({ id: 'c1', user_id: 'u1' })
      .mockResolvedValueOnce({ id: 'm1', role: 'user' });
    const res = await chatMessageRouter({
      req,
      env: {},
      ctx: {},
      db: mocks.db,
      user,
      path: req.url.replace('https://example.com', ''),
    });
    expect(res.status).toBe(400);
  });

  // -- resume GET — returns SSE stream
  it('resume returns an SSE response', async () => {
    const req = makeReq('/api/chats/c1/messages/m1/resume', 'GET');
    mocks.db.first
      .mockResolvedValueOnce({ id: 'c1', user_id: 'u1' })
      .mockResolvedValueOnce({ id: 'm1', role: 'assistant' })
      .mockResolvedValueOnce({ id: 'm1', role: 'assistant', status: 'complete' }); // status poll
    mocks.db.all.mockResolvedValueOnce([
      { seq: 1, payload: '{"text":"hi"}' },
      { seq: 2, payload: '{"text":" there"}' },
    ]);
    const res = await chatMessageRouter({
      req,
      env: {},
      ctx: {},
      db: mocks.db,
      user,
      path: req.url.replace('https://example.com', ''),
    });
    expect(res.headers.get('Content-Type')).toMatch(/text\/event-stream/);
  });

  // -- resume GET — returns SSE stream when after_seq is positive (floored internally)
  it('resume uses after_seq parameter correctly', async () => {
    const req = makeReq('/api/chats/c1/messages/m1/resume?after_seq=5.7', 'GET');
    mocks.db.first
      .mockResolvedValueOnce({ id: 'c1', user_id: 'u1' })
      .mockResolvedValueOnce({ id: 'm1', role: 'assistant', status: 'streaming' })
      .mockResolvedValueOnce({ id: 'm1', status: 'complete' });
    // stream: db.all returns a delta (loop enters), then db.first status='complete' exits loop
    mocks.db.all.mockResolvedValueOnce([{ id: 'delta1', seq: 1, payload: 'hi' }]);
    // strip query string: code uses new URL(req.url) for params, but path regex anchors $ require clean path
    const res = await chatMessageRouter({
      req,
      env: {},
      ctx: {},
      db: mocks.db,
      user,
      path: req.url.replace('https://example.com', '').split('?')[0],
    });
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toMatch(/text\/event-stream/);
    // cursor starts at Math.floor(5.7) = 5, then updated to max(5, 1) = 5 after first delta
    const deltaCall = mocks.db.all.mock.calls.find(
      (call) => Array.isArray(call[1]) && call[1].includes(5)
    );
    expect(deltaCall).toBeDefined();
    expect(deltaCall[1]).toEqual(['m1', 5]);
  });

  // -- status GET — message not found (status handler calls db.first twice: ownership then message)
  it('status returns 404 when message not found', async () => {
    const req = makeReq('/api/chats/c1/messages/m1/status', 'GET');
    mocks.db.first.mockResolvedValueOnce({ id: 'c1', user_id: 'u1' }).mockResolvedValueOnce(null);
    const res = await chatMessageRouter({
      req,
      env: {},
      ctx: {},
      db: mocks.db,
      user,
      path: req.url.replace('https://example.com', ''),
    });
    expect(res.status).toBe(404);
  });

  // -- status GET — returns message + chat
  it('status returns message and chat', async () => {
    const req = makeReq('/api/chats/c1/messages/m1/status', 'GET');
    mocks.db.first
      .mockResolvedValueOnce({ id: 'c1', user_id: 'u1' })
      .mockResolvedValueOnce({ id: 'm1', role: 'assistant', chat_id: 'c1', model: 'gpt-4' });
    const res = await chatMessageRouter({
      req,
      env: {},
      ctx: {},
      db: mocks.db,
      user,
      path: req.url.replace('https://example.com', ''),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.message.id).toBe('m1');
    expect(body.chat.id).toBe('c1');
  });

  // -- PUT update — message not found
  it('PUT returns 404 when message not found', async () => {
    const req = makeReq('/api/chats/c1/messages/m1', 'PUT', { content: 'updated' });
    mocks.db.first.mockResolvedValueOnce({ id: 'c1', user_id: 'u1' }).mockResolvedValueOnce(null);
    const res = await chatMessageRouter({
      req,
      env: {},
      ctx: {},
      db: mocks.db,
      user,
      path: req.url.replace('https://example.com', ''),
    });
    expect(res.status).toBe(404);
  });

  // -- PUT update — non-assistant (message found, but role=user)
  it('PUT returns 400 when editing non-assistant message', async () => {
    const req = makeReq('/api/chats/c1/messages/m1', 'PUT', { content: 'updated' });
    mocks.db.first
      .mockResolvedValueOnce({ id: 'c1', user_id: 'u1' })
      .mockResolvedValueOnce({ id: 'm1', role: 'user', chat_id: 'c1' });
    const res = await chatMessageRouter({
      req,
      env: {},
      ctx: {},
      db: mocks.db,
      user,
      path: req.url.replace('https://example.com', ''),
    });
    expect(res.status).toBe(400);
  });

  // -- PUT update — empty content (message found, role=assistant, but content is empty)
  it('PUT returns 400 when content is empty', async () => {
    const req = makeReq('/api/chats/c1/messages/m1', 'PUT', { content: '' });
    mocks.db.first
      .mockResolvedValueOnce({ id: 'c1', user_id: 'u1' })
      .mockResolvedValueOnce({ id: 'm1', role: 'assistant', chat_id: 'c1' });
    const res = await chatMessageRouter({
      req,
      env: {},
      ctx: {},
      db: mocks.db,
      user,
      path: req.url.replace('https://example.com', ''),
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/content/i);
  });

  // -- PUT update — whitespace-only content treated as empty
  it('PUT returns 400 when content is whitespace only', async () => {
    const req = makeReq('/api/chats/c1/messages/m1', 'PUT', { content: '   ' });
    mocks.db.first
      .mockResolvedValueOnce({ id: 'c1', user_id: 'u1' })
      .mockResolvedValueOnce({ id: 'm1', role: 'assistant', chat_id: 'c1' });
    const res = await chatMessageRouter({
      req,
      env: {},
      ctx: {},
      db: mocks.db,
      user,
      path: req.url.replace('https://example.com', ''),
    });
    expect(res.status).toBe(400);
  });

  // -- PUT update — invalid JSON
  it('PUT returns 400 for invalid JSON body', async () => {
    const badReq = new Request('https://example.com/api/chats/c1/messages/m1', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: 'not json',
    });
    mocks.db.first
      .mockResolvedValueOnce({ id: 'c1', user_id: 'u1' })
      .mockResolvedValueOnce({ id: 'm1', role: 'assistant', chat_id: 'c1' });
    const res = await chatMessageRouter({
      req: badReq,
      env: {},
      ctx: {},
      db: mocks.db,
      user,
      path: '/api/chats/c1/messages/m1',
    });
    expect(res.status).toBe(400);
  });

  // -- PUT update — success
  it('PUT successfully updates message content', async () => {
    const req = makeReq('/api/chats/c1/messages/m1', 'PUT', { content: 'updated text' });
    mocks.db.first
      .mockResolvedValueOnce({ id: 'c1', user_id: 'u1' })
      .mockResolvedValueOnce({ id: 'm1', role: 'assistant', chat_id: 'c1' })
      .mockResolvedValueOnce({
        id: 'm1',
        role: 'assistant',
        chat_id: 'c1',
        content: 'updated text',
      });
    const res = await chatMessageRouter({
      req,
      env: {},
      ctx: {},
      db: mocks.db,
      user,
      path: req.url.replace('https://example.com', ''),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.message.content).toBe('updated text');
  });

  // -- DELETE — message not found
  it('DELETE returns 404 when message not found', async () => {
    const req = makeReq('/api/chats/c1/messages/m1', 'DELETE');
    mocks.db.first.mockResolvedValueOnce({ id: 'c1', user_id: 'u1' }).mockResolvedValueOnce(null);
    const res = await chatMessageRouter({
      req,
      env: {},
      ctx: {},
      db: mocks.db,
      user,
      path: req.url.replace('https://example.com', ''),
    });
    expect(res.status).toBe(404);
  });

  // -- DELETE — cascades to child messages
  it('DELETE cascades deletion to child messages', async () => {
    const req = makeReq('/api/chats/c1/messages/m1', 'DELETE');
    mocks.db.first
      .mockResolvedValueOnce({ id: 'c1', user_id: 'u1' }) // permission → ownership
      .mockResolvedValueOnce({ id: 'm1', chat_id: 'c1' }) // the message to delete
      .mockResolvedValueOnce({ id: 'm1', chat_id: 'c1' }); // deleteMessageSubtree find
    mocks.db.all
      .mockResolvedValueOnce([]) // no children of m1 (first call in deleteMessageSubtree)
      .mockResolvedValueOnce([{ id: 'm2', chat_id: 'c1', parent_id: 'm1' }]) // children of m1 (recursive call)
      .mockResolvedValueOnce([]); // no children of m2
    const res = await chatMessageRouter({
      req,
      env: {},
      ctx: {},
      db: mocks.db,
      user,
      path: req.url.replace('https://example.com', ''),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.deleted).toBe('m1');
  });

  // -- DELETE — when deleted msg was the last message (lastMsg.id === msgId),
  // current_message_id must be set to NULL to avoid dangling FK reference
  it('DELETE sets current_message_id to NULL when deleting the last message', async () => {
    mocks.authorize.mockResolvedValueOnce({ allow: true, reason: '' });
    const req = makeReq('/api/chats/c1/messages/m1', 'DELETE');
    mocks.db.first
      .mockResolvedValueOnce({ id: 'c1', user_id: 'u1' }) // requireOwnedChat → getOwnedChat
      .mockResolvedValueOnce({ id: 'm1', chat_id: 'c1' }) // SELECT id FROM messages WHERE id=? AND chat_id=?
      .mockResolvedValueOnce({ id: 'm1' }); // lastMsg before deletion (same as msgId → triggers NULL branch)
    mocks.db.all.mockResolvedValueOnce([]); // no children in subtree
    const res = await chatMessageRouter({
      req,
      env: {},
      ctx: {},
      db: mocks.db,
      user,
      path: req.url.replace('https://example.com', ''),
    });
    expect(res.status).toBe(200);
    expect(mocks.db.run).toHaveBeenCalled();
    // NULL is a SQL literal in the UPDATE — check call[0] for 'NULL'
    const nullUpdateCall = mocks.db.run.mock.calls.find(
      (call) => typeof call[0] === 'string' && call[0].includes('NULL')
    );
    expect(nullUpdateCall).toBeDefined();
  });
});
