import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  db: {
    first: vi.fn(),
    run: vi.fn(),
    prepare: vi.fn().mockReturnValue({
      bind: vi.fn().mockReturnThis(),
      run: vi.fn().mockResolvedValue({}),
      first: vi.fn().mockResolvedValue(null),
    }),
    batch: vi.fn().mockResolvedValue([]),
  },
  hashPassword: vi.fn(),
  verifyPassword: vi.fn(),
  signJWT: vi.fn(),
  createRefreshToken: vi.fn(),
  consumeRefreshToken: vi.fn(),
  revokeRefreshTokenForLogout: vi.fn(),
  loadPrimaryRole: vi.fn(),
}));

let queryResponses;

const FIRST_RESPONSES = [
  {
    match: (query) => query.includes('SELECT COUNT(*) as count FROM users'),
    value: (responses) => responses.countUsers.shift() ?? null,
  },
  {
    match: (query) => query.includes('SELECT value FROM app_config WHERE key = ?'),
    value: (responses) => responses.appConfig.shift() ?? null,
  },
  {
    match: (query) => query.includes('SELECT id FROM users WHERE email = ?'),
    value: (responses) => responses.existingUser.shift() ?? null,
  },
  {
    match: (query) => query.includes('SELECT * FROM users WHERE email = ?'),
    value: (responses) => responses.loginUser.shift() ?? null,
  },
  {
    match: (query) => query.includes('SELECT * FROM users WHERE id = ?'),
    value: (responses) => responses.userById.shift() ?? null,
  },
];

function mockFirstResponse(sql, responses) {
  const query = String(sql || '');
  const entry = FIRST_RESPONSES.find((r) => r.match(query));
  return entry ? entry.value(responses) : null;
}

vi.mock('../db.js', () => ({
  createDB: () => mocks.db,
}));

vi.mock('../shared/auth.js', () => ({
  hashPassword: (...args) => mocks.hashPassword(...args),
  verifyPassword: (...args) => mocks.verifyPassword(...args),
  signJWT: (...args) => mocks.signJWT(...args),
}));

vi.mock('../shared/session.js', () => ({
  createRefreshToken: (...args) => mocks.createRefreshToken(...args),
  consumeRefreshToken: (...args) => mocks.consumeRefreshToken(...args),
  revokeRefreshTokenForLogout: (...args) => mocks.revokeRefreshTokenForLogout(...args),
}));

vi.mock('../repositories/user-repository.js', () => ({
  createUserRepository: (db) => ({
    count: () => db.first('SELECT COUNT(*) as count FROM users').then((r) => Number(r?.count || 0)),
    findByEmail: (email, columns) => {
      const cols = columns || '*';
      const sql =
        cols === '*'
          ? 'SELECT * FROM users WHERE email = ?'
          : 'SELECT id FROM users WHERE email = ?';
      return db.first(sql, [email]);
    },
    findById: (id) => db.first('SELECT * FROM users WHERE id = ?', [id]),
    create: async (userData) => {
      const id = userData.id || crypto.randomUUID();
      await db.run(
        'INSERT INTO users (id, email, password_hash, name, account_status, settings) VALUES (?, ?, ?, ?, ?, ?)',
        [id, userData.email, userData.passwordHash, userData.name, userData.accountStatus, '{}']
      );
      return { id, ...userData };
    },
    touchLastActive: () => Promise.resolve(undefined),
  }),
}));

vi.mock('../utils/user-role.js', () => ({
  loadPrimaryRole: (...args) => mocks.loadPrimaryRole(...args),
  normalizePublicRole: vi.fn((r) => r || 'member'),
}));

import { authRouter } from './auth.js';

const VALID_JWT_SECRET = '0123456789abcdef0123456789abcdef';

function makeReq(path, method, body, headers = {}) {
  const init = { method, headers: { ...headers } };
  if (body !== undefined) {
    init.body = typeof body === 'string' ? body : JSON.stringify(body);
    init.headers['Content-Type'] = 'application/json';
  }
  return new Request(`https://example.com${path}`, init);
}

