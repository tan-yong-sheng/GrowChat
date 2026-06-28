import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  requireOwnedChat: vi.fn(),
  getMessageSnapshot: vi.fn(),
  requireChatPermission: vi.fn(),
  ensureModelAllowed: vi.fn(),
  normalizeSelectedToolNames: vi.fn(),
  publishRealtimeNow: vi.fn(),
  resolveDefaultModel: vi.fn(),
  loadAttachmentDocuments: vi.fn(),
  buildAttachmentParts: vi.fn(),
  normalizeAttachmentIds: vi.fn(),
  isSupportedAttachmentType: vi.fn(),
  loadModelAttachmentCaps: vi.fn(),
  getModelAttachmentCapsEntry: vi.fn(),
  getAttachmentKinds: vi.fn(),
  getUnsupportedAttachmentKinds: vi.fn(),
  getUnsupportedAttachmentKindsStrict: vi.fn(),
  formatUnsupportedAttachmentMessage: vi.fn(),
  mergeTextAttachmentParts: vi.fn(),
  checkRateLimit: vi.fn(),
  buildMetadataSystemPrompt: vi.fn(),
  MAX_ATTACHMENTS: 5,
  STRICT_ATTACHMENT_CAPS: false,
}));

vi.mock('./chat-core.js', () => ({
  requireOwnedChat: (...args) => mocks.requireOwnedChat(...args),
  getMessageSnapshot: (...args) => mocks.getMessageSnapshot(...args),
  resolveDefaultModel: (...args) => mocks.resolveDefaultModel(...args),
  loadAttachmentDocuments: (...args) => mocks.loadAttachmentDocuments(...args),
  buildAttachmentParts: (...args) => mocks.buildAttachmentParts(...args),
  normalizeErrorMessage: vi.fn((err) => err?.message || String(err)),
}));

vi.mock('./chat-message-helpers.js', () => ({
  ensureModelAllowed: (...args) => mocks.ensureModelAllowed(...args),
  normalizeSelectedToolNames: (...args) => mocks.normalizeSelectedToolNames(...args),
  publishRealtimeNow: (...args) => mocks.publishRealtimeNow(...args),
  requireChatPermission: (...args) => mocks.requireChatPermission(...args),
}));

vi.mock('../chat/attachments.js', () => ({
  MAX_ATTACHMENTS: mocks.MAX_ATTACHMENTS,
  STRICT_ATTACHMENT_CAPS: mocks.STRICT_ATTACHMENT_CAPS,
  normalizeAttachmentIds: (...args) => mocks.normalizeAttachmentIds(...args),
  isSupportedAttachmentType: (...args) => mocks.isSupportedAttachmentType(...args),
  loadModelAttachmentCaps: (...args) => mocks.loadModelAttachmentCaps(...args),
  getModelAttachmentCapsEntry: (...args) => mocks.getModelAttachmentCapsEntry(...args),
  getAttachmentKinds: (...args) => mocks.getAttachmentKinds(...args),
  getUnsupportedAttachmentKinds: (...args) => mocks.getUnsupportedAttachmentKinds(...args),
  getUnsupportedAttachmentKindsStrict: (...args) =>
    mocks.getUnsupportedAttachmentKindsStrict(...args),
  formatUnsupportedAttachmentMessage: (...args) =>
    mocks.formatUnsupportedAttachmentMessage(...args),
  mergeTextAttachmentParts: (...args) => mocks.mergeTextAttachmentParts(...args),
}));

vi.mock('../services/rate-limit.js', () => ({
  RATE_LIMITS: { chatSend: { maxRequests: 20, windowSeconds: 60 } },
  checkRateLimit: (...args) => mocks.checkRateLimit(...args),
}));

vi.mock('../llm/system-prompt.js', () => ({
  buildMetadataSystemPrompt: (...args) => mocks.buildMetadataSystemPrompt(...args),
}));

vi.mock('../features/realtime/realtime.js', () => ({
  createRealtimeEvent: vi.fn((e) => e),
}));

vi.mock('../utils/response.js', () => ({
  error: (req, message, status = 500, details) => {
    const body = { error: message };
    if (details !== undefined) body.details = details;
    return new Response(JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json' },
    });
  },
  json: (req, data, status = 200) =>
    new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } }),
}));

import { handleSendMessage } from './chat-message-send.js';

function makeReq(path, method, body) {
  const init = { method, headers: {} };
  if (body !== undefined) {
    init.body = typeof body === 'string' ? body : JSON.stringify(body);
    init.headers['Content-Type'] = 'application/json';
  }
  return new Request(`https://example.com${path}`, init);
}

