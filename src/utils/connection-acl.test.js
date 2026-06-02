import { describe, expect, it, vi, beforeEach } from 'vitest';
import {
  normalizeConnectionAclEffect,
  normalizeConnectionAclPrincipalType,
  normalizeConnectionAclAction,
  normalizeConnectionAclRule,
  buildConnectionAclIndex,
  evaluateConnectionAclAccess,
  ensureConnectionAclRulesTable,
  buildConnectionAclRuleSaveStatements,
  loadConnectionAclRules,
  saveConnectionAclRulesForConnection,
} from './connection-acl.js';

describe('connection-acl', () => {
  // ── Normalizers ──────────────────────────────────────────────

  describe('normalizeConnectionAclEffect', () => {
    it('returns "deny" for "deny"', () => {
      expect(normalizeConnectionAclEffect('deny')).toBe('deny');
    });

    it('returns "allow" for "allow"', () => {
      expect(normalizeConnectionAclEffect('allow')).toBe('allow');
    });

    it('defaults to "allow" for undefined', () => {
      expect(normalizeConnectionAclEffect(undefined)).toBe('allow');
    });

    it('defaults to "allow" for null', () => {
      expect(normalizeConnectionAclEffect(null)).toBe('allow');
    });

    it('defaults to "allow" for random string', () => {
      expect(normalizeConnectionAclEffect('maybe')).toBe('allow');
    });

    it('handles uppercase "DENY"', () => {
      expect(normalizeConnectionAclEffect('DENY')).toBe('deny');
    });

    it('handles whitespace-padded " deny "', () => {
      expect(normalizeConnectionAclEffect(' deny ')).toBe('deny');
    });
  });

  describe('normalizeConnectionAclPrincipalType', () => {
    it('returns "user" for "user"', () => {
      expect(normalizeConnectionAclPrincipalType('user')).toBe('user');
    });

    it('defaults to "group" for "group"', () => {
      expect(normalizeConnectionAclPrincipalType('group')).toBe('group');
    });

    it('defaults to "group" for undefined', () => {
      expect(normalizeConnectionAclPrincipalType(undefined)).toBe('group');
    });

    it('defaults to "group" for random string', () => {
      expect(normalizeConnectionAclPrincipalType('other')).toBe('group');
    });

    it('handles uppercase "USER"', () => {
      expect(normalizeConnectionAclPrincipalType('USER')).toBe('user');
    });
  });

  describe('normalizeConnectionAclAction', () => {
    it('returns action as-is when non-empty', () => {
      expect(normalizeConnectionAclAction('use')).toBe('use');
    });

    it('returns "use" for empty string', () => {
      expect(normalizeConnectionAclAction('')).toBe('use');
    });

    it('returns "use" for undefined', () => {
      expect(normalizeConnectionAclAction(undefined)).toBe('use');
    });

    it('returns trimmed lowercase action', () => {
      expect(normalizeConnectionAclAction('  MANAGE  ')).toBe('manage');
    });
  });

  // ── normalizeConnectionAclRule ───────────────────────────────

  describe('normalizeConnectionAclRule', () => {
    it('normalizes a valid rule with snake_case keys', () => {
      const result = normalizeConnectionAclRule({
        connection_id: 'conn1',
        principal_type: 'user',
        principal_id: 'user1',
        effect: 'deny',
        action: 'use',
      });
      expect(result).toEqual({
        connection_id: 'conn1',
        principal_type: 'user',
        principal_id: 'user1',
        effect: 'deny',
        action: 'use',
      });
    });

    it('normalizes a valid rule with camelCase keys', () => {
      const result = normalizeConnectionAclRule({
        connectionId: 'conn1',
        principalType: 'group',
        principalId: 'g1',
        effect: 'allow',
        action: 'manage',
      });
      expect(result).toEqual({
        connection_id: 'conn1',
        principal_type: 'group',
        principal_id: 'g1',
        effect: 'allow',
        action: 'manage',
      });
    });

    it('returns null when connection_id is missing', () => {
      expect(normalizeConnectionAclRule({ principal_id: 'user1' })).toBeNull();
    });

    it('returns null when principal_id is missing', () => {
      expect(normalizeConnectionAclRule({ connection_id: 'conn1' })).toBeNull();
    });

    it('returns null for empty rule', () => {
      expect(normalizeConnectionAclRule({})).toBeNull();
    });

    it('returns null for empty connection_id string', () => {
      expect(normalizeConnectionAclRule({ connection_id: '  ', principal_id: 'user1' })).toBeNull();
    });

    it('returns null for empty principal_id string', () => {
      expect(normalizeConnectionAclRule({ connection_id: 'conn1', principal_id: '  ' })).toBeNull();
    });

    it('defaults effect to "allow" when not specified', () => {
      const result = normalizeConnectionAclRule({
        connection_id: 'c1',
        principal_id: 'u1',
      });
      expect(result.effect).toBe('allow');
    });

    it('defaults principal_type to "group" when not specified', () => {
      const result = normalizeConnectionAclRule({
        connection_id: 'c1',
        principal_id: 'u1',
      });
      expect(result.principal_type).toBe('group');
    });
  });

  // ── buildConnectionAclIndex ──────────────────────────────────

  describe('buildConnectionAclIndex', () => {
    it('builds index keyed by connection_id', () => {
      const rules = [
        { connection_id: 'c1', principal_id: 'u1', effect: 'allow', action: 'use' },
        { connection_id: 'c1', principal_id: 'u2', effect: 'deny', action: 'use' },
        { connection_id: 'c2', principal_id: 'u3', effect: 'allow', action: 'use' },
      ];
      const index = buildConnectionAclIndex(rules);
      expect(index.size).toBe(2);
      expect(index.get('c1')).toHaveLength(2);
      expect(index.get('c2')).toHaveLength(1);
    });

    it('skips invalid rules', () => {
      const rules = [
        { connection_id: '', principal_id: 'u1' }, // invalid
        { connection_id: 'c1', principal_id: 'u1', effect: 'allow', action: 'use' },
      ];
      const index = buildConnectionAclIndex(rules);
      expect(index.size).toBe(1);
    });

    it('returns empty Map for empty array', () => {
      const index = buildConnectionAclIndex([]);
      expect(index.size).toBe(0);
    });

    it('returns empty Map for non-array input', () => {
      const index = buildConnectionAclIndex(null);
      expect(index.size).toBe(0);
    });
  });

  // ── evaluateConnectionAclAccess ──────────────────────────────

  describe('evaluateConnectionAclAccess', () => {
    it('returns personal access for user-source connection', () => {
      const result = evaluateConnectionAclAccess(
        { source: 'user' },
        { user: { sub: 'user1' } }
      );
      expect(result).toEqual({ allowed: true, access_label: 'Personal', access_variant: 'personal' });
    });

    it('returns no access when no rules match and user is not admin', () => {
      const result = evaluateConnectionAclAccess(
        { source: 'system' },
        { user: { sub: 'user1', primary_role: 'member' }, rules: [] }
      );
      expect(result).toEqual({ allowed: false, access_label: 'No access', access_variant: 'none' });
    });

    it('returns shared access when allow rule matches', () => {
      const rules = [
        { connection_id: 'c1', principal_type: 'user', principal_id: 'user1', effect: 'allow', action: 'use' },
      ];
      const result = evaluateConnectionAclAccess(
        { id: 'c1' },
        { user: { sub: 'user1' }, rules }
      );
      expect(result).toEqual({ allowed: true, access_label: 'Shared', access_variant: 'shared' });
    });

    it('returns no access when deny rule matches', () => {
      const rules = [
        { connection_id: 'c1', principal_type: 'user', principal_id: 'user1', effect: 'deny', action: 'use' },
      ];
      const result = evaluateConnectionAclAccess(
        { id: 'c1' },
        { user: { sub: 'user1' }, rules }
      );
      expect(result).toEqual({ allowed: false, access_label: 'No access', access_variant: 'none' });
    });

    it('deny takes precedence over allow', () => {
      const rules = [
        { connection_id: 'c1', principal_type: 'user', principal_id: 'user1', effect: 'allow', action: 'use' },
        { connection_id: 'c1', principal_type: 'user', principal_id: 'user1', effect: 'deny', action: 'use' },
      ];
      const result = evaluateConnectionAclAccess(
        { id: 'c1' },
        { user: { sub: 'user1' }, rules }
      );
      expect(result.allowed).toBe(false);
    });

    it('group-based allow rule matches via userGroupIds', () => {
      const rules = [
        { connection_id: 'c1', principal_type: 'group', principal_id: 'g1', effect: 'allow', action: 'use' },
      ];
      const result = evaluateConnectionAclAccess(
        { id: 'c1' },
        { user: { sub: 'user1' }, userGroupIds: new Set(['g1']), rules }
      );
      expect(result).toEqual({ allowed: true, access_label: 'Shared', access_variant: 'shared' });
    });

    it('group-based deny rule blocks access', () => {
      const rules = [
        { connection_id: 'c1', principal_type: 'group', principal_id: 'g1', effect: 'deny', action: 'use' },
      ];
      const result = evaluateConnectionAclAccess(
        { id: 'c1' },
        { user: { sub: 'user1' }, userGroupIds: new Set(['g1']), rules }
      );
      expect(result.allowed).toBe(false);
    });

    it('admin user gets admin access when allowAdmin=true and no rules match', () => {
      const result = evaluateConnectionAclAccess(
        { source: 'system' },
        { user: { sub: 'admin1', primary_role: 'admin' }, rules: [], allowAdmin: true }
      );
      expect(result).toEqual({ allowed: true, access_label: 'Admin', access_variant: 'admin' });
    });

    it('admin user is blocked when allowAdmin=false', () => {
      const result = evaluateConnectionAclAccess(
        { source: 'system' },
        { user: { sub: 'admin1', primary_role: 'admin' }, rules: [], allowAdmin: false }
      );
      expect(result).toEqual({ allowed: false, access_label: 'No access', access_variant: 'none' });
    });

    it('deny rule takes precedence even for admin', () => {
      const rules = [
        { connection_id: 'c1', principal_type: 'user', principal_id: 'admin1', effect: 'deny', action: 'use' },
      ];
      const result = evaluateConnectionAclAccess(
        { id: 'c1' },
        { user: { sub: 'admin1', primary_role: 'admin' }, rules, allowAdmin: true }
      );
      expect(result.allowed).toBe(false);
    });

    it('ignores rules with irrelevant action', () => {
      const rules = [
        { connection_id: 'c1', principal_type: 'user', principal_id: 'user1', effect: 'allow', action: 'unknown' },
      ];
      const result = evaluateConnectionAclAccess(
        { id: 'c1' },
        { user: { sub: 'user1' }, rules }
      );
      expect(result.allowed).toBe(false);
    });

    it('recognizes "manage" as a relevant action', () => {
      const rules = [
        { connection_id: 'c1', principal_type: 'user', principal_id: 'user1', effect: 'allow', action: 'manage' },
      ];
      const result = evaluateConnectionAclAccess(
        { id: 'c1' },
        { user: { sub: 'user1' }, rules }
      );
      expect(result.allowed).toBe(true);
    });

    it('recognizes "admin" as a relevant action', () => {
      const rules = [
        { connection_id: 'c1', principal_type: 'user', principal_id: 'user1', effect: 'allow', action: 'admin' },
      ];
      const result = evaluateConnectionAclAccess(
        { id: 'c1' },
        { user: { sub: 'user1' }, rules }
      );
      expect(result.allowed).toBe(true);
    });

    it('recognizes "read" as a relevant action', () => {
      const rules = [
        { connection_id: 'c1', principal_type: 'user', principal_id: 'user1', effect: 'allow', action: 'read' },
      ];
      const result = evaluateConnectionAclAccess(
        { id: 'c1' },
        { user: { sub: 'user1' }, rules }
      );
      expect(result.allowed).toBe(true);
    });

    it('handles null user', () => {
      const result = evaluateConnectionAclAccess(
        { source: 'system' },
        { user: null, rules: [] }
      );
      expect(result.allowed).toBe(false);
    });

    it('handles undefined options', () => {
      const result = evaluateConnectionAclAccess({ source: 'system' });
      expect(result.allowed).toBe(false);
    });

    it('handles non-array rules', () => {
      const result = evaluateConnectionAclAccess(
        { source: 'system' },
        { user: { sub: 'u1' }, rules: null }
      );
      expect(result.allowed).toBe(false);
    });
  });

  // ── ensureConnectionAclRulesTable ────────────────────────────

  describe('ensureConnectionAclRulesTable', () => {
    it('creates table and indexes when db is provided', async () => {
      const db = { run: vi.fn().mockResolvedValue() };
      await ensureConnectionAclRulesTable(db);
      expect(db.run).toHaveBeenCalledTimes(3);
    });

    it('does nothing when db is null', async () => {
      await expect(ensureConnectionAclRulesTable(null)).resolves.toBeUndefined();
    });

    it('does nothing when db is undefined', async () => {
      await expect(ensureConnectionAclRulesTable(undefined)).resolves.toBeUndefined();
    });

    it('swallows table creation errors', async () => {
      const db = { run: vi.fn().mockRejectedValue(new Error('already exists')) };
      await expect(ensureConnectionAclRulesTable(db)).resolves.toBeUndefined();
    });
  });

  // ── buildConnectionAclRuleSaveStatements ──────────────────────

  describe('buildConnectionAclRuleSaveStatements', () => {
    it('throws when db is null', () => {
      expect(() => buildConnectionAclRuleSaveStatements(null, 'c1')).toThrow(
        'Connection id is required'
      );
    });

    it('throws when connectionId is empty', () => {
      const db = { prepare: vi.fn() };
      expect(() => buildConnectionAclRuleSaveStatements(db, '')).toThrow(
        'Connection id is required'
      );
    });

    it('throws when connectionId is null', () => {
      const db = { prepare: vi.fn() };
      expect(() => buildConnectionAclRuleSaveStatements(db, null)).toThrow(
        'Connection id is required'
      );
    });

    it('includes schema statements when includeSchemaStatements=true', () => {
      const db = { prepare: vi.fn().mockReturnValue('stmt') };
      const { statements } = buildConnectionAclRuleSaveStatements(db, 'c1', [], {
        includeSchemaStatements: true,
      });
      // 3 schema + 1 DELETE = 4
      expect(statements).toHaveLength(4);
    });

    it('excludes schema statements when includeSchemaStatements=false', () => {
      const db = { prepare: vi.fn().mockReturnValue('stmt') };
      const { statements } = buildConnectionAclRuleSaveStatements(db, 'c1', [], {
        includeSchemaStatements: false,
      });
      // Only DELETE
      expect(statements).toHaveLength(1);
    });

    it('generates INSERT for each valid rule', () => {
      const db = { prepare: vi.fn().mockReturnValue('stmt') };
      const rules = [
        { principal_id: 'u1', effect: 'allow', action: 'use' },
        { principal_id: 'u2', effect: 'deny', action: 'manage' },
      ];
      const { statements, normalized } = buildConnectionAclRuleSaveStatements(db, 'c1', rules, {
        includeSchemaStatements: false,
      });
      // 1 DELETE + 2 INSERTs = 3
      expect(statements).toHaveLength(3);
      expect(normalized).toHaveLength(2);
    });

    it('skips invalid rules', () => {
      const db = { prepare: vi.fn().mockReturnValue('stmt') };
      const rules = [
        { principal_id: '', effect: 'allow' }, // invalid: no principal_id
        { principal_id: 'u1', effect: 'allow', action: 'use' },
      ];
      const { normalized } = buildConnectionAclRuleSaveStatements(db, 'c1', rules, {
        includeSchemaStatements: false,
      });
      expect(normalized).toHaveLength(1);
    });

    it('handles non-array rules input', () => {
      const db = { prepare: vi.fn().mockReturnValue('stmt') };
      const { statements, normalized } = buildConnectionAclRuleSaveStatements(db, 'c1', null, {
        includeSchemaStatements: false,
      });
      expect(normalized).toHaveLength(0);
      expect(statements).toHaveLength(1); // DELETE only
    });
  });

  // ── loadConnectionAclRules ───────────────────────────────────

  describe('loadConnectionAclRules', () => {
    it('returns empty array when db is null', async () => {
      const result = await loadConnectionAclRules(null);
      expect(result).toEqual([]);
    });

    it('loads rules for a single connectionId', async () => {
      const mockRows = [
        {
          id: '1',
          connection_id: 'c1',
          principal_type: 'user',
          principal_id: 'u1',
          effect: 'allow',
          action: 'use',
          created_at: 1000,
          updated_at: 2000,
        },
      ];
      const db = {
        run: vi.fn().mockResolvedValue(),
        all: vi.fn().mockResolvedValue(mockRows),
      };
      const result = await loadConnectionAclRules(db, 'c1');
      expect(result).toHaveLength(1);
      expect(result[0].connection_id).toBe('c1');
      expect(result[0].effect).toBe('allow');
    });

    it('loads rules for multiple connectionIds', async () => {
      const mockRows = [
        { id: '1', connection_id: 'c1', principal_type: 'group', principal_id: 'g1', effect: 'allow', action: 'use', created_at: 1, updated_at: 1 },
        { id: '2', connection_id: 'c2', principal_type: 'user', principal_id: 'u1', effect: 'deny', action: 'use', created_at: 1, updated_at: 1 },
      ];
      const db = {
        run: vi.fn().mockResolvedValue(),
        all: vi.fn().mockResolvedValue(mockRows),
      };
      const result = await loadConnectionAclRules(db, null, ['c1', 'c2']);
      expect(result).toHaveLength(2);
    });

    it('loads all rules when no filter provided', async () => {
      const mockRows = [
        { id: '1', connection_id: 'c1', principal_type: 'group', principal_id: 'g1', effect: 'allow', action: 'use', created_at: 1, updated_at: 1 },
      ];
      const db = {
        run: vi.fn().mockResolvedValue(),
        all: vi.fn().mockResolvedValue(mockRows),
      };
      const result = await loadConnectionAclRules(db);
      expect(result).toHaveLength(1);
    });

    it('returns empty array on "no such table" error', async () => {
      const db = {
        run: vi.fn().mockResolvedValue(),
        all: vi.fn().mockRejectedValue(new Error('no such table: connection_acl_rules')),
      };
      const result = await loadConnectionAclRules(db, 'c1');
      expect(result).toEqual([]);
    });

    it('re-throws non-missing-table errors', async () => {
      const db = {
        run: vi.fn().mockResolvedValue(),
        all: vi.fn().mockRejectedValue(new Error('disk I/O error')),
      };
      await expect(loadConnectionAclRules(db, 'c1')).rejects.toThrow('disk I/O error');
    });

    it('filters out rows with empty connection_id or principal_id', async () => {
      const mockRows = [
        { id: '1', connection_id: '', principal_type: 'group', principal_id: 'g1', effect: 'allow', action: 'use', created_at: 1, updated_at: 1 },
        { id: '2', connection_id: 'c1', principal_type: 'user', principal_id: '', effect: 'deny', action: 'use', created_at: 1, updated_at: 1 },
        { id: '3', connection_id: 'c1', principal_type: 'user', principal_id: 'u1', effect: 'allow', action: 'use', created_at: 1, updated_at: 1 },
      ];
      const db = {
        run: vi.fn().mockResolvedValue(),
        all: vi.fn().mockResolvedValue(mockRows),
      };
      const result = await loadConnectionAclRules(db, 'c1');
      expect(result).toHaveLength(1);
    });

    it('handles db.all returning non-array', async () => {
      const db = {
        run: vi.fn().mockResolvedValue(),
        all: vi.fn().mockResolvedValue(null),
      };
      const result = await loadConnectionAclRules(db);
      expect(result).toEqual([]);
    });

    it('prefers single connectionId over connectionIds when both provided', async () => {
      const db = {
        run: vi.fn().mockResolvedValue(),
        all: vi.fn().mockResolvedValue([]),
      };
      await loadConnectionAclRules(db, 'c1', ['c2', 'c3']);
      // Should use singleFilter (connection_id = ?) not idFilter
      expect(db.all).toHaveBeenCalledWith(
        expect.stringContaining('connection_id = ?'),
        ['c1']
      );
    });
  });

  // ── saveConnectionAclRulesForConnection ──────────────────────

  describe('saveConnectionAclRulesForConnection', () => {
    it('batches statements and reloads rules', async () => {
      const db = {
        run: vi.fn().mockResolvedValue(),
        prepare: vi.fn().mockReturnValue('stmt'),
        batch: vi.fn().mockResolvedValue(),
        all: vi.fn().mockResolvedValue([]),
      };
      await saveConnectionAclRulesForConnection(db, 'c1', [
        { principal_id: 'u1', effect: 'allow', action: 'use' },
      ]);
      expect(db.batch).toHaveBeenCalledWith(expect.any(Array));
    });
  });
});
