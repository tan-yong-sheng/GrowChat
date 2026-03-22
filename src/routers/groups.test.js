import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  db: {
    first: vi.fn(),
    run: vi.fn(),
    all: vi.fn(),
    batch: vi.fn(),
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

  it('lists groups with member counts and permissions', async () => {
    mocks.db.all
      .mockResolvedValueOnce([
        {
          id: 'g1',
          name: 'Support',
          description: 'Help desk',
          share_policy: 'members',
          is_system: 0,
          created_at: 10,
          updated_at: 20,
        },
      ])
      .mockResolvedValueOnce([{ group_id: 'g1', member_count: 2 }])
      .mockResolvedValueOnce([{ group_id: 'g1', key: 'chat.read' }]);

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
    expect(body.groups[0].permissions).toEqual(['chat.read']);
  });

  it('creates a group with permissions', async () => {
    mocks.db.all.mockResolvedValueOnce([
      { id: 'perm-chat-read', key: 'chat.read' },
      { id: 'perm-chat-write', key: 'chat.write' },
    ]);

    const res = await groupsRouter(
      makeReq('/api/admin/groups', 'POST', {
        name: 'Team Alpha',
        description: 'Core team',
        share_policy: 'members',
        permissions: ['chat.read', 'chat.write'],
      }),
      env,
      {},
      user,
      '/api/admin/groups'
    );

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.group.name).toBe('Team Alpha');
    expect(body.permissions).toEqual(['chat.read', 'chat.write']);
    expect(mocks.db.run).toHaveBeenCalled();
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

  it('returns default group permissions from config', async () => {
    mocks.getConfigValue.mockResolvedValue('["chat.read"]');

    const res = await groupsRouter(
      makeReq('/api/admin/groups/default-permissions', 'GET'),
      env,
      {},
      user,
      '/api/admin/groups/default-permissions'
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.permissions).toEqual(['chat.read']);
  });

  it('updates default group permissions', async () => {
    mocks.db.all.mockResolvedValueOnce([
      { id: 'perm-chat-read', key: 'chat.read' },
      { id: 'perm-chat-write', key: 'chat.write' },
    ]);

    const res = await groupsRouter(
      makeReq('/api/admin/groups/default-permissions', 'PUT', {
        permissions: ['chat.read', 'chat.write'],
      }),
      env,
      {},
      user,
      '/api/admin/groups/default-permissions'
    );

    expect(res.status).toBe(200);
    expect(mocks.setConfigValue).toHaveBeenCalled();
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

  it('returns model access for a group', async () => {
    mocks.db.first.mockResolvedValueOnce({ id: 'g1' });
    mocks.db.all.mockResolvedValueOnce([
      { model_id: 'gpt-5-mini' },
      { model_id: '@cf/meta/llama-3.1-8b-instruct' },
    ]);

    const res = await groupsRouter(
      makeReq('/api/admin/groups/g1/models', 'GET'),
      env,
      {},
      user,
      '/api/admin/groups/g1/models'
    );

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({
      group_id: 'g1',
      model_ids: ['gpt-5-mini', '@cf/meta/llama-3.1-8b-instruct'],
    });
    expect(mocks.db.run).toHaveBeenCalledWith(
      expect.stringContaining('CREATE TABLE IF NOT EXISTS group_model_access')
    );
  });

  it('updates model access for a group', async () => {
    mocks.db.first.mockResolvedValueOnce({ id: 'g1' });

    const res = await groupsRouter(
      makeReq('/api/admin/groups/g1/models', 'PUT', {
        model_ids: ['gpt-5-mini'],
      }),
      env,
      {},
      user,
      '/api/admin/groups/g1/models'
    );

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({
      group_id: 'g1',
      model_ids: ['gpt-5-mini'],
    });
    expect(mocks.db.run).toHaveBeenCalledWith(
      expect.stringContaining('CREATE TABLE IF NOT EXISTS group_model_access')
    );
    expect(mocks.db.run).toHaveBeenCalled();
    expect(mocks.logAuditEvent).toHaveBeenCalled();
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
});
