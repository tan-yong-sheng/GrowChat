import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  db: {
    first: vi.fn(),
    run: vi.fn(),
    all: vi.fn(),
    batch: vi.fn(),
    prepare: vi.fn((sql) => ({ sql })),
  },
  authorize: vi.fn(),
  logAuditEvent: vi.fn(),
  getConfigValue: vi.fn(),
  setConfigValue: vi.fn(),
}));

vi.mock('../db.js', () => ({
  createDB: () => mocks.db,
}));

vi.mock('../utils/authorize.js', () => ({
  authorize: (...args) => mocks.authorize(...args),
  logAuditEvent: (...args) => mocks.logAuditEvent(...args),
}));

vi.mock('../utils/app-config.js', () => ({
  getConfigValue: (...args) => mocks.getConfigValue(...args),
  setConfigValue: (...args) => mocks.setConfigValue(...args),
}));

import { groupsRouter } from './groups.js';

function makeReq(path, method, body) {
  const init = { method, headers: {} };
  if (body !== undefined) {
    init.body = typeof body === 'string' ? body : JSON.stringify(body);
    init.headers['Content-Type'] = 'application/json';
  }
  return new Request(`https://example.com${path}`, init);
}

describe('groupsRouter', () => {
  const user = { sub: 'u1', role: 'admin', email: 'admin@example.com' };
  const env = { DB: {} };

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.authorize.mockResolvedValue({ allow: true });
    mocks.db.first.mockResolvedValue(null);
    mocks.db.run.mockResolvedValue({ success: true });
    mocks.db.all.mockResolvedValue([]);
    mocks.db.batch.mockResolvedValue([]);
    mocks.logAuditEvent.mockResolvedValue(undefined);
    mocks.getConfigValue.mockResolvedValue(null);
    mocks.setConfigValue.mockResolvedValue(undefined);
  });

  it('rejects unauthorized access to groups', async () => {
    mocks.authorize.mockResolvedValue({ allow: false, reason: 'forbidden' });

    const res = await groupsRouter(
      makeReq('/api/admin/groups', 'GET'),
      env,
      {},
      user,
      '/api/admin/groups'
    );

    expect(res.status).toBe(403);
  });

  it('lists groups with member counts', async () => {
    mocks.db.all
      .mockResolvedValueOnce([
        {
          id: 'g1',
          name: 'Support',
          description: 'Help desk',
          is_system: 0,
          created_at: 10,
          updated_at: 20,
        },
      ])
      .mockResolvedValueOnce([{ group_id: 'g1', member_count: 2 }]);

    const res = await groupsRouter(
      makeReq('/api/admin/groups', 'GET'),
      env,
      {},
      user,
      '/api/admin/groups'
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.groups).toHaveLength(1);
    expect(body.groups[0].member_count).toBe(2);
    expect(body.groups[0].permissions).toBeUndefined();
  });

  it('creates a group', async () => {
    const res = await groupsRouter(
      makeReq('/api/admin/groups', 'POST', {
        name: 'Team Alpha',
        description: 'Core team',
      }),
      env,
      {},
      user,
      '/api/admin/groups'
    );

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.group.name).toBe('Team Alpha');
    expect(mocks.db.batch).toHaveBeenCalledTimes(1);
    expect(mocks.db.run).not.toHaveBeenCalled();
  });

  it('creates a group with members in one write path', async () => {
    const res = await groupsRouter(
      makeReq('/api/admin/groups', 'POST', {
        name: 'Team Alpha',
        description: 'Core team',
        member_ids: ['u2', 'u3'],
      }),
      env,
      {},
      user,
      '/api/admin/groups'
    );

    expect(res.status).toBe(201);
    expect(mocks.db.batch).toHaveBeenCalledTimes(1);
    expect(mocks.db.run).not.toHaveBeenCalled();
    const statements = mocks.db.batch.mock.calls[0][0];
    expect(statements).toHaveLength(3);
  });

  it('updates a group without permissions', async () => {
    mocks.db.first.mockResolvedValueOnce({
      id: 'g1',
      name: 'Team Alpha',
      description: null,
      is_system: 0,
    });

    const res = await groupsRouter(
      makeReq('/api/admin/groups/g1', 'PUT', {
        name: 'Team Alpha',
      }),
      env,
      {},
      user,
      '/api/admin/groups/g1'
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.group.name).toBe('Team Alpha');
    expect(body.permissions).toBeUndefined();
    expect(mocks.db.batch).toHaveBeenCalledTimes(1);
    expect(mocks.db.run).not.toHaveBeenCalled();
  });

  it('updates a group and replaces members in one write path when member_ids are provided', async () => {
    mocks.db.first
      .mockResolvedValueOnce({
        id: 'g1',
        name: 'Team Alpha',
        description: null,
        is_system: 0,
      })
      .mockResolvedValueOnce([{ user_id: 'u1' }]);

    const res = await groupsRouter(
      makeReq('/api/admin/groups/g1', 'PUT', {
        name: 'Team Alpha',
        member_ids: ['u2', 'u3'],
      }),
      env,
      {},
      user,
      '/api/admin/groups/g1'
    );

    expect(res.status).toBe(200);
    expect(mocks.db.batch).toHaveBeenCalledTimes(1);
    expect(mocks.db.run).not.toHaveBeenCalled();
    const statements = mocks.db.batch.mock.calls[0][0];
    expect(statements.length).toBeGreaterThan(1);
  });

  it('rejects group creation without name', async () => {
    const res = await groupsRouter(
      makeReq('/api/admin/groups', 'POST', { name: ' ' }),
      env,
      {},
      user,
      '/api/admin/groups'
    );

    expect(res.status).toBe(400);
  });

  it('adds group members', async () => {
    mocks.db.first.mockResolvedValueOnce({ id: 'g1' });

    const res = await groupsRouter(
      makeReq('/api/admin/groups/g1/users', 'POST', { user_id: 'u2' }),
      env,
      {},
      user,
      '/api/admin/groups/g1/users'
    );

    expect(res.status).toBe(201);
    await expect(res.json()).resolves.toEqual({ group_id: 'g1', user_ids: ['u2'] });
  });

  it('removes group members', async () => {
    mocks.db.first.mockResolvedValueOnce({ id: 'g1' });

    const res = await groupsRouter(
      makeReq('/api/admin/groups/g1/users', 'DELETE', { user_id: 'u2' }),
      env,
      {},
      user,
      '/api/admin/groups/g1/users'
    );

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ group_id: 'g1', user_ids: ['u2'] });
  });

  it('rejects member updates without user_id', async () => {
    const res = await groupsRouter(
      makeReq('/api/admin/groups/g1/users', 'POST', {}),
      env,
      {},
      user,
      '/api/admin/groups/g1/users'
    );

    expect(res.status).toBe(400);
  });

  it('returns null for non-group paths', async () => {
    const res = await groupsRouter(
      makeReq('/api/admin/other', 'GET'),
      env,
      {},
      user,
      '/api/admin/other'
    );
    expect(res).toBeNull();
  });

  it('returns 404 when group not found on GET', async () => {
    mocks.db.first.mockResolvedValueOnce(null);

    const res = await groupsRouter(
      makeReq('/api/admin/groups/missing', 'GET'),
      env,
      {},
      user,
      '/api/admin/groups/missing'
    );
    expect(res.status).toBe(404);
  });

  it('returns 404 when group not found on PUT', async () => {
    mocks.db.first.mockResolvedValueOnce(null);

    const res = await groupsRouter(
      makeReq('/api/admin/groups/missing', 'PUT', { name: 'Updated' }),
      env,
      {},
      user,
      '/api/admin/groups/missing'
    );
    expect(res.status).toBe(404);
  });

  it('returns 403 when trying to modify system group', async () => {
    mocks.db.first.mockResolvedValueOnce({ id: 'g1', name: 'Admin', is_system: 1 });

    const res = await groupsRouter(
      makeReq('/api/admin/groups/g1', 'PUT', { name: 'Updated' }),
      env,
      {},
      user,
      '/api/admin/groups/g1'
    );
    expect(res.status).toBe(403);
  });

  it('returns 403 when trying to delete system group', async () => {
    mocks.db.first.mockResolvedValueOnce({ id: 'g1', name: 'Admin', is_system: 1 });

    const res = await groupsRouter(
      makeReq('/api/admin/groups/g1', 'DELETE'),
      env,
      {},
      user,
      '/api/admin/groups/g1'
    );
    expect(res.status).toBe(403);
  });

  it('rejects group creation with name too long', async () => {
    const res = await groupsRouter(
      makeReq('/api/admin/groups', 'POST', { name: 'a'.repeat(101) }),
      env,
      {},
      user,
      '/api/admin/groups'
    );
    expect(res.status).toBe(400);
  });

  it('rejects group creation with description too long', async () => {
    const res = await groupsRouter(
      makeReq('/api/admin/groups', 'POST', { name: 'Test', description: 'a'.repeat(501) }),
      env,
      {},
      user,
      '/api/admin/groups'
    );
    expect(res.status).toBe(400);
  });

  it('rejects group update with name too long', async () => {
    mocks.db.first.mockResolvedValueOnce({
      id: 'g1',
      name: 'Test',
      description: null,
      is_system: 0,
    });

    const res = await groupsRouter(
      makeReq('/api/admin/groups/g1', 'PUT', { name: 'a'.repeat(101) }),
      env,
      {},
      user,
      '/api/admin/groups/g1'
    );
    expect(res.status).toBe(400);
  });

  it('rejects group update with description too long', async () => {
    mocks.db.first.mockResolvedValueOnce({
      id: 'g1',
      name: 'Test',
      description: null,
      is_system: 0,
    });

    const res = await groupsRouter(
      makeReq('/api/admin/groups/g1', 'PUT', { name: 'Test', description: 'a'.repeat(501) }),
      env,
      {},
      user,
      '/api/admin/groups/g1'
    );
    expect(res.status).toBe(400);
  });

  it('rejects duplicate group name on create', async () => {
    mocks.db.first.mockResolvedValueOnce({ id: 'existing' });

    const res = await groupsRouter(
      makeReq('/api/admin/groups', 'POST', { name: 'Existing Group' }),
      env,
      {},
      user,
      '/api/admin/groups'
    );
    expect(res.status).toBe(409);
  });

  it('returns 404 when deleting nonexistent group', async () => {
    mocks.db.first.mockResolvedValueOnce(null);

    const res = await groupsRouter(
      makeReq('/api/admin/groups/missing', 'DELETE'),
      env,
      {},
      user,
      '/api/admin/groups/missing'
    );
    expect(res.status).toBe(404);
  });

  it('returns 404 when adding member to nonexistent group', async () => {
    mocks.db.first.mockResolvedValueOnce(null);

    const res = await groupsRouter(
      makeReq('/api/admin/groups/missing/users', 'POST', { user_id: 'u2' }),
      env,
      {},
      user,
      '/api/admin/groups/missing/users'
    );
    expect(res.status).toBe(404);
  });

  it('returns 404 when removing member from nonexistent group', async () => {
    mocks.db.first.mockResolvedValueOnce(null);

    const res = await groupsRouter(
      makeReq('/api/admin/groups/missing/users', 'DELETE', { user_id: 'u2' }),
      env,
      {},
      user,
      '/api/admin/groups/missing/users'
    );
    expect(res.status).toBe(404);
  });

  it('returns 500 on list groups error', async () => {
    mocks.db.all.mockRejectedValueOnce(new Error('DB error'));

    const res = await groupsRouter(
      makeReq('/api/admin/groups', 'GET'),
      env,
      {},
      user,
      '/api/admin/groups'
    );
    expect(res.status).toBe(500);
  });

  it('returns 500 on create group error', async () => {
    mocks.db.batch.mockRejectedValueOnce(new Error('DB error'));

    const res = await groupsRouter(
      makeReq('/api/admin/groups', 'POST', { name: 'Test' }),
      env,
      {},
      user,
      '/api/admin/groups'
    );
    expect(res.status).toBe(500);
  });

  it('returns 403 for non-read methods without admin.user.write', async () => {
    // First authorize call checks read permission, second checks write
    mocks.authorize.mockImplementation(async (_env, _user, options = {}) => {
      if (options.action === 'admin.user.write') return { allow: false, reason: 'no_write' };
      return { allow: true };
    });

    const res = await groupsRouter(
      makeReq('/api/admin/groups', 'POST', { name: 'Test' }),
      env,
      {},
      user,
      '/api/admin/groups'
    );
    expect(res.status).toBe(403);
  });
});
