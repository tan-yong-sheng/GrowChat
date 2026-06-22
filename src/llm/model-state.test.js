import { describe, expect, it } from 'vitest';
import { countEnabledModels, sortModelsByActiveThenName } from './model-state.js';

describe('model-state utils', () => {
  describe('countEnabledModels', () => {
    it('counts enabled models', () => {
      expect(
        countEnabledModels([{ id: 'a', enabled: true }, { id: 'b', enabled: false }, { id: 'c' }])
      ).toBe(2);
    });

    it('returns 0 for empty array', () => {
      expect(countEnabledModels([])).toBe(0);
    });

    it('returns 0 for null input', () => {
      expect(countEnabledModels(null)).toBe(0);
    });

    it('returns 0 for undefined input', () => {
      expect(countEnabledModels(undefined)).toBe(0);
    });

    it('returns 0 for non-array input', () => {
      expect(countEnabledModels('not an array')).toBe(0);
      expect(countEnabledModels(42)).toBe(0);
      expect(countEnabledModels({})).toBe(0);
    });

    it('counts all models when none have enabled property', () => {
      expect(countEnabledModels([{ id: 'a' }, { id: 'b' }, { id: 'c' }])).toBe(3);
    });

    it('returns 0 when all models are disabled', () => {
      expect(
        countEnabledModels([
          { id: 'a', enabled: false },
          { id: 'b', enabled: false },
        ])
      ).toBe(0);
    });

    it('handles models with null/undefined enabled', () => {
      expect(
        countEnabledModels([
          { id: 'a', enabled: null },
          { id: 'b', enabled: undefined },
        ])
      ).toBe(2);
    });

    it('counts models with truthy enabled values', () => {
      expect(
        countEnabledModels([
          { id: 'a', enabled: true },
          { id: 'b', enabled: 1 },
        ])
      ).toBe(2);
    });
  });

  describe('sortModelsByActiveThenName', () => {
    it('sorts enabled models before disabled ones and alphabetically within each group', () => {
      const sorted = sortModelsByActiveThenName([
        { id: 'z', name: 'Zulu', enabled: false },
        { id: 'b', name: 'Beta', enabled: true },
        { id: 'a', name: 'Alpha', enabled: true },
        { id: 'c', name: 'Charlie', enabled: false },
      ]);

      expect(sorted.map((model) => model.id)).toEqual(['a', 'b', 'c', 'z']);
    });

    it('returns empty array for empty input', () => {
      expect(sortModelsByActiveThenName([])).toEqual([]);
    });

    it('returns empty array for null input', () => {
      expect(sortModelsByActiveThenName(null)).toEqual([]);
    });

    it('returns empty array for undefined input', () => {
      expect(sortModelsByActiveThenName(undefined)).toEqual([]);
    });

    it('returns empty array for non-array input', () => {
      expect(sortModelsByActiveThenName('not an array')).toEqual([]);
    });

    it('does not mutate original array', () => {
      const original = [{ id: 'b' }, { id: 'a' }];
      const sorted = sortModelsByActiveThenName(original);
      expect(original.map((m) => m.id)).toEqual(['b', 'a']);
      expect(sorted.map((m) => m.id)).toEqual(['a', 'b']);
    });

    it('sorts by name when all enabled', () => {
      const sorted = sortModelsByActiveThenName([
        { id: 'z', name: 'Zebra', enabled: true },
        { id: 'a', name: 'Apple', enabled: true },
        { id: 'm', name: 'Mango', enabled: true },
      ]);
      expect(sorted.map((m) => m.id)).toEqual(['a', 'm', 'z']);
    });

    it('sorts by name when all disabled', () => {
      const sorted = sortModelsByActiveThenName([
        { id: 'z', name: 'Zebra', enabled: false },
        { id: 'a', name: 'Apple', enabled: false },
      ]);
      expect(sorted.map((m) => m.id)).toEqual(['a', 'z']);
    });

    it('falls back to id when name is missing', () => {
      const sorted = sortModelsByActiveThenName([{ id: 'z' }, { id: 'a' }]);
      expect(sorted.map((m) => m.id)).toEqual(['a', 'z']);
    });

    it('falls back to connection_name', () => {
      const sorted = sortModelsByActiveThenName([
        { id: 'z', connection_name: 'Zebra', enabled: true },
        { id: 'a', connection_name: 'Apple', enabled: true },
      ]);
      expect(sorted.map((m) => m.id)).toEqual(['a', 'z']);
    });

    it('falls back to connection_id', () => {
      const sorted = sortModelsByActiveThenName([
        { enabled: true, connection_id: 'z' },
        { enabled: true, connection_id: 'a' },
      ]);
      expect(sorted.map((m) => m.connection_id)).toEqual(['a', 'z']);
    });

    it('sorts by id when names are identical', () => {
      const sorted = sortModelsByActiveThenName([
        { id: 'z', name: 'Same', enabled: true },
        { id: 'a', name: 'Same', enabled: true },
      ]);
      expect(sorted.map((m) => m.id)).toEqual(['a', 'z']);
    });

    it('sorts by connection_name when id is also identical', () => {
      const sorted = sortModelsByActiveThenName([
        { id: 'same', name: 'Same', connection_name: 'Beta', enabled: true },
        { id: 'same', name: 'Same', connection_name: 'Alpha', enabled: true },
      ]);
      expect(sorted.map((m) => m.connection_name)).toEqual(['Alpha', 'Beta']);
    });

    it('handles case-insensitive name sorting', () => {
      const sorted = sortModelsByActiveThenName([
        { id: 'a', name: 'alpha', enabled: true },
        { id: 'b', name: 'ALPHA', enabled: true },
      ]);
      // localeCompare is case-sensitive by default, but the impl uses toLowerCase
      expect(sorted[0].name).toBe('alpha');
      expect(sorted[1].name).toBe('ALPHA');
    });

    it('handles models with no identifying fields', () => {
      const sorted = sortModelsByActiveThenName([{}, {}]);
      expect(sorted).toHaveLength(2);
    });

    it('sorts mixed case names', () => {
      const sorted = sortModelsByActiveThenName([
        { id: 'a', name: 'zebra', enabled: true },
        { id: 'b', name: 'Alpha', enabled: true },
      ]);
      expect(sorted.map((m) => m.id)).toEqual(['b', 'a']);
    });

    it('preserves stability for equal elements', () => {
      const sorted = sortModelsByActiveThenName([
        { id: 'first', name: 'Same', enabled: true },
        { id: 'second', name: 'Same', enabled: true },
      ]);
      // When all comparison functions return 0, original order should be preserved
      // (slice() creates a shallow copy, then sort is stable in modern JS)
      expect(sorted[0].id).toBe('first');
      expect(sorted[1].id).toBe('second');
    });
  });
});
