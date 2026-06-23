import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  ensureModelAllowed,
  normalizeSelectedToolNames,
  publishRealtimeNow,
  requireChatPermission,
} from './chat-message-helpers.js';

// ─── Mocks ────────────────────────────────────────────────────────────────────
// All mocked functions are declared once via vi.hoisted so vi.mock() exports
// the SAME function instances that tests interact with via the mocks object.

const mocks = vi.hoisted(() => ({
  authorize: vi.fn(),
  loadModelAclRules: vi.fn(),
  buildModelAclIndex: vi.fn(),
  evaluateModelAclAccess: vi.fn(),
  createRealtimeBus: vi.fn(),
  resolveProviderForModel: vi.fn(),
}));

vi.mock('../services/realtime-bus.js', () => ({
  createRealtimeBus: mocks.createRealtimeBus,
}));

vi.mock('./chat-core.js', () => ({
  resolveProviderForModel: mocks.resolveProviderForModel,
}));

vi.mock('../utils/authorize.js', () => ({
  authorize: mocks.authorize,
}));

vi.mock('../utils/model-acl.js', () => ({
  buildModelAclIndex: mocks.buildModelAclIndex,
  evaluateModelAclAccess: mocks.evaluateModelAclAccess,
  loadModelAclRules: mocks.loadModelAclRules,
}));

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeReq(url = 'http://localhost/chat') {
  return new Request(url, { method: 'POST' });
}

function makeUser(overrides = {}) {
  return { sub: 'user-1', email: 'admin@localhost', primary_role: 'admin', ...overrides };
}

function makeDb(rows = []) {
  return { all: vi.fn().mockResolvedValue(rows) };
}

// ─── normalizeSelectedToolNames ──────────────────────────────────────────────

describe('normalizeSelectedToolNames', () => {
  it('returns null for non-array input', () => {
    expect(normalizeSelectedToolNames(null)).toBeNull();
    expect(normalizeSelectedToolNames(undefined)).toBeNull();
    expect(normalizeSelectedToolNames('string')).toBeNull();
    expect(normalizeSelectedToolNames(42)).toBeNull();
    expect(normalizeSelectedToolNames({})).toBeNull();
  });

  it('returns empty array for empty array', () => {
    expect(normalizeSelectedToolNames([])).toEqual([]);
  });

  it('returns deduplicated tool names in order', () => {
    expect(normalizeSelectedToolNames(['tool1', 'tool2', 'tool1', 'tool3', 'tool2'])).toEqual([
      'tool1',
      'tool2',
      'tool3',
    ]);
  });

  it('trims whitespace from tool names', () => {
    expect(normalizeSelectedToolNames(['  tool1  ', 'tool2', ' tool3'])).toEqual([
      'tool1',
      'tool2',
      'tool3',
    ]);
  });

  it('filters out empty/whitespace-only values', () => {
    expect(normalizeSelectedToolNames(['tool1', '', '  ', 'tool2'])).toEqual(['tool1', 'tool2']);
  });

  it('filters out null and undefined values', () => {
    expect(normalizeSelectedToolNames(['tool1', null, undefined, 'tool2'])).toEqual([
      'tool1',
      'tool2',
    ]);
  });

  it('converts non-string values to string', () => {
    expect(normalizeSelectedToolNames(['tool1', 123, 'tool2'])).toEqual(['tool1', '123', 'tool2']);
  });

  it('handles mixed valid/invalid values', () => {
    expect(
      normalizeSelectedToolNames(['', '  ', null, 'web_search', 42, undefined, 'calculator', '   '])
    ).toEqual(['web_search', '42', 'calculator']);
  });

  it('handles single valid tool', () => {
    expect(normalizeSelectedToolNames(['only_tool'])).toEqual(['only_tool']);
  });
});

// ─── publishRealtimeNow ───────────────────────────────────────────────────────

describe('publishRealtimeNow', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.createRealtimeBus.mockReturnValue({ publish: vi.fn().mockResolvedValue(true) });
  });

  it('returns true on successful publish', async () => {
    const result = await publishRealtimeNow({}, { type: 'message.created' });
    expect(result).toBe(true);
  });

  it('returns false when publish throws', async () => {
    mocks.createRealtimeBus.mockReturnValue({
      publish: vi.fn().mockRejectedValue(new Error('Bus error')),
    });
    const result = await publishRealtimeNow({}, { type: 'message.created' });
    expect(result).toBe(false);
  });

  it('returns false when bus creation throws', async () => {
    mocks.createRealtimeBus.mockImplementation(() => {
      throw new Error('Bus creation failed');
    });
    const result = await publishRealtimeNow({}, { type: 'message.created' });
    expect(result).toBe(false);
  });
});

// ─── requireChatPermission ────────────────────────────────────────────────────

