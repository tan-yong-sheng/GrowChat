import { describe, expect, it, vi } from 'vitest';
import {
  normalizeModelAclEffect,
  normalizeModelAclPrincipalType,
  normalizeModelAclAction,
  normalizeModelAclRule,
  buildModelAclIndex,
  evaluateModelAclAccess,
  ensureModelAclRulesTable,
  buildModelAclRuleSaveStatements,
  loadModelAclRules,
  saveModelAclRulesForModel,
} from './model-acl.js';

describe('model-acl', () => {
  // ── Normalizers ──────────────────────────────────────────────

  describe('normalizeModelAclEffect', () => {
    it('returns "deny" for "deny"', () => {
      expect(normalizeModelAclEffect('deny')).toBe('deny');
    });

    it('returns "allow" for "allow"', () => {
      expect(normalizeModelAclEffect('allow')).toBe('allow');
    });

    it('defaults to "allow" for undefined', () => {
      expect(normalizeModelAclEffect(undefined)).toBe('allow');
    });

    it('defaults to "allow" for null', () => {
      expect(normalizeModelAclEffect(null)).toBe('allow');
    });

    it('defaults to "allow" for random string', () => {
      expect(normalizeModelAclEffect('maybe')).toBe('allow');
    });

    it('handles uppercase "DENY"', () => {
      expect(normalizeModelAclEffect('DENY')).toBe('deny');
    });

    it('handles whitespace-padded " deny "', () => {
      expect(normalizeModelAclEffect(' deny ')).toBe('deny');
    });
  });

  describe('normalizeModelAclPrincipalType', () => {
    it('returns "user" for "user"', () => {
      expect(normalizeModelAclPrincipalType('user')).toBe('user');
    });

    it('defaults to "group" for "group"', () => {
      expect(normalizeModelAclPrincipalType('group')).toBe('group');
    });

    it('defaults to "group" for undefined', () => {
      expect(normalizeModelAclPrincipalType(undefined)).toBe('group');
    });

    it('defaults to "group" for random string', () => {
      expect(normalizeModelAclPrincipalType('other')).toBe('group');
    });

    it('handles uppercase "USER"', () => {
      expect(normalizeModelAclPrincipalType('USER')).toBe('user');
    });
  });

  describe('normalizeModelAclAction', () => {
    it('returns action as-is when non-empty', () => {
      expect(normalizeModelAclAction('use')).toBe('use');
    });

    it('returns "use" for empty string', () => {
      expect(normalizeModelAclAction('')).toBe('use');
    });

    it('returns "use" for undefined', () => {
      expect(normalizeModelAclAction(undefined)).toBe('use');
    });

    it('returns trimmed lowercase action', () => {
      expect(normalizeModelAclAction('  MANAGE  ')).toBe('manage');
    });
  });

  // ── normalizeModelAclRule ────────────────────────────────────

  describe('normalizeModelAclRule', () => {
    it('normalizes a valid rule with snake_case keys', () => {
      const result = normalizeModelAclRule({
        model_id: 'm1',
        principal_type: 'user',
        principal_id: 'user1',
        effect: 'deny',
        action: 'use',
      });
      expect(result).toEqual({
        model_id: 'm1',
        principal_type: 'user',
        principal_id: 'user1',
        effect: 'deny',
        action: 'use',
      });
    });

    it('normalizes a valid rule with camelCase keys', () => {
      const result = normalizeModelAclRule({
        modelId: 'm1',
        principalType: 'group',
        principalId: 'g1',
        effect: 'allow',
        action: 'manage',
      });
      expect(result).toEqual({
        model_id: 'm1',
        principal_type: 'group',
        principal_id: 'g1',
        effect: 'allow',
        action: 'manage',
      });
    });

    it('returns null when model_id is missing', () => {
      expect(normalizeModelAclRule({ principal_id: 'user1' })).toBeNull();
    });

    it('returns null when principal_id is missing', () => {
      expect(normalizeModelAclRule({ model_id: 'm1' })).toBeNull();
    });

    it('returns null for empty rule', () => {
      expect(normalizeModelAclRule({})).toBeNull();
    });

    it('returns null for whitespace-only model_id', () => {
      expect(normalizeModelAclRule({ model_id: '  ', principal_id: 'u1' })).toBeNull();
    });

    it('returns null for whitespace-only principal_id', () => {
      expect(normalizeModelAclRule({ model_id: 'm1', principal_id: '  ' })).toBeNull();
    });

    it('defaults effect to "allow" when not specified', () => {
      const result = normalizeModelAclRule({ model_id: 'm1', principal_id: 'u1' });
      expect(result.effect).toBe('allow');
    });

    it('defaults principal_type to "group" when not specified', () => {
      const result = normalizeModelAclRule({ model_id: 'm1', principal_id: 'u1' });
      expect(result.principal_type).toBe('group');
    });
  });

  // ── buildModelAclIndex ───────────────────────────────────────

  describe('buildModelAclIndex', () => {
    it('builds index keyed by model_id', () => {
      const rules = [
        { model_id: 'm1', principal_id: 'u1', effect: 'allow', action: 'use' },
        { model_id: 'm1', principal_id: 'u2', effect: 'deny', action: 'use' },
        { model_id: 'm2', principal_id: 'u3', effect: 'allow', action: 'use' },
      ];
      const index = buildModelAclIndex(rules);
      expect(index.size).toBe(2);
      expect(index.get('m1')).toHaveLength(2);
      expect(index.get('m2')).toHaveLength(1);
    });

    it('skips invalid rules', () => {
      const rules = [
        { model_id: '', principal_id: 'u1' },
        { model_id: 'm1', principal_id: 'u1', effect: 'allow', action: 'use' },
      ];
      const index = buildModelAclIndex(rules);
      expect(index.size).toBe(1);
    });

    it('returns empty Map for empty array', () => {
      expect(buildModelAclIndex([]).size).toBe(0);
    });

    it('returns empty Map for non-array input', () => {
      expect(buildModelAclIndex(null).size).toBe(0);
    });
  });

  // ── evaluateModelAclAccess ───────────────────────────────────

  describe('evaluateModelAclAccess', () => {
    it('returns personal access for user-source model', () => {
      const result = evaluateModelAclAccess(
        { connection_source: 'user' },
        { user: { sub: 'user1' } }
      );
      expect(result).toEqual({
        allowed: true,
        access_label: 'Personal',
        access_variant: 'personal',
      });
    });

    it('returns no access when no rules match and user is not admin', () => {
      const result = evaluateModelAclAccess(
        { connection_source: 'system' },
        { user: { sub: 'user1', primary_role: 'member' }, rules: [] }
      );
      expect(result).toEqual({ allowed: false, access_label: 'No access', access_variant: 'none' });
    });

    it('returns shared access when allow rule matches', () => {
      const rules = [
        {
          model_id: 'm1',
          principal_type: 'user',
          principal_id: 'user1',
          effect: 'allow',
          action: 'use',
        },
      ];
      const result = evaluateModelAclAccess({ id: 'm1' }, { user: { sub: 'user1' }, rules });
      expect(result).toEqual({ allowed: true, access_label: 'Shared', access_variant: 'shared' });
    });

    it('returns no access when deny rule matches', () => {
      const rules = [
        {
          model_id: 'm1',
          principal_type: 'user',
          principal_id: 'user1',
          effect: 'deny',
          action: 'use',
        },
      ];
      const result = evaluateModelAclAccess({ id: 'm1' }, { user: { sub: 'user1' }, rules });
      expect(result).toEqual({ allowed: false, access_label: 'No access', access_variant: 'none' });
    });

    it('deny takes precedence over allow', () => {
      const rules = [
        {
          model_id: 'm1',
          principal_type: 'user',
          principal_id: 'user1',
          effect: 'allow',
          action: 'use',
        },
        {
          model_id: 'm1',
          principal_type: 'user',
          principal_id: 'user1',
          effect: 'deny',
          action: 'use',
        },
      ];
      const result = evaluateModelAclAccess({ id: 'm1' }, { user: { sub: 'user1' }, rules });
      expect(result.allowed).toBe(false);
    });

    it('group-based allow rule matches via userGroupIds', () => {
      const rules = [
        {
          model_id: 'm1',
          principal_type: 'group',
          principal_id: 'g1',
          effect: 'allow',
          action: 'use',
        },
      ];
      const result = evaluateModelAclAccess(
        { id: 'm1' },
        { user: { sub: 'user1' }, userGroupIds: new Set(['g1']), rules }
      );
      expect(result.allowed).toBe(true);
    });

    it('group-based deny rule blocks access', () => {
      const rules = [
        {
          model_id: 'm1',
          principal_type: 'group',
          principal_id: 'g1',
          effect: 'deny',
          action: 'use',
        },
      ];
      const result = evaluateModelAclAccess(
        { id: 'm1' },
        { user: { sub: 'user1' }, userGroupIds: new Set(['g1']), rules }
      );
      expect(result.allowed).toBe(false);
    });

    it('admin user gets admin access when allowAdmin=true and no rules', () => {
      const result = evaluateModelAclAccess(
        { connection_source: 'system' },
        { user: { sub: 'admin1', primary_role: 'admin' }, rules: [], allowAdmin: true }
      );
      expect(result).toEqual({ allowed: true, access_label: 'Admin', access_variant: 'admin' });
    });

    it('admin user is blocked when allowAdmin=false', () => {
      const result = evaluateModelAclAccess(
        { connection_source: 'system' },
        { user: { sub: 'admin1', primary_role: 'admin' }, rules: [], allowAdmin: false }
      );
      expect(result).toEqual({ allowed: false, access_label: 'No access', access_variant: 'none' });
    });

    it('deny rule takes precedence even for admin', () => {
      const rules = [
        {
          model_id: 'm1',
          principal_type: 'user',
          principal_id: 'admin1',
          effect: 'deny',
          action: 'use',
        },
      ];
      const result = evaluateModelAclAccess(
        { id: 'm1' },
        { user: { sub: 'admin1', primary_role: 'admin' }, rules, allowAdmin: true }
      );
      expect(result.allowed).toBe(false);
    });

    it('ignores rules with irrelevant action', () => {
      const rules = [
        {
          model_id: 'm1',
          principal_type: 'user',
          principal_id: 'user1',
          effect: 'allow',
          action: 'unknown',
        },
      ];
      const result = evaluateModelAclAccess({ id: 'm1' }, { user: { sub: 'user1' }, rules });
      expect(result.allowed).toBe(false);
    });

    it('recognizes relevant actions: use, manage, admin, read', () => {
      for (const action of ['use', 'manage', 'admin', 'read']) {
        const rules = [
          { model_id: 'm1', principal_type: 'user', principal_id: 'u1', effect: 'allow', action },
        ];
        const result = evaluateModelAclAccess({ id: 'm1' }, { user: { sub: 'u1' }, rules });
        expect(result.allowed).toBe(true);
      }
    });

    it('handles null user', () => {
      const result = evaluateModelAclAccess(
        { connection_source: 'system' },
        { user: null, rules: [] }
      );
      expect(result.allowed).toBe(false);
    });

    it('handles undefined options', () => {
      const result = evaluateModelAclAccess({ connection_source: 'system' });
      expect(result.allowed).toBe(false);
    });

    it('handles non-array rules', () => {
      const result = evaluateModelAclAccess(
        { connection_source: 'system' },
        { user: { sub: 'u1' }, rules: null }
      );
      expect(result.allowed).toBe(false);
    });
  });

  // ── ensureModelAclRulesTable ─────────────────────────────────

  describe('ensureModelAclRulesTable', () => {
    it('creates table and indexes when db is provided', async () => {
      const db = { run: vi.fn().mockResolvedValue() };
      await ensureModelAclRulesTable(db);
      expect(db.run).toHaveBeenCalledTimes(3);
    });

    it('does nothing when db is null', async () => {
      await expect(ensureModelAclRulesTable(null)).resolves.toBeUndefined();
    });

    it('swallows table creation errors', async () => {
      const db = { run: vi.fn().mockRejectedValue(new Error('already exists')) };
      await expect(ensureModelAclRulesTable(db)).resolves.toBeUndefined();
    });
  });

  // ── buildModelAclRuleSaveStatements ───────────────────────────

  describe('buildModelAclRuleSaveStatements', () => {
    it('throws when db is null', () => {
      expect(() => buildModelAclRuleSaveStatements(null, 'm1')).toThrow('Model id is required');
    });

    it('throws when modelId is empty', () => {
      const db = { prepare: vi.fn() };
      expect(() => buildModelAclRuleSaveStatements(db, '')).toThrow('Model id is required');
    });

    it('throws when modelId is null', () => {
      const db = { prepare: vi.fn() };
      expect(() => buildModelAclRuleSaveStatements(db, null)).toThrow('Model id is required');
    });

    it('includes schema statements when includeSchemaStatements=true', () => {
      const db = { prepare: vi.fn().mockReturnValue('stmt') };
      const { statements } = buildModelAclRuleSaveStatements(db, 'm1', [], {
        includeSchemaStatements: true,
      });
      // 3 schema + 1 DELETE = 4
      expect(statements).toHaveLength(4);
    });

    it('excludes schema statements when includeSchemaStatements=false', () => {
      const db = { prepare: vi.fn().mockReturnValue('stmt') };
      const { statements } = buildModelAclRuleSaveStatements(db, 'm1', [], {
        includeSchemaStatements: false,
      });
      // DELETE only
      expect(statements).toHaveLength(1);
    });

    it('generates INSERT for each valid rule', () => {
      const db = { prepare: vi.fn().mockReturnValue('stmt') };
      const rules = [
        { principal_id: 'u1', effect: 'allow', action: 'use' },
        { principal_id: 'u2', effect: 'deny', action: 'manage' },
      ];
      const { statements, normalized } = buildModelAclRuleSaveStatements(db, 'm1', rules, {
        includeSchemaStatements: false,
      });
      expect(normalized).toHaveLength(2);
    });

    it('skips invalid rules', () => {
      const db = { prepare: vi.fn().mockReturnValue('stmt') };
      const rules = [
        { principal_id: '', effect: 'allow' },
        { principal_id: 'u1', effect: 'allow', action: 'use' },
      ];
      const { normalized } = buildModelAclRuleSaveStatements(db, 'm1', rules, {
        includeSchemaStatements: false,
      });
      expect(normalized).toHaveLength(1);
    });

    it('handles non-array rules input', () => {
      const db = { prepare: vi.fn().mockReturnValue('stmt') };
      const { normalized } = buildModelAclRuleSaveStatements(db, 'm1', null, {
        includeSchemaStatements: false,
      });
      expect(normalized).toHaveLength(0);
    });

    it('decodes URI-encoded modelId for canonical form', () => {
      const db = { prepare: vi.fn().mockReturnValue('stmt') };
      const { canonicalModelId } = buildModelAclRuleSaveStatements(db, 'org%2Fmodel', [], {
        includeSchemaStatements: false,
      });
      expect(canonicalModelId).toBe('org/model');
    });

    it('handles modelId that does not need decoding', () => {
      const db = { prepare: vi.fn().mockReturnValue('stmt') };
      const { canonicalModelId } = buildModelAclRuleSaveStatements(db, 'simple-model', [], {
        includeSchemaStatements: false,
      });
      expect(canonicalModelId).toBe('simple-model');
    });
  });

  // ── loadModelAclRules ────────────────────────────────────────

  describe('loadModelAclRules', () => {
    it('returns empty array when db is null', async () => {
      const result = await loadModelAclRules(null);
      expect(result).toEqual([]);
    });

    it('loads rules for a single modelId', async () => {
      const mockRows = [
        {
          id: '1',
          model_id: 'm1',
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
      const result = await loadModelAclRules(db, 'm1');
      expect(result).toHaveLength(1);
      expect(result[0].model_id).toBe('m1');
    });

    it('loads rules for multiple modelIds', async () => {
      const mockRows = [
        {
          id: '1',
          model_id: 'm1',
          principal_type: 'group',
          principal_id: 'g1',
          effect: 'allow',
          action: 'use',
          created_at: 1,
          updated_at: 1,
        },
        {
          id: '2',
          model_id: 'm2',
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
      const result = await loadModelAclRules(db, null, ['m1', 'm2']);
      expect(result).toHaveLength(2);
    });

    it('loads all rules when no filter provided', async () => {
      const mockRows = [
        {
          id: '1',
          model_id: 'm1',
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
      const result = await loadModelAclRules(db);
      expect(result).toHaveLength(1);
    });

    it('returns empty array on "no such table" error', async () => {
      const db = {
        run: vi.fn().mockResolvedValue(),
        all: vi.fn().mockRejectedValue(new Error('no such table: model_acl_rules')),
      };
      const result = await loadModelAclRules(db, 'm1');
      expect(result).toEqual([]);
    });

    it('re-throws non-missing-table errors', async () => {
      const db = {
        run: vi.fn().mockResolvedValue(),
        all: vi.fn().mockRejectedValue(new Error('disk I/O error')),
      };
      await expect(loadModelAclRules(db, 'm1')).rejects.toThrow('disk I/O error');
    });

    it('filters out rows with empty model_id or principal_id', async () => {
      const mockRows = [
        {
          id: '1',
          model_id: '',
          principal_type: 'group',
          principal_id: 'g1',
          effect: 'allow',
          action: 'use',
          created_at: 1,
          updated_at: 1,
        },
        {
          id: '2',
          model_id: 'm1',
          principal_type: 'user',
          principal_id: '',
          effect: 'deny',
          action: 'use',
          created_at: 1,
          updated_at: 1,
        },
        {
          id: '3',
          model_id: 'm1',
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
      const result = await loadModelAclRules(db, 'm1');
      expect(result).toHaveLength(1);
    });

    it('deduplicates rows with same composite key', async () => {
      const mockRows = [
        {
          id: '1',
          model_id: 'm1',
          principal_type: 'user',
          principal_id: 'u1',
          effect: 'allow',
          action: 'use',
          created_at: 1,
          updated_at: 1,
        },
        {
          id: '2',
          model_id: 'm1',
          principal_type: 'user',
          principal_id: 'u1',
          effect: 'allow',
          action: 'use',
          created_at: 2,
          updated_at: 2,
        },
      ];
      const db = {
        run: vi.fn().mockResolvedValue(),
        all: vi.fn().mockResolvedValue(mockRows),
      };
      const result = await loadModelAclRules(db, 'm1');
      expect(result).toHaveLength(1);
    });

    it('handles db.all returning non-array', async () => {
      const db = {
        run: vi.fn().mockResolvedValue(),
        all: vi.fn().mockResolvedValue(null),
      };
      const result = await loadModelAclRules(db);
      expect(result).toEqual([]);
    });

    it('prefers single modelId over modelIds when both provided', async () => {
      const db = {
        run: vi.fn().mockResolvedValue(),
        all: vi.fn().mockResolvedValue([]),
      };
      await loadModelAclRules(db, 'm1', ['m2', 'm3']);
      // singleFilter uses buildIdFilterClause which produces IN clause
      expect(db.all).toHaveBeenCalledWith(expect.stringContaining('model_id IN (?)'), ['m1']);
    });

    it('round-trips encoded model IDs through save and load', async () => {
      const db = {
        run: vi.fn().mockResolvedValue(),
        prepare: vi.fn().mockReturnValue('stmt'),
        batch: vi.fn().mockResolvedValue(),
        all: vi.fn().mockResolvedValue([
          {
            id: '1',
            model_id: 'org/model',
            principal_type: 'user',
            principal_id: 'u1',
            effect: 'allow',
            action: 'use',
            created_at: 1,
            updated_at: 1,
          },
        ]),
      };

      await saveModelAclRulesForModel(db, 'org%2Fmodel', [
        { principal_id: 'u1', effect: 'allow', action: 'use' },
      ]);

      await expect(loadModelAclRules(db, 'org%2Fmodel')).resolves.toHaveLength(1);
    });
  });

  // ── saveModelAclRulesForModel ────────────────────────────────

  describe('saveModelAclRulesForModel', () => {
    it('batches statements and reloads rules', async () => {
      const db = {
        run: vi.fn().mockResolvedValue(),
        prepare: vi.fn().mockReturnValue('stmt'),
        batch: vi.fn().mockResolvedValue(),
        all: vi.fn().mockResolvedValue([]),
      };
      await saveModelAclRulesForModel(db, 'm1', [
        { principal_id: 'u1', effect: 'allow', action: 'use' },
      ]);
      expect(db.batch).toHaveBeenCalledWith(expect.any(Array));
    });
  });
});
