// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import {
  normalizeConnectionModelSelectionMode,
  resolveConnectionModelSelectionMode,
} from '../../public/js/shared/utils/connection-model-selection.js';

describe('connection model selection mode', () => {
  it('normalizes supported selection modes', () => {
    expect(normalizeConnectionModelSelectionMode('ALL')).toBe('all');
    expect(normalizeConnectionModelSelectionMode('some')).toBe('some');
    expect(normalizeConnectionModelSelectionMode('none')).toBe('none');
    expect(normalizeConnectionModelSelectionMode('')).toBe('');
  });

  it('resolves all, some, and none selection states', () => {
    const models = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
    expect(resolveConnectionModelSelectionMode(models, new Set(models.map((model) => model.id)))).toBe('all');
    expect(resolveConnectionModelSelectionMode(models, new Set(['a', 'c']))).toBe('some');
    expect(resolveConnectionModelSelectionMode(models, new Set())).toBe('none');
  });
});
