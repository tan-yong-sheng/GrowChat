/**
 * Tests for src/routers/auth-register.js — the first-admin bootstrap claim
 * race and its interaction with rate limiting / body validation.
 *
 * Original ordering claimed the bootstrap sentinel BEFORE rate limit + body
 * validation, so a throttled or malformed first request could consume the
 * sentinel and then fail with 429/400 without ever creating an admin. The
 * fix moves the claim AFTER validation and rolls it back if user creation
 * throws.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  db: {
    first: vi.fn(),
    run: vi.fn(),
    batch: vi.fn().mockResolvedValue([]),
  },
  hashPassword: vi.fn(),
  createRefreshToken: vi.fn(),
  signJWT: vi.fn(),
  loadPrimaryRole: vi.fn(),
  checkRateLimit: vi.fn(),
  getConfigBool: vi.fn(),
  getConfigValue: vi.fn(),
  setConfigValue: vi.fn(),
  ensureUserRoleBinding: vi.fn(),
  createAccessToken: vi.fn(),
  usersCount: 0,
  claimChanges: 1, // simulate first claim winning
}));

vi.mock('../db.js', () => ({
  createDB: () => mocks.db,
}));

vi.mock('../shared/auth.js', () => ({
  hashPassword: (...args) => mocks.hashPassword(...args),
}));

vi.mock('../shared/session.js', () => ({
  createRefreshToken: (...args) => mocks.createRefreshToken(...args),
}));

vi.mock('../utils/app-config.js', () => ({
  getConfigBool: (...args) => mocks.getConfigBool(...args),
  getConfigValue: (...args) => mocks.getConfigValue(...args),
  setConfigValue: (...args) => mocks.setConfigValue(...args),
}));

vi.mock('../services/rate-limit.js', () => ({
  RATE_LIMITS: { authRegister: { limit: 5, windowMs: 60_000 } },
  checkRateLimit: (...args) => mocks.checkRateLimit(...args),
  resolveRateLimitSubject: () => 'test-subject',
}));

vi.mock('../repositories/user-repository.js', () => ({
  createUserRepository: () => ({
    count: () => Promise.resolve(mocks.usersCount),
    findByEmail: () => Promise.resolve(null),
    create: async (userData) => {
      if (mocks.userCreateShouldThrow) {
        throw new Error('simulated user.create failure');
      }
      return { id: userData.id, ...userData };
    },
  }),
}));

vi.mock('../utils/user-role.js', () => ({
  normalizePublicRole: (r) => r || 'member',
  loadPrimaryRole: (...args) => mocks.loadPrimaryRole(...args),
}));

vi.mock('../bootstrap/router-registry.js', () => ({
  resolveSharedFns: () => ({
    ensureUserRoleBinding: (...args) => mocks.ensureUserRoleBinding(...args),
    createAccessToken: (...args) => mocks.createAccessToken(...args),
  }),
}));

import { handleRegister } from './auth-register.js';

const VALID_JWT_SECRET = 'test-jwt-secret-not-real-0123456789abcdef0123456789abcdef';

function makeReq(body) {
  return new Request('https://example.com/api/auth/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

const VALID_BODY = {
  email: 'admin@example.com',
  name: 'Admin',
  password: 'supersecret123',
};

beforeEach(() => {
  mocks.db.first.mockReset();
  mocks.db.run.mockReset();
  mocks.hashPassword.mockReset().mockResolvedValue('hash');
  mocks.createRefreshToken.mockReset().mockResolvedValue({ token: 'rt', expiresAt: 0 });
  mocks.createAccessToken.mockReset().mockResolvedValue('at');
  mocks.ensureUserRoleBinding.mockReset().mockResolvedValue(undefined);
  mocks.getConfigBool.mockReset().mockResolvedValue(true);
  mocks.getConfigValue.mockReset().mockResolvedValue('pending');
  mocks.setConfigValue.mockReset().mockResolvedValue(undefined);
  mocks.checkRateLimit
    .mockReset()
    .mockResolvedValue({ allowed: true, resetAt: Date.now() + 60_000 });
  mocks.usersCount = 0; // empty system → first-admin path
  mocks.claimChanges = 1;
  mocks.userCreateShouldThrow = false;
  // Track db.run calls by SQL so we can assert on the claim + rollback.
  mocks.db.run.mockImplementation(async (sql) => {
    if (
      typeof sql === 'string' &&
      sql.includes('first_admin_claimed') &&
      sql.startsWith('INSERT')
    ) {
      return { meta: { changes: mocks.claimChanges } };
    }
    return { meta: { changes: 1 } };
  });
});

const sharedFns = {
  ensureUserRoleBinding: (...args) => mocks.ensureUserRoleBinding(...args),
  createAccessToken: (...args) => mocks.createAccessToken(...args),
};

const usersRepo = {
  count: () => Promise.resolve(mocks.usersCount),
  findByEmail: () => Promise.resolve(null),
  create: async (userData) => {
    if (mocks.userCreateShouldThrow) {
      throw new Error('simulated user.create failure');
    }
    return { id: userData.id, ...userData };
  },
};

describe('handleRegister — bootstrap claim race', () => {
  it('does NOT consume the bootstrap sentinel when the request is rate-limited', async () => {
    mocks.usersCount = 0;
    mocks.checkRateLimit.mockResolvedValue({ allowed: false, resetAt: Date.now() + 60_000 });

    const res = await handleRegister(
      makeReq(VALID_BODY),
      {},
      mocks.db,
      usersRepo,
      VALID_JWT_SECRET,
      null,
      sharedFns
    );

    expect(res.status).toBe(429);
    const insertClaimCall = mocks.db.run.mock.calls.find(
      ([sql]) =>
        typeof sql === 'string' && sql.startsWith('INSERT') && sql.includes('first_admin_claimed')
    );
    expect(insertClaimCall).toBeUndefined();
  });

  it('does NOT consume the bootstrap sentinel when the body is malformed', async () => {
    mocks.usersCount = 0;
    const res = await handleRegister(
      makeReq({ email: 'not-an-email', name: 'A', password: 'short' }),
      {},
      mocks.db,
      usersRepo,
      VALID_JWT_SECRET,
      null,
      sharedFns
    );

    expect(res.status).toBe(400);
    const insertClaimCall = mocks.db.run.mock.calls.find(
      ([sql]) =>
        typeof sql === 'string' && sql.startsWith('INSERT') && sql.includes('first_admin_claimed')
    );
    expect(insertClaimCall).toBeUndefined();
  });

  it('returns 409 when a concurrent first-admin claim wins the race', async () => {
    mocks.usersCount = 0;
    mocks.claimChanges = 0; // INSERT OR IGNORE saw the sentinel already taken

    const res = await handleRegister(
      makeReq(VALID_BODY),
      {},
      mocks.db,
      usersRepo,
      VALID_JWT_SECRET,
      null,
      sharedFns
    );

    expect(res.status).toBe(409);
  });

  it('rolls back the bootstrap sentinel if user creation throws after a successful claim', async () => {
    mocks.usersCount = 0;
    mocks.userCreateShouldThrow = true;

    // The handler re-throws after rollback so the global error handler can
    // convert it to a 500; the test asserts the rollback happened before the
    // throw propagated.
    await expect(
      handleRegister(
        makeReq(VALID_BODY),
        {},
        mocks.db,
        usersRepo,
        VALID_JWT_SECRET,
        null,
        sharedFns
      )
    ).rejects.toThrow('simulated user.create failure');

    const deleteClaimCall = mocks.db.run.mock.calls.find(
      ([sql]) =>
        typeof sql === 'string' && sql.startsWith('DELETE') && sql.includes('first_admin_claimed')
    );
    expect(deleteClaimCall).toBeDefined();
  });

  it('also rolls back the inserted user row if a post-create step throws after a successful claim', async () => {
    // PR #173 review thread Ms7sF: the catch block used to delete only the
    // first_admin_claimed sentinel but leave the newly inserted users row
    // behind. A retry would then see hasUsers > 0 and the original
    // first-admin claim would be lost forever. The fix also DELETEs the user
    // row on rollback so a failed bootstrap is fully self-healing.
    mocks.usersCount = 0;
    mocks.ensureUserRoleBinding.mockRejectedValueOnce(
      new Error('simulated ensureUserRoleBinding failure')
    );

    await expect(
      handleRegister(
        makeReq(VALID_BODY),
        {},
        mocks.db,
        usersRepo,
        VALID_JWT_SECRET,
        null,
        sharedFns
      )
    ).rejects.toThrow('simulated ensureUserRoleBinding failure');

    const deleteClaimCall = mocks.db.run.mock.calls.find(
      ([sql]) =>
        typeof sql === 'string' && sql.startsWith('DELETE') && sql.includes('first_admin_claimed')
    );
    expect(deleteClaimCall).toBeDefined();

    const deleteUserCall = mocks.db.run.mock.calls.find(
      ([sql]) =>
        typeof sql === 'string' &&
        sql.startsWith('DELETE') &&
        sql.includes('users') &&
        sql.includes('WHERE id =')
    );
    expect(deleteUserCall).toBeDefined();
  });

  it('claims the sentinel AFTER rate limit + validation, in the correct order', async () => {
    mocks.usersCount = 0;
    let claimSeenAt = -1;
    let rateLimitSeenAt = -1;
    let opIndex = 0;
    mocks.db.run.mockImplementation(async (sql) => {
      if (
        typeof sql === 'string' &&
        sql.startsWith('INSERT') &&
        sql.includes('first_admin_claimed')
      ) {
        claimSeenAt = opIndex++;
      } else {
        opIndex++;
      }
      return { meta: { changes: 1 } };
    });
    mocks.checkRateLimit.mockImplementation(async () => {
      rateLimitSeenAt = opIndex++;
      return { allowed: true, resetAt: Date.now() + 60_000 };
    });

    await handleRegister(
      makeReq(VALID_BODY),
      {},
      mocks.db,
      usersRepo,
      VALID_JWT_SECRET,
      null,
      sharedFns
    );

    expect(rateLimitSeenAt).toBeGreaterThanOrEqual(0);
    expect(claimSeenAt).toBeGreaterThanOrEqual(0);
    // The claim must come AFTER rate limit.
    expect(claimSeenAt).toBeGreaterThan(rateLimitSeenAt);
  });
});

describe('handleRegister — public_registration flip ordering', () => {
  // PR #173 review thread MsspR: disabling public_registration used to happen
  // BEFORE ensureUserRoleBinding and the primary_role UPDATE. If either of
  // those later writes failed, the catch block only rolled back
  // first_admin_claimed, leaving the deployment with public registration
  // permanently disabled until a manual DB repair. The fix defers the flip
  // until all bootstrap writes succeed so a failed bootstrap is self-healing.

  it('does NOT disable public_registration when ensureUserRoleBinding throws after the first-admin user is created', async () => {
    mocks.usersCount = 0;
    mocks.ensureUserRoleBinding.mockRejectedValueOnce(
      new Error('simulated ensureUserRoleBinding failure')
    );

    await expect(
      handleRegister(
        makeReq(VALID_BODY),
        {},
        mocks.db,
        usersRepo,
        VALID_JWT_SECRET,
        null,
        sharedFns
      )
    ).rejects.toThrow('simulated ensureUserRoleBinding failure');

    const flipCall = mocks.setConfigValue.mock.calls.find(
      ([, key, value]) => key === 'public_registration' && value === 'false'
    );
    expect(flipCall).toBeUndefined();
  });

  it('still disables public_registration when the tolerated primary_role UPDATE throws', async () => {
    // The primary_role UPDATE is wrapped in a tolerant try/catch
    // ("Tolerate missing column in older schemas"), so its error is
    // swallowed and the bootstrap path is still considered successful.
    // The public_registration flip must therefore still run after it.
    mocks.usersCount = 0;
    mocks.db.run.mockImplementation(async (sql) => {
      if (typeof sql === 'string' && sql.startsWith('UPDATE users SET primary_role')) {
        throw new Error('tolerated UPDATE failure');
      }
      if (
        typeof sql === 'string' &&
        sql.startsWith('INSERT') &&
        sql.includes('first_admin_claimed')
      ) {
        return { meta: { changes: 1 } };
      }
      return { meta: { changes: 1 } };
    });

    await handleRegister(
      makeReq(VALID_BODY),
      {},
      mocks.db,
      usersRepo,
      VALID_JWT_SECRET,
      null,
      sharedFns
    );

    const flipCall = mocks.setConfigValue.mock.calls.find(
      ([, key, value]) => key === 'public_registration' && value === 'false'
    );
    expect(flipCall).toBeDefined();
  });

  it('disables public_registration AFTER ensureUserRoleBinding and the primary_role UPDATE on successful bootstrap', async () => {
    mocks.usersCount = 0;
    let ensureUserRoleBindingSeenAt = -1;
    let primaryRoleUpdateSeenAt = -1;
    let flipSeenAt = -1;
    let opIndex = 0;

    mocks.ensureUserRoleBinding.mockImplementation(async () => {
      ensureUserRoleBindingSeenAt = opIndex++;
    });
    mocks.db.run.mockImplementation(async (sql) => {
      if (typeof sql === 'string' && sql.startsWith('UPDATE users SET primary_role')) {
        primaryRoleUpdateSeenAt = opIndex++;
        return { meta: { changes: 1 } };
      }
      opIndex++;
      return { meta: { changes: 1 } };
    });
    mocks.setConfigValue.mockImplementation(async () => {
      flipSeenAt = opIndex++;
    });

    await handleRegister(
      makeReq(VALID_BODY),
      {},
      mocks.db,
      usersRepo,
      VALID_JWT_SECRET,
      null,
      sharedFns
    );

    expect(ensureUserRoleBindingSeenAt).toBeGreaterThanOrEqual(0);
    expect(primaryRoleUpdateSeenAt).toBeGreaterThanOrEqual(0);
    expect(flipSeenAt).toBeGreaterThanOrEqual(0);
    expect(flipSeenAt).toBeGreaterThan(ensureUserRoleBindingSeenAt);
    expect(flipSeenAt).toBeGreaterThan(primaryRoleUpdateSeenAt);
  });

  it('does NOT touch public_registration when the registering user is not the first admin', async () => {
    mocks.usersCount = 5; // not first admin
    await handleRegister(
      makeReq(VALID_BODY),
      {},
      mocks.db,
      usersRepo,
      VALID_JWT_SECRET,
      null,
      sharedFns
    );
    const flipCall = mocks.setConfigValue.mock.calls.find(
      ([, key, value]) => key === 'public_registration' && value === 'false'
    );
    expect(flipCall).toBeUndefined();
  });
});