describe('handleSendMessage', () => {
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
    mocks.requireOwnedChat.mockResolvedValue({
      chat: { id: 'c1', user_id: 'u1', model: 'gpt-4o', current_message_id: null },
    });
    mocks.requireChatPermission.mockResolvedValue(null);
    mocks.checkRateLimit.mockResolvedValue({ allowed: true });
    mocks.resolveDefaultModel.mockResolvedValue('gpt-4o');
    mocks.ensureModelAllowed.mockResolvedValue({
      providerInfo: { providerFamily: 'openai', connection: { source: 'config' } },
    });
    mocks.normalizeSelectedToolNames.mockReturnValue(null);
    mocks.publishRealtimeNow.mockResolvedValue(true);
    mocks.getMessageSnapshot.mockResolvedValue({ id: 'msg-1', model: 'gpt-4o' });
    mocks.normalizeAttachmentIds.mockImplementation((ids) => ids);
    mocks.buildMetadataSystemPrompt.mockReturnValue('System prompt');
    mocks.MAX_ATTACHMENTS = 5;
    mocks.STRICT_ATTACHMENT_CAPS = false;
  });

  it('rejects when chat permission denied', async () => {
    mocks.requireChatPermission.mockResolvedValue(
      new Response(JSON.stringify({ error: 'no' }), { status: 403 })
    );
    const res = await handleSendMessage({
      req: makeReq('/api/chats/c1/messages', 'POST', { message: 'hello' }),
      env,
      ctx,
      db,
      user,
      chatId: 'c1',
      originSessionId,
      assistantStreamRunner: vi.fn(),
    });
    expect(res.status).toBe(403);
  });

  it('rejects rate limited requests', async () => {
    mocks.checkRateLimit.mockResolvedValue({ allowed: false, resetAt: Date.now() + 60000 });
    const res = await handleSendMessage({
      req: makeReq('/api/chats/c1/messages', 'POST', { message: 'hello' }),
      env,
      ctx,
      db,
      user,
      chatId: 'c1',
      originSessionId,
      assistantStreamRunner: vi.fn(),
    });
    expect(res.status).toBe(429);
  });

  it('requires message content', async () => {
    const res = await handleSendMessage({
      req: makeReq('/api/chats/c1/messages', 'POST', { message: '' }),
      env,
      ctx,
      db,
      user,
      chatId: 'c1',
      originSessionId,
      assistantStreamRunner: vi.fn(),
    });
    expect(res.status).toBe(400);
  });

  it('rejects too many attachments', async () => {
    mocks.normalizeAttachmentIds.mockReturnValue([1, 2, 3, 4, 5, 6]);
    const res = await handleSendMessage({
      req: makeReq('/api/chats/c1/messages', 'POST', {
        message: 'hello',
        attachments: [1, 2, 3, 4, 5, 6],
      }),
      env,
      ctx,
      db,
      user,
      chatId: 'c1',
      originSessionId,
      assistantStreamRunner: vi.fn(),
    });
    expect(res.status).toBe(400);
  });

  it('rejects model not allowed', async () => {
    mocks.ensureModelAllowed.mockResolvedValue({
      error: new Response(JSON.stringify({ error: 'Model not allowed' }), { status: 403 }),
    });
    const res = await handleSendMessage({
      req: makeReq('/api/chats/c1/messages', 'POST', { message: 'hello' }),
      env,
      ctx,
      db,
      user,
      chatId: 'c1',
      originSessionId,
      assistantStreamRunner: vi.fn(),
    });
    expect(res.status).toBe(403);
  });

  it('sends message successfully', async () => {
    db.all.mockResolvedValue([{ role: 'user', content: 'hello' }]);
    db.batch.mockResolvedValue(undefined);
    const streamRunner = vi.fn().mockResolvedValue({ response: new Response('streaming') });
    const res = await handleSendMessage({
      req: makeReq('/api/chats/c1/messages', 'POST', { message: 'hello' }),
      env,
      ctx,
      db,
      user,
      chatId: 'c1',
      originSessionId,
      assistantStreamRunner: streamRunner,
    });
    expect(res.status).toBe(200);
    expect(db.batch).toHaveBeenCalledOnce();
    const statements = db.batch.mock.calls[0][0];
    expect(statements).toHaveLength(2);
    expect(statements[0].sql).toContain('INSERT INTO messages');
    expect(statements[1].sql).toContain('UPDATE chats SET current_message_id');
    expect(streamRunner).toHaveBeenCalledOnce();
    const runnerArgs = streamRunner.mock.calls[0][0];
    expect(runnerArgs.model).toBe('gpt-4o');
    expect(runnerArgs.chatId).toBe('c1');
    expect(runnerArgs.history).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ role: 'system' }),
        expect.objectContaining({ role: 'user', content: 'hello' }),
      ])
    );
  });

  it('rejects invalid JSON body', async () => {
    const res = await handleSendMessage({
      req: new Request('https://example.com/api/chats/c1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: 'not-json',
      }),
      env,
      ctx,
      db,
      user,
      chatId: 'c1',
      originSessionId,
      assistantStreamRunner: vi.fn(),
    });
    expect(res.status).toBe(400);
  });
});
