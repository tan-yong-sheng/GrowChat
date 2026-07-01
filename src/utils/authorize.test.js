import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  authorize,
  resolvePermissions,
  hasPermission,
  requireAdmin,
  logAuditEvent,
  isLastOwnerOfRole,
  getRoleUserCount,
  getRoleDetails,
  getUserRoles,
  getAuditLog,
  DENIAL_REASONS,
} from './authorize.js';

describe('authorize.js - Authorization Core', () => {
  let mockEnv;
  let mockDB;

  // Helper to create a mock statement with chainable bind()
  const createMockStatement = (overrides = {}) => {
    const mockStatement = {
      bind: vi.fn(),
      first: vi.fn(),
      all: vi.fn(),
      run: vi.fn(),
      ...overrides,
    };
    mockStatement.bind.mockReturnValue(mockStatement);
    return mockStatement;
  };

  beforeEach(() => {
    mockDB = {
      prepare: vi.fn(),
    };
    mockEnv = {
      DB: mockDB,
    };
  });

  describe('DENIAL_REASONS constants', () => {
    it('should define all required denial reason codes', () => {
      expect(DENIAL_REASONS.MISSING_PERMISSION).toBe('missing_permission');
      expect(DENIAL_REASONS.ACCOUNT_NOT_ACTIVE).toBe('account_not_active');
      expect(DENIAL_REASONS.LAST_OWNER_PROTECTED).toBe('last_owner_protected');
      expect(DENIAL_REASONS.SYSTEM_ROLE_IMMUTABLE).toBe('system_role_immutable');
      expect(DENIAL_REASONS.INVALID_REQUEST).toBe('invalid_request');
    });
  });

  describe('authorize - Permission Allow Path', () => {
    it('should allow user with required permission', async () => {
      const user = { sub: 'user-123', role: 'admin' };
      const mockStatement = createMockStatement({
        all: vi.fn().mockResolvedValue({
          results: [{ key: 'chat.read' }, { key: 'chat.write' }, { key: 'admin.rbac.admin' }],
        }),
      });
      mockDB.prepare.mockReturnValue(mockStatement);

      const result = await authorize(mockEnv, user, {
        action: 'chat.read',
      });

      expect(result.allow).toBe(true);
      expect(result.code).toBe('ok');
      expect(result.action).toBe('chat.read');
      expect(result.reason).toBeUndefined();
    });

    it('should include action in allow response', async () => {
      const user = { sub: 'user-456' };
      const mockStatement = createMockStatement({
        all: vi.fn().mockResolvedValue({
          results: [{ key: 'model.use' }],
        }),
      });
      mockDB.prepare.mockReturnValue(mockStatement);

      const result = await authorize(mockEnv, user, {
        action: 'model.use',
      });

      expect(result.action).toBe('model.use');
      expect(result.allow).toBe(true);
    });

    it('should ignore extra context when resolving permissions', async () => {
      const user = { sub: 'user-789' };
      const mockStatement = createMockStatement({
        all: vi.fn().mockResolvedValue({
          results: [{ key: 'chat.read' }],
        }),
      });
      mockDB.prepare.mockReturnValue(mockStatement);

      await authorize(mockEnv, user, {
        action: 'chat.read',
        context: { resource: 'chat', resourceId: 'chat-123' },
      });

      expect(mockDB.prepare).toHaveBeenCalled();
      const sql = mockDB.prepare.mock.calls[0][0];
      expect(sql).not.toContain('scope_type');
      expect(sql).not.toContain('scope_id');
    });
  });

  describe('authorize - Permission Deny Path', () => {
    it('should deny user without required permission', async () => {
      const user = { sub: 'user-123', role: 'user' };
      const mockStatement = createMockStatement({
        all: vi.fn().mockResolvedValue({
          results: [{ key: 'chat.read' }, { key: 'chat.write' }],
        }),
      });
      mockDB.prepare.mockReturnValue(mockStatement);

      const result = await authorize(mockEnv, user, {
        action: 'admin.rbac.admin',
      });

      expect(result.allow).toBe(false);
      expect(result.code).toBe('forbidden');
      expect(result.reason).toBe(DENIAL_REASONS.MISSING_PERMISSION);
      expect(result.action).toBe('admin.rbac.admin');
    });

    it('should return machine-readable denial code', async () => {
      const user = { sub: 'user-123' };
      const mockStatement = createMockStatement({
        all: vi.fn().mockResolvedValue({ results: [] }),
      });
      mockDB.prepare.mockReturnValue(mockStatement);

      const result = await authorize(mockEnv, user, {
        action: 'forbidden.action',
      });

      expect(result.code).toBeDefined();
      expect(typeof result.code).toBe('string');
      expect(result.reason).toBeDefined();
    });

    it('should deny when user has no permissions', async () => {
      const user = { sub: 'user-999' };
      const mockStatement = createMockStatement({
        all: vi.fn().mockResolvedValue({ results: [] }),
      });
      mockDB.prepare.mockReturnValue(mockStatement);

      const result = await authorize(mockEnv, user, {
        action: 'any.permission',
      });

      expect(result.allow).toBe(false);
      expect(result.reason).toBe(DENIAL_REASONS.MISSING_PERMISSION);
    });
  });

  describe('authorize - Account State Checks', () => {
    it('should deny request with no user', async () => {
      const result = await authorize(mockEnv, null, {
        action: 'chat.read',
      });

      expect(result.allow).toBe(false);
      expect(result.reason).toBe(DENIAL_REASONS.ACCOUNT_NOT_ACTIVE);
      expect(result.code).toBe('unauthorized');
    });

    it('should deny request with undefined user', async () => {
      const result = await authorize(mockEnv, undefined, {
        action: 'chat.read',
      });

      expect(result.allow).toBe(false);
      expect(result.reason).toBe(DENIAL_REASONS.ACCOUNT_NOT_ACTIVE);
    });

    it('should deny request with user but no sub claim', async () => {
      const user = { role: 'user' };
      const result = await authorize(mockEnv, user, {
        action: 'chat.read',
      });

      expect(result.allow).toBe(false);
      expect(result.reason).toBe(DENIAL_REASONS.ACCOUNT_NOT_ACTIVE);
    });

    it('should deny request with null sub claim', async () => {
      const user = { sub: null, role: 'user' };
      const result = await authorize(mockEnv, user, {
        action: 'chat.read',
      });

      expect(result.allow).toBe(false);
      expect(result.reason).toBe(DENIAL_REASONS.ACCOUNT_NOT_ACTIVE);
    });
  });

  describe('authorize - Invalid Request Handling', () => {
    it('should reject request with no action specified', async () => {
      const user = { sub: 'user-123' };

      const result = await authorize(mockEnv, user, {});

      expect(result.allow).toBe(false);
      expect(result.reason).toBe(DENIAL_REASONS.INVALID_REQUEST);
      expect(result.code).toBe('forbidden');
    });

    it('should reject request with null action', async () => {
      const user = { sub: 'user-123' };

      const result = await authorize(mockEnv, user, { action: null });

      expect(result.allow).toBe(false);
      expect(result.reason).toBe(DENIAL_REASONS.INVALID_REQUEST);
    });

    it('should reject request with empty action string', async () => {
      const user = { sub: 'user-123' };

      const result = await authorize(mockEnv, user, { action: '' });

      expect(result.allow).toBe(false);
      expect(result.reason).toBe(DENIAL_REASONS.INVALID_REQUEST);
    });

    it('should reject request with non-string action', async () => {
      const user = { sub: 'user-123' };

      const result = await authorize(mockEnv, user, { action: 12345 });

      expect(result.allow).toBe(false);
      expect(result.reason).toBe(DENIAL_REASONS.INVALID_REQUEST);
    });

    it('should return action as unknown for invalid request', async () => {
      const user = { sub: 'user-123' };

      const result = await authorize(mockEnv, user, { action: null });

      expect(result.action).toBe('unknown');
    });
  });

  describe('authorize - Error Handling', () => {
    it('should deny when DB errors prevent permission resolution', async () => {
      const user = { sub: 'user-123', role: 'user' };
      const mockStatement = createMockStatement({
        all: vi.fn().mockRejectedValue(new Error('DB connection failed')),
      });
      mockDB.prepare.mockReturnValue(mockStatement);

      const result = await authorize(mockEnv, user, {
        action: 'chat.read',
      });

      expect(result.allow).toBe(false);
      expect(result.code).toBe('forbidden');
      expect(result.reason).toBe(DENIAL_REASONS.MISSING_PERMISSION);
    });

    it('should deny when RBAC query returns no permissions', async () => {
      const user = { sub: 'user-123', role: 'user' };
      const mockStatement = createMockStatement({
        all: vi.fn().mockResolvedValue(null),
      });
      mockDB.prepare.mockReturnValue(mockStatement);

      const result = await authorize(mockEnv, user, {
        action: 'chat.read',
      });

      expect(result.allow).toBe(false);
      expect(result.reason).toBe(DENIAL_REASONS.MISSING_PERMISSION);
    });
  });

  describe('resolvePermissions - Permission Resolution', () => {
    it('should return permissions from RBAC query when available', async () => {
      const user = { sub: 'user-123' };
      const mockStatement = createMockStatement({
        all: vi.fn().mockResolvedValue({
          results: [{ key: 'chat.read' }, { key: 'chat.write' }],
        }),
      });
      mockDB.prepare.mockReturnValue(mockStatement);

      const perms = await resolvePermissions(mockDB, user);

      expect(perms).toEqual(['chat.read', 'chat.write']);
    });

    it('should return role permissions without group-derived grants', async () => {
      const user = { sub: 'user-456' };
      const roleStatement = createMockStatement({
        all: vi.fn().mockResolvedValue({
          results: [{ key: 'chat.read' }],
        }),
      });
      mockDB.prepare
        .mockImplementationOnce(() => roleStatement)
        .mockImplementationOnce(() =>
          createMockStatement({
            first: vi.fn().mockResolvedValue({ role: null }),
          })
        );

      const perms = await resolvePermissions(mockDB, user);

      expect(perms).toEqual(['chat.read']);
    });

    it('should return empty array for user with no sub', async () => {
      const user = { role: 'user' };

      const perms = await resolvePermissions(mockDB, user);

      expect(perms).toEqual([]);
    });

    it('should return empty array for null user', async () => {
      const perms = await resolvePermissions(mockEnv, null);

      expect(perms).toEqual([]);
    });

    it('should ignore extra context in permission query', async () => {
      const user = { sub: 'user-456' };
      const mockStatement = createMockStatement({
        all: vi.fn().mockResolvedValue({
          results: [{ key: 'chat.read' }],
        }),
      });
      mockDB.prepare.mockReturnValue(mockStatement);

      await resolvePermissions(mockDB, user, { resource: 'chat', resourceId: 'chat-789' });

      expect(mockStatement.bind).toHaveBeenCalledWith('user-456');
    });

    it('should query permissions with just the user id when context is omitted', async () => {
      const user = { sub: 'user-123' };
      const mockStatement = createMockStatement({
        all: vi.fn().mockResolvedValue({ results: [] }),
      });
      mockDB.prepare.mockReturnValue(mockStatement);

      await resolvePermissions(mockDB, user);

      expect(mockStatement.bind).toHaveBeenCalledWith('user-123');
    });

    it('should handle DB errors and return no permissions', async () => {
      const user = { sub: 'user-123', role: 'admin' };
      const mockStatement = createMockStatement({
        all: vi.fn().mockRejectedValue(new Error('DB error')),
      });
      mockDB.prepare.mockReturnValue(mockStatement);

      const perms = await resolvePermissions(mockDB, user);

      expect(Array.isArray(perms)).toBe(true);
      expect(perms).toEqual([]);
    });

    it('should not include duplicate permissions', async () => {
      const user = { sub: 'user-123' };
      const mockStatement = createMockStatement({
        all: vi.fn().mockResolvedValue({
          results: [{ key: 'chat.read' }, { key: 'chat.read' }, { key: 'chat.write' }],
        }),
      });
      mockDB.prepare.mockReturnValue(mockStatement);

      const perms = await resolvePermissions(mockDB, user);

      expect(perms).toEqual(['chat.read', 'chat.write']);
    });
  });

  describe('hasPermission - Convenience Method', () => {
    it('should return true when user has permission', async () => {
      const user = { sub: 'user-123' };
      const mockStatement = createMockStatement({
        all: vi.fn().mockResolvedValue({
          results: [{ key: 'chat.read' }],
        }),
      });
      mockDB.prepare.mockReturnValue(mockStatement);

      const result = await hasPermission({ env: mockEnv, user, permission: 'chat.read' });

      expect(result).toBe(true);
    });

    it('should return false when user lacks permission', async () => {
      const user = { sub: 'user-123' };
      const mockStatement = createMockStatement({
        all: vi.fn().mockResolvedValue({
          results: [{ key: 'chat.read' }],
        }),
      });
      mockDB.prepare.mockReturnValue(mockStatement);

      const result = await hasPermission({ env: mockEnv, user, permission: 'admin.rbac.admin' });

      expect(result).toBe(false);
    });

    it('should accept context parameter', async () => {
      const user = { sub: 'user-123' };
      const mockStatement = createMockStatement({
        all: vi.fn().mockResolvedValue({
          results: [{ key: 'chat.read' }],
        }),
      });
      mockDB.prepare.mockReturnValue(mockStatement);

      const result = await hasPermission({
        env: mockEnv,
        user,
        permission: 'chat.read',
        context: {
          resource: 'chat',
          resourceId: 'chat-123',
        },
      });

      expect(result).toBe(true);
    });
  });

  describe('requireAdmin - Throw-on-Deny Helper', () => {
    it('should not throw when user has admin permission', async () => {
      const user = { sub: 'user-123' };
      const mockStatement = createMockStatement({
        all: vi.fn().mockResolvedValue({
          results: [{ key: 'admin.rbac.admin' }],
        }),
      });
      mockDB.prepare.mockReturnValue(mockStatement);

      await expect(requireAdmin({ env: mockEnv, user })).resolves.not.toThrow();
    });

    it('should throw when user lacks admin permission', async () => {
      const user = { sub: 'user-123' };
      const mockStatement = createMockStatement({
        all: vi.fn().mockResolvedValue({
          results: [{ key: 'chat.read' }],
        }),
      });
      mockDB.prepare.mockReturnValue(mockStatement);

      await expect(requireAdmin({ env: mockEnv, user })).rejects.toThrow();
    });

    it('should throw error with statusCode 403', async () => {
      const user = { sub: 'user-123' };
      const mockStatement = createMockStatement({
        all: vi.fn().mockResolvedValue({ results: [] }),
      });
      mockDB.prepare.mockReturnValue(mockStatement);

      try {
        await requireAdmin({ env: mockEnv, user });
        expect.fail('Should have thrown');
      } catch (err) {
        expect(err.statusCode).toBe(403);
      }
    });

    it('should throw error with code property', async () => {
      const user = { sub: 'user-123' };
      const mockStatement = createMockStatement({
        all: vi.fn().mockResolvedValue({ results: [] }),
      });
      mockDB.prepare.mockReturnValue(mockStatement);

      try {
        await requireAdmin({ env: mockEnv, user });
        expect.fail('Should have thrown');
      } catch (err) {
        expect(err.code).toBeDefined();
      }
    });
  });

  describe('logAuditEvent - Audit Logging', () => {
    it('should insert audit event into DB', async () => {
      const mockStatement = createMockStatement({
        run: vi.fn().mockResolvedValue({ success: true }),
      });
      mockDB.prepare.mockReturnValue(mockStatement);

      const event = {
        actor_id: 'user-123',
        action: 'role_change',
        resource_type: 'user',
        resource_id: 'user-456',
        metadata: { old_role: 'user', new_role: 'admin' },
      };

      await logAuditEvent(mockEnv, event);

      expect(mockDB.prepare).toHaveBeenCalled();
      expect(mockStatement.run).toHaveBeenCalled();
    });

    it('should serialize metadata to JSON', async () => {
      const mockStatement = createMockStatement({
        run: vi.fn().mockResolvedValue({ success: true }),
      });
      mockDB.prepare.mockReturnValue(mockStatement);

      const event = {
        actor_id: 'user-123',
        action: 'file_upload',
        resource_type: 'file',
        resource_id: 'file-789',
        metadata: { size: 1024, type: 'image/png' },
      };

      await logAuditEvent(mockEnv, event);

      expect(mockStatement.bind).toHaveBeenCalled();
      const callArgs = mockStatement.bind.mock.calls[0];
      expect(typeof callArgs[5]).toBe('string');
      expect(JSON.parse(callArgs[5])).toEqual(event.metadata);
    });

    it('should handle events with null metadata', async () => {
      const mockStatement = createMockStatement({
        run: vi.fn().mockResolvedValue({ success: true }),
      });
      mockDB.prepare.mockReturnValue(mockStatement);

      const event = {
        actor_id: 'user-123',
        action: 'login',
        resource_type: 'session',
        resource_id: 'session-123',
      };

      await logAuditEvent(mockEnv, event);

      expect(mockStatement.run).toHaveBeenCalled();
    });

    it('should reject events missing required fields', async () => {
      await logAuditEvent(mockEnv, {
        action: 'test',
        resource_type: 'user',
      });

      expect(mockDB.prepare).not.toHaveBeenCalled();
    });

    it('should not throw on DB errors', async () => {
      const mockStatement = createMockStatement({
        run: vi.fn().mockRejectedValue(new Error('DB error')),
      });
      mockDB.prepare.mockReturnValue(mockStatement);

      const event = {
        actor_id: 'user-123',
        action: 'test',
        resource_type: 'user',
        resource_id: 'user-456',
      };

      await expect(logAuditEvent(mockEnv, event)).resolves.not.toThrow();
    });
  });

  describe('isLastOwnerOfRole - Last Owner Check', () => {
    it('should return true when user is last owner', async () => {
      const mockStatement = createMockStatement({
        first: vi.fn().mockResolvedValue({ count: 0 }),
      });
      mockDB.prepare.mockReturnValue(mockStatement);

      const result = await isLastOwnerOfRole(mockEnv, 'user-123', 'admin');

      expect(result).toBe(true);
    });

    it('should return false when other admins exist', async () => {
      const mockStatement = createMockStatement({
        first: vi.fn().mockResolvedValue({ count: 2 }),
      });
      mockDB.prepare.mockReturnValue(mockStatement);

      const result = await isLastOwnerOfRole(mockEnv, 'user-123', 'admin');

      expect(result).toBe(false);
    });

    it('should exclude specified user from count', async () => {
      const mockStatement = createMockStatement({
        first: vi.fn().mockResolvedValue({ count: 0 }),
      });
      mockDB.prepare.mockReturnValue(mockStatement);

      await isLastOwnerOfRole(mockEnv, 'user-123', 'admin');

      expect(mockStatement.bind).toHaveBeenCalledWith('admin', 'user-123');
    });
  });

  describe('getRoleUserCount - Count Users in Role', () => {
    it('should return count of users with role', async () => {
      const mockStatement = createMockStatement({
        first: vi.fn().mockResolvedValue({ count: 5 }),
      });
      mockDB.prepare.mockReturnValue(mockStatement);

      const count = await getRoleUserCount(mockEnv, 'admin');

      expect(count).toBe(5);
    });

    it('should exclude user when specified', async () => {
      const mockStatement = createMockStatement({
        first: vi.fn().mockResolvedValue({ count: 2 }),
      });
      mockDB.prepare.mockReturnValue(mockStatement);

      const count = await getRoleUserCount(mockEnv, 'admin', 'user-123');

      expect(count).toBe(2);
      expect(mockStatement.bind).toHaveBeenCalledWith('admin', 'user-123');
    });

    it('should return 0 on DB error', async () => {
      const mockStatement = createMockStatement({
        first: vi.fn().mockRejectedValue(new Error('DB error')),
      });
      mockDB.prepare.mockReturnValue(mockStatement);

      const count = await getRoleUserCount(mockEnv, 'admin');

      expect(count).toBe(0);
    });

    it('should return 0 when null result from DB', async () => {
      const mockStatement = createMockStatement({
        first: vi.fn().mockResolvedValue(null),
      });
      mockDB.prepare.mockReturnValue(mockStatement);

      const count = await getRoleUserCount(mockEnv, 'admin');

      expect(count).toBe(0);
    });
  });

  describe('getUserRoles - Get User Roles', () => {
    it('should return user roles with details', async () => {
      const mockStatement = createMockStatement({
        all: vi.fn().mockResolvedValue({
          results: [
            { id: 'ur1', role_id: 'r1', role_name: 'admin' },
            { id: 'ur2', role_id: 'r2', role_name: 'member' },
          ],
        }),
      });
      mockDB.prepare.mockReturnValue(mockStatement);

      const roles = await getUserRoles(mockDB, 'user-123');

      expect(roles.length).toBe(2);
      expect(roles[0].role_name).toBe('admin');
      expect(roles[1].role_name).toBe('member');
    });

    it('should return empty array when user has no roles', async () => {
      const mockStatement = createMockStatement({
        all: vi.fn().mockResolvedValue({ results: [] }),
      });
      mockDB.prepare.mockReturnValue(mockStatement);

      const roles = await getUserRoles(mockDB, 'user-123');

      expect(roles).toEqual([]);
    });

    it('should return empty array on DB error', async () => {
      const mockStatement = createMockStatement({
        all: vi.fn().mockRejectedValue(new Error('DB error')),
      });
      mockDB.prepare.mockReturnValue(mockStatement);

      const roles = await getUserRoles(mockDB, 'user-123');

      expect(roles).toEqual([]);
    });
  });

  describe('getRoleDetails - Get Role With Permissions', () => {
    it('should return role details with permissions', async () => {
      let callCount = 0;
      const mockStatements = [
        createMockStatement({
          first: vi.fn().mockResolvedValue({
            id: 'r1',
            name: 'admin',
            system: true,
          }),
        }),
        createMockStatement({
          all: vi.fn().mockResolvedValue({
            results: [
              { id: 'p1', key: 'admin.user.read', description: 'Read users' },
              { id: 'p2', key: 'admin.user.write', description: 'Write users' },
            ],
          }),
        }),
      ];

      mockDB.prepare.mockImplementation(() => mockStatements[callCount++]);

      const role = await getRoleDetails(mockEnv, 'admin');

      expect(role.name).toBe('admin');
      expect(role.permissions.length).toBe(2);
      expect(role.permissions[0].key).toBe('admin.user.read');
    });

    it('should return null when role not found', async () => {
      const mockStatement = createMockStatement({
        first: vi.fn().mockResolvedValue(null),
      });
      mockDB.prepare.mockReturnValue(mockStatement);

      const role = await getRoleDetails(mockEnv, 'nonexistent');

      expect(role).toBeNull();
    });

    it('should return null on DB error', async () => {
      const mockStatement = createMockStatement({
        first: vi.fn().mockRejectedValue(new Error('DB error')),
      });
      mockDB.prepare.mockReturnValue(mockStatement);

      const role = await getRoleDetails(mockEnv, 'admin');

      expect(role).toBeNull();
    });
  });

  describe('getAuditLog - Audit Log Retrieval', () => {
    it('should return audit entries with pagination', async () => {
      let callCount = 0;
      const mockStatements = [
        createMockStatement({
          first: vi.fn().mockResolvedValue({ count: 10 }),
        }),
        createMockStatement({
          all: vi.fn().mockResolvedValue({
            results: [
              {
                id: 'a1',
                actor_id: 'user-1',
                action: 'role_change',
                resource_type: 'user',
                resource_id: 'user-2',
                metadata: '{"old": "user", "new": "admin"}',
                created_at: 1234567890,
              },
            ],
          }),
        }),
      ];

      mockDB.prepare.mockImplementation(() => mockStatements[callCount++]);

      const result = await getAuditLog(mockEnv, { limit: 10, offset: 0 });

      expect(result.entries.length).toBe(1);
      expect(result.total).toBe(10);
      expect(result.entries[0].metadata).toEqual({ old: 'user', new: 'admin' });
    });

    it('should filter by actor_id', async () => {
      let callCount = 0;
      const mockStatements = [
        createMockStatement({
          first: vi.fn().mockResolvedValue({ count: 5 }),
        }),
        createMockStatement({
          all: vi.fn().mockResolvedValue({ results: [] }),
        }),
      ];

      mockDB.prepare.mockImplementation(() => mockStatements[callCount++]);

      await getAuditLog(mockEnv, { actor_id: 'user-123' });

      const sql = mockDB.prepare.mock.calls[0][0];
      expect(sql).toContain('actor_id = ?');
    });

    it('should apply safe limit cap of 500', async () => {
      let callCount = 0;
      const mockStatements = [
        createMockStatement({
          first: vi.fn().mockResolvedValue({ count: 0 }),
        }),
        createMockStatement({
          all: vi.fn().mockResolvedValue({ results: [] }),
        }),
      ];

      mockDB.prepare.mockImplementation(() => mockStatements[callCount++]);

      const result = await getAuditLog(mockEnv, { limit: 1000 });

      expect(result.limit).toBe(500);
    });

    it('should apply minimum limit of 1', async () => {
      let callCount = 0;
      const mockStatements = [
        createMockStatement({
          first: vi.fn().mockResolvedValue({ count: 0 }),
        }),
        createMockStatement({
          all: vi.fn().mockResolvedValue({ results: [] }),
        }),
      ];

      mockDB.prepare.mockImplementation(() => mockStatements[callCount++]);

      const result = await getAuditLog(mockEnv, { limit: -10 });

      expect(result.limit).toBe(1);
    });

    it('should return safe defaults on DB error', async () => {
      const mockStatement = createMockStatement({
        first: vi.fn().mockRejectedValue(new Error('DB error')),
      });
      mockDB.prepare.mockReturnValue(mockStatement);

      const result = await getAuditLog(mockEnv, { limit: 100 });

      expect(result.entries).toEqual([]);
      expect(result.total).toBe(0);
      expect(result.limit).toBe(100);
      expect(result.offset).toBe(0);
    });

    it('should parse JSON metadata', async () => {
      let callCount = 0;
      const mockStatements = [
        createMockStatement({
          first: vi.fn().mockResolvedValue({ count: 1 }),
        }),
        createMockStatement({
          all: vi.fn().mockResolvedValue({
            results: [
              {
                id: 'a1',
                actor_id: 'user-1',
                action: 'test',
                resource_type: 'user',
                resource_id: 'user-2',
                metadata: '{"valid": "json"}',
                created_at: 1234567890,
              },
            ],
          }),
        }),
      ];

      mockDB.prepare.mockImplementation(() => mockStatements[callCount++]);

      const result = await getAuditLog(mockEnv);

      expect(result.entries[0].metadata).toEqual({ valid: 'json' });
    });

    it('should return null metadata for invalid JSON', async () => {
      let callCount = 0;
      const mockStatements = [
        createMockStatement({
          first: vi.fn().mockResolvedValue({ count: 1 }),
        }),
        createMockStatement({
          all: vi.fn().mockResolvedValue({
            results: [
              {
                id: 'a1',
                actor_id: 'user-1',
                action: 'test',
                resource_type: 'user',
                resource_id: 'user-2',
                metadata: 'not json',
                created_at: 1234567890,
              },
            ],
          }),
        }),
      ];

      mockDB.prepare.mockImplementation(() => mockStatements[callCount++]);

      const result = await getAuditLog(mockEnv);

      expect(result.entries[0].metadata).toBeNull();
    });
  });

  describe('SQL Parameter Binding - No String Interpolation', () => {
    it('should use parameterized queries for user ID', async () => {
      const mockStatement = createMockStatement({
        all: vi.fn().mockResolvedValue({ results: [] }),
      });
      mockDB.prepare.mockReturnValue(mockStatement);

      const user = { sub: 'user-123; DROP TABLE users;--' };
      await resolvePermissions(mockDB, user);

      expect(mockStatement.bind).toHaveBeenCalledWith('user-123; DROP TABLE users;--');
    });

    it('should use parameterized queries for role names', async () => {
      const mockStatement = createMockStatement({
        first: vi.fn().mockResolvedValue({ count: 0 }),
      });
      mockDB.prepare.mockReturnValue(mockStatement);

      await getRoleUserCount(mockEnv, "admin'; DROP TABLE roles;--");

      expect(mockStatement.bind).toHaveBeenCalled();
    });
  });

  describe('Edge Cases and Integration', () => {
    it('should handle user with multiple permissions correctly', async () => {
      const user = { sub: 'user-123' };
      const permissions = Array.from({ length: 10 }, (_, i) => ({
        key: `permission.${i}`,
      }));

      const mockStatement = createMockStatement({
        all: vi.fn().mockResolvedValue({ results: permissions }),
      });
      mockDB.prepare.mockReturnValue(mockStatement);

      const result = await authorize(mockEnv, user, {
        action: 'permission.5',
      });

      expect(result.allow).toBe(true);
    });

    it('should handle very long action names', async () => {
      const user = { sub: 'user-123' };
      const longAction = 'a'.repeat(1000);
      const mockStatement = createMockStatement({
        all: vi.fn().mockResolvedValue({ results: [{ key: longAction }] }),
      });
      mockDB.prepare.mockReturnValue(mockStatement);

      const result = await authorize(mockEnv, user, { action: longAction });

      expect(result.allow).toBe(true);
    });

    it('should handle extra context with special characters', async () => {
      const user = { sub: 'user-123' };
      const mockStatement = createMockStatement({
        all: vi.fn().mockResolvedValue({ results: [] }),
      });
      mockDB.prepare.mockReturnValue(mockStatement);

      await authorize(mockEnv, user, {
        action: 'chat.read',
        context: {
          resource: "type'; DROP TABLE;--",
          resourceId: "id'; DROP TABLE;--",
        },
      });

      expect(mockStatement.bind).toHaveBeenCalled();
    });
  });
});
