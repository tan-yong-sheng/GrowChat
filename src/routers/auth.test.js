import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  db: {
    first: vi.fn(),
    run: vi.fn(),
  },
  hashPassword: vi.fn(),
  verifyPassword: vi.fn(),
  signJWT: vi.fn(),
  createRefreshToken: vi.fn(),
  consumeRefreshToken: vi.fn(),
  revokeRefreshToken: vi.fn(),
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

import { authRouter } from './auth.js';

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

  it('registers a user and returns tokens', async () => {
    const env = { DB: {}, JWT_SECRET: 'secret' };
    queryResponses.countUsers = [{ count: 0 }, { count: 1 }];
    queryResponses.appConfig = [null];
    queryResponses.existingUser = [null];
    queryResponses.userById = [{
      id: 'u1',
      email: 'user@example.com',
      name: 'User',
      role: 'admin',
      settings: '{}',
      created_at: 1,
      updated_at: 1,
    }];

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
    expect(body.access_token).toBe('jwt-token');
    expect(body.refresh_token).toBe('refresh-token');
    expect(body.expires_in).toBe(900);
    expect(mocks.db.run).toHaveBeenCalled();
  });

  it('rejects duplicate email on register', async () => {
    const env = { DB: {}, JWT_SECRET: 'secret' };
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
    await expect(res.json()).resolves.toMatchObject({ error: 'Email already registered' });
  });

  it('logs in user with valid credentials', async () => {
    const env = { DB: {}, JWT_SECRET: 'secret' };
    queryResponses.loginUser = [{
      id: 'u1',
      email: 'user@example.com',
      name: 'User',
      role: 'user',
      password_hash: 'stored-hash',
      settings: '{}',
      created_at: 1,
      updated_at: 1,
    }];
    queryResponses.userById = [{
      id: 'u1',
      email: 'user@example.com',
      name: 'User',
      role: 'user',
      password_hash: 'stored-hash',
      settings: '{}',
      created_at: 1,
      updated_at: 1,
    }];

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
    expect(body.access_token).toBe('jwt-token');
    expect(body.refresh_token).toBe('refresh-token');
    expect(mocks.verifyPassword).toHaveBeenCalledWith('password123', 'stored-hash');
  });

  it('returns generic 401 when login password is wrong', async () => {
    const env = { DB: {}, JWT_SECRET: 'secret' };
    queryResponses.loginUser = [{
      id: 'u1',
      email: 'user@example.com',
      name: 'User',
      role: 'user',
      password_hash: 'stored-hash',
      settings: '{}',
      created_at: 1,
      updated_at: 1,
    }];
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
    await expect(res.json()).resolves.toMatchObject({ error: 'Invalid credentials' });
  });

  it('refreshes tokens when refresh token is valid', async () => {
    const env = { DB: {}, JWT_SECRET: 'secret' };
    mocks.consumeRefreshToken.mockResolvedValueOnce({ userId: 'u1', expiresAt: 1_700_000_000 });
    queryResponses.userById = [{
      id: 'u1',
      email: 'user@example.com',
      name: 'User',
      role: 'user',
      settings: '{}',
      created_at: 1,
      updated_at: 1,
    }, {
      id: 'u1',
      email: 'user@example.com',
      name: 'User',
      role: 'user',
      settings: '{}',
      created_at: 1,
      updated_at: 1,
    }];

    const res = await authRouter(
      makeReq('/api/auth/refresh', 'POST', { refresh_token: 'valid' }),
      env,
      {},
      null,
      '/api/auth/refresh'
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.access_token).toBe('jwt-token');
    expect(body.refresh_token).toBe('refresh-token');
  });

  it('returns 401 on invalid refresh token', async () => {
    const env = { DB: {}, JWT_SECRET: 'secret' };
    mocks.consumeRefreshToken.mockResolvedValueOnce(null);

    const res = await authRouter(
      makeReq('/api/auth/refresh', 'POST', { refresh_token: 'bad' }),
      env,
      {},
      null,
      '/api/auth/refresh'
    );

    expect(res.status).toBe(401);
    await expect(res.json()).resolves.toMatchObject({ error: 'Invalid refresh token' });
  });

  it('returns ok on logout and revokes provided refresh token', async () => {
    const env = { DB: {}, JWT_SECRET: 'secret' };

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
    await expect(res.json()).resolves.toMatchObject({ error: 'JWT_SECRET is not configured' });
  });
});