describe('authRouter', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.loadPrimaryRole.mockResolvedValue('member');
    queryResponses = {
      countUsers: [],
      appConfig: [],
      existingUser: [],
      userById: [],
      loginUser: [],
      refreshUser: [],
    };
    mocks.db.first.mockImplementation(async (sql) => mockFirstResponse(sql, queryResponses));
    mocks.hashPassword.mockResolvedValue('pbkdf2:hash');
    mocks.verifyPassword.mockResolvedValue(true);
    mocks.signJWT.mockResolvedValue('jwt-token');
    mocks.createRefreshToken.mockResolvedValue({
      token: 'refresh-token',
      expiresAt: 1_700_000_000,
    });
    mocks.consumeRefreshToken.mockResolvedValue(null);
    mocks.revokeRefreshTokenForLogout.mockResolvedValue(undefined);
    mocks.db.run.mockResolvedValue({ success: true });
  });

  it('registers the first user as an active admin and returns tokens', async () => {
    const env = { DB: {}, JWT_SECRET: VALID_JWT_SECRET };
    queryResponses.countUsers = [{ count: 0 }];
    queryResponses.appConfig = [null];
    queryResponses.existingUser = [null];
    queryResponses.userById = [
      {
        id: 'u1',
        email: 'user@example.com',
        name: 'User',
        role: 'admin',
        account_status: 'active',
        settings: '{}',
        created_at: 1,
        updated_at: 1,
      },
    ];

    const res = await authRouter(
      makeReq('/api/auth/register', 'POST', {
        email: 'User@Example.com',
        name: 'User',
        password: 'password123',
      }),
      env,
      {},
      null,
      '/api/auth/register'
    );

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.user.email).toBe('user@example.com');
    expect(body.user.primary_role).toBe('admin');
    expect(body.user.account_status).toBe('active');
    expect(body.access_token).toBe('jwt-token');
    expect(body.refresh_token).toBe('refresh-token');
    expect(body.expires_in).toBe(900);
    expect(
      mocks.db.run.mock.calls.some(
        ([sql, params]) =>
          String(sql).includes('INSERT INTO users') &&
          Array.isArray(params) &&
          params[4] === 'active'
      )
    ).toBe(true);
    expect(
      mocks.db.run.mock.calls.some(
        ([sql, params]) =>
          String(sql).includes('app_config') &&
          Array.isArray(params) &&
          params[0] === 'public_registration'
      )
    ).toBe(true);
  });

  it('returns 409 when first-admin claim is already taken (race condition guard)', async () => {
    // Simulate a concurrent request that already claimed first_admin_claimed.
    // db.run for INSERT OR IGNORE returns meta.changes = 0 (ignored, not inserted).
    const env = { DB: {}, JWT_SECRET: VALID_JWT_SECRET };
    queryResponses.countUsers = [{ count: 0 }]; // empty system
    queryResponses.appConfig = [null];
    queryResponses.existingUser = [null];
    mocks.db.run.mockImplementation(async (sql) => {
      if (String(sql).includes('INSERT OR IGNORE INTO app_config')) {
        return { meta: { changes: 0 } }; // another request already claimed
      }
      return { success: true };
    });
    const res = await authRouter(
      makeReq('/api/auth/register', 'POST', {
        email: 'racer@example.com',
        name: 'Racer',
        password: 'password123',
      }),
      env,
      {},
      null,
      '/api/auth/register'
    );
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toBe('Registration in progress, please retry');
  });

  it('allows first-admin claim when INSERT OR IGNORE returns meta.changes = 1', async () => {
    // Verify that a real D1 response with meta.changes = 1 is treated as success.
    const env = { DB: {}, JWT_SECRET: VALID_JWT_SECRET };
    queryResponses.countUsers = [{ count: 0 }];
    queryResponses.appConfig = [null];
    queryResponses.existingUser = [null];
    queryResponses.userById = [
      {
        id: 'u1',
        email: 'admin@example.com',
        name: 'Admin',
        role: 'admin',
        account_status: 'active',
        settings: '{}',
        created_at: 1,
        updated_at: 1,
      },
    ];
    mocks.db.run.mockImplementation(async (sql) => {
      if (String(sql).includes('INSERT OR IGNORE INTO app_config')) {
        return { meta: { changes: 1 } }; // claim succeeded
      }
      return { success: true };
    });
    const res = await authRouter(
      makeReq('/api/auth/register', 'POST', {
        email: 'admin@example.com',
        name: 'Admin',
        password: 'password123',
      }),
      env,
      {},
      null,
      '/api/auth/register'
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.user.primary_role).toBe('admin');
  });

  it('creates pending registrations when the default registration status is pending', async () => {
    const env = { DB: {}, JWT_SECRET: VALID_JWT_SECRET };
    queryResponses.countUsers = [{ count: 1 }, { count: 2 }];
    queryResponses.appConfig = [null];
    queryResponses.existingUser = [null];
    queryResponses.userById = [
      {
        id: 'u2',
        email: 'pending@example.com',
        name: 'Pending User',
        role: 'member',
        account_status: 'pending',
        settings: '{}',
        created_at: 1,
        updated_at: 1,
      },
    ];

    const res = await authRouter(
      makeReq('/api/auth/register', 'POST', {
        email: 'pending@example.com',
        name: 'Pending User',
        password: 'password123',
      }),
      env,
      {},
      null,
      '/api/auth/register'
    );

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.user.primary_role).toBe('member');
    expect(body.user.account_status).toBe('pending');
    expect(body.status).toBe('pending');
    expect(body.message).toBe('Account pending approval.');
    expect(body.access_token).toBeUndefined();
    expect(body.refresh_token).toBeUndefined();
    expect(mocks.createRefreshToken).not.toHaveBeenCalled();
    expect(mocks.db.run).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO users'),
      expect.arrayContaining(['pending', expect.any(String)])
    );
  });

  it('rejects duplicate email on register', async () => {
    const env = { DB: {}, JWT_SECRET: VALID_JWT_SECRET };
    queryResponses.countUsers = [{ count: 1 }];
    queryResponses.appConfig = [null];
    queryResponses.existingUser = [{ id: 'exists' }];

    const res = await authRouter(
      makeReq('/api/auth/register', 'POST', {
        email: 'dupe@example.com',
        name: 'Dupe',
        password: 'password123',
      }),
      env,
      {},
      null,
      '/api/auth/register'
    );

    expect(res.status).toBe(409);
    await expect(res.json()).resolves.toMatchObject({
      error: 'Email already registered',
    });
  });

  it('logs in user with valid credentials', async () => {
    const env = { DB: {}, JWT_SECRET: VALID_JWT_SECRET };
    queryResponses.loginUser = [
      {
        id: 'u1',
        email: 'user@example.com',
        name: 'User',
        role: 'member',
        account_status: 'active',
        password_hash: 'stored-hash',
        settings: '{}',
        created_at: 1,
        updated_at: 1,
      },
    ];
    queryResponses.userById = [
      {
        id: 'u1',
        email: 'user@example.com',
        name: 'User',
        role: 'member',
        password_hash: 'stored-hash',
        settings: '{}',
        created_at: 1,
        updated_at: 1,
      },
    ];

    const res = await authRouter(
      makeReq('/api/auth/login', 'POST', {
        email: 'user@example.com',
        password: 'password123',
      }),
      env,
      {},
      null,
      '/api/auth/login'
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.user.account_status).toBe('active');
    expect(body.access_token).toBe('jwt-token');
    expect(body.refresh_token).toBe('refresh-token');
    expect(mocks.verifyPassword).toHaveBeenCalledWith('password123', 'stored-hash');
  });

  it('rejects pending users from logging in', async () => {
    const env = { DB: {}, JWT_SECRET: VALID_JWT_SECRET };
    queryResponses.loginUser = [
      {
        id: 'u1',
        email: 'user@example.com',
        name: 'User',
        role: 'member',
        account_status: 'pending',
        password_hash: 'stored-hash',
        settings: '{}',
        created_at: 1,
        updated_at: 1,
      },
    ];
    mocks.verifyPassword.mockResolvedValueOnce(true);

    const res = await authRouter(
      makeReq('/api/auth/login', 'POST', {
        email: 'user@example.com',
        password: 'password123',
      }),
      env,
      {},
      null,
      '/api/auth/login'
    );

    expect(res.status).toBe(403);
    await expect(res.json()).resolves.toMatchObject({
      error: 'pending_account',
      message: 'Account pending approval.',
    });
    expect(mocks.createRefreshToken).not.toHaveBeenCalled();
  });

  it('returns generic 401 when login password is wrong', async () => {
    const env = { DB: {}, JWT_SECRET: VALID_JWT_SECRET };
    queryResponses.loginUser = [
      {
        id: 'u1',
        email: 'user@example.com',
        name: 'User',
        role: 'member',
        account_status: 'active',
        password_hash: 'stored-hash',
        settings: '{}',
        created_at: 1,
        updated_at: 1,
      },
    ];
    mocks.verifyPassword.mockResolvedValueOnce(false);

    const res = await authRouter(
      makeReq('/api/auth/login', 'POST', {
        email: 'user@example.com',
        password: 'wrong',
      }),
      env,
      {},
      null,
      '/api/auth/login'
    );

    expect(res.status).toBe(401);
    await expect(res.json()).resolves.toMatchObject({
      error: 'Invalid credentials',
    });
  });

  it('refreshes tokens when refresh token is valid', async () => {
    const env = { DB: {}, JWT_SECRET: VALID_JWT_SECRET };
    mocks.consumeRefreshToken.mockResolvedValueOnce({
      userId: 'u1',
      expiresAt: 1_700_000_000,
    });
    queryResponses.userById = [
      {
        id: 'u1',
        email: 'user@example.com',
        name: 'User',
        role: 'member',
        account_status: 'active',
        settings: '{}',
        created_at: 1,
        updated_at: 1,
      },
      {
        id: 'u1',
        email: 'user@example.com',
        name: 'User',
        role: 'member',
        account_status: 'active',
        settings: '{}',
        created_at: 1,
        updated_at: 1,
      },
    ];

    const res = await authRouter(
      makeReq('/api/auth/refresh', 'POST', { refresh_token: 'valid' }),
      env,
      {},
      null,
      '/api/auth/refresh'
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.user.account_status).toBe('active');
    expect(body.access_token).toBe('jwt-token');
    expect(body.refresh_token).toBe('refresh-token');
  });

  it('returns 401 on invalid refresh token', async () => {
    const env = { DB: {}, JWT_SECRET: VALID_JWT_SECRET };
    mocks.consumeRefreshToken.mockResolvedValueOnce(null);

    const res = await authRouter(
      makeReq('/api/auth/refresh', 'POST', { refresh_token: 'bad' }),
      env,
      {},
      null,
      '/api/auth/refresh'
    );

    expect(res.status).toBe(401);
    await expect(res.json()).resolves.toMatchObject({
      error: 'Invalid refresh token',
    });
  });

  it('returns ok on logout and revokes provided refresh token', async () => {
    const env = { DB: {}, JWT_SECRET: VALID_JWT_SECRET };
    mocks.revokeRefreshTokenForLogout.mockResolvedValueOnce('u1');

    const res = await authRouter(
      makeReq('/api/auth/logout', 'POST', { refresh_token: 'bye' }),
      env,
      {},
      null,
      '/api/auth/logout'
    );

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({ ok: true });
    expect(mocks.revokeRefreshTokenForLogout).toHaveBeenCalledWith(env, 'bye');
  });

  it('logout calls revokeRefreshTokenForLogout even when token has no userId', async () => {
    const env = { DB: {}, JWT_SECRET: VALID_JWT_SECRET };
    mocks.revokeRefreshTokenForLogout.mockResolvedValueOnce(null);

    const res = await authRouter(
      makeReq('/api/auth/logout', 'POST', { refresh_token: 'unknown' }),
      env,
      {},
      null,
      '/api/auth/logout'
    );

    expect(res.status).toBe(200);
    expect(mocks.revokeRefreshTokenForLogout).toHaveBeenCalledWith(env, 'unknown');
  });

  it('logout does not invoke revoke when refresh token is absent', async () => {
    const env = { DB: {}, JWT_SECRET: VALID_JWT_SECRET };

    const res = await authRouter(
      makeReq('/api/auth/logout', 'POST', {}),
      env,
      {},
      null,
      '/api/auth/logout'
    );

    expect(res.status).toBe(200);
    expect(mocks.revokeRefreshTokenForLogout).not.toHaveBeenCalled();
  });

  it('returns 500 when JWT_SECRET is missing', async () => {
    const env = { DB: {}, JWT_SECRET: '' };

    const res = await authRouter(
      makeReq('/api/auth/login', 'POST', {
        email: 'user@example.com',
        password: 'password123',
      }),
      env,
      {},
      null,
      '/api/auth/login'
    );
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.details.message).toContain('JWT_SECRET');
  });

  it('returns 500 with clear message when JWT_SECRET is too short', async () => {
    const env = { DB: {}, JWT_SECRET: 'too-short' };
    const res = await authRouter(
      makeReq('/api/auth/register', 'POST', {
        email: 'test@example.com',
        name: 'Test',
        password: 'password123',
      }),
      env,
      {},
      null,
      '/api/auth/register'
    );
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.details.message).toContain('JWT_SECRET');
    expect(body.details.message).toContain('32 bytes');
  });

  it('GET /api/auth/me returns user profile when authenticated', async () => {
    const env = { DB: {}, JWT_SECRET: VALID_JWT_SECRET };
    const mockUser = {
      id: 'user-1',
      email: 'alice@example.com',
      name: 'Alice',
      account_status: 'active',
      settings: '{}',
      created_at: 1000,
      last_active_at: 2000,
      updated_at: 3000,
    };
    queryResponses.userById.push(mockUser);
    mocks.loadPrimaryRole.mockResolvedValueOnce('admin');
    const res = await authRouter(
      makeReq('/api/auth/me', 'GET'),
      env,
      {},
      { sub: 'user-1', email: 'alice@example.com' },
      '/api/auth/me'
    );
    expect(res.status).toBe(200);
    const payload = await res.json();
    expect(payload.id).toBe('user-1');
    expect(payload.email).toBe('alice@example.com');
    expect(payload.primary_role).toBe('admin');
  });

  it('GET /api/auth/me returns 401 when not authenticated', async () => {
    const env = { DB: {}, JWT_SECRET: VALID_JWT_SECRET };
    const res = await authRouter(makeReq('/api/auth/me', 'GET'), env, {}, null, '/api/auth/me');
    expect(res.status).toBe(401);
  });

  it('GET /api/auth/me returns 404 when user not found', async () => {
    const env = { DB: {}, JWT_SECRET: VALID_JWT_SECRET };
    // userById defaults to null in beforeEach
    const res = await authRouter(
      makeReq('/api/auth/me', 'GET'),
      env,
      {},
      { sub: 'deleted-user', email: 'gone@example.com' },
      '/api/auth/me'
    );
    expect(res.status).toBe(404);
  });

  it('returns 405 for wrong method on known auth paths', async () => {
    const env = { DB: {}, JWT_SECRET: VALID_JWT_SECRET };
    const res = await authRouter(
      makeReq('/api/auth/login', 'GET'),
      env,
      {},
      null,
      '/api/auth/login'
    );
    expect(res.status).toBe(405);
  });

  it('returns 405 for DELETE on /api/auth/register', async () => {
    const env = { DB: {}, JWT_SECRET: VALID_JWT_SECRET };
    const res = await authRouter(
      makeReq('/api/auth/register', 'DELETE'),
      env,
      {},
      null,
      '/api/auth/register'
    );
    expect(res.status).toBe(405);
  });
});

