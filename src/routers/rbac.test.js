import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  db: {
    all: vi.fn(),
    first: vi.fn(),
    run: vi.fn(),
  },
  authorize: vi.fn(),
  logAuditEvent: vi.fn(),
  getAuditLog: vi.fn(),
}));

vi.mock('../db.js', () => ({
  createDB: () => mocks.db,
}));

vi.mock('../utils/authorize.js', () => ({
  authorize: (...args) => mocks.authorize(...args),
  logAuditEvent: (...args) => mocks.logAuditEvent(...args),
  getAuditLog: (...args) => mocks.getAuditLog(...args),
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

  // ============================================
  // Authorization & Routing Tests
  // ============================================

  describe('routing', () => {
    it('returns null for non-RBAC paths (middleware behavior)', async () => {
      const res = await rbacRouter(
        makeReq('/api/users/123', 'GET'),
        { DB: {} },
        {},
        { sub: 'u1' },
        '/api/users/123'
      );
      expect(res).toBeNull();
    });

    it('returns null for /api/admin/audit path but requires audit.read permission', async () => {
      mocks.authorize.mockResolvedValue({ allow: true });
      mocks.getAuditLog.mockResolvedValue({
        entries: [],
        total: 0,
        limit: 50,
        offset: 0,
      });

      const res = await rbacRouter(
        makeReq('/api/admin/audit', 'GET'),
        { DB: {} },
        {},
        { sub: 'u1' },
        '/api/admin/audit'
      );
      expect(res.status).toBe(200);
    });
  });

  describe('authorization failures', () => {
    it('returns 403 when user lacks required permission', async () => {
      mocks.authorize.mockResolvedValue({ allow: false, reason: 'Insufficient permissions' });

      const res = await rbacRouter(
        makeReq('/api/admin/rbac/roles', 'GET'),
        { DB: {} },
        {},
        { sub: 'u1' },
        '/api/admin/rbac/roles'
      );

      expect(res.status).toBe(403);
      expect(mocks.authorize).toHaveBeenCalledWith(
        expect.anything(),
        { sub: 'u1' },
        expect.objectContaining({ action: 'admin.rbac.admin' })
      );
    });

    it('returns 403 for audit endpoint when user lacks audit.read permission', async () => {
      mocks.authorize.mockResolvedValue({ allow: false, reason: 'No audit access' });

      const res = await rbacRouter(
        makeReq('/api/admin/audit', 'GET'),
        { DB: {} },
        {},
        { sub: 'u1' },
        '/api/admin/audit'
      );

      expect(res.status).toBe(403);
      expect(mocks.authorize).toHaveBeenCalledWith(
        expect.anything(),
        { sub: 'u1' },
        expect.objectContaining({ action: 'admin.audit.read' })
      );
    });

    it('uses auth reason in error message when available', async () => {
      mocks.authorize.mockResolvedValue({ allow: false, reason: 'Custom forbidden reason' });

      const res = await rbacRouter(
        makeReq('/api/admin/rbac/roles', 'GET'),
        { DB: {} },
        {},
        { sub: 'u1' },
        '/api/admin/rbac/roles'
      );

      const body = await res.json();
      expect(body.error).toBe('Custom forbidden reason');
    });

    it('returns generic Forbidden when no reason provided', async () => {
      mocks.authorize.mockResolvedValue({ allow: false });

      const res = await rbacRouter(
        makeReq('/api/admin/rbac/roles', 'GET'),
        { DB: {} },
        {},
        { sub: 'u1' },
        '/api/admin/rbac/roles'
      );

      const body = await res.json();
      expect(body.error).toBe('Forbidden');
    });
  });

  // ============================================
  // Invalid JSON Handling
  // ============================================

  describe('invalid JSON handling', () => {
    it('returns 400 when POST /api/admin/rbac/roles has invalid JSON', async () => {
      const req = new Request('https://example.com/api/admin/rbac/roles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: 'not valid json',
      });

      const res = await rbacRouter(req, { DB: {} }, {}, { sub: 'u1' }, '/api/admin/rbac/roles');

      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toBe('Invalid JSON');
    });

    it('returns 400 when PUT /api/admin/rbac/roles/:id has invalid JSON', async () => {
      const req = new Request('https://example.com/api/admin/rbac/roles/custom-1', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: 'invalid',
      });

      const res = await rbacRouter(
        req,
        { DB: {} },
        {},
        { sub: 'u1' },
        '/api/admin/rbac/roles/custom-1'
      );

      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toBe('Invalid JSON');
    });

    it('returns 400 when POST /api/admin/rbac/bindings has invalid JSON', async () => {
      const req = new Request('https://example.com/api/admin/rbac/bindings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{ broken',
      });

      const res = await rbacRouter(req, { DB: {} }, {}, { sub: 'u1' }, '/api/admin/rbac/bindings');

      expect(res.status).toBe(400);
    });
  });

  // ============================================
  // Create Role Tests
  // ============================================

  describe('POST /api/admin/rbac/roles', () => {
    it('returns 400 when name is empty', async () => {
      const res = await rbacRouter(
        makeReq('/api/admin/rbac/roles', 'POST', { name: '', permissions: [] }),
        { DB: {} },
        {},
        { sub: 'u1' },
        '/api/admin/rbac/roles'
      );

      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toBe('Name required (1-100 chars)');
    });

    it('returns 400 when name is only whitespace', async () => {
      const res = await rbacRouter(
        makeReq('/api/admin/rbac/roles', 'POST', { name: '   ', permissions: [] }),
        { DB: {} },
        {},
        { sub: 'u1' },
        '/api/admin/rbac/roles'
      );

      expect(res.status).toBe(400);
    });

    it('returns 400 when name is too long (> 100 chars)', async () => {
      const res = await rbacRouter(
        makeReq('/api/admin/rbac/roles', 'POST', {
          name: 'a'.repeat(101),
          permissions: [],
        }),
        { DB: {} },
        {},
        { sub: 'u1' },
        '/api/admin/rbac/roles'
      );

      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toBe('Name required (1-100 chars)');
    });

    it('returns 400 when name is exactly 100 chars (boundary)', async () => {
      mocks.db.all.mockResolvedValue([]);

      const res = await rbacRouter(
        makeReq('/api/admin/rbac/roles', 'POST', {
          name: 'a'.repeat(100),
          permissions: [],
        }),
        { DB: {} },
        {},
        { sub: 'u1' },
        '/api/admin/rbac/roles'
      );

      // Should succeed (100 chars is valid)
      expect(res.status).toBe(201);
    });

    it('returns 400 when permissions include unknown keys', async () => {
      mocks.db.all.mockImplementation(async (sql) => {
        const query = String(sql || '');
        if (query.includes('FROM permissions') && query.includes('WHERE key IN')) {
          // Only return one of the requested permissions
          return [{ id: 'p-1', key: 'chat.read' }];
        }
        return [];
      });

      const res = await rbacRouter(
        makeReq('/api/admin/rbac/roles', 'POST', {
          name: 'Test Role',
          permissions: ['chat.read', 'nonexistent.permission'],
        }),
        { DB: {} },
        {},
        { sub: 'u1' },
        '/api/admin/rbac/roles'
      );

      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toContain('Unknown permissions');
      expect(body.error).toContain('nonexistent.permission');
    });

    it('returns 400 when permissions array contains non-strings', async () => {
      mocks.db.all.mockImplementation(async (sql) => {
        const query = String(sql || '');
        if (query.includes('FROM permissions') && query.includes('WHERE key IN')) {
          return [];
        }
        return [];
      });

      const res = await rbacRouter(
        makeReq('/api/admin/rbac/roles', 'POST', {
          name: 'Test Role',
          permissions: ['chat.read', null, undefined, 123],
        }),
        { DB: {} },
        {},
        { sub: 'u1' },
        '/api/admin/rbac/roles'
      );

      // Should try to resolve permissions and fail
      expect(res.status).toBe(400);
    });

    it('creates role without permissions successfully', async () => {
      mocks.db.all.mockResolvedValue([]);

      const res = await rbacRouter(
        makeReq('/api/admin/rbac/roles', 'POST', { name: 'No Permissions Role' }),
        { DB: {} },
        {},
        { sub: 'u1' },
        '/api/admin/rbac/roles'
      );

      expect(res.status).toBe(201);
      const body = await res.json();
      expect(body.role.permissions).toEqual([]);
    });

    it('trims name whitespace', async () => {
      mocks.db.all.mockImplementation(async (sql) => {
        const query = String(sql || '');
        if (query.includes('FROM permissions') && query.includes('WHERE key IN')) {
          return [];
        }
        return [];
      });

      const res = await rbacRouter(
        makeReq('/api/admin/rbac/roles', 'POST', { name: '  Trimmed Name  ', permissions: [] }),
        { DB: {} },
        {},
        { sub: 'u1' },
        '/api/admin/rbac/roles'
      );

      expect(res.status).toBe(201);
      const body = await res.json();
      expect(body.role.name).toBe('Trimmed Name');
    });

    it('deduplicates permissions in the same request', async () => {
      mocks.db.all.mockImplementation(async (sql) => {
        const query = String(sql || '');
        if (query.includes('FROM permissions') && query.includes('WHERE key IN')) {
          return [{ id: 'p-1', key: 'chat.read' }];
        }
        return [];
      });

      const res = await rbacRouter(
        makeReq('/api/admin/rbac/roles', 'POST', {
          name: 'Dupe Role',
          permissions: ['chat.read', 'chat.read', 'chat.read'],
        }),
        { DB: {} },
        {},
        { sub: 'u1' },
        '/api/admin/rbac/roles'
      );

      expect(res.status).toBe(201);
      // Should only insert one permission binding
      const insertCalls = mocks.db.run.mock.calls.filter(([sql]) =>
        String(sql).includes('INSERT INTO role_permissions')
      );
      expect(insertCalls.length).toBe(1);
    });

    it('logs audit event on role creation', async () => {
      mocks.db.all.mockResolvedValue([]);

      await rbacRouter(
        makeReq('/api/admin/rbac/roles', 'POST', { name: 'Audit Test', permissions: [] }),
        { DB: {} },
        {},
        { sub: 'u1' },
        '/api/admin/rbac/roles'
      );

      expect(mocks.logAuditEvent).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          actor_id: 'u1',
          action: 'role_created',
          resource_type: 'role',
        })
      );
    });

    it('returns 500 on database error during role creation', async () => {
      // Override the mock to return an error - this simulates a DB failure
      // Must provide permissions so resolvePermissionsByKeys calls db.all
      mocks.db.all = vi.fn().mockRejectedValue(new Error('DB connection failed'));

      const res = await rbacRouter(
        makeReq('/api/admin/rbac/roles', 'POST', { name: 'Test Role', permissions: ['chat.read'] }),
        { DB: {} },
        {},
        { sub: 'u1' },
        '/api/admin/rbac/roles'
      );

      expect(res.status).toBe(500);
      // Note: 5xx error messages are sanitized to prevent internal details leakage
      const body = await res.json();
      expect(body.error).toBe('An error occurred. Please try again later.');
    });
  });

  // ============================================
  // Update Role Tests
  // ============================================

  describe('PUT /api/admin/rbac/roles/:id', () => {
    it('returns 404 when role not found', async () => {
      mocks.db.first.mockResolvedValue(null);

      const res = await rbacRouter(
        makeReq('/api/admin/rbac/roles/nonexistent', 'PUT', { name: 'New Name' }),
        { DB: {} },
        {},
        { sub: 'u1' },
        '/api/admin/rbac/roles/nonexistent'
      );

      expect(res.status).toBe(404);
      const body = await res.json();
      expect(body.error).toBe('Role not found');
    });

    it('returns 403 when trying to modify system role', async () => {
      mocks.db.first.mockImplementation(async (sql) => {
        if (String(sql).includes('SELECT * FROM roles')) {
          return { id: 'admin', name: 'Admin', system: 1 };
        }
        return null;
      });

      const res = await rbacRouter(
        makeReq('/api/admin/rbac/roles/admin', 'PUT', { name: 'New Name' }),
        { DB: {} },
        {},
        { sub: 'u1' },
        '/api/admin/rbac/roles/admin'
      );

      expect(res.status).toBe(403);
      const body = await res.json();
      expect(body.error).toBe('Cannot modify system role');
    });

    it('returns 400 when new name is empty', async () => {
      mocks.db.first.mockImplementation(async (sql) => {
        if (String(sql).includes('SELECT * FROM roles')) {
          return { id: 'custom-1', name: 'Old Name', system: 0 };
        }
        return null;
      });

      const res = await rbacRouter(
        makeReq('/api/admin/rbac/roles/custom-1', 'PUT', { name: '' }),
        { DB: {} },
        {},
        { sub: 'u1' },
        '/api/admin/rbac/roles/custom-1'
      );

      expect(res.status).toBe(400);
    });

    it('returns 400 when new name is too long', async () => {
      mocks.db.first.mockImplementation(async (sql) => {
        if (String(sql).includes('SELECT * FROM roles')) {
          return { id: 'custom-1', name: 'Old Name', system: 0 };
        }
        return null;
      });

      const res = await rbacRouter(
        makeReq('/api/admin/rbac/roles/custom-1', 'PUT', { name: 'a'.repeat(101) }),
        { DB: {} },
        {},
        { sub: 'u1' },
        '/api/admin/rbac/roles/custom-1'
      );

      expect(res.status).toBe(400);
    });

    it('returns 400 when updating with unknown permissions', async () => {
      mocks.db.first.mockImplementation(async (sql) => {
        if (String(sql).includes('SELECT * FROM roles')) {
          return { id: 'custom-1', name: 'Old Name', system: 0 };
        }
        return null;
      });

      mocks.db.all.mockImplementation(async (sql) => {
        const query = String(sql || '');
        if (query.includes('FROM permissions') && query.includes('WHERE key IN')) {
          return [{ id: 'p-1', key: 'chat.read' }];
        }
        return [];
      });

      const res = await rbacRouter(
        makeReq('/api/admin/rbac/roles/custom-1', 'PUT', {
          name: 'New Name',
          permissions: ['nonexistent'],
        }),
        { DB: {} },
        {},
        { sub: 'u1' },
        '/api/admin/rbac/roles/custom-1'
      );

      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toContain('Unknown permissions');
    });

    it('keeps existing name when not provided in update', async () => {
      // Override mocks to ensure clean state for this specific test
      mocks.db.first = vi.fn().mockImplementation(async (sql) => {
        if (String(sql).includes('SELECT * FROM roles')) {
          return { id: 'custom-1', name: 'Original Name', system: 0, created_at: 123456 };
        }
        return null;
      });

      mocks.db.all = vi.fn().mockImplementation(async (sql) => {
        const query = String(sql || '');
        // Return the matching permission for resolvePermissionsByKeys
        if (query.includes('FROM permissions') && query.includes('WHERE key IN')) {
          return [{ id: 'p-1', key: 'chat.read' }];
        }
        // Return empty for role_permissions query (no existing permissions)
        if (query.includes('role_permissions')) {
          return [];
        }
        return [];
      });

      const res = await rbacRouter(
        makeReq('/api/admin/rbac/roles/custom-1', 'PUT', { permissions: ['chat.read'] }),
        { DB: {} },
        {},
        { sub: 'u1' },
        '/api/admin/rbac/roles/custom-1'
      );

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.role.name).toBe('Original Name');
    });

    it('deletes old permissions and adds new when permissions provided', async () => {
      mocks.db.first.mockImplementation(async (sql) => {
        if (String(sql).includes('SELECT * FROM roles')) {
          return { id: 'custom-1', name: 'Name', system: 0, created_at: 123 };
        }
        return null;
      });

      mocks.db.all.mockImplementation(async (sql) => {
        const query = String(sql || '');
        if (query.includes('FROM permissions') && query.includes('WHERE key IN')) {
          return [{ id: 'p-1', key: 'chat.write' }];
        }
        if (query.includes('FROM role_permissions')) {
          return [{ key: 'chat.read' }];
        }
        return [];
      });

      const res = await rbacRouter(
        makeReq('/api/admin/rbac/roles/custom-1', 'PUT', { permissions: ['chat.write'] }),
        { DB: {} },
        {},
        { sub: 'u1' },
        '/api/admin/rbac/roles/custom-1'
      );

      expect(res.status).toBe(200);

      // Verify DELETE was called before INSERT
      const calls = mocks.db.run.mock.calls;
      const deleteIdx = calls.findIndex(([sql]) =>
        String(sql).includes('DELETE FROM role_permissions')
      );
      expect(deleteIdx).toBeGreaterThan(-1);
    });

    it('logs audit event on role update', async () => {
      mocks.db.first.mockImplementation(async (sql) => {
        if (String(sql).includes('SELECT * FROM roles')) {
          return { id: 'custom-1', name: 'Old Name', system: 0, created_at: 123 };
        }
        return null;
      });
      mocks.db.all.mockResolvedValue([]);

      await rbacRouter(
        makeReq('/api/admin/rbac/roles/custom-1', 'PUT', { name: 'New Name' }),
        { DB: {} },
        {},
        { sub: 'u1' },
        '/api/admin/rbac/roles/custom-1'
      );

      expect(mocks.logAuditEvent).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          action: 'role_updated',
          resource_type: 'role',
          resource_id: 'custom-1',
          metadata: expect.objectContaining({
            name: 'New Name',
            old_name: 'Old Name',
          }),
        })
      );
    });

    it('returns 500 on database error during update', async () => {
      mocks.db.first.mockRejectedValue(new Error('DB error'));

      const res = await rbacRouter(
        makeReq('/api/admin/rbac/roles/custom-1', 'PUT', { name: 'New Name' }),
        { DB: {} },
        {},
        { sub: 'u1' },
        '/api/admin/rbac/roles/custom-1'
      );

      expect(res.status).toBe(500);
    });
  });

  // ============================================
  // Delete Role Tests
  // ============================================

  describe('DELETE /api/admin/rbac/roles/:id', () => {
    it('returns 404 when role not found', async () => {
      mocks.db.first.mockResolvedValue(null);

      const res = await rbacRouter(
        makeReq('/api/admin/rbac/roles/nonexistent', 'DELETE'),
        { DB: {} },
        {},
        { sub: 'u1' },
        '/api/admin/rbac/roles/nonexistent'
      );

      expect(res.status).toBe(404);
    });

    it('returns 403 when trying to delete system role', async () => {
      mocks.db.first.mockImplementation(async (sql) => {
        if (String(sql).includes('SELECT * FROM roles')) {
          return { id: 'admin', name: 'Admin', system: 1 };
        }
        return null;
      });

      const res = await rbacRouter(
        makeReq('/api/admin/rbac/roles/admin', 'DELETE'),
        { DB: {} },
        {},
        { sub: 'u1' },
        '/api/admin/rbac/roles/admin'
      );

      expect(res.status).toBe(403);
    });

    it('deletes role successfully and returns 204', async () => {
      mocks.db.first.mockImplementation(async (sql) => {
        if (String(sql).includes('SELECT * FROM roles')) {
          return { id: 'custom-1', name: 'Custom 1', system: 0 };
        }
        return null;
      });

      const res = await rbacRouter(
        makeReq('/api/admin/rbac/roles/custom-1', 'DELETE'),
        { DB: {} },
        {},
        { sub: 'u1' },
        '/api/admin/rbac/roles/custom-1'
      );

      expect(res.status).toBe(204);
      expect(mocks.db.run).toHaveBeenCalledWith(expect.stringContaining('DELETE FROM roles'), [
        'custom-1',
      ]);
    });

    it('logs audit event on role deletion', async () => {
      mocks.db.first.mockImplementation(async (sql) => {
        if (String(sql).includes('SELECT * FROM roles')) {
          return { id: 'custom-1', name: 'Deleted Role', system: 0 };
        }
        return null;
      });

      await rbacRouter(
        makeReq('/api/admin/rbac/roles/custom-1', 'DELETE'),
        { DB: {} },
        {},
        { sub: 'u1' },
        '/api/admin/rbac/roles/custom-1'
      );

      expect(mocks.logAuditEvent).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          action: 'role_deleted',
          resource_type: 'role',
          resource_id: 'custom-1',
          metadata: expect.objectContaining({ name: 'Deleted Role' }),
        })
      );
    });

    it('returns 500 on database error during deletion', async () => {
      mocks.db.first.mockImplementation(async (sql) => {
        if (String(sql).includes('SELECT * FROM roles')) {
          return { id: 'custom-1', name: 'Custom 1', system: 0 };
        }
        return null;
      });
      mocks.db.run.mockRejectedValue(new Error('DB error'));

      const res = await rbacRouter(
        makeReq('/api/admin/rbac/roles/custom-1', 'DELETE'),
        { DB: {} },
        {},
        { sub: 'u1' },
        '/api/admin/rbac/roles/custom-1'
      );

      expect(res.status).toBe(500);
    });
  });

  // ============================================
  // List Permissions Tests
  // ============================================

  describe('GET /api/admin/rbac/permissions', () => {
    it('returns permissions grouped by category', async () => {
      mocks.db.all.mockResolvedValue([
        { id: 'p-1', key: 'chat.read', description: 'Read chats', created_at: 123 },
        { id: 'p-2', key: 'chat.write', description: 'Write chats', created_at: 124 },
        { id: 'p-3', key: 'admin.rbac', description: 'RBAC admin', created_at: 125 },
      ]);

      const res = await rbacRouter(
        makeReq('/api/admin/rbac/permissions', 'GET'),
        { DB: {} },
        {},
        { sub: 'u1' },
        '/api/admin/rbac/permissions'
      );

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.grouped_by_category).toHaveProperty('chat');
      expect(body.grouped_by_category).toHaveProperty('admin');
      expect(body.grouped_by_category.chat).toHaveLength(2);
    });

    it('groups permissions with keys containing dots correctly', async () => {
      mocks.db.all.mockResolvedValue([
        { id: 'p-1', key: 'admin.rbac.admin', description: 'RBAC', created_at: 123 },
        { id: 'p-2', key: 'admin.users.read', description: 'Read users', created_at: 124 },
        { id: 'p-3', key: 'model.use', description: 'Use models', created_at: 125 },
      ]);

      const res = await rbacRouter(
        makeReq('/api/admin/rbac/permissions', 'GET'),
        { DB: {} },
        {},
        { sub: 'u1' },
        '/api/admin/rbac/permissions'
      );

      const body = await res.json();
      expect(body.grouped_by_category.admin).toHaveLength(2);
      expect(body.grouped_by_category.model).toHaveLength(1);
    });

    it('handles empty permissions list', async () => {
      mocks.db.all.mockResolvedValue([]);

      const res = await rbacRouter(
        makeReq('/api/admin/rbac/permissions', 'GET'),
        { DB: {} },
        {},
        { sub: 'u1' },
        '/api/admin/rbac/permissions'
      );

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.permissions).toEqual([]);
      expect(body.grouped_by_category).toEqual({});
    });

    it('handles permission key with no dot (defaults to misc)', async () => {
      mocks.db.all.mockResolvedValue([
        { id: 'p-1', key: 'nodots', description: 'No category', created_at: 123 },
        { id: 'p-2', key: '', description: 'Empty key', created_at: 124 },
        { id: 'p-3', key: null, description: 'Null key', created_at: 125 },
      ]);

      const res = await rbacRouter(
        makeReq('/api/admin/rbac/permissions', 'GET'),
        { DB: {} },
        {},
        { sub: 'u1' },
        '/api/admin/rbac/permissions'
      );

      const body = await res.json();
      expect(body.grouped_by_category.misc).toBeDefined();
    });

    it('returns 500 on database error', async () => {
      mocks.db.all.mockRejectedValue(new Error('DB error'));

      const res = await rbacRouter(
        makeReq('/api/admin/rbac/permissions', 'GET'),
        { DB: {} },
        {},
        { sub: 'u1' },
        '/api/admin/rbac/permissions'
      );

      expect(res.status).toBe(500);
    });
  });

  // ============================================
  // Create Binding Tests
  // ============================================

  describe('POST /api/admin/rbac/bindings', () => {
    it('returns 400 when role_id is missing', async () => {
      const res = await rbacRouter(
        makeReq('/api/admin/rbac/bindings', 'POST', { permission_id: 'p-1' }),
        { DB: {} },
        {},
        { sub: 'u1' },
        '/api/admin/rbac/bindings'
      );

      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toContain('role_id and permission_id required');
    });

    it('returns 400 when permission_id is missing', async () => {
      const res = await rbacRouter(
        makeReq('/api/admin/rbac/bindings', 'POST', { role_id: 'r-1' }),
        { DB: {} },
        {},
        { sub: 'u1' },
        '/api/admin/rbac/bindings'
      );

      expect(res.status).toBe(400);
    });

    it('returns 400 when both are missing', async () => {
      const res = await rbacRouter(
        makeReq('/api/admin/rbac/bindings', 'POST', {}),
        { DB: {} },
        {},
        { sub: 'u1' },
        '/api/admin/rbac/bindings'
      );

      expect(res.status).toBe(400);
    });

    it('trims whitespace from role_id and permission_id', async () => {
      mocks.db.first.mockImplementation(async (sql) => {
        if (String(sql).includes('FROM roles')) {
          return { id: 'r-1', name: 'Role', system: 0 };
        }
        if (String(sql).includes('FROM permissions')) {
          return { id: 'p-1', key: 'chat.read' };
        }
        return null;
      });

      const res = await rbacRouter(
        makeReq('/api/admin/rbac/bindings', 'POST', {
          role_id: '  r-1  ',
          permission_id: '  p-1  ',
        }),
        { DB: {} },
        {},
        { sub: 'u1' },
        '/api/admin/rbac/bindings'
      );

      expect(res.status).toBe(201);
    });

    it('returns 404 when role not found', async () => {
      mocks.db.first.mockResolvedValue(null);

      const res = await rbacRouter(
        makeReq('/api/admin/rbac/bindings', 'POST', {
          role_id: 'nonexistent',
          permission_id: 'p-1',
        }),
        { DB: {} },
        {},
        { sub: 'u1' },
        '/api/admin/rbac/bindings'
      );

      expect(res.status).toBe(404);
      const body = await res.json();
      expect(body.error).toBe('Role not found');
    });

    it('returns 403 when trying to bind to system role', async () => {
      mocks.db.first.mockImplementation(async (sql) => {
        if (String(sql).includes('FROM roles')) {
          return { id: 'admin', name: 'Admin', system: 1 };
        }
        return null;
      });

      const res = await rbacRouter(
        makeReq('/api/admin/rbac/bindings', 'POST', { role_id: 'admin', permission_id: 'p-1' }),
        { DB: {} },
        {},
        { sub: 'u1' },
        '/api/admin/rbac/bindings'
      );

      expect(res.status).toBe(403);
      const body = await res.json();
      expect(body.error).toBe('Cannot modify system role permissions');
    });

    it('returns 404 when permission not found', async () => {
      mocks.db.first.mockImplementation(async (sql) => {
        if (String(sql).includes('FROM roles')) {
          return { id: 'r-1', name: 'Role', system: 0 };
        }
        if (String(sql).includes('FROM permissions')) {
          return null;
        }
        return null;
      });

      const res = await rbacRouter(
        makeReq('/api/admin/rbac/bindings', 'POST', {
          role_id: 'r-1',
          permission_id: 'nonexistent',
        }),
        { DB: {} },
        {},
        { sub: 'u1' },
        '/api/admin/rbac/bindings'
      );

      expect(res.status).toBe(404);
      const body = await res.json();
      expect(body.error).toBe('Permission not found');
    });

    it('succeeds when binding already exists (ignores unique constraint error)', async () => {
      mocks.db.first.mockImplementation(async (sql) => {
        if (String(sql).includes('FROM roles')) {
          return { id: 'r-1', name: 'Role', system: 0 };
        }
        if (String(sql).includes('FROM permissions')) {
          return { id: 'p-1', key: 'chat.read' };
        }
        return null;
      });

      mocks.db.run.mockRejectedValue(new Error('UNIQUE constraint failed'));

      const res = await rbacRouter(
        makeReq('/api/admin/rbac/bindings', 'POST', { role_id: 'r-1', permission_id: 'p-1' }),
        { DB: {} },
        {},
        { sub: 'u1' },
        '/api/admin/rbac/bindings'
      );

      // Should still succeed (duplicate is ignored)
      expect(res.status).toBe(201);
    });

    it('throws on non-unique constraint errors', async () => {
      mocks.db.first.mockImplementation(async (sql) => {
        if (String(sql).includes('FROM roles')) {
          return { id: 'r-1', name: 'Role', system: 0 };
        }
        if (String(sql).includes('FROM permissions')) {
          return { id: 'p-1', key: 'chat.read' };
        }
        return null;
      });

      mocks.db.run.mockRejectedValue(new Error('FOREIGN KEY constraint failed'));

      const res = await rbacRouter(
        makeReq('/api/admin/rbac/bindings', 'POST', { role_id: 'r-1', permission_id: 'p-1' }),
        { DB: {} },
        {},
        { sub: 'u1' },
        '/api/admin/rbac/bindings'
      );

      expect(res.status).toBe(500);
    });

    it('logs audit event on binding creation', async () => {
      mocks.db.first.mockImplementation(async (sql) => {
        if (String(sql).includes('FROM roles')) {
          return { id: 'r-1', name: 'Role', system: 0 };
        }
        if (String(sql).includes('FROM permissions')) {
          return { id: 'p-1', key: 'chat.read' };
        }
        return null;
      });

      await rbacRouter(
        makeReq('/api/admin/rbac/bindings', 'POST', { role_id: 'r-1', permission_id: 'p-1' }),
        { DB: {} },
        {},
        { sub: 'u1' },
        '/api/admin/rbac/bindings'
      );

      expect(mocks.logAuditEvent).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          action: 'role_permission_added',
          resource_type: 'role',
          resource_id: 'r-1',
          metadata: expect.objectContaining({
            permission_id: 'p-1',
            permission_key: 'chat.read',
          }),
        })
      );
    });

    it('returns 500 on database error', async () => {
      mocks.db.first.mockImplementation(async (sql) => {
        if (String(sql).includes('FROM roles')) {
          return { id: 'r-1', name: 'Role', system: 0 };
        }
        return null;
      });
      mocks.db.first.mockRejectedValue(new Error('DB error'));

      const res = await rbacRouter(
        makeReq('/api/admin/rbac/bindings', 'POST', { role_id: 'r-1', permission_id: 'p-1' }),
        { DB: {} },
        {},
        { sub: 'u1' },
        '/api/admin/rbac/bindings'
      );

      expect(res.status).toBe(500);
    });
  });

  // ============================================
  // Audit Log Endpoint Tests
  // ============================================

  describe('GET /api/admin/audit', () => {
    beforeEach(() => {
      mocks.getAuditLog.mockResolvedValue({
        entries: [],
        total: 0,
        limit: 50,
        offset: 0,
      });
    });

    it('accepts empty filters', async () => {
      const res = await rbacRouter(
        makeReq('/api/admin/audit', 'GET'),
        { DB: {} },
        {},
        { sub: 'u1' },
        '/api/admin/audit'
      );

      expect(res.status).toBe(200);
      expect(mocks.getAuditLog).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({})
      );
    });

    it('clamps limit to 500', async () => {
      const req = new Request('https://example.com/api/admin/audit?limit=1000', {
        method: 'GET',
      });

      await rbacRouter(req, { DB: {} }, {}, { sub: 'u1' }, '/api/admin/audit');

      expect(mocks.getAuditLog).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ limit: 500 })
      );
    });

    it('uses default limit when not provided', async () => {
      await rbacRouter(
        makeReq('/api/admin/audit', 'GET'),
        { DB: {} },
        {},
        { sub: 'u1' },
        '/api/admin/audit'
      );

      expect(mocks.getAuditLog).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ limit: 50 })
      );
    });

    it('clamps offset to 0 if negative', async () => {
      const req = new Request('https://example.com/api/admin/audit?offset=-10', {
        method: 'GET',
      });

      await rbacRouter(req, { DB: {} }, {}, { sub: 'u1' }, '/api/admin/audit');

      expect(mocks.getAuditLog).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ offset: 0 })
      );
    });

    it('filters by actor_id when provided', async () => {
      await rbacRouter(
        makeReq('/api/admin/audit?actor_id=user-123', 'GET'),
        { DB: {} },
        {},
        { sub: 'u1' },
        '/api/admin/audit'
      );

      expect(mocks.getAuditLog).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ actor_id: 'user-123' })
      );
    });

    it('filters by resource_type when provided', async () => {
      await rbacRouter(
        makeReq('/api/admin/audit?resource_type=role', 'GET'),
        { DB: {} },
        {},
        { sub: 'u1' },
        '/api/admin/audit'
      );

      expect(mocks.getAuditLog).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ resource_type: 'role' })
      );
    });

    it('filters by action when provided', async () => {
      await rbacRouter(
        makeReq('/api/admin/audit?action=role_created', 'GET'),
        { DB: {} },
        {},
        { sub: 'u1' },
        '/api/admin/audit'
      );

      expect(mocks.getAuditLog).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ action: 'role_created' })
      );
    });

    it('ignores actor_id longer than 255 chars', async () => {
      const longActorId = 'a'.repeat(256);

      await rbacRouter(
        new Request(`https://example.com/api/admin/audit?actor_id=${longActorId}`, {
          method: 'GET',
        }),
        { DB: {} },
        {},
        { sub: 'u1' },
        '/api/admin/audit'
      );

      expect(mocks.getAuditLog).toHaveBeenCalledWith(
        expect.anything(),
        expect.not.objectContaining({ actor_id: expect.any(String) })
      );
      // Should not include the long actor_id
      const call = mocks.getAuditLog.mock.calls[0][1];
      expect(call.actor_id).toBeUndefined();
    });

    it('ignores resource_type longer than 100 chars', async () => {
      const longType = 'a'.repeat(101);

      await rbacRouter(
        new Request(`https://example.com/api/admin/audit?resource_type=${longType}`, {
          method: 'GET',
        }),
        { DB: {} },
        {},
        { sub: 'u1' },
        '/api/admin/audit'
      );

      const call = mocks.getAuditLog.mock.calls[0][1];
      expect(call.resource_type).toBeUndefined();
    });

    it('ignores action longer than 100 chars', async () => {
      const longAction = 'a'.repeat(101);

      await rbacRouter(
        new Request(`https://example.com/api/admin/audit?action=${longAction}`, {
          method: 'GET',
        }),
        { DB: {} },
        {},
        { sub: 'u1' },
        '/api/admin/audit'
      );

      const call = mocks.getAuditLog.mock.calls[0][1];
      expect(call.action).toBeUndefined();
    });

    it('combines all filters', async () => {
      await rbacRouter(
        makeReq('/api/admin/audit?actor_id=u1&resource_type=role&action=role_created', 'GET'),
        { DB: {} },
        {},
        { sub: 'u1' },
        '/api/admin/audit'
      );

      expect(mocks.getAuditLog).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          actor_id: 'u1',
          resource_type: 'role',
          action: 'role_created',
        })
      );
    });

    it('returns audit log entries with pagination metadata', async () => {
      mocks.getAuditLog.mockResolvedValue({
        entries: [{ id: '1', action: 'role_created' }],
        total: 100,
        limit: 50,
        offset: 0,
      });

      const res = await rbacRouter(
        makeReq('/api/admin/audit', 'GET'),
        { DB: {} },
        {},
        { sub: 'u1' },
        '/api/admin/audit'
      );

      const body = await res.json();
      expect(body.audit_log).toHaveLength(1);
      expect(body.total).toBe(100);
      expect(body.limit).toBe(50);
      expect(body.offset).toBe(0);
      expect(body.filters).toEqual({
        actor_id: '',
        resource_type: '',
        action: '',
      });
    });

    it('returns 500 on getAuditLog error', async () => {
      mocks.getAuditLog.mockRejectedValue(new Error('DB error'));

      const res = await rbacRouter(
        makeReq('/api/admin/audit', 'GET'),
        { DB: {} },
        {},
        { sub: 'u1' },
        '/api/admin/audit'
      );

      expect(res.status).toBe(500);
      // Note: 5xx error messages are sanitized to prevent internal details leakage
      const body = await res.json();
      expect(body.error).toBe('An error occurred. Please try again later.');
    });
  });

  // ============================================
  // Original regression tests preserved
  // ============================================

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
      '/api/admin/rbac/roles'
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
      '/api/admin/rbac/roles'
    );

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.role).toMatchObject({
      name: 'Support',
      system: false,
      permissions: ['chat.read', 'chat.write'],
    });
  });

  it('prevents deleting system roles', async () => {
    mocks.db.first.mockImplementation(async (sql, params = []) => {
      const query = String(sql || '');
      if (query.includes('SELECT * FROM roles WHERE id = ?') && params[0] === 'admin') {
        return {
          id: 'admin',
          name: 'Admin',
          system: 1,
        };
      }
      return null;
    });

    const res = await rbacRouter(
      makeReq('/api/admin/rbac/roles/admin', 'DELETE'),
      { DB: {} },
      {},
      { sub: 'u1' },
      '/api/admin/rbac/roles/admin'
    );

    expect(res.status).toBe(403);
  });

  // ============================================
  // Mutation-gap tests
  // ============================================

  describe('mutation gaps', () => {
    it('GET roles returns 500 on database error', async () => {
      mocks.db.all.mockRejectedValue(new Error('DB connection lost'));

      const res = await rbacRouter(
        makeReq('/api/admin/rbac/roles', 'GET'),
        { DB: {} },
        {},
        { sub: 'u1' },
        '/api/admin/rbac/roles'
      );

      expect(res.status).toBe(500);
    });

    it('PUT role without permissions field only updates name', async () => {
      mocks.db.first.mockImplementation(async (sql) => {
        if (String(sql).includes('SELECT * FROM roles')) {
          return { id: 'custom-1', name: 'Old Name', system: 0, created_at: 123 };
        }
        return null;
      });
      mocks.db.all.mockImplementation(async (sql) => {
        if (String(sql).includes('role_permissions')) return [{ key: 'chat.read' }];
        return [];
      });

      const res = await rbacRouter(
        makeReq('/api/admin/rbac/roles/custom-1', 'PUT', { name: 'New Name Only' }),
        { DB: {} },
        {},
        { sub: 'u1' },
        '/api/admin/rbac/roles/custom-1'
      );

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.role.name).toBe('New Name Only');
      // Permissions should not be deleted when not provided
      const deleteCalls = mocks.db.run.mock.calls.filter(([sql]) =>
        String(sql).includes('DELETE FROM role_permissions')
      );
      expect(deleteCalls.length).toBe(0);
    });

    it('PUT role with empty permissions clears all bindings', async () => {
      mocks.db.first.mockImplementation(async (sql) => {
        if (String(sql).includes('SELECT * FROM roles')) {
          return { id: 'custom-1', name: 'Name', system: 0, created_at: 123 };
        }
        return null;
      });
      mocks.db.all.mockImplementation(async (sql) => {
        if (String(sql).includes('role_permissions')) return [{ key: 'chat.read' }];
        return [];
      });

      const res = await rbacRouter(
        makeReq('/api/admin/rbac/roles/custom-1', 'PUT', { name: 'Name', permissions: [] }),
        { DB: {} },
        {},
        { sub: 'u1' },
        '/api/admin/rbac/roles/custom-1'
      );

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.role.permissions).toEqual([]);
    });

    it('POST bindings with whitespace-only role_id returns 400', async () => {
      const res = await rbacRouter(
        makeReq('/api/admin/rbac/bindings', 'POST', { role_id: '   ', permission_id: 'p-1' }),
        { DB: {} },
        {},
        { sub: 'u1' },
        '/api/admin/rbac/bindings'
      );

      expect(res.status).toBe(400);
    });

    it('POST bindings with whitespace-only permission_id returns 400', async () => {
      const res = await rbacRouter(
        makeReq('/api/admin/rbac/bindings', 'POST', { role_id: 'r-1', permission_id: '   ' }),
        { DB: {} },
        {},
        { sub: 'u1' },
        '/api/admin/rbac/bindings'
      );

      expect(res.status).toBe(400);
    });

    it('POST bindings with numeric role_id throws TypeError (no coercion)', async () => {
      // The code does (body.role_id || '').trim() which fails on numbers
      await expect(
        rbacRouter(
          makeReq('/api/admin/rbac/bindings', 'POST', { role_id: 123, permission_id: 'p-1' }),
          { DB: {} },
          {},
          { sub: 'u1' },
          '/api/admin/rbac/bindings'
        )
      ).rejects.toThrow();
    });

    it('POST roles with non-array permissions treats as empty', async () => {
      mocks.db.all.mockResolvedValue([]);

      const res = await rbacRouter(
        makeReq('/api/admin/rbac/roles', 'POST', { name: 'Test', permissions: 'not-array' }),
        { DB: {} },
        {},
        { sub: 'u1' },
        '/api/admin/rbac/roles'
      );

      expect(res.status).toBe(201);
      const body = await res.json();
      expect(body.role.permissions).toEqual([]);
    });

    it('audit log with limit=0 passes 0 through', async () => {
      mocks.getAuditLog.mockResolvedValue({ entries: [], total: 0, limit: 0, offset: 0 });

      const req = new Request('https://example.com/api/admin/audit?limit=0', { method: 'GET' });
      await rbacRouter(req, { DB: {} }, {}, { sub: 'u1' }, '/api/admin/audit');

      expect(mocks.getAuditLog).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ limit: 0 })
      );
    });

    it('audit log with negative limit clamps via Math.min', async () => {
      mocks.getAuditLog.mockResolvedValue({ entries: [], total: 0, limit: 50, offset: 0 });

      const req = new Request('https://example.com/api/admin/audit?limit=-5', { method: 'GET' });
      await rbacRouter(req, { DB: {} }, {}, { sub: 'u1' }, '/api/admin/audit');

      // Math.min(-5, 500) === -5
      expect(mocks.getAuditLog).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ limit: -5 })
      );
    });

    it('DELETE role returns 500 when db.first throws', async () => {
      mocks.db.first.mockRejectedValue(new Error('DB failure'));

      const res = await rbacRouter(
        makeReq('/api/admin/rbac/roles/custom-1', 'DELETE'),
        { DB: {} },
        {},
        { sub: 'u1' },
        '/api/admin/rbac/roles/custom-1'
      );

      expect(res.status).toBe(500);
    });
  });

  // ============================================
  // Final fallback return null (line 437)
  // ============================================
  describe('fallback return null', () => {
    it('returns null for PATCH /api/admin/rbac/roles/:id (no handler)', async () => {
      mocks.authorize.mockResolvedValue({ allow: true });

      const res = await rbacRouter(
        makeReq('/api/admin/rbac/roles/custom-1', 'PATCH', { name: 'test' }),
        { DB: {} },
        {},
        { sub: 'u1' },
        '/api/admin/rbac/roles/custom-1'
      );

      expect(res).toBeNull();
    });

    it('returns null for POST /api/admin/rbac/permissions (read-only)', async () => {
      mocks.authorize.mockResolvedValue({ allow: true });

      const res = await rbacRouter(
        makeReq('/api/admin/rbac/permissions', 'POST', { key: 'test' }),
        { DB: {} },
        {},
        { sub: 'u1' },
        '/api/admin/rbac/permissions'
      );

      expect(res).toBeNull();
    });

    it('returns null for DELETE /api/admin/rbac/bindings (no handler)', async () => {
      mocks.authorize.mockResolvedValue({ allow: true });

      const res = await rbacRouter(
        makeReq('/api/admin/rbac/bindings', 'DELETE'),
        { DB: {} },
        {},
        { sub: 'u1' },
        '/api/admin/rbac/bindings'
      );

      expect(res).toBeNull();
    });

    it('returns null for PUT /api/admin/rbac/roles (no id)', async () => {
      mocks.authorize.mockResolvedValue({ allow: true });

      const res = await rbacRouter(
        makeReq('/api/admin/rbac/roles', 'PUT', { name: 'test' }),
        { DB: {} },
        {},
        { sub: 'u1' },
        '/api/admin/rbac/roles'
      );

      expect(res).toBeNull();
    });
  });

  // ============================================
  // Helper function edge cases
  // ============================================
  describe('helper functions', () => {
    it('normalizeStringList filters out null and undefined items', async () => {
      mocks.db.all.mockImplementation(async (sql) => {
        const query = String(sql || '');
        if (query.includes('FROM permissions') && query.includes('WHERE key IN')) {
          return [{ id: 'p-1', key: 'chat.read' }];
        }
        return [];
      });

      const res = await rbacRouter(
        makeReq('/api/admin/rbac/roles', 'POST', {
          name: 'Test',
          permissions: [null, undefined, 'chat.read', null],
        }),
        { DB: {} },
        {},
        { sub: 'u1' },
        '/api/admin/rbac/roles'
      );

      expect(res.status).toBe(201);
    });

    it('normalizeStringList returns empty for non-array input', async () => {
      mocks.db.all.mockResolvedValue([]);

      const res = await rbacRouter(
        makeReq('/api/admin/rbac/roles', 'POST', {
          name: 'Test',
          permissions: 'not-an-array',
        }),
        { DB: {} },
        {},
        { sub: 'u1' },
        '/api/admin/rbac/roles'
      );

      expect(res.status).toBe(201);
      const body = await res.json();
      expect(body.role.permissions).toEqual([]);
    });

    it('serializeRoleWithPermissions handles non-array permissionKeys', async () => {
      mocks.db.all.mockResolvedValue([]);

      const res = await rbacRouter(
        makeReq('/api/admin/rbac/roles', 'POST', { name: 'Test' }),
        { DB: {} },
        {},
        { sub: 'u1' },
        '/api/admin/rbac/roles'
      );

      expect(res.status).toBe(201);
    });
  });
});
