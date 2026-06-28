import { describe, expect, it, vi } from 'vitest';
import {
  normalizeToolServerAclEffect,
  normalizeToolServerAclPrincipalType,
  normalizeToolServerAclAction,
  normalizeToolServerAclRule,
  buildToolServerAclIndex,
  evaluateToolServerAclAccess,
  ensureToolServerAclRulesTable,
  buildToolServerAclRuleSaveStatements,
  loadToolServerAclRules,
  saveToolServerAclRulesForToolServer,
} from './tool-server-acl.js';

describe('tool-server-acl', () => {
  // ── Normalizers ──────────────────────────────────────────────

  describe('normalizeToolServerAclEffect', () => {
    it('returns "deny" for "deny"', () => {
      expect(normalizeToolServerAclEffect('deny')).toBe('deny');
    });

    it('returns "allow" for "allow"', () => {
      expect(normalizeToolServerAclEffect('allow')).toBe('allow');
    });

    it('defaults to "allow" for undefined', () => {
      expect(normalizeToolServerAclEffect(undefined)).toBe('allow');
    });

    it('defaults to "allow" for null', () => {
      expect(normalizeToolServerAclEffect(null)).toBe('allow');
    });

    it('defaults to "allow" for random string', () => {
      expect(normalizeToolServerAclEffect('maybe')).toBe('allow');
    });

    it('handles uppercase "DENY"', () => {
      expect(normalizeToolServerAclEffect('DENY')).toBe('deny');
    });

    it('handles whitespace-padded " deny "', () => {
      expect(normalizeToolServerAclEffect(' deny ')).toBe('deny');
    });
  });

  describe('normalizeToolServerAclPrincipalType', () => {
    it('returns "user" for "user"', () => {
      expect(normalizeToolServerAclPrincipalType('user')).toBe('user');
    });

    it('defaults to "group" for "group"', () => {
      expect(normalizeToolServerAclPrincipalType('group')).toBe('group');
    });

    it('defaults to "group" for undefined', () => {
      expect(normalizeToolServerAclPrincipalType(undefined)).toBe('group');
    });

    it('defaults to "group" for random string', () => {
      expect(normalizeToolServerAclPrincipalType('other')).toBe('group');
    });

    it('handles uppercase "USER"', () => {
      expect(normalizeToolServerAclPrincipalType('USER')).toBe('user');
    });
  });

  describe('normalizeToolServerAclAction', () => {
    it('returns action as-is when non-empty', () => {
      expect(normalizeToolServerAclAction('use')).toBe('use');
    });

    it('returns "use" for empty string', () => {
      expect(normalizeToolServerAclAction('')).toBe('use');
    });

    it('returns "use" for undefined', () => {
      expect(normalizeToolServerAclAction(undefined)).toBe('use');
    });

    it('returns trimmed lowercase action', () => {
      expect(normalizeToolServerAclAction('  MANAGE  ')).toBe('manage');
    });
  });

  // ── normalizeToolServerAclRule ───────────────────────────────

  describe('normalizeToolServerAclRule', () => {
    it('normalizes a valid rule with snake_case keys', () => {
      const result = normalizeToolServerAclRule({
        tool_server_id: 'ts1',
        principal_type: 'user',
        principal_id: 'user1',
        effect: 'deny',
        action: 'use',
      });
      expect(result).toEqual({
        tool_server_id: 'ts1',
        principal_type: 'user',
        principal_id: 'user1',
        effect: 'deny',
        action: 'use',
      });
    });

    it('normalizes a valid rule with camelCase keys', () => {
      const result = normalizeToolServerAclRule({
        toolServerId: 'ts1',
        principalType: 'group',
        principalId: 'g1',
        effect: 'allow',
        action: 'manage',
      });
      expect(result).toEqual({
        tool_server_id: 'ts1',
        principal_type: 'group',
        principal_id: 'g1',
        effect: 'allow',
        action: 'manage',
      });
    });

    it('returns null when tool_server_id is missing', () => {
      expect(normalizeToolServerAclRule({ principal_id: 'user1' })).toBeNull();
    });

    it('returns null when principal_id is missing', () => {
      expect(normalizeToolServerAclRule({ tool_server_id: 'ts1' })).toBeNull();
    });

    it('returns null for empty rule', () => {
      expect(normalizeToolServerAclRule({})).toBeNull();
    });

    it('returns null for whitespace-only tool_server_id', () => {
      expect(normalizeToolServerAclRule({ tool_server_id: '  ', principal_id: 'u1' })).toBeNull();
    });

    it('returns null for whitespace-only principal_id', () => {
      expect(normalizeToolServerAclRule({ tool_server_id: 'ts1', principal_id: '  ' })).toBeNull();
    });

    it('defaults effect to "allow" when not specified', () => {
      const result = normalizeToolServerAclRule({ tool_server_id: 'ts1', principal_id: 'u1' });
      expect(result.effect).toBe('allow');
    });

    it('defaults principal_type to "group" when not specified', () => {
      const result = normalizeToolServerAclRule({ tool_server_id: 'ts1', principal_id: 'u1' });
      expect(result.principal_type).toBe('group');
    });
  });

  // ── buildToolServerAclIndex ──────────────────────────────────

  describe('buildToolServerAclIndex', () => {
    it('builds index keyed by tool_server_id', () => {
      const rules = [
        { tool_server_id: 'ts1', principal_id: 'u1', effect: 'allow', action: 'use' },
        { tool_server_id: 'ts1', principal_id: 'u2', effect: 'deny', action: 'use' },
        { tool_server_id: 'ts2', principal_id: 'u3', effect: 'allow', action: 'use' },
      ];
      const index = buildToolServerAclIndex(rules);
      expect(index.size).toBe(2);
      expect(index.get('ts1')).toHaveLength(2);
      expect(index.get('ts2')).toHaveLength(1);
    });

    it('skips invalid rules', () => {
      const rules = [
        { tool_server_id: '', principal_id: 'u1' },
        { tool_server_id: 'ts1', principal_id: 'u1', effect: 'allow', action: 'use' },
      ];
      const index = buildToolServerAclIndex(rules);
      expect(index.size).toBe(1);
    });

    it('returns empty Map for empty array', () => {
      expect(buildToolServerAclIndex([]).size).toBe(0);
    });

    it('returns empty Map for non-array input', () => {
      expect(buildToolServerAclIndex(null).size).toBe(0);
    });
  });

  // ── evaluateToolServerAclAccess ──────────────────────────────

  describe('evaluateToolServerAclAccess', () => {
    it('returns personal access for user-source tool server', () => {
      const result = evaluateToolServerAclAccess({ source: 'user' }, { user: { sub: 'user1' } });
      expect(result).toEqual({
        allowed: true,
        access_label: 'Personal',
        access_variant: 'personal',
      });
    });

    it('returns no access when no rules match and user is not admin', () => {
      const result = evaluateToolServerAclAccess(
        { source: 'system' },
        { user: { sub: 'user1', primary_role: 'member' }, rules: [] }
      );
      expect(result).toEqual({ allowed: false, access_label: 'No access', access_variant: 'none' });
    });

    it('returns shared access when allow rule matches', () => {
      const rules = [
        {
          tool_server_id: 'ts1',
          principal_type: 'user',
          principal_id: 'user1',
          effect: 'allow',
          action: 'use',
        },
      ];
      const result = evaluateToolServerAclAccess({ id: 'ts1' }, { user: { sub: 'user1' }, rules });
      expect(result).toEqual({ allowed: true, access_label: 'Shared', access_variant: 'shared' });
    });

    it('returns no access when deny rule matches', () => {
      const rules = [
        {
          tool_server_id: 'ts1',
          principal_type: 'user',
          principal_id: 'user1',
          effect: 'deny',
          action: 'use',
        },
      ];
      const result = evaluateToolServerAclAccess({ id: 'ts1' }, { user: { sub: 'user1' }, rules });
      expect(result).toEqual({ allowed: false, access_label: 'No access', access_variant: 'none' });
    });

    it('deny takes precedence over allow', () => {
      const rules = [
        {
          tool_server_id: 'ts1',
          principal_type: 'user',
          principal_id: 'user1',
          effect: 'allow',
          action: 'use',
        },
        {
          tool_server_id: 'ts1',
          principal_type: 'user',
          principal_id: 'user1',
          effect: 'deny',
          action: 'use',
        },
      ];
      const result = evaluateToolServerAclAccess({ id: 'ts1' }, { user: { sub: 'user1' }, rules });
      expect(result.allowed).toBe(false);
    });

    it('group-based allow rule matches via userGroupIds', () => {
      const rules = [
        {
          tool_server_id: 'ts1',
          principal_type: 'group',
          principal_id: 'g1',
          effect: 'allow',
          action: 'use',
        },
      ];
      const result = evaluateToolServerAclAccess(
        { id: 'ts1' },
        { user: { sub: 'user1' }, userGroupIds: new Set(['g1']), rules }
      );
      expect(result.allowed).toBe(true);
    });

    it('group-based deny rule blocks access', () => {
      const rules = [
        {
          tool_server_id: 'ts1',
          principal_type: 'group',
          principal_id: 'g1',
          effect: 'deny',
          action: 'use',
        },
      ];
      const result = evaluateToolServerAclAccess(
        { id: 'ts1' },
        { user: { sub: 'user1' }, userGroupIds: new Set(['g1']), rules }
      );
      expect(result.allowed).toBe(false);
    });

    it('admin user gets admin access when allowAdmin=true and no rules', () => {
      const result = evaluateToolServerAclAccess(
        { source: 'system' },
        { user: { sub: 'admin1', primary_role: 'admin' }, rules: [], allowAdmin: true }
      );
      expect(result).toEqual({ allowed: true, access_label: 'Admin', access_variant: 'admin' });
    });

    it('admin user is blocked when allowAdmin=false', () => {
      const result = evaluateToolServerAclAccess(
        { source: 'system' },
        { user: { sub: 'admin1', primary_role: 'admin' }, rules: [], allowAdmin: false }
      );
      expect(result).toEqual({ allowed: false, access_label: 'No access', access_variant: 'none' });
    });

    it('deny rule takes precedence even for admin', () => {
      const rules = [
        {
          tool_server_id: 'ts1',
          principal_type: 'user',
          principal_id: 'admin1',
          effect: 'deny',
          action: 'use',
        },
      ];
      const result = evaluateToolServerAclAccess(
        { id: 'ts1' },
        { user: { sub: 'admin1', primary_role: 'admin' }, rules, allowAdmin: true }
      );
      expect(result.allowed).toBe(false);
    });

    it('ignores rules with irrelevant action', () => {
      const rules = [
        {
          tool_server_id: 'ts1',
          principal_type: 'user',
          principal_id: 'user1',
          effect: 'allow',
          action: 'unknown',
        },
      ];
      const result = evaluateToolServerAclAccess({ id: 'ts1' }, { user: { sub: 'user1' }, rules });
      expect(result.allowed).toBe(false);
    });

    it('recognizes relevant actions: use, manage, admin, read', () => {
      for (const action of ['use', 'manage', 'admin', 'read']) {
        const rules = [
          {
            tool_server_id: 'ts1',
            principal_type: 'user',
            principal_id: 'u1',
            effect: 'allow',
            action,
          },
        ];
        const result = evaluateToolServerAclAccess({ id: 'ts1' }, { user: { sub: 'u1' }, rules });
        expect(result.allowed).toBe(true);
      }
    });

    it('handles null user', () => {
      const result = evaluateToolServerAclAccess({ source: 'system' }, { user: null, rules: [] });
      expect(result.allowed).toBe(false);
    });

    it('handles undefined options', () => {
      const result = evaluateToolServerAclAccess({ source: 'system' });
      expect(result.allowed).toBe(false);
    });

    it('handles non-array rules', () => {
      const result = evaluateToolServerAclAccess(
        { source: 'system' },
        { user: { sub: 'u1' }, rules: null }
      );
      expect(result.allowed).toBe(false);
    });
  });

  // ── ensureToolServerAclRulesTable ────────────────────────────

  describe('ensureToolServerAclRulesTable', () => {
    it('creates table and indexes when db is provided', async () => {
      const db = { run: vi.fn().mockResolvedValue() };
      await ensureToolServerAclRulesTable(db);
      expect(db.run).toHaveBeenCalledTimes(3);
    });

    it('does nothing when db is null', async () => {
      await expect(ensureToolServerAclRulesTable(null)).resolves.toBeUndefined();
    });

    it('swallows table creation errors', async () => {
      const db = { run: vi.fn().mockRejectedValue(new Error('already exists')) };
      await expect(ensureToolServerAclRulesTable(db)).resolves.toBeUndefined();
    });
  });

  // ── buildToolServerAclRuleSaveStatements ──────────────────────

  describe('buildToolServerAclRuleSaveStatements', () => {
    it('throws when db is null', () => {
      expect(() => buildToolServerAclRuleSaveStatements(null, 'ts1')).toThrow(
        'Tool server id is required'
      );
    });

    it('throws when toolServerId is empty', () => {
      const db = { prepare: vi.fn() };
      expect(() => buildToolServerAclRuleSaveStatements(db, '')).toThrow(
        'Tool server id is required'
      );
    });

    it('throws when toolServerId is null', () => {
      const db = { prepare: vi.fn() };
      expect(() => buildToolServerAclRuleSaveStatements(db, null)).toThrow(
        'Tool server id is required'
      );
    });

    it('includes schema statements when includeSchemaStatements=true', () => {
      const db = { prepare: vi.fn().mockReturnValue('stmt') };
      const { statements } = buildToolServerAclRuleSaveStatements(db, 'ts1', [], {
        includeSchemaStatements: true,
      });
      // 3 schema + 1 DELETE = 4
      expect(statements).toHaveLength(4);
    });

    it('excludes schema statements when includeSchemaStatements=false', () => {
      const db = { prepare: vi.fn().mockReturnValue('stmt') };
      const { statements } = buildToolServerAclRuleSaveStatements(db, 'ts1', [], {
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
      const { statements, normalized } = buildToolServerAclRuleSaveStatements(db, 'ts1', rules, {
        includeSchemaStatements: false,
      });
      // 1 DELETE + 2 INSERTs = 3
      expect(statements).toHaveLength(3);
      expect(normalized).toHaveLength(2);
    });

    it('skips invalid rules', () => {
      const db = { prepare: vi.fn().mockReturnValue('stmt') };
      const rules = [
        { principal_id: '', effect: 'allow' },
        { principal_id: 'u1', effect: 'allow', action: 'use' },
      ];
      const { normalized } = buildToolServerAclRuleSaveStatements(db, 'ts1', rules, {
        includeSchemaStatements: false,
      });
      expect(normalized).toHaveLength(1);
    });

    it('handles non-array rules input', () => {
      const db = { prepare: vi.fn().mockReturnValue('stmt') };
      const { statements, normalized } = buildToolServerAclRuleSaveStatements(db, 'ts1', null, {
        includeSchemaStatements: false,
      });
      expect(normalized).toHaveLength(0);
      expect(statements).toHaveLength(1); // DELETE only
    });
  });

  // ── loadToolServerAclRules ───────────────────────────────────

  describe('loadToolServerAclRules', () => {
    it('returns empty array when db is null', async () => {
      const result = await loadToolServerAclRules(null);
      expect(result).toEqual([]);
    });

    it('loads rules for a single toolServerId', async () => {
      const mockRows = [
        {
          id: '1',
          tool_server_id: 'ts1',
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
      const result = await loadToolServerAclRules(db, 'ts1');
      expect(result).toHaveLength(1);
      expect(result[0].tool_server_id).toBe('ts1');
    });

    it('loads rules for multiple toolServerIds', async () => {
      const mockRows = [
        {
          id: '1',
          tool_server_id: 'ts1',
          principal_type: 'group',
          principal_id: 'g1',
          effect: 'allow',
          action: 'use',
          created_at: 1,
          updated_at: 1,
        },
        {
          id: '2',
          tool_server_id: 'ts2',
          principal_type: 'user',
          principal_id: 'u1',
          effect: 'deny',
          action: 'use',
          created_at: 1,
          updated_at: 1,
        },
      ];
      const db = {
        run: vi.fn().mockResolvedValue(),
        all: vi.fn().mockResolvedValue(mockRows),
      };
      const result = await loadToolServerAclRules(db, null, ['ts1', 'ts2']);
      expect(result).toHaveLength(2);
    });

    it('loads all rules when no filter provided', async () => {
      const mockRows = [
        {
          id: '1',
          tool_server_id: 'ts1',
          principal_type: 'group',
          principal_id: 'g1',
          effect: 'allow',
          action: 'use',
          created_at: 1,
          updated_at: 1,
        },
      ];
      const db = {
        run: vi.fn().mockResolvedValue(),
        all: vi.fn().mockResolvedValue(mockRows),
      };
      const result = await loadToolServerAclRules(db);
      expect(result).toHaveLength(1);
    });

    it('returns empty array on "no such table" error', async () => {
      const db = {
        run: vi.fn().mockResolvedValue(),
        all: vi.fn().mockRejectedValue(new Error('no such table: tool_server_acl_rules')),
      };
      const result = await loadToolServerAclRules(db, 'ts1');
      expect(result).toEqual([]);
    });

    it('re-throws non-missing-table errors', async () => {
      const db = {
        run: vi.fn().mockResolvedValue(),
        all: vi.fn().mockRejectedValue(new Error('disk I/O error')),
      };
      await expect(loadToolServerAclRules(db, 'ts1')).rejects.toThrow('disk I/O error');
    });

    it('filters out rows with empty tool_server_id or principal_id', async () => {
      const mockRows = [
        {
          id: '1',
          tool_server_id: '',
          principal_type: 'group',
          principal_id: 'g1',
          effect: 'allow',
          action: 'use',
          created_at: 1,
          updated_at: 1,
        },
        {
          id: '2',
          tool_server_id: 'ts1',
          principal_type: 'user',
          principal_id: '',
          effect: 'deny',
          action: 'use',
          created_at: 1,
          updated_at: 1,
        },
        {
          id: '3',
          tool_server_id: 'ts1',
          principal_type: 'user',
          principal_id: 'u1',
          effect: 'allow',
          action: 'use',
          created_at: 1,
          updated_at: 1,
        },
      ];
      const db = {
        run: vi.fn().mockResolvedValue(),
        all: vi.fn().mockResolvedValue(mockRows),
      };
      const result = await loadToolServerAclRules(db, 'ts1');
      expect(result).toHaveLength(1);
    });

    it('handles db.all returning non-array', async () => {
      const db = {
        run: vi.fn().mockResolvedValue(),
        all: vi.fn().mockResolvedValue(null),
      };
      const result = await loadToolServerAclRules(db);
      expect(result).toEqual([]);
    });

    it('prefers single toolServerId over toolServerIds when both provided', async () => {
      const db = {
        run: vi.fn().mockResolvedValue(),
        all: vi.fn().mockResolvedValue([]),
      };
      await loadToolServerAclRules(db, 'ts1', ['ts2', 'ts3']);
      // Should use singleFilter (tool_server_id = ?) not idFilter
      expect(db.all).toHaveBeenCalledWith(expect.stringContaining('tool_server_id = ?'), ['ts1']);
    });
  });

  // ── saveToolServerAclRulesForToolServer ──────────────────────

  describe('saveToolServerAclRulesForToolServer', () => {
    it('batches statements and reloads rules', async () => {
      const db = {
        run: vi.fn().mockResolvedValue(),
        prepare: vi.fn().mockReturnValue('stmt'),
        batch: vi.fn().mockResolvedValue(),
        all: vi.fn().mockResolvedValue([]),
      };
      await saveToolServerAclRulesForToolServer(db, 'ts1', [
        { principal_id: 'u1', effect: 'allow', action: 'use' },
      ]);
      expect(db.batch).toHaveBeenCalledWith(expect.any(Array));
    });
  });
});
