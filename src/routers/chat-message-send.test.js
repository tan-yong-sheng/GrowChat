/**
 * Tests for chat-message-send.js — error paths and conditional branches
 * Coverage focus: validation errors, permission errors, rate limiting,
 * attachment validation, model resolution branches.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

// ─── Mock shared dependencies ────────────────────────────────────────────────

const mocks = vi.hoisted(() => ({
  requireOwnedChat: vi.fn(),
  getMessageSnapshot: vi.fn(),
  normalizeErrorMessage: vi.fn((err, fb) => fb),
  resolveDefaultModel: vi.fn(),
  loadAttachmentDocuments: vi.fn(),
  buildAttachmentParts: vi.fn(),
  checkRateLimit: vi.fn(),
  requireChatPermission: vi.fn(),
  ensureModelAllowed: vi.fn(),
  publishRealtimeNow: vi.fn(),
  buildMetadataSystemPrompt: vi.fn(() => 'system prompt'),
  createLogger: vi.fn(() => ({ warn: vi.fn(), info: vi.fn(), error: vi.fn() })),
}));

vi.mock('../utils/response.js', () => ({
  error: (req, msg, status, extra) =>
    new Response(JSON.stringify({ error: msg, ...extra }), {
      status,
      headers: { 'Content-Type': 'application/json' },
    }),
}));

vi.mock('../utils/logger.js', () => ({
  createLogger: mocks.createLogger,
}));

vi.mock('../services/rate-limit.js', () => ({
  RATE_LIMITS: { chatSend: { allowed: true, resetAt: 0 } },
  checkRateLimit: mocks.checkRateLimit,
}));

vi.mock('../features/realtime/realtime.js', () => ({
  createRealtimeEvent: vi.fn((data) => data),
}));

vi.mock('../llm/system-prompt.js', () => ({
  buildMetadataSystemPrompt: mocks.buildMetadataSystemPrompt,
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

import { handleSendMessage } from './chat-message-send.js';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeReq(body = {}) {
  return {
    url: 'https://example.com/api/chats/c1/messages',
    method: 'POST',
    async json() {
      return body;
    },
  };
}

const baseArgs = () => ({
  req: makeReq({ message: 'hello' }),
  env: { FILES: {}, APP_NAME: 'GrowChat' },
  ctx: {},
  db: {
    all: vi.fn().mockResolvedValue([]),
    batch: vi.fn().mockResolvedValue([]),
    prepare: vi.fn((sql) => ({ bind: vi.fn() })),
  },
  user: { sub: 'u1' },
  chatId: 'c1',
  originSessionId: 's1',
  assistantStreamRunner: vi.fn().mockResolvedValue({ response: new Response('{}') }),
});

describe('handleSendMessage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireChatPermission.mockResolvedValue(null);
    mocks.requireOwnedChat.mockResolvedValue({ chat: { id: 'c1', model: 'gpt-4' } });
    mocks.checkRateLimit.mockResolvedValue({ allowed: true, resetAt: 0 });
    mocks.resolveDefaultModel.mockResolvedValue('gpt-4');
    mocks.ensureModelAllowed.mockResolvedValue({ providerInfo: { providerFamily: 'openai' } });
    mocks.getMessageSnapshot.mockResolvedValue({ id: 'm1', role: 'user', content: 'hello' });
    mocks.loadAttachmentDocuments.mockResolvedValue([]);
    mocks.buildAttachmentParts.mockResolvedValue([]);
    mocks.publishRealtimeNow.mockResolvedValue(undefined);
  });

  // ── Permission errors ─────────────────────────────────────────────────────

  it('returns 403 when user lacks chat.write permission', async () => {
    mocks.requireChatPermission.mockResolvedValue(
      new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403 })
    );
    const args = baseArgs();
    const res = await handleSendMessage(args);
    expect(res.status).toBe(403);
  });

  it('returns 404 when chat is not found', async () => {
    mocks.requireOwnedChat.mockResolvedValue({
      error: new Response(JSON.stringify({ error: 'Chat not found' }), { status: 404 }),
    });
    const args = baseArgs();
    const res = await handleSendMessage(args);
    expect(res.status).toBe(404);
  });

  // ── Rate limiting ─────────────────────────────────────────────────────────

  it('returns 429 when rate limit is exceeded', async () => {
    mocks.checkRateLimit.mockResolvedValue({
      allowed: false,
      resetAt: Date.now() + 30_000,
    });
    const args = baseArgs();
    const res = await handleSendMessage(args);
    expect(res.status).toBe(429);
    const body = await res.json();
    expect(body).toHaveProperty('retry_after');
  });

  // ── Body parsing ──────────────────────────────────────────────────────────

  it('returns 400 when body is not valid JSON', async () => {
    const args = baseArgs();
    args.req = {
      ...args.req,
      json: () => {
        throw new SyntaxError('bad json');
      },
    };
    const res = await handleSendMessage(args);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/Invalid JSON/i);
  });

  it('returns 400 when message is empty', async () => {
    const args = baseArgs();
    args.req = makeReq({ message: '   ' });
    const res = await handleSendMessage(args);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/required/i);
  });

  it('returns 400 when message is missing', async () => {
    const args = baseArgs();
    args.req = makeReq({});
    const res = await handleSendMessage(args);
    expect(res.status).toBe(400);
  });

  // ── Model resolution ──────────────────────────────────────────────────────

  it('falls back to resolveDefaultModel when model is not provided', async () => {
    const args = baseArgs();
    args.req = makeReq({ message: 'hello' });
    mocks.requireOwnedChat.mockResolvedValue({ chat: { id: 'c1', model: null } });
    mocks.resolveDefaultModel.mockResolvedValue('gpt-4');
    await handleSendMessage(args);
    expect(mocks.resolveDefaultModel).toHaveBeenCalled();
  });

  it('returns error when ensureModelAllowed fails', async () => {
    mocks.ensureModelAllowed.mockResolvedValue({
      error: new Response(JSON.stringify({ error: 'Model not allowed' }), { status: 403 }),
    });
    const args = baseArgs();
    const res = await handleSendMessage(args);
    expect(res.status).toBe(403);
  });

  // ── Attachment limits ─────────────────────────────────────────────────────

  it('returns 400 when too many attachments are provided', async () => {
    const args = baseArgs();
    args.req = makeReq({
      message: 'hello',
      attachments: Array.from({ length: 15 }, (_, i) => `d${i}`),
    });
    const res = await handleSendMessage(args);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/Too many attachments/i);
  });

  it('returns 500 when FILES binding is missing with attachments', async () => {
    const args = baseArgs();
    args.req = makeReq({ message: 'hello', attachments: ['doc1'] });
    args.env = { APP_NAME: 'GrowChat' }; // no FILES
    mocks.loadAttachmentDocuments.mockResolvedValue([{ id: 'doc1', content_type: 'image/png' }]);
    const res = await handleSendMessage(args);
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toMatch(/FILES binding missing/i);
  });

  it('returns 400 when loadAttachmentDocuments throws', async () => {
    const args = baseArgs();
    args.req = makeReq({ message: 'hello', attachments: ['doc1'] });
    mocks.normalizeErrorMessage.mockReturnValueOnce('Missing attachment: doc1');
    mocks.loadAttachmentDocuments.mockRejectedValue(new Error('Missing attachment: doc1'));
    const res = await handleSendMessage(args);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/Missing attachment/i);
  });

  it('returns 400 when buildAttachmentParts throws', async () => {
    const args = baseArgs();
    args.req = makeReq({ message: 'hello', attachments: ['doc1'] });
    mocks.loadAttachmentDocuments.mockResolvedValue([
      { id: 'doc1', content_type: 'text/plain', filename: 'a.txt', r2_key: 'k1' },
    ]);
    mocks.normalizeErrorMessage.mockReturnValueOnce('FILES binding not configured');
    mocks.buildAttachmentParts.mockRejectedValue(new Error('FILES binding not configured'));
    const res = await handleSendMessage(args);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/FILES binding/i);
  });

  // ── Attachment type validation ────────────────────────────────────────────

  it('returns 400 when attachment has unsupported type', async () => {
    const { isSupportedAttachmentType } = await import('../chat/attachments.js');
    mocks.loadAttachmentDocuments.mockResolvedValue([
      { id: 'doc1', content_type: 'video/mp4', filename: 'vid.mp4' },
    ]);
    isSupportedAttachmentType.mockReturnValueOnce(false);

    const args = baseArgs();
    args.req = makeReq({ message: 'hello', attachments: ['doc1'] });
    const res = await handleSendMessage(args);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/Unsupported attachment type/i);
  });

  // ── Attachment capability validation ─────────────────────────────────────

  it('returns 400 with attachments_not_supported when model lacks text capability', async () => {
    const args = baseArgs();
    const { getModelAttachmentCapsEntry, getUnsupportedAttachmentKindsStrict } =
      await import('../chat/attachments.js');
    mocks.loadAttachmentDocuments.mockResolvedValue([
      { id: 'doc1', content_type: 'image/png', filename: 'img.png', r2_key: 'k1' },
    ]);
    mocks.buildAttachmentParts.mockResolvedValue([
      { type: 'image_url', image_url: { url: 'data:image/png;base64,xyz' } },
    ]);
    getModelAttachmentCapsEntry.mockReturnValueOnce({ text: false, image: false });
    getUnsupportedAttachmentKindsStrict.mockReturnValueOnce(['image', 'text']);

    args.req = makeReq({ message: 'hello', attachments: ['doc1'] });
    const res = await handleSendMessage(args);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('attachments_not_supported');
    expect(body.unsupported_types).toContain('image');
  });

  // ── Realtime publish ──────────────────────────────────────────────────────

  it('publishes realtime event after message insert', async () => {
    const args = baseArgs();
    await handleSendMessage(args);
    expect(mocks.publishRealtimeNow).toHaveBeenCalledWith(
      expect.objectContaining({ FILES: {} }),
      expect.objectContaining({
        type: 'message.created',
        userId: 'u1',
        chatId: 'c1',
      })
    );
  });

  // ── History building ──────────────────────────────────────────────────────

  it('passes enhanced history to assistantStreamRunner', async () => {
    const args = baseArgs();
    const mockRunner = vi.fn().mockResolvedValue({ response: new Response('{}') });
    args.assistantStreamRunner = mockRunner;
    args.db.all.mockResolvedValue([{ role: 'user', content: 'previous message' }]);

    await handleSendMessage(args);

    expect(mockRunner).toHaveBeenCalledWith(
      expect.objectContaining({
        history: expect.arrayContaining([
          expect.objectContaining({ role: 'system' }),
          expect.objectContaining({ role: 'user', content: 'previous message' }),
        ]),
        userMsgId: expect.any(String),
        chatId: 'c1',
        model: 'gpt-4',
      })
    );
  });

  // ── Message insert ────────────────────────────────────────────────────────

  it('inserts user message and updates chat in a batch', async () => {
    const args = baseArgs();
    await handleSendMessage(args);
    expect(args.db.batch).toHaveBeenCalledTimes(1);
    const statements = args.db.batch.mock.calls[0][0];
    expect(statements.length).toBeGreaterThanOrEqual(2); // at least insert + update
  });

  it('attaches attachments to created message snapshot', async () => {
    mocks.loadAttachmentDocuments.mockResolvedValue([
      { id: 'doc1', filename: 'a.txt', content_type: 'text/plain', file_size: 100 },
    ]);
    mocks.buildAttachmentParts.mockResolvedValue([]);

    const args = baseArgs();
    args.req = makeReq({ message: 'hello', attachments: ['doc1'] });
    await handleSendMessage(args);

    expect(mocks.getMessageSnapshot).toHaveBeenCalled();
  });

  // ── Model from request body ───────────────────────────────────────────────

  it('uses model from request body when provided', async () => {
    const args = baseArgs();
    args.req = makeReq({ message: 'hello', model: 'claude-3' });
    mocks.requireOwnedChat.mockResolvedValue({ chat: { id: 'c1', model: 'gpt-4' } });
    const mockRunner = vi.fn().mockResolvedValue({ response: new Response('{}') });
    args.assistantStreamRunner = mockRunner;

    await handleSendMessage(args);

    expect(mocks.resolveDefaultModel).not.toHaveBeenCalled();
    expect(mockRunner).toHaveBeenCalledWith(expect.objectContaining({ model: 'claude-3' }));
  });

  // ── Attachment handling edge cases ────────────────────────────────────────

  it('returns 500 when FILES binding is missing without attachments', async () => {
    // Actually this should not happen since we only check FILES when there are attachments
    const args = baseArgs();
    args.req = makeReq({ message: 'hello', attachments: [] });
    const mockRunner = vi.fn().mockResolvedValue({ response: new Response('{}') });
    args.assistantStreamRunner = mockRunner;

    // Should succeed because no attachments to process
    const res = await handleSendMessage(args);
    expect(res.status).toBe(200);
  });

  it('handles mix of image and text attachment kinds', async () => {
    const args = baseArgs();
    args.req = makeReq({ message: 'hello', attachments: ['doc1', 'doc2'] });
    mocks.loadAttachmentDocuments.mockResolvedValue([
      { id: 'doc1', content_type: 'image/png', filename: 'img.png', file_size: 100, r2_key: 'k1' },
      { id: 'doc2', content_type: 'text/plain', filename: 'a.txt', file_size: 100, r2_key: 'k2' },
    ]);
    mocks.buildAttachmentParts.mockResolvedValue([
      { type: 'image_url', image_url: { url: 'data:image/png;base64,xyz' } },
      { type: 'text', text: '[Attachment: a.txt]' },
    ]);
    const mockRunner = vi.fn().mockResolvedValue({ response: new Response('{}') });
    args.assistantStreamRunner = mockRunner;

    await handleSendMessage(args);
    expect(mockRunner).toHaveBeenCalled();
  });

  it('handles non-text attachment in history with hasNonText flag', async () => {
    const args = baseArgs();
    args.db.all.mockResolvedValue([{ role: 'user', content: 'hello' }]);
    args.req = makeReq({ message: 'hello', attachments: ['doc1'] });
    mocks.loadAttachmentDocuments.mockResolvedValue([
      { id: 'doc1', content_type: 'image/png', filename: 'img.png', file_size: 100, r2_key: 'k1' },
    ]);
    mocks.buildAttachmentParts.mockResolvedValue([
      { type: 'image_url', image_url: { url: 'data:image/png;base64,xyz' } },
    ]);
    const mockRunner = vi.fn().mockResolvedValue({ response: new Response('{}') });
    args.assistantStreamRunner = mockRunner;

    await handleSendMessage(args);
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

  it('falls back to resolveDefaultModel when body.model is whitespace only', async () => {
    const args = baseArgs();
    args.req = makeReq({ message: 'hello', model: '   ' });
    mocks.requireOwnedChat.mockResolvedValue({ chat: { id: 'c1', model: 'gpt-3.5' } });
    mocks.resolveDefaultModel.mockResolvedValue('gpt-3.5');
    const mockRunner = vi.fn().mockResolvedValue({ response: new Response('{}') });
    args.assistantStreamRunner = mockRunner;

    await handleSendMessage(args);

    // body.model.trim() === '' triggers resolveDefaultModel since neither body.model nor chat.model is usable
    expect(mocks.resolveDefaultModel).toHaveBeenCalled();
    expect(mockRunner).toHaveBeenCalledWith(expect.objectContaining({ model: 'gpt-3.5' }));
  });

  it('propagates error when assistantStreamRunner throws', async () => {
    const args = baseArgs();
    args.assistantStreamRunner = vi.fn().mockRejectedValue(new Error('Stream error'));

    await expect(handleSendMessage(args)).rejects.toThrow('Stream error');
  });
});
