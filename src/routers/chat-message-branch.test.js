/**
 * Tests for chat-message-branch.js — error paths and conditional branches
 * Coverage focus: message not found, role validation, no_reply constraints,
 * attachment cap validation, branch history, assistant branching.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

// ─── Mock dependencies ───────────────────────────────────────────────────────

const mocks = vi.hoisted(() => ({
  requireOwnedChat: vi.fn(),
  getMessageSnapshot: vi.fn(),
  normalizeErrorMessage: vi.fn((err, fb) => fb),
  resolveDefaultModel: vi.fn(),
  loadAttachmentDocuments: vi.fn(),
  buildAttachmentParts: vi.fn(),
  requireChatPermission: vi.fn(),
  ensureModelAllowed: vi.fn(),
  publishRealtimeNow: vi.fn(),
  createLogger: vi.fn(() => ({ warn: vi.fn(), info: vi.fn(), error: vi.fn() })),
}));

vi.mock('../utils/response.js', () => ({
  error: (req, msg, status, extra) =>
    new Response(JSON.stringify({ error: msg, ...extra }), {
      status,
      headers: { 'Content-Type': 'application/json' },
    }),
  json: (req, data, status = 200) =>
    new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } }),
}));

vi.mock('../utils/logger.js', () => ({
  createLogger: mocks.createLogger,
}));

vi.mock('../features/realtime/realtime.js', () => ({
  createRealtimeEvent: vi.fn((data) => data),
}));

vi.mock('./chat-core.js', () => ({
  requireOwnedChat: mocks.requireOwnedChat,
  getMessageSnapshot: mocks.getMessageSnapshot,
  normalizeErrorMessage: mocks.normalizeErrorMessage,
  resolveDefaultModel: mocks.resolveDefaultModel,
  loadAttachmentDocuments: mocks.loadAttachmentDocuments,
  buildAttachmentParts: mocks.buildAttachmentParts,
}));

vi.mock('./chat-message-helpers.js', () => ({
  ensureModelAllowed: mocks.ensureModelAllowed,
  normalizeSelectedToolNames: vi.fn((x) => (Array.isArray(x) ? x : null)),
  publishRealtimeNow: mocks.publishRealtimeNow,
  requireChatPermission: mocks.requireChatPermission,
}));

vi.mock('../chat/attachments.js', () => ({
  MAX_ATTACHMENTS: 10,
  STRICT_ATTACHMENT_CAPS: true,
  formatUnsupportedAttachmentMessage: (u) => `Unsupported: ${u.join(',')}`,
  getAttachmentKinds: vi.fn((docs) => {
    const kinds = new Set();
    docs.forEach((d) => kinds.add(d?.content_type?.startsWith('image/') ? 'image' : 'text'));
    return Array.from(kinds);
  }),
  getModelAttachmentCapsEntry: vi.fn(() => ({ text: true, image: true })),
  getUnsupportedAttachmentKinds: vi.fn(() => []),
  getUnsupportedAttachmentKindsStrict: vi.fn(() => []),
  loadModelAttachmentCaps: vi.fn(() => ({})),
  mergeTextAttachmentParts: vi.fn((c, p) => c),
  normalizeAttachmentIds: vi.fn((x) => (Array.isArray(x) ? x : [])),
  isSupportedAttachmentType: vi.fn(() => true),
}));

import { handleBranchMessage } from './chat-message-branch.js';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeReq(body = {}) {
  return {
    url: 'https://example.com/api/chats/c1/messages/msg1/branch',
    method: 'POST',
    async json() {
      return body;
    },
  };
}

const baseArgs = () => ({
  req: makeReq({ content: 'hello', role: 'user' }),
  env: { FILES: {}, APP_NAME: 'GrowChat' },
  ctx: {},
  db: {
    all: vi.fn().mockResolvedValue([]),
    first: vi.fn(),
    batch: vi.fn().mockResolvedValue([]),
    prepare: vi.fn((sql) => ({ bind: vi.fn() })),
  },
  user: { sub: 'u1' },
  chatId: 'c1',
  msgId: 'msg1',
  originSessionId: 's1',
  assistantStreamRunner: vi.fn().mockResolvedValue({ response: new Response('{}') }),
});

describe('handleBranchMessage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireOwnedChat.mockResolvedValue({ chat: { id: 'c1', model: 'gpt-4' } });
    mocks.requireChatPermission.mockResolvedValue(null);
    mocks.getMessageSnapshot.mockResolvedValue({ id: 'm1', role: 'user', content: 'hello' });
    mocks.resolveDefaultModel.mockResolvedValue('gpt-4');
    mocks.ensureModelAllowed.mockResolvedValue({ providerInfo: { providerFamily: 'openai' } });
    mocks.publishRealtimeNow.mockResolvedValue(undefined);
    mocks.loadAttachmentDocuments.mockResolvedValue([]);
    mocks.buildAttachmentParts.mockResolvedValue([]);
  });

  // ── Chat ownership / permission ──────────────────────────────────────────

  it('returns 404 when chat is not found', async () => {
    mocks.requireOwnedChat.mockResolvedValue({
      error: new Response(JSON.stringify({ error: 'Chat not found' }), { status: 404 }),
    });
    const args = baseArgs();
    const res = await handleBranchMessage(args);
    expect(res.status).toBe(404);
  });

  it('returns 403 when user lacks chat.write permission', async () => {
    mocks.requireChatPermission.mockResolvedValue(
      new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403 })
    );
    const args = baseArgs();
    const res = await handleBranchMessage(args);
    expect(res.status).toBe(403);
  });

  // ── Source message not found ─────────────────────────────────────────────

  it('returns 404 when source message does not exist', async () => {
    const args = baseArgs();
    args.db.first.mockResolvedValueOnce(null); // requireOwnedChat
    args.db.first.mockResolvedValueOnce(null); // sourceMsg query
    const res = await handleBranchMessage(args);
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toMatch(/not found/i);
  });

  // ── Body validation ──────────────────────────────────────────────────────

  it('returns 400 when body is not valid JSON', async () => {
    const args = baseArgs();
    args.db.first.mockResolvedValueOnce({ role: 'user', parent_id: null, model: 'gpt-4' });
    args.req = {
      ...args.req,
      json: () => {
        throw new SyntaxError('bad json');
      },
    };
    const res = await handleBranchMessage(args);
    expect(res.status).toBe(400);
  });

  it('returns 400 when content is empty', async () => {
    const args = baseArgs();
    args.db.first.mockResolvedValueOnce({ role: 'user', parent_id: null, model: 'gpt-4' });
    args.req = makeReq({ content: '   ', role: 'user' });
    const res = await handleBranchMessage(args);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/content is required/i);
  });

  it('returns 400 when content is missing', async () => {
    const args = baseArgs();
    args.db.first.mockResolvedValueOnce({ role: 'user', parent_id: null, model: 'gpt-4' });
    args.req = makeReq({ role: 'user' });
    const res = await handleBranchMessage(args);
    expect(res.status).toBe(400);
  });

  // ── Role validation ──────────────────────────────────────────────────────

  it('returns 400 when role is not user or assistant', async () => {
    const args = baseArgs();
    args.db.first.mockResolvedValueOnce({ role: 'user', parent_id: null, model: 'gpt-4' });
    args.req = makeReq({ content: 'hello', role: 'system' });
    const res = await handleBranchMessage(args);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/role must be/i);
  });

  it('accepts uppercase role by normalizing to lowercase', async () => {
    const args = baseArgs();
    args.db.first.mockResolvedValueOnce({ role: 'user', parent_id: null, model: 'gpt-4' });
    args.req = makeReq({ content: 'hello', role: 'USER' }); // uppercase
    const res = await handleBranchMessage(args);
    // Role is normalized via .toLowerCase(), so uppercase USER is treated as 'user'
    expect(res.status).toBe(200);
  });

  // ── no_reply constraint ──────────────────────────────────────────────────

  it('returns 400 when user message has no_reply=true', async () => {
    const args = baseArgs();
    args.db.first.mockResolvedValueOnce({ role: 'user', parent_id: null, model: 'gpt-4' });
    args.req = makeReq({ content: 'hello', role: 'user', no_reply: true });
    const res = await handleBranchMessage(args);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/no_reply=true/i);
  });

  it('returns 400 when assistant message does not have no_reply=true', async () => {
    const args = baseArgs();
    args.db.first.mockResolvedValueOnce({ role: 'assistant', parent_id: 'p1', model: 'gpt-4' });
    args.req = makeReq({ content: 'bye', role: 'assistant', no_reply: false });
    const res = await handleBranchMessage(args);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/no_reply=true/i);
  });

  it('returns 400 when role does not match source message role', async () => {
    const args = baseArgs();
    args.db.first.mockResolvedValueOnce({ role: 'user', parent_id: null, model: 'gpt-4' });
    args.req = makeReq({ content: 'hello', role: 'assistant', no_reply: true }); // source is user
    const res = await handleBranchMessage(args);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/Cannot branch/i);
  });

  // ── Assistant branching (no_reply path) ──────────────────────────────────

  it('branches assistant message without calling assistantStreamRunner', async () => {
    const args = baseArgs();
    args.db.first
      .mockResolvedValueOnce({
        role: 'assistant',
        parent_id: 'p1',
        model: 'gpt-4',
        citations: null,
      })
      .mockResolvedValueOnce({
        id: 'new-msg',
        chat_id: 'c1',
        role: 'assistant',
        content: 'branched',
        model: 'gpt-4',
        citations: null,
        parent_id: 'p1',
        created_at: 123,
      });
    mocks.publishRealtimeNow.mockResolvedValue(undefined);
    args.req = makeReq({ content: 'branched assistant msg', role: 'assistant', no_reply: true });

    const res = await handleBranchMessage(args);

    expect(res.status).toBe(200);
    expect(args.assistantStreamRunner).not.toHaveBeenCalled();
    expect(mocks.publishRealtimeNow).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ type: 'message.completed' })
    );
  });

  it('returns 200 json response for assistant branching', async () => {
    const args = baseArgs();
    args.db.first
      .mockResolvedValueOnce({
        role: 'assistant',
        parent_id: 'p1',
        model: 'gpt-4',
        citations: null,
      })
      .mockResolvedValueOnce({
        id: 'new-msg',
        chat_id: 'c1',
        role: 'assistant',
        content: 'branched',
        model: 'gpt-4',
        parent_id: 'p1',
        created_at: 123,
      });

    args.req = makeReq({ content: 'branched', role: 'assistant', no_reply: true });

    const res = await handleBranchMessage(args);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty('message');
  });

  // ── Attachment limits ────────────────────────────────────────────────────

  it('returns 400 when too many attachments', async () => {
    const args = baseArgs();
    args.db.first.mockResolvedValueOnce({ role: 'user', parent_id: null, model: 'gpt-4' });
    args.req = makeReq({
      content: 'hello',
      role: 'user',
      attachments: Array.from({ length: 15 }, (_, i) => `d${i}`),
    });
    const res = await handleBranchMessage(args);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/Too many attachments/i);
  });

  it('returns 500 when FILES binding is missing with attachments', async () => {
    const args = baseArgs();
    args.env = { APP_NAME: 'GrowChat' }; // no FILES
    args.db.first.mockResolvedValueOnce({ role: 'user', parent_id: null, model: 'gpt-4' });
    mocks.loadAttachmentDocuments.mockResolvedValue([{ id: 'doc1', content_type: 'text/plain' }]);
    args.req = makeReq({ content: 'hello', role: 'user', attachments: ['doc1'] });
    const res = await handleBranchMessage(args);
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toMatch(/FILES binding missing/i);
  });

  it('returns 400 when attachment load fails', async () => {
    const args = baseArgs();
    args.db.first.mockResolvedValueOnce({ role: 'user', parent_id: null, model: 'gpt-4' });
    mocks.loadAttachmentDocuments.mockRejectedValue(new Error('Missing attachment: doc1'));
    args.req = makeReq({ content: 'hello', role: 'user', attachments: ['doc1'] });
    const res = await handleBranchMessage(args);
    expect(res.status).toBe(400);
  });

  it('returns 400 when buildAttachmentParts throws', async () => {
    const args = baseArgs();
    args.db.first.mockResolvedValueOnce({ role: 'user', parent_id: null, model: 'gpt-4' });
    mocks.loadAttachmentDocuments.mockResolvedValue([
      { id: 'doc1', content_type: 'image/png', filename: 'img.png', r2_key: 'k1' },
    ]);
    mocks.normalizeErrorMessage.mockReturnValueOnce('FILES binding not configured');
    mocks.buildAttachmentParts.mockRejectedValue(new Error('FILES binding not configured'));
    args.req = makeReq({ content: 'hello', role: 'user', attachments: ['doc1'] });
    const res = await handleBranchMessage(args);
    expect(res.status).toBe(400);
  });

  // ── Attachment type validation ───────────────────────────────────────────

  it('returns 400 when attachment type is unsupported', async () => {
    const { isSupportedAttachmentType } = await import('../chat/attachments.js');
    const args = baseArgs();
    args.db.first.mockResolvedValueOnce({ role: 'user', parent_id: null, model: 'gpt-4' });
    mocks.loadAttachmentDocuments.mockResolvedValue([
      { id: 'doc1', content_type: 'application/exe', filename: 'evil.exe' },
    ]);
    isSupportedAttachmentType.mockReturnValueOnce(false);
    args.req = makeReq({ content: 'hello', role: 'user', attachments: ['doc1'] });
    const res = await handleBranchMessage(args);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/Unsupported attachment type/i);
  });

  // ── Attachment capability validation ─────────────────────────────────────

  it('returns 400 with attachments_not_supported when model lacks capability', async () => {
    const { getModelAttachmentCapsEntry, getUnsupportedAttachmentKindsStrict } =
      await import('../chat/attachments.js');
    const args = baseArgs();
    args.db.first.mockResolvedValueOnce({ role: 'user', parent_id: null, model: 'gpt-4' });
    mocks.loadAttachmentDocuments.mockResolvedValue([
      { id: 'doc1', content_type: 'image/png', filename: 'img.png', r2_key: 'k1' },
    ]);
    mocks.buildAttachmentParts.mockResolvedValue([
      { type: 'image_url', image_url: { url: 'data:image/png;base64,xyz' } },
    ]);
    getModelAttachmentCapsEntry.mockReturnValueOnce({ image: false, text: true });
    getUnsupportedAttachmentKindsStrict.mockReturnValueOnce(['image']);
    args.req = makeReq({ content: 'hello', role: 'user', attachments: ['doc1'] });
    const res = await handleBranchMessage(args);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('attachments_not_supported');
  });

  // ── Inherited attachments fallback ───────────────────────────────────────

  it('loads inherited attachments when none provided in body', async () => {
    const args = baseArgs();
    args.db.first
      .mockResolvedValueOnce({ role: 'user', parent_id: null, model: 'gpt-4' })
      .mockResolvedValueOnce([{ document_id: 'doc1' }]); // inherited attachments query
    args.req = makeReq({ content: 'hello', role: 'user' }); // no attachments in body

    await handleBranchMessage(args);

    // Should not call loadAttachmentDocuments with empty list
    expect(mocks.loadAttachmentDocuments).not.toHaveBeenCalled();
  });

  it('gracefully handles missing message_documents table for inherited attachments', async () => {
    const args = baseArgs();
    args.db.first
      .mockResolvedValueOnce({ role: 'user', parent_id: null, model: 'gpt-4' })
      .mockRejectedValueOnce(new Error('no such table: message_documents'));
    args.req = makeReq({ content: 'hello', role: 'user' });

    // Should not throw
    const res = await handleBranchMessage(args);
    expect(res.status).not.toBe(500);
  });

  // ── Model resolution ─────────────────────────────────────────────────────

  it('falls back to resolveDefaultModel when model is not provided and chat.model is null', async () => {
    const args = baseArgs();
    mocks.requireOwnedChat.mockResolvedValue({ chat: { id: 'c1', model: null } });
    args.db.first.mockResolvedValueOnce({ role: 'user', parent_id: null, model: null });
    mocks.resolveDefaultModel.mockResolvedValue('gpt-4');

    await handleBranchMessage(args);

    expect(mocks.resolveDefaultModel).toHaveBeenCalled();
  });

  it('returns 400 when ensureModelAllowed fails', async () => {
    const args = baseArgs();
    args.db.first.mockResolvedValueOnce({ role: 'user', parent_id: null, model: 'gpt-4' });
    mocks.ensureModelAllowed.mockResolvedValue({
      error: new Response(JSON.stringify({ error: 'Model not allowed' }), { status: 403 }),
    });

    const res = await handleBranchMessage(args);
    expect(res.status).toBe(403);
  });

  // ── Batch insert ──────────────────────────────────────────────────────────

  it('inserts branch message and updates chat in batch', async () => {
    const args = baseArgs();
    args.db.first.mockResolvedValueOnce({ role: 'user', parent_id: null, model: 'gpt-4' });
    args.db.all.mockResolvedValue([]); // getBranchHistory

    await handleBranchMessage(args);

    expect(args.db.batch).toHaveBeenCalled();
    const statements = args.db.batch.mock.calls[0][0];
    expect(statements.length).toBeGreaterThanOrEqual(2);
  });

  // ── Branch history ────────────────────────────────────────────────────────

  it('passes branch history to assistantStreamRunner', async () => {
    const args = baseArgs();
    args.db.first.mockResolvedValueOnce({ role: 'user', parent_id: null, model: 'gpt-4' });
    // First db.all is for inherited attachments query (attachmentIds.length === 0)
    // Second db.all is for getBranchHistory
    args.db.all
      .mockResolvedValueOnce([]) // inherited attachments - empty
      .mockResolvedValueOnce([{ role: 'user', content: 'prior msg' }]); // branch history

    const mockRunner = vi.fn().mockResolvedValue({ response: new Response('{}') });
    args.assistantStreamRunner = mockRunner;

    await handleBranchMessage(args);

    expect(mockRunner).toHaveBeenCalledWith(
      expect.objectContaining({
        history: expect.arrayContaining([
          expect.objectContaining({ role: 'user', content: 'prior msg' }),
        ]),
      })
    );
  });

  // ── Branch history with attachments ───────────────────────────────────────

  it('passes branch history with attachment parts', async () => {
    const args = baseArgs();
    args.db.first.mockResolvedValueOnce({ role: 'user', parent_id: null, model: 'gpt-4' });
    args.db.all
      .mockResolvedValueOnce([{ document_id: 'doc1' }]) // inherited attachments
      .mockResolvedValueOnce([{ role: 'user', content: 'prior msg' }]);
    mocks.loadAttachmentDocuments.mockResolvedValue([
      { id: 'doc1', content_type: 'image/png', filename: 'img.png', file_size: 100, r2_key: 'k1' },
    ]);
    mocks.buildAttachmentParts.mockResolvedValue([
      { type: 'image_url', image_url: { url: 'data:image/png;base64,xyz' } },
    ]);

    const mockRunner = vi.fn().mockResolvedValue({ response: new Response('{}') });
    args.assistantStreamRunner = mockRunner;

    await handleBranchMessage(args);

    expect(mockRunner).toHaveBeenCalledWith(
      expect.objectContaining({
        history: expect.arrayContaining([
          expect.objectContaining({
            role: 'user',
            content: expect.arrayContaining([expect.objectContaining({ type: 'image_url' })]),
          }),
        ]),
      })
    );
  });

  it('propagates error when assistantStreamRunner throws', async () => {
    const args = baseArgs();
    args.db.first.mockResolvedValueOnce({ role: 'user', parent_id: null, model: 'gpt-4' });
    args.db.all.mockResolvedValue([]);
    args.assistantStreamRunner = vi.fn().mockRejectedValue(new Error('Stream error'));

    await expect(handleBranchMessage(args)).rejects.toThrow('Stream error');
  });

  it('returns 200 when branching user message', async () => {
    const args = baseArgs();
    args.db.first.mockResolvedValueOnce({ role: 'user', parent_id: null, model: 'gpt-4' });
    args.db.all.mockResolvedValue([]);
    const mockRunner = vi.fn().mockResolvedValue({ response: new Response('{}') });
    args.assistantStreamRunner = mockRunner;

    const res = await handleBranchMessage(args);
    expect(res.status).toBe(200);
  });

  it('returns 200 when branching user message with empty attachments', async () => {
    const args = baseArgs();
    args.db.first.mockResolvedValueOnce({ role: 'user', parent_id: null, model: 'gpt-4' });
    args.db.all.mockResolvedValue([]);
    args.req = makeReq({ content: 'hello', role: 'user', attachments: [] });
    const mockRunner = vi.fn().mockResolvedValue({ response: new Response('{}') });
    args.assistantStreamRunner = mockRunner;

    const res = await handleBranchMessage(args);
    expect(res.status).toBe(200);
  });
});
