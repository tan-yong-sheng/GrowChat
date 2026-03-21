import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  db: {
    first: vi.fn(),
    run: vi.fn(),
    all: vi.fn(),
    batch: vi.fn(),
    prepare: vi.fn(),
  },
  authorize: vi.fn(),
  logAuditEvent: vi.fn(),
  resolvePermissions: vi.fn(),
  getUserRoles: vi.fn(),
  getConfigValue: vi.fn(),
  hashPassword: vi.fn(),
  isLastOwnerOfRole: vi.fn(),
}));

vi.mock('../db.js', () => ({
  createDB: () => mocks.db,
}));

vi.mock('../utils/authorize.js', () => ({
  authorize: (...args) => mocks.authorize(...args),
  logAuditEvent: (...args) => mocks.logAuditEvent(...args),
  isLastOwnerOfRole: (...args) => mocks.isLastOwnerOfRole(...args),
  resolvePermissions: (...args) => mocks.resolvePermissions(...args),
  getUserRoles: (...args) => mocks.getUserRoles(...args),
}));

vi.mock('../utils/app-config.js', () => ({
  getConfigValue: (...args) => mocks.getConfigValue(...args),
}));

vi.mock('../shared/auth.js', () => ({
  hashPassword: (...args) => mocks.hashPassword(...args),
}));

import { usersRouter } from './users.js';

function makeReq(path, method, body, headers = {}) {
  const init = { method, headers: { ...headers } };
  if (body !== undefined) {
    init.body = typeof body === 'string' ? body : JSON.stringify(body);
    init.headers['Content-Type'] = 'application/json';
  }
  return new Request(`https://example.com${path}`, init);
}

