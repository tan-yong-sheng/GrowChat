import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  db: {
    all: vi.fn(),
    first: vi.fn(),
    run: vi.fn(),
  },
  authorize: vi.fn(),
  logAuditEvent: vi.fn(),
}));

vi.mock('../db.js', () => ({
  createDB: () => mocks.db,
}));

vi.mock('../utils/authorize.js', () => ({
  authorize: (...args) => mocks.authorize(...args),
  logAuditEvent: (...args) => mocks.logAuditEvent(...args),
}));

import { rbacRouter } from './rbac.js';

function makeReq(path, method, body) {
  const init = { method, headers: {} };
  if (body !== undefined) {
    init.body = JSON.stringify(body);
    init.headers['Content-Type'] = 'application/json';
  }
  return new Request(`https://example.com${path}`, init);
}

describe('rbacRouter', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.authorize.mockResolvedValue({ allow: true });
    mocks.logAuditEvent.mockResolvedValue(undefined);
    mocks.db.run.mockResolvedValue({ success: true });
    mocks.db.first.mockImplementation(async (sql) => {
      const query = String(sql || '');
      if (query.includes('SELECT * FROM roles WHERE id = ?')) {
        return {
          id: 'custom-1',
          name: 'Custom 1',
          system: 0,
        };
      }
      return null;
    });
  });

  it('returns roles with their permission keys', async () => {
    mocks.db.all.mockResolvedValue([
      { id: 'admin', name: 'Admin', system: 1, created_at: 1, permission_key: 'chat.read' },
      { id: 'admin', name: 'Admin', system: 1, created_at: 1, permission_key: 'chat.write' },
      { id: 'custom-1', name: 'Custom 1', system: 0, created_at: 2, permission_key: null },
    ]);

    const res = await rbacRouter(
      makeReq('/api/admin/rbac/roles', 'GET'),
      { DB: {} },
      {},
      { sub: 'u1' },
      '/api/admin/rbac/roles',
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.roles).toEqual([
      {
        id: 'admin',
        name: 'Admin',
        system: true,
        created_at: 1,
        permissions: ['chat.read', 'chat.write'],
      },
      {
        id: 'custom-1',
        name: 'Custom 1',
        system: false,
        created_at: 2,
        permissions: [],
      },
    ]);
  });

  it('creates a custom role with persisted permission bindings', async () => {
    mocks.db.all.mockImplementation(async (sql, params = []) => {
      const query = String(sql || '');
      if (query.includes('FROM permissions') && query.includes('WHERE key IN')) {
        return params.map((key, index) => ({
          id: `p-${index + 1}`,
          key,
        }));
      }
      if (query.includes('FROM roles r')) {
        return [];
      }
      return [];
    });

    const res = await rbacRouter(
      makeReq('/api/admin/rbac/roles', 'POST', {
        name: 'Support',
        permissions: ['chat.read', 'chat.write'],
      }),
      { DB: {} },
      {},
      { sub: 'u1' },
      '/api/admin/rbac/roles',
    );

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.role).toMatchObject({
      name: 'Support',
      system: false,
      permissions: ['chat.read', 'chat.write'],
    });
    expect(mocks.db.run.mock.calls.some(([sql]) => String(sql).includes('INSERT INTO roles'))).toBe(true);
    expect(mocks.db.run.mock.calls.some(([sql]) => String(sql).includes('INSERT INTO role_permissions'))).toBe(true);
    expect(mocks.logAuditEvent).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      action: 'role_created',
      resource_type: 'role',
    }));
  });

  it('replaces role permissions on update', async () => {
    const permissionRows = {
      'chat.write': { id: 'p-2', key: 'chat.write' },
      'model.use': { id: 'p-3', key: 'model.use' },
    };

    mocks.db.first.mockImplementation(async (sql) => {
      const query = String(sql || '');
      if (query.includes('SELECT * FROM roles WHERE id = ?')) {
        return {
          id: 'custom-1',
          name: 'Old Name',
          system: 0,
        };
      }
      return null;
    });

    mocks.db.all.mockImplementation(async (sql, params = []) => {
      const query = String(sql || '');
      if (query.includes('FROM permissions') && query.includes('WHERE key IN')) {
        return params.map((key) => permissionRows[key]).filter(Boolean);
      }
      if (query.includes('FROM role_permissions') && query.includes('permissions p')) {
        return [{ key: 'chat.read' }];
      }
      return [];
    });

    const res = await rbacRouter(
      makeReq('/api/admin/rbac/roles/custom-1', 'PUT', {
        name: 'New Name',
        permissions: ['chat.write', 'model.use'],
      }),
      { DB: {} },
      {},
      { sub: 'u1' },
      '/api/admin/rbac/roles/custom-1',
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.role).toMatchObject({
      id: 'custom-1',
      name: 'New Name',
      permissions: ['chat.write', 'model.use'],
    });
    expect(mocks.db.run.mock.calls.some(([sql]) => String(sql).includes('DELETE FROM role_permissions'))).toBe(true);
    expect(mocks.db.run.mock.calls.filter(([sql]) => String(sql).includes('INSERT INTO role_permissions')).length).toBe(2);
  });
});
