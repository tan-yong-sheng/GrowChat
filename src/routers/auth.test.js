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
  revokeRefreshToken: vi.fn(),
  loadPrimaryRole: vi.fn(),
}));

let queryResponses;

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
  revokeRefreshToken: (...args) => mocks.revokeRefreshToken(...args),
}));


vi.mock('../repositories/user-repository.js', () => ({
  createUserRepository: (db) => ({
    count: () => db.first('SELECT COUNT(*) as count FROM users').then(r => Number(r?.count || 0)),
    findByEmail: (email, columns) => {
      const cols = columns || '*';
      const sql = cols === '*' 
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
    mocks.db.first.mockImplementation(async (sql) => {
      const query = String(sql || '');
      if (query.includes('SELECT COUNT(*) as count FROM users')) {
        return queryResponses.countUsers.shift() ?? null;
      }
      if (query.includes('SELECT value FROM app_config WHERE key = ?')) {
        return queryResponses.appConfig.shift() ?? null;
      }
      if (query.includes('SELECT id FROM users WHERE email = ?')) {
        return queryResponses.existingUser.shift() ?? null;
      }
      if (query.includes('SELECT * FROM users WHERE email = ?')) {
        return queryResponses.loginUser.shift() ?? null;
      }
      if (query.includes('SELECT * FROM users WHERE id = ?')) {
        return queryResponses.userById.shift() ?? null;
      }
      return null;
    });
    mocks.hashPassword.mockResolvedValue('pbkdf2:hash');
    mocks.verifyPassword.mockResolvedValue(true);
    mocks.signJWT.mockResolvedValue('jwt-token');
    mocks.createRefreshToken.mockResolvedValue({
      token: 'refresh-token',
      expiresAt: 1_700_000_000,
    });
    mocks.consumeRefreshToken.mockResolvedValue(null);
    mocks.revokeRefreshToken.mockResolvedValue(undefined);
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

    const res = await authRouter(
      makeReq('/api/auth/logout', 'POST', { refresh_token: 'bye' }),
      env,
      {},
      null,
      '/api/auth/logout'
    );

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({ ok: true });
    expect(mocks.revokeRefreshToken).toHaveBeenCalledWith(env, 'bye');
  });

  it('fails auth endpoints when JWT_SECRET is missing', async () => {
    const env = { DB: {}, JWT_SECRET: '' };

    await expect(
      authRouter(
        makeReq('/api/auth/login', 'POST', {
          email: 'user@example.com',
          password: 'password123',
        }),
        env,
        {},
        null,
        '/api/auth/login'
      )
    ).rejects.toThrow('JWT_SECRET environment variable is required for non-localhost deployments');
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
    const res = await authRouter(
      makeReq('/api/auth/me', 'GET'),
      env,
      {},
      null,
      '/api/auth/me'
    );
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