/* ------------------------------------------------------------------ */
/*  Per-account brute-force protection (issue #145)                   */
/* ------------------------------------------------------------------ */

/**
 * Lightweight KV store that mimics the SESSIONS namespace behaviour
 * required by trackFailedLoginAttempt / clearFailedLoginAttempts.
 * Maintains an in-memory map keyed by the exact string the audit
 * logging service writes (`login_attempts:<email>`).
 */
function makeKVStore() {
  const store = new Map();
  return {
    get: vi.fn(async (key, type) => {
      const raw = store.get(key);
      if (raw === undefined) return null;
      if (type === 'json') return JSON.parse(raw);
      return raw;
    }),
    put: vi.fn(async (key, value) => {
      store.set(key, value);
    }),
    delete: vi.fn(async (key) => {
      store.delete(key);
    }),
    list: vi.fn(async () => ({ keys: [], objects: [] })),
    _store: store,
  };
}

function activeUserRow(overrides = {}) {
  return {
    id: 'u1',
    email: 'user@example.com',
    name: 'User',
    role: 'member',
    account_status: 'active',
    password_hash: 'stored-hash',
    settings: '{}',
    created_at: 1,
    updated_at: 1,
    ...overrides,
  };
}

describe('per-account brute-force protection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.loadPrimaryRole.mockResolvedValue('member');
    queryResponses = {
      countUsers: [],
      appConfig: [],
      existingUser: [],
      userById: [],
      loginUser: [],
      refreshUser: [],
    };
    mocks.db.first.mockImplementation(async (sql) => mockFirstResponse(sql, queryResponses));
    mocks.hashPassword.mockResolvedValue('pbkdf2:hash');
    mocks.verifyPassword.mockResolvedValue(true);
    mocks.signJWT.mockResolvedValue('jwt-token');
    mocks.createRefreshToken.mockResolvedValue({
      token: 'refresh-token',
      expiresAt: 1_700_000_000,
    });
    mocks.consumeRefreshToken.mockResolvedValue(null);
    mocks.revokeRefreshTokenForLogout.mockResolvedValue(undefined);
    mocks.db.run.mockResolvedValue({ success: true });
  });

  it('returns 401 for the first four failed attempts and 429 on the fifth', async () => {
    const kv = makeKVStore();
    const env = { DB: {}, JWT_SECRET: VALID_JWT_SECRET, SESSIONS: kv };
    for (let i = 0; i < 5; i += 1) {
      queryResponses.loginUser.push(activeUserRow({ email: 'lock@example.com' }));
    }
    mocks.verifyPassword.mockResolvedValue(false);

    for (let i = 0; i < 4; i += 1) {
      const res = await authRouter(
        makeReq('/api/auth/login', 'POST', { email: 'lock@example.com', password: 'wrong' }),
        env,
        {},
        null,
        '/api/auth/login'
      );
      expect(res.status).toBe(401);
      const body = await res.json();
      expect(body.error).toBe('Invalid credentials');
    }

    const fifth = await authRouter(
      makeReq('/api/auth/login', 'POST', { email: 'lock@example.com', password: 'wrong' }),
      env,
      {},
      null,
      '/api/auth/login'
    );
    expect(fifth.status).toBe(429);
    const body = await fifth.json();
    expect(body.error).toBe('Too many failed login attempts for this account');
    expect(body.details).toBeDefined();
    expect(body.details.retry_after).toBeGreaterThan(0);
    expect(mocks.verifyPassword).toHaveBeenCalledTimes(5);
    expect(mocks.createRefreshToken).not.toHaveBeenCalled();
  });

  it('returns 429 on the fifth failed attempt even for an unknown email', async () => {
    // The 'user not found' branch must also count toward the per-account lockout
    // so an attacker cannot probe for valid emails without consequence.
    const kv = makeKVStore();
    const env = { DB: {}, JWT_SECRET: VALID_JWT_SECRET, SESSIONS: kv };
    mocks.verifyPassword.mockResolvedValue(false);

    for (let i = 0; i < 4; i += 1) {
      const res = await authRouter(
        makeReq('/api/auth/login', 'POST', {
          email: 'ghost@example.com',
          password: 'whatever',
        }),
        env,
        {},
        null,
        '/api/auth/login'
      );
      expect(res.status).toBe(401);
    }

    const fifth = await authRouter(
      makeReq('/api/auth/login', 'POST', {
        email: 'ghost@example.com',
        password: 'whatever',
      }),
      env,
      {},
      null,
      '/api/auth/login'
    );
    expect(fifth.status).toBe(429);
    const body = await fifth.json();
    expect(body.error).toBe('Too many failed login attempts for this account');
  });

  it('clears the per-account counter after a successful login', async () => {
    const kv = makeKVStore();
    const env = { DB: {}, JWT_SECRET: VALID_JWT_SECRET, SESSIONS: kv };

    // Three failures (call 1-3) — each consumes one queue entry.
    mocks.verifyPassword.mockResolvedValueOnce(false);
    mocks.verifyPassword.mockResolvedValueOnce(false);
    mocks.verifyPassword.mockResolvedValueOnce(false);
    for (let i = 0; i < 3; i += 1) {
      queryResponses.loginUser.push(activeUserRow({ email: 'reset@example.com' }));
      const res = await authRouter(
        makeReq('/api/auth/login', 'POST', {
          email: 'reset@example.com',
          password: 'wrong',
        }),
        env,
        {},
        null,
        '/api/auth/login'
      );
      expect(res.status).toBe(401);
    }
    expect(kv._store.has('login_attempts:reset@example.com')).toBe(true);

    // Fourth attempt succeeds using the default mockResolvedValue(true).
    queryResponses.loginUser.push(activeUserRow({ email: 'reset@example.com' }));
    queryResponses.userById.push(activeUserRow({ email: 'reset@example.com' }));
    const successRes = await authRouter(
      makeReq('/api/auth/login', 'POST', {
        email: 'reset@example.com',
        password: 'correct',
      }),
      env,
      {},
      null,
      '/api/auth/login'
    );
    expect(successRes.status).toBe(200);
    expect(kv._store.has('login_attempts:reset@example.com')).toBe(false);

    // Fifth attempt fails — counter was cleared, so still 401 not 429.
    mocks.verifyPassword.mockResolvedValueOnce(false);
    queryResponses.loginUser.push(activeUserRow({ email: 'reset@example.com' }));
    const resAfter = await authRouter(
      makeReq('/api/auth/login', 'POST', {
        email: 'reset@example.com',
        password: 'wrong',
      }),
      env,
      {},
      null,
      '/api/auth/login'
    );
    expect(resAfter.status).toBe(401);
    const body = await resAfter.json();
    expect(body.error).toBe('Invalid credentials');
  });

  it('tracks failed attempts independently per email', async () => {
    const kv = makeKVStore();
    const env = { DB: {}, JWT_SECRET: VALID_JWT_SECRET, SESSIONS: kv };

    // Lock email A with five failures.
    for (let i = 0; i < 5; i += 1) {
      queryResponses.loginUser.push(activeUserRow({ id: 'uA', email: 'a@example.com' }));
    }
    mocks.verifyPassword.mockResolvedValue(false);
    for (let i = 0; i < 5; i += 1) {
      const res = await authRouter(
        makeReq('/api/auth/login', 'POST', { email: 'a@example.com', password: 'wrong' }),
        env,
        {},
        null,
        '/api/auth/login'
      );
      if (i < 4) {
        expect(res.status).toBe(401);
      } else {
        expect(res.status).toBe(429);
      }
    }
    expect(kv._store.has('login_attempts:a@example.com')).toBe(true);
    expect(kv._store.has('login_attempts:b@example.com')).toBe(false);

    // Email B must still respond with 401, not 429 — independent counter.
    queryResponses.loginUser.push(activeUserRow({ id: 'uB', email: 'b@example.com' }));
    const resB = await authRouter(
      makeReq('/api/auth/login', 'POST', { email: 'b@example.com', password: 'wrong' }),
      env,
      {},
      null,
      '/api/auth/login'
    );
    expect(resB.status).toBe(401);
    expect(kv._store.has('login_attempts:b@example.com')).toBe(true);
  });

  it('silently no-ops the lockout when the SESSIONS KV binding is missing', async () => {
    // Existing tests construct env without SESSIONS. The login flow must remain
    // functional even when the binding is unavailable — track/clear become no-ops.
    const env = { DB: {}, JWT_SECRET: VALID_JWT_SECRET };
    queryResponses.loginUser = [activeUserRow({ email: 'nostore@example.com' })];
    mocks.verifyPassword.mockResolvedValueOnce(false);

    const res = await authRouter(
      makeReq('/api/auth/login', 'POST', {
        email: 'nostore@example.com',
        password: 'wrong',
      }),
      env,
      {},
      null,
      '/api/auth/login'
    );
    expect(res.status).toBe(401);
    await expect(res.json()).resolves.toMatchObject({ error: 'Invalid credentials' });
  });

  it('rejects locked accounts before password verification', async () => {
    // Seed the KV store with the maximum number of failed attempts, then
    // attempt to log in with the correct password. The handler must return
    // 429 immediately without paying the PBKDF2 verifyPassword cost.
    const kv = makeKVStore();
    const env = { DB: {}, JWT_SECRET: VALID_JWT_SECRET, SESSIONS: kv };
    const now = Date.now();
    await kv.put(
      'login_attempts:locked@example.com',
      JSON.stringify({
        email: 'locked@example.com',
        attempts: [
          now - 4 * 60 * 1000,
          now - 3 * 60 * 1000,
          now - 2 * 60 * 1000,
          now - 1 * 60 * 1000,
          now,
        ],
      })
    );
    queryResponses.loginUser = [activeUserRow({ email: 'locked@example.com' })];

    const res = await authRouter(
      makeReq('/api/auth/login', 'POST', {
        email: 'locked@example.com',
        password: 'correct',
      }),
      env,
      {},
      null,
      '/api/auth/login'
    );

    expect(res.status).toBe(429);
    const body = await res.json();
    expect(body.error).toBe('Too many failed login attempts for this account');
    expect(body.details.retry_after).toBeGreaterThan(0);
    expect(body.details.retry_after).toBeLessThanOrEqual(3600);
    expect(mocks.verifyPassword).not.toHaveBeenCalled();
    expect(mocks.createRefreshToken).not.toHaveBeenCalled();
  });

  it('returns rolling-window retry_after based on the oldest blocking attempt', async () => {
    // Five attempts spaced 10 minutes apart. The lockout should report the
    // remaining time until the oldest of the five attempts ages out of the
    // 1-hour window, not the hard-coded 3600 seconds.
    const kv = makeKVStore();
    const env = { DB: {}, JWT_SECRET: VALID_JWT_SECRET, SESSIONS: kv };
    const now = Date.now();
    await kv.put(
      'login_attempts:rolling@example.com',
      JSON.stringify({
        email: 'rolling@example.com',
        attempts: [
          now - 50 * 60 * 1000,
          now - 40 * 60 * 1000,
          now - 30 * 60 * 1000,
          now - 20 * 60 * 1000,
          now - 10 * 60 * 1000,
        ],
      })
    );

    const res = await authRouter(
      makeReq('/api/auth/login', 'POST', {
        email: 'rolling@example.com',
        password: 'whatever',
      }),
      env,
      {},
      null,
      '/api/auth/login'
    );

    expect(res.status).toBe(429);
    const body = await res.json();
    expect(body.details.retry_after).toBeGreaterThanOrEqual(590);
    expect(body.details.retry_after).toBeLessThanOrEqual(3700);
  });

  it('does not clear failed attempts when the account is pending approval', async () => {
    // A correct password for a pending account must not wipe the lockout
    // history because the login path did not complete successfully.
    const kv = makeKVStore();
    const env = { DB: {}, JWT_SECRET: VALID_JWT_SECRET, SESSIONS: kv };
    await kv.put(
      'login_attempts:pending@example.com',
      JSON.stringify({
        email: 'pending@example.com',
        attempts: [Date.now() - 1000],
      })
    );
    queryResponses.loginUser = [
      activeUserRow({ email: 'pending@example.com', account_status: 'pending' }),
    ];

    const res = await authRouter(
      makeReq('/api/auth/login', 'POST', {
        email: 'pending@example.com',
        password: 'correct',
      }),
      env,
      {},
      null,
      '/api/auth/login'
    );

    expect(res.status).toBe(403);
    await expect(res.json()).resolves.toMatchObject({
      error: 'pending_account',
      message: 'Account pending approval.',
    });
    expect(kv._store.has('login_attempts:pending@example.com')).toBe(true);
    expect(mocks.createRefreshToken).not.toHaveBeenCalled();
  });
});
