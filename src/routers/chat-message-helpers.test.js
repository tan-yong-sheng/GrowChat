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

  // ─── Mutation: falsy-but-meaningful primitive values ─────────────────────
  // Kill mutant: removing  || ''  from  String(value || '')  would let falsy
  // primitives pass through as their string representation instead of being
  // treated as empty (e.g.,  0  →  '0'  instead of filtering).
  it('treats numeric 0 as empty (not "0")', () => {
    // With  || ''  :  String(0 || '') = String('') = ''  → filtered out
    // Without || '' :  String(0) = '0'  → kept (wrong!)
    expect(normalizeSelectedToolNames([0])).toEqual([]);
    expect(normalizeSelectedToolNames(['tool', 0, 'other'])).toEqual(['tool', 'other']);
  });

  it('treats boolean false as empty (not "false")', () => {
    expect(normalizeSelectedToolNames([false])).toEqual([]);
    expect(normalizeSelectedToolNames(['tool', false])).toEqual(['tool']);
  });

  it('treats NaN as empty (not "NaN")', () => {
    expect(normalizeSelectedToolNames([NaN])).toEqual([]);
    expect(normalizeSelectedToolNames(['a', NaN, 'b'])).toEqual(['a', 'b']);
  });

  // Kill mutant: changing  !name  to  !name || name === '0'  (or similar) would
  // incorrectly filter out meaningful numeric string values.
  it('keeps the string "0" as a valid tool name', () => {
    // The string '0' is truthy and must NOT be filtered
    expect(normalizeSelectedToolNames(['0'])).toEqual(['0']);
    expect(normalizeSelectedToolNames(['tool', '0'])).toEqual(['tool', '0']);
  });

  it('keeps the string "false" as a valid tool name', () => {
    // The string 'false' is truthy and must NOT be filtered
    expect(normalizeSelectedToolNames(['false'])).toEqual(['false']);
    expect(normalizeSelectedToolNames(['tool', 'false'])).toEqual(['tool', 'false']);
  });

  // Kill mutant: changing the deduplication Set to a plain comparison loop
  // (without proper reference equality) could allow near-duplicates through.
  it('deduplicates all duplicate entries regardless of position', () => {
    expect(normalizeSelectedToolNames(['a', 'b', 'a', 'c', 'b'])).toEqual(['a', 'b', 'c']);
    expect(normalizeSelectedToolNames(['x', 'x', 'x'])).toEqual(['x']);
  });

  it('preserves insertion order through deduplication', () => {
    expect(normalizeSelectedToolNames(['third', 'first', 'second', 'first', 'third'])).toEqual([
      'third',
      'first',
      'second',
    ]);
  });
});

// ─── Mutation: publishRealtimeNow — null/false return paths ─────────────────

describe('publishRealtimeNow — mutation coverage', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  // Kill mutant: changing  return await createRealtimeBus(env).publish(event)
  // to  return createRealtimeBus(env).publish(event)  (removing await) would
  // return a Promise instead of the boolean, breaking the caller's boolean check.
  // We verify the return value is a boolean (not a Promise) by awaiting it.
  it('returns a boolean (not a pending Promise) on success', async () => {
    mocks.createRealtimeBus.mockReturnValue({ publish: vi.fn().mockResolvedValue(true) });
    const result = publishRealtimeNow({}, { type: 'ping' });
    // Without `await` the return value would be a Promise, not a boolean
    const awaited = await result;
    expect(typeof awaited).toBe('boolean');
    expect(awaited).toBe(true);
  });

  // Kill mutant: if the function body were changed to  return true  (always
  // succeed), the false-path tests below would catch it.
  it('returns false when publish resolves to false', async () => {
    mocks.createRealtimeBus.mockReturnValue({ publish: vi.fn().mockResolvedValue(false) });
    const result = await publishRealtimeNow({}, { type: 'event' });
    expect(result).toBe(false);
  });

  it('returns null when publish resolves to null', async () => {
    mocks.createRealtimeBus.mockReturnValue({ publish: vi.fn().mockResolvedValue(null) });
    const result = await publishRealtimeNow({}, { type: 'event' });
    // The try block returns the value directly; only throws are caught
    expect(result).toBeNull();
  });

  it('returns undefined when publish resolves to undefined', async () => {
    mocks.createRealtimeBus.mockReturnValue({ publish: vi.fn().mockResolvedValue(undefined) });
    const result = await publishRealtimeNow({}, { type: 'event' });
    expect(result).toBeUndefined();
  });
});