describe('usersRouter', () => {
  const user = { sub: 'u1', role: 'user', email: 'user@example.com' };
  const env = { DB: {} };

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.db.first.mockResolvedValue(null);
    mocks.db.run.mockResolvedValue({ success: true });
    mocks.db.all.mockResolvedValue([]);
    mocks.db.batch.mockResolvedValue([]);
    mocks.db.prepare.mockReturnValue({
      bind: () => ({
        first: vi.fn(),
        run: vi.fn(),
        all: vi.fn().mockResolvedValue({ results: [] }),
      }),
    });
    mocks.authorize.mockResolvedValue({ allow: true });
    mocks.logAuditEvent.mockResolvedValue(undefined);
    mocks.resolvePermissions.mockResolvedValue(['chat.read']);
    mocks.getUserRoles.mockResolvedValue([{ role_name: 'user' }]);
    mocks.getConfigValue.mockResolvedValue('gpt-5-mini');
    mocks.hashPassword.mockResolvedValue('hashed');
    mocks.isLastOwnerOfRole.mockResolvedValue(false);
  });

  it('returns the current user profile with app config', async () => {
    mocks.db.first.mockResolvedValueOnce({
      id: 'u1',
      email: 'user@example.com',
      name: 'User',
      role: 'user',
      settings: '{"theme":"dark"}',
      avatar: 'https://example.com/avatar.png',
      avatar_emoji: '🙂',
      status: 'online',
      preferences: '{"compact":true}',
      created_at: 10,
      updated_at: 20,
      last_active_at: null,
    });

    const res = await usersRouter(
      makeReq('/api/users/me', 'GET'),
      env,
      {},
      user,
      '/api/users/me'
    );

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({
      user: {
        id: 'u1',
        email: 'user@example.com',
        name: 'User',
        role: 'user',
        settings: { theme: 'dark' },
        avatar: 'https://example.com/avatar.png',
        avatar_emoji: '🙂',
        status: 'online',
        preferences: { compact: true },
        created_at: 10,
        last_active_at: null,
        updated_at: 20,
      },
      app_config: {
        default_model_id: 'gpt-5-mini',
      },
    });
  });

  it('includes permissions and roles when requested', async () => {
    mocks.db.first.mockResolvedValueOnce({
      id: 'u1',
      email: 'user@example.com',
      name: 'User',
      role: 'user',
      settings: '{}',
      preferences: '{}',
      created_at: 10,
      updated_at: 20,
      last_active_at: 30,
    });

    const res = await usersRouter(
      makeReq('/api/users/me?include=permissions,roles', 'GET'),
      env,
      {},
      user,
      '/api/users/me'
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.permissions).toEqual(['chat.read']);
    expect(body.roles).toEqual([{ role_name: 'user' }]);
    expect(mocks.resolvePermissions).toHaveBeenCalledWith(env, user);
    expect(mocks.getUserRoles).toHaveBeenCalledWith(env, user.sub);
  });

  it('updates the current user profile with PUT /api/users/me', async () => {
    mocks.db.first.mockResolvedValueOnce({
      id: 'u1',
      email: 'user@example.com',
      name: 'Updated User',
      role: 'user',
      settings: '{"theme":"light"}',
      avatar: 'https://example.com/new-avatar.png',
      avatar_emoji: '🚀',
      status: 'away',
      preferences: '{"compact":false}',
      created_at: 10,
      updated_at: 21,
    });

    const res = await usersRouter(
      makeReq('/api/users/me', 'PUT', {
        name: ' Updated User ',
        avatar: 'https://example.com/new-avatar.png',
        avatar_emoji: '🚀',
        status: 'away',
        settings: { theme: 'light' },
        preferences: { compact: false },
      }),
      env,
      {},
      user,
      '/api/users/me'
    );

    expect(res.status).toBe(200);
    expect(mocks.db.run).toHaveBeenCalledWith(
      'UPDATE users SET name = ?, avatar = ?, avatar_emoji = ?, status = ?, settings = ?, preferences = ?, updated_at = unixepoch() WHERE id = ?',
      [
        'Updated User',
        'https://example.com/new-avatar.png',
        '🚀',
        'away',
        JSON.stringify({ theme: 'light' }),
        JSON.stringify({ compact: false }),
        'u1',
      ]
    );
    await expect(res.json()).resolves.toMatchObject({
      user: {
        name: 'Updated User',
        avatar: 'https://example.com/new-avatar.png',
        avatar_emoji: '🚀',
        status: 'away',
        settings: { theme: 'light' },
        preferences: { compact: false },
      },
    });
  });

  it('updates the current user profile with POST /api/users/me/update', async () => {
    mocks.db.first.mockResolvedValueOnce({
      id: 'u1',
      email: 'user@example.com',
      name: 'Updated User',
      role: 'user',
      settings: '{}',
      avatar: null,
      avatar_emoji: '🙂',
      status: 'offline',
      preferences: '{"compact":true}',
      created_at: 10,
      updated_at: 21,
    });

    const res = await usersRouter(
      makeReq('/api/users/me/update', 'POST', {
        name: 'Updated User',
        avatar: null,
        avatar_emoji: '🙂',
        status: 'offline',
        preferences: { compact: true },
      }),
      env,
      {},
      user,
      '/api/users/me/update'
    );

    expect(res.status).toBe(200);
    expect(mocks.db.run).toHaveBeenCalledWith(
      'UPDATE users SET name = ?, avatar = ?, avatar_emoji = ?, status = ?, preferences = ?, updated_at = unixepoch() WHERE id = ?',
      [
        'Updated User',
        null,
        '🙂',
        'offline',
        JSON.stringify({ compact: true }),
        'u1',
      ]
    );
    await expect(res.json()).resolves.toMatchObject({
      user: {
        name: 'Updated User',
        avatar: null,
        avatar_emoji: '🙂',
        status: 'offline',
        preferences: { compact: true },
      },
    });
  });

  it('rejects invalid status values on profile update', async () => {
    const res = await usersRouter(
      makeReq('/api/users/me', 'PUT', { status: 'busy' }),
      env,
      {},
      user,
      '/api/users/me'
    );

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toMatchObject({
      error: 'Status must be one of: online, away, offline',
    });
    expect(mocks.db.run).not.toHaveBeenCalled();
  });

  it('rejects invalid preferences payloads on POST /api/users/me/update', async () => {
    const res = await usersRouter(
      makeReq('/api/users/me/update', 'POST', { preferences: [] }),
      env,
      {},
      user,
      '/api/users/me/update'
    );

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toMatchObject({
      error: 'preferences must be an object',
    });
    expect(mocks.db.run).not.toHaveBeenCalled();
  });
});
