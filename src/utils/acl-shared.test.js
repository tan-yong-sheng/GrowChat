import { describe, expect, it } from 'vitest';
import { ruleMatchesPrincipal, buildIdFilterClause } from './acl-shared.js';

describe('acl-shared', () => {
  describe('ruleMatchesPrincipal', () => {
    it('returns false for null rule', () => {
      expect(ruleMatchesPrincipal(null, 'user1', new Set())).toBe(false);
    });

    it('returns false for undefined rule', () => {
      expect(ruleMatchesPrincipal(undefined, 'user1', new Set())).toBe(false);
    });

    describe('user principal type', () => {
      it('matches when principal_id equals userId', () => {
        const rule = { principal_type: 'user', principal_id: 'user1' };
        expect(ruleMatchesPrincipal(rule, 'user1', new Set())).toBe(true);
      });

      it('does not match when principal_id differs from userId', () => {
        const rule = { principal_type: 'user', principal_id: 'user2' };
        expect(ruleMatchesPrincipal(rule, 'user1', new Set())).toBe(false);
      });

      it('coerces principal_id and userId to strings for comparison', () => {
        const rule = { principal_type: 'user', principal_id: 42 };
        expect(ruleMatchesPrincipal(rule, 42, new Set())).toBe(true);
      });

      it('preserves numeric id 0 instead of coercing to empty string', () => {
        const rule = { principal_type: 'user', principal_id: 0 };
        expect(ruleMatchesPrincipal(rule, 0, new Set())).toBe(true);
        expect(ruleMatchesPrincipal(rule, '', new Set())).toBe(false);
      });

      it('handles missing principal_id (empty string)', () => {
        const rule = { principal_type: 'user' };
        expect(ruleMatchesPrincipal(rule, 'user1', new Set())).toBe(false);
      });

      it('handles missing userId (empty string)', () => {
        const rule = { principal_type: 'user', principal_id: 'user1' };
        expect(ruleMatchesPrincipal(rule, null, new Set())).toBe(false);
      });

      it('both principal_id and userId empty strings match', () => {
        const rule = { principal_type: 'user', principal_id: '' };
        expect(ruleMatchesPrincipal(rule, '', new Set())).toBe(true);
      });
    });

    describe('group principal type', () => {
      it('matches when principal_id is in userGroupIds set', () => {
        const rule = { principal_type: 'group', principal_id: 'groupA' };
        expect(ruleMatchesPrincipal(rule, 'user1', new Set(['groupA']))).toBe(true);
      });

      it('does not match when principal_id is not in userGroupIds set', () => {
        const rule = { principal_type: 'group', principal_id: 'groupB' };
        expect(ruleMatchesPrincipal(rule, 'user1', new Set(['groupA']))).toBe(false);
      });

      it('returns false when userGroupIds is not a Set', () => {
        const rule = { principal_type: 'group', principal_id: 'groupA' };
        expect(ruleMatchesPrincipal(rule, 'user1', null)).toBe(false);
      });

      it('returns false when userGroupIds is undefined', () => {
        const rule = { principal_type: 'group', principal_id: 'groupA' };
        expect(ruleMatchesPrincipal(rule, 'user1', undefined)).toBe(false);
      });

      it('returns false when userGroupIds is a plain array (not Set)', () => {
        const rule = { principal_type: 'group', principal_id: 'groupA' };
        expect(ruleMatchesPrincipal(rule, 'user1', ['groupA'])).toBe(false);
      });

      it('coerces principal_id to string when checking Set membership', () => {
        const rule = { principal_type: 'group', principal_id: 42 };
        expect(ruleMatchesPrincipal(rule, 'user1', new Set(['42']))).toBe(true);
      });

      it('preserves numeric group id 0 instead of coercing to empty string', () => {
        const rule = { principal_type: 'group', principal_id: 0 };
        expect(ruleMatchesPrincipal(rule, 'user1', new Set(['0']))).toBe(true);
        expect(ruleMatchesPrincipal(rule, 'user1', new Set())).toBe(false);
      });

      it('handles empty Set', () => {
        const rule = { principal_type: 'group', principal_id: 'groupA' };
        expect(ruleMatchesPrincipal(rule, 'user1', new Set())).toBe(false);
      });
    });
  });

  describe('buildIdFilterClause', () => {
    it('builds IN clause for a single id', () => {
      const result = buildIdFilterClause('column_name', ['id1']);
      expect(result).toEqual({ clause: 'column_name IN (?)', values: ['id1'] });
    });

    it('builds IN clause for multiple ids', () => {
      const result = buildIdFilterClause('col', ['a', 'b', 'c']);
      expect(result).toEqual({ clause: 'col IN (?, ?, ?)', values: ['a', 'b', 'c'] });
    });

    it('returns null for empty array', () => {
      expect(buildIdFilterClause('col', [])).toBeNull();
    });

    it('returns null for undefined ids (defaults to [])', () => {
      expect(buildIdFilterClause('col')).toBeNull();
    });

    it('returns null for null ids', () => {
      expect(buildIdFilterClause('col', null)).toBeNull();
    });

    it('returns null when all ids are falsy/whitespace', () => {
      expect(buildIdFilterClause('col', ['', '  ', null, undefined])).toBeNull();
    });

    it('trims whitespace from ids', () => {
      const result = buildIdFilterClause('col', ['  id1  ', 'id2']);
      expect(result.values).toEqual(['id1', 'id2']);
    });

    it('filters out empty/falsy values but keeps valid ones', () => {
      const result = buildIdFilterClause('col', ['', 'valid', null, 'also']);
      expect(result.values).toEqual(['valid', 'also']);
    });

    it('coerces ids to strings', () => {
      const result = buildIdFilterClause('col', [42, true]);
      expect(result.values).toEqual(['42', 'true']);
    });

    it('preserves numeric id 0', () => {
      const result = buildIdFilterClause('col', [0]);
      expect(result).toEqual({ clause: 'col IN (?)', values: ['0'] });
    });

    it('handles non-array ids input (defaults to empty)', () => {
      expect(buildIdFilterClause('col', 'not-array')).toBeNull();
    });
  });
});