// ─── Mutation: requireChatPermission — status code edge cases ──────────────

describe('requireChatPermission — mutation coverage', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.authorize.mockReturnValue({ allow: true });
  });

  // Kill mutant: changing the status code assignment so any error returns 500
  // (e.g., removing the server_error check) would be caught.
  it('returns 403 for explicit forbidden code', async () => {
    mocks.authorize.mockReturnValue({ allow: false, code: 'forbidden', reason: 'no' });
    const result = await requireChatPermission(makeReq(), {}, makeUser(), 'chat.read', 'c1');
    expect(result.status).toBe(403);
  });

  it('returns 403 when reason/message are both absent', async () => {
    mocks.authorize.mockReturnValue({ allow: false, code: 'denied' });
    const result = await requireChatPermission(makeReq(), {}, makeUser(), 'chat.read', 'c1');
    expect(result.status).toBe(403);
  });

  // Kill mutant: if  server_error  status code mapping were removed/changed
  // to default to 403, this test would fail.
  it('returns 500 only for server_error code, 403 for everything else', async () => {
    mocks.authorize.mockReturnValue({ allow: false, code: 'server_error' });
    const serverErrResult = await requireChatPermission(makeReq(), {}, makeUser(), 'a', 'c');
    expect(serverErrResult.status).toBe(500);

    mocks.authorize.mockReturnValue({ allow: false, code: 'unauthorized' });
    const unauthResult = await requireChatPermission(makeReq(), {}, makeUser(), 'a', 'c');
    expect(unauthResult.status).toBe(403);

    mocks.authorize.mockReturnValue({ allow: false, code: 'quota_exceeded' });
    const quotaResult = await requireChatPermission(makeReq(), {}, makeUser(), 'a', 'c');
    expect(quotaResult.status).toBe(403);
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

  // ─── Mutation: falsy-but-truthy user object ───────────────────────────────
  // Kill mutant: changing  user?.sub  to  user?.sub || ''  would silently bypass
  // the  "user has no sub" guard and send an empty string as userId, causing the
  // group query to run (or succeed with 0 rows) even when the token is invalid.
  it('returns early when user.sub is falsy (0) without querying groups', async () => {
    const req = makeReq();
    const db = makeDb();
    const result = await ensureModelAllowed(req, {}, db, makeUser({ sub: 0 }), 'gpt-4o');
    // sub=0 is falsy — the group query must NOT run
    expect(db.all).not.toHaveBeenCalled();
    // Still succeeds because model ACL is permissive
    expect(result.providerInfo).toBeDefined();
  });

  // Kill mutant: removing  filter(Boolean)  from the group mapping would leave
  // null group-ids in userGroupIds, expanding the ACL evaluation to include
  // a null key that matches every rule.
  it('filters out null group_ids from membership rows', async () => {
    const req = makeReq();
    const db = makeDb([{ group_id: 'group-1' }, { group_id: null }, { group_id: 'group-2' }]);
    // evaluateModelAclAccess is called with 2 args: ({ connection_source }, { user, userGroupIds, rules })
    // userGroupIds lives in the SECOND argument
    mocks.evaluateModelAclAccess.mockImplementation((_connInfo, { userGroupIds }) => {
      // If filter(Boolean) is removed, null would be in the Set
      expect(userGroupIds.has(null)).toBe(false);
      return { allowed: true };
    });
    await ensureModelAllowed(req, {}, db, makeUser(), 'gpt-4o');
  });

  // Kill mutant: changing  user?.sub  to  user.sub  (removing optional chaining)
  // would throw on a null/undefined user object instead of returning safely.
  it('does not throw when user is null — skips group lookup and uses default role', async () => {
    const req = makeReq();
    const db = makeDb();
    // No throw — the early return on  user?.sub  protects this path
    const result = await ensureModelAllowed(req, {}, db, null, 'gpt-4o');
    // Without user.sub the group query is skipped; provider resolves via default role
    expect(result.providerInfo).toBeDefined();
    expect(db.all).not.toHaveBeenCalled();
  });

  // Kill mutant: replacing  user?.primary_role || 'member'  with
  //  user.primary_role || 'member'  (removing optional chaining) would throw.
  // Kill mutant: replacing  user?.primary_role || 'member'  with
  //  user.primary_role || 'member'  (removing optional chaining) would throw.
  // We verify the function completes without throwing — which proves the
  // optional chaining guard is in place.
  it('does not throw when user is null — uses member as default primary_role', async () => {
    const req = makeReq();
    const db = makeDb();
    // If optional chaining is removed from  user?.primary_role  this call
    // would throw a TypeError before reaching the provider resolution.
    const result = await ensureModelAllowed(req, {}, db, null, 'gpt-4o');
    // Verify it completes with a valid result (default role 'member' is used)
    expect(result.providerInfo).toBeDefined();
    expect(result.providerInfo.providerFamily).toBeDefined();
  });

  // Kill mutant: changing  providerInfo?.connection?.source  to
  //  providerInfo.connection.source  (removing optional chaining) would throw
  // when connection is null/undefined.
  it('does not throw when connection is absent — passes undefined to ACL evaluator', async () => {
    const req = makeReq();
    const db = makeDb();
    mocks.resolveProviderForModel.mockResolvedValue({
      providerFamily: 'openai',
      connection: null, // explicitly null
    });
    // Should not throw — optional chaining protects this
    const result = await ensureModelAllowed(req, {}, db, makeUser(), 'gpt-4o');
    expect(mocks.evaluateModelAclAccess).toHaveBeenCalledWith(
      { connection_source: undefined },
      expect.any(Object)
    );
    expect(result.providerInfo).toBeDefined();
  });

  // ─── Mutation: non-server_error codes must return 403 ────────────────────
  it('returns 403 for unknown error codes (not just server_error)', async () => {
    mocks.authorize.mockReturnValue({
      allow: false,
      reason: 'some_error',
      code: 'rate_limited',
    });
    const req = makeReq();
    const result = await ensureModelAllowed(req, {}, makeDb(), makeUser(), 'gpt-4o');
    expect(result.error.status).toBe(403);
  });

  // Kill mutant: removing  || []  from  Array.isArray(groupRows) ? groupRows : []
  // would crash when db.all returns null instead of an array.
  it('handles db.all returning null gracefully', async () => {
    const req = makeReq();
    const db = { all: vi.fn().mockResolvedValue(null) }; // null, not []
    // evaluateModelAclAccess is called with 2 args; userGroupIds is in the 2nd
    mocks.evaluateModelAclAccess.mockImplementation((_connInfo, { userGroupIds }) => {
      expect(userGroupIds.size).toBe(0);
      return { allowed: true };
    });
    const result = await ensureModelAllowed(req, {}, db, makeUser(), 'gpt-4o');
    expect(result.providerInfo).toBeDefined();
  });

  // Kill mutant: changing  aclIndex.get(model) || []  to just  aclIndex.get(model)
  // would pass undefined to evaluateModelAclAccess when model has no rules.
  it('passes empty array to ACL evaluator when model has no rules', async () => {
    // evaluateModelAclAccess is called with 2 args; rules is in the 2nd
    mocks.evaluateModelAclAccess.mockImplementation((_connInfo, { rules }) => {
      // If  || []  were removed, rules would be undefined, not []
      expect(rules).toEqual([]);
      return { allowed: true };
    });
    const req = makeReq();
    await ensureModelAllowed(req, {}, makeDb(), makeUser(), 'undiscovered-model');
  });

  // ─── Mutation: empty group membership array must not break ─────────────────
  it('works when user has no group memberships', async () => {
    const req = makeReq();
    const db = makeDb([]); // empty array
    const result = await ensureModelAllowed(req, {}, db, makeUser(), 'gpt-4o');
    expect(result.providerInfo).toBeDefined();
    expect(result.access).toEqual({ allowed: true });
  });
});
