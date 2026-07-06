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
  buildUserMessageContent: (content, attachmentParts) => ({
    role: 'user',
    content: attachmentParts.length
      ? [{ type: 'text', text: content }, ...attachmentParts]
      : content,
  }),
  ensureModelAllowed: (...args) => mocks.ensureModelAllowed(...args),
  normalizeSelectedToolNames: (...args) => mocks.normalizeSelectedToolNames(...args),
  publishRealtimeNow: (...args) => mocks.publishRealtimeNow(...args),
  requireChatPermission: (...args) => mocks.requireChatPermission(...args),
  resolveChatModel: (...args) => mocks.ensureModelAllowed(...args),
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

vi.mock('../features/realtime/realtime.js', () => ({
  createRealtimeEvent: vi.fn((e) => e),
}));

import { handleBranchMessage } from './chat-message-branch.js';

function makeReq(path, method, body) {
  const init = { method, headers: {} };
  if (body !== undefined) {
    init.body = typeof body === 'string' ? body : JSON.stringify(body);
    init.headers['Content-Type'] = 'application/json';
  }
  return new Request(`https://example.com${path}`, init);
}

describe('handleBranchMessage', () => {
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
    mocks.resolveDefaultModel.mockResolvedValue('gpt-4o');
    mocks.ensureModelAllowed.mockResolvedValue({
      providerInfo: { providerFamily: 'openai', connection: { source: 'config' } },
    });
    mocks.normalizeSelectedToolNames.mockReturnValue(null);
    mocks.publishRealtimeNow.mockResolvedValue(true);
    mocks.getMessageSnapshot.mockResolvedValue({ id: 'new-msg', model: 'gpt-4o' });
    mocks.normalizeAttachmentIds.mockImplementation((ids) => ids);
    mocks.MAX_ATTACHMENTS = 5;
    mocks.STRICT_ATTACHMENT_CAPS = false;
  });

  it('returns 404 for missing source message', async () => {
    db.first.mockResolvedValue(null);
    const res = await handleBranchMessage({
      req: makeReq('/api/chats/c1/messages/m1/branch', 'POST', { content: 'branch' }),
      env,
      ctx,
      db,
      user,
      chatId: 'c1',
      msgId: 'm1',
      originSessionId,
      assistantStreamRunner: vi.fn(),
    });
    expect(res.status).toBe(404);
  });

  it('requires content', async () => {
    db.first.mockResolvedValue({ role: 'user', parent_id: null, model: 'gpt-4o', citations: null });
    const res = await handleBranchMessage({
      req: makeReq('/api/chats/c1/messages/m1/branch', 'POST', { content: '' }),
      env,
      ctx,
      db,
      user,
      chatId: 'c1',
      msgId: 'm1',
      originSessionId,
      assistantStreamRunner: vi.fn(),
    });
    expect(res.status).toBe(400);
  });

  it('rejects user branch with no_reply=true', async () => {
    db.first.mockResolvedValue({ role: 'user', parent_id: null, model: 'gpt-4o', citations: null });
    const res = await handleBranchMessage({
      req: makeReq('/api/chats/c1/messages/m1/branch', 'POST', {
        content: 'test',
        role: 'user',
        no_reply: true,
      }),
      env,
      ctx,
      db,
      user,
      chatId: 'c1',
      msgId: 'm1',
      originSessionId,
      assistantStreamRunner: vi.fn(),
    });
    expect(res.status).toBe(400);
  });

  it('requires no_reply=true for assistant branch', async () => {
    db.first.mockResolvedValue({
      role: 'assistant',
      parent_id: null,
      model: 'gpt-4o',
      citations: null,
    });
    const res = await handleBranchMessage({
      req: makeReq('/api/chats/c1/messages/m1/branch', 'POST', {
        content: 'test',
        role: 'assistant',
      }),
      env,
      ctx,
      db,
      user,
      chatId: 'c1',
      msgId: 'm1',
      originSessionId,
      assistantStreamRunner: vi.fn(),
    });
    expect(res.status).toBe(400);
  });

  it('rejects mismatched role', async () => {
    db.first.mockResolvedValue({
      role: 'assistant',
      parent_id: null,
      model: 'gpt-4o',
      citations: null,
    });
    const res = await handleBranchMessage({
      req: makeReq('/api/chats/c1/messages/m1/branch', 'POST', { content: 'test', role: 'user' }),
      env,
      ctx,
      db,
      user,
      chatId: 'c1',
      msgId: 'm1',
      originSessionId,
      assistantStreamRunner: vi.fn(),
    });
    expect(res.status).toBe(400);
  });

  it('creates assistant branch message', async () => {
    db.first.mockResolvedValue({
      role: 'assistant',
      parent_id: null,
      model: 'gpt-4o',
      citations: null,
    });
    db.batch.mockResolvedValue(undefined);
    const assistantStreamRunner = vi.fn();
    const res = await handleBranchMessage({
      req: makeReq('/api/chats/c1/messages/m1/branch', 'POST', {
        content: 'test',
        role: 'assistant',
        no_reply: true,
      }),
      env,
      ctx,
      db,
      user,
      chatId: 'c1',
      msgId: 'm1',
      originSessionId,
      assistantStreamRunner,
    });
    expect(res.status).toBe(200);
    expect(assistantStreamRunner).not.toHaveBeenCalled();
  });

  it('branches user message with stream runner', async () => {
    db.first.mockResolvedValue({ role: 'user', parent_id: null, model: 'gpt-4o', citations: null });
    db.all.mockResolvedValue([]);
    db.batch.mockResolvedValue(undefined);
    const streamRunner = vi.fn().mockResolvedValue({ response: new Response('streaming') });
    const res = await handleBranchMessage({
      req: makeReq('/api/chats/c1/messages/m1/branch', 'POST', { content: 'test' }),
      env,
      ctx,
      db,
      user,
      chatId: 'c1',
      msgId: 'm1',
      originSessionId,
      assistantStreamRunner: streamRunner,
    });
    expect(res.status).toBe(200);
    expect(streamRunner).toHaveBeenCalledOnce();
  });

  it('uses new branch user message as assistant parent_id (regression #160)', async () => {
    const randomUUIDSpy = vi.spyOn(crypto, 'randomUUID').mockReturnValue('new-user-msg-id');
    db.first.mockResolvedValue({
      role: 'user',
      parent_id: 'old-parent-id',
      model: 'gpt-4o',
      citations: null,
    });
    db.all.mockResolvedValue([]);
    db.batch.mockResolvedValue(undefined);
    const streamRunner = vi.fn().mockResolvedValue({ response: new Response('streaming') });
    const res = await handleBranchMessage({
      req: makeReq('/api/chats/c1/messages/m1/branch', 'POST', { content: 'test' }),
      env,
      ctx,
      db,
      user,
      chatId: 'c1',
      msgId: 'm1',
      originSessionId,
      assistantStreamRunner: streamRunner,
    });
    expect(res.status).toBe(200);
    expect(streamRunner).toHaveBeenCalledOnce();
    const runnerCall = streamRunner.mock.calls[0][0];
    expect(runnerCall.userMsgId).toBe('new-user-msg-id');
    expect(runnerCall.parentId).toBe('new-user-msg-id');
    expect(runnerCall.userMsgId).not.toBe('old-parent-id');

    const statements = db.batch.mock.calls[0][0];
    const userInsert = statements.find(
      (s) => s.sql && s.sql.includes('INSERT INTO messages') && s.params[2] === 'user'
    );
    expect(userInsert).toBeDefined();
    expect(userInsert.params[0]).toBe('new-user-msg-id');
    expect(userInsert.params[5]).toBe('old-parent-id');
    randomUUIDSpy.mockRestore();
  });
});