describe('requireChatPermission', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.authorize.mockReturnValue({ allow: true });
  });

  it('returns null when authorized', async () => {
    const req = makeReq();
    const result = await requireChatPermission(req, {}, makeUser(), 'chat.read', 'chat-1');
    expect(result).toBeNull();
    expect(mocks.authorize).toHaveBeenCalledWith({}, makeUser(), {
      action: 'chat.read',
      resource: 'chat',
      resourceId: 'chat-1',
    });
  });

  it('returns 403 Response when not authorized', async () => {
    mocks.authorize.mockReturnValue({ allow: false, reason: 'Not your chat' });
    const req = makeReq();
    const result = await requireChatPermission(req, {}, makeUser(), 'chat.read', 'chat-1');
    expect(result).not.toBeNull();
    expect(result.status).toBe(403);
    const body = await result.json();
    expect(body.error).toContain('Not your chat');
  });

  it('returns 500 Response on server_error code', async () => {
    mocks.authorize.mockReturnValue({
      allow: false,
      reason: 'Internal error',
      code: 'server_error',
    });
    const req = makeReq();
    const result = await requireChatPermission(req, {}, makeUser(), 'chat.read', 'chat-1');
    expect(result.status).toBe(500);
  });

  it('returns 403 when reason is missing', async () => {
    mocks.authorize.mockReturnValue({ allow: false });
    const req = makeReq();
    const result = await requireChatPermission(req, {}, makeUser(), 'chat.read', 'chat-1');
    expect(result.status).toBe(403);
  });
});

// ─── ensureModelAllowed ───────────────────────────────────────────────────────

describe('ensureModelAllowed', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.authorize.mockReturnValue({ allow: true });
    mocks.loadModelAclRules.mockResolvedValue([]);
    mocks.buildModelAclIndex.mockReturnValue(new Map());
    mocks.evaluateModelAclAccess.mockReturnValue({ allowed: true });
    // resolveProviderForModel returns { providerFamily, connection } on success
    mocks.resolveProviderForModel.mockResolvedValue({
      providerFamily: 'openai',
      connection: { source: 'admin' },
    });
  });

  it('returns 403 when model.use is denied', async () => {
    mocks.authorize.mockReturnValue({
      allow: false,
      reason: 'Model not allowed',
      code: 'forbidden',
    });
    const req = makeReq();
    const result = await ensureModelAllowed(req, {}, makeDb(), makeUser(), 'gpt-4o');
    expect(result.error).not.toBeNull();
    expect(result.error.status).toBe(403);
  });

  it('returns 500 when authorize returns server_error code', async () => {
    mocks.authorize.mockReturnValue({
      allow: false,
      reason: 'Internal error',
      code: 'server_error',
    });
    const req = makeReq();
    const result = await ensureModelAllowed(req, {}, makeDb(), makeUser(), 'gpt-4o');
    expect(result.error.status).toBe(500);
  });

  it('returns 400 when resolveProviderForModel returns error', async () => {
    mocks.resolveProviderForModel.mockResolvedValue({ error: 'Unknown model' });
    const req = makeReq();
    const result = await ensureModelAllowed(req, {}, makeDb(), makeUser(), 'unknown-model');
    expect(result.error).not.toBeNull();
    expect(result.error.status).toBe(400);
    const body = await result.error.json();
    expect(body.error).toContain('Unknown model');
  });

  it('returns 403 when ACL denies access', async () => {
    mocks.evaluateModelAclAccess.mockReturnValue({ allowed: false });
    const req = makeReq();
    const result = await ensureModelAllowed(req, {}, makeDb(), makeUser(), 'gpt-4o');
    expect(result.error.status).toBe(403);
  });

  it('returns providerInfo and access on success', async () => {
    const req = makeReq();
    const db = makeDb();
    mocks.resolveProviderForModel.mockResolvedValue({
      providerFamily: 'openai',
      connection: { source: 'admin' },
    });
    mocks.evaluateModelAclAccess.mockReturnValue({ allowed: true });
    const result = await ensureModelAllowed(req, {}, db, makeUser(), 'gpt-4o');
    expect(result.providerInfo).toEqual({
      providerFamily: 'openai',
      connection: { source: 'admin' },
    });
    expect(result.access).toEqual({ allowed: true });
  });

  it('loads user groups and passes to ACL check', async () => {
    const req = makeReq();
    const db = makeDb([{ group_id: 'group-1' }, { group_id: 'group-2' }]);
    await ensureModelAllowed(req, {}, db, makeUser(), 'gpt-4o');
    expect(db.all).toHaveBeenCalledWith('SELECT group_id FROM group_members WHERE user_id = ?', [
      'user-1',
    ]);
  });

  it('skips group lookup when user.sub is null', async () => {
    const req = makeReq();
    const db = makeDb();
    const result = await ensureModelAllowed(req, {}, db, makeUser({ sub: null }), 'gpt-4o');
    expect(db.all).not.toHaveBeenCalled();
    expect(result.providerInfo).toBeDefined();
  });

  it('passes connection_source from providerInfo to ACL evaluator', async () => {
    const req = makeReq();
    const db = makeDb();
    mocks.resolveProviderForModel.mockResolvedValue({
      providerFamily: 'google',
      connection: { source: 'user' },
    });
    await ensureModelAllowed(req, {}, db, makeUser(), 'gpt-4o');
    expect(mocks.evaluateModelAclAccess).toHaveBeenCalledWith(
      { connection_source: 'user' },
      expect.objectContaining({ userGroupIds: expect.any(Set) })
    );
  });
});
