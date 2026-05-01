import { describe, expect, it } from 'vitest';
import { countEnabledModels, sortModelsByActiveThenName } from './model-state.js';

describe('model-state utils', () => {
  it('counts enabled models', () => {
    expect(
      countEnabledModels([{ id: 'a', enabled: true }, { id: 'b', enabled: false }, { id: 'c' }])
    ).toBe(2);
  });

  it('sorts enabled models before disabled ones and alphabetically within each group', () => {
    const sorted = sortModelsByActiveThenName([
      { id: 'z', name: 'Zulu', enabled: false },
      { id: 'b', name: 'Beta', enabled: true },
      { id: 'a', name: 'Alpha', enabled: true },
      { id: 'c', name: 'Charlie', enabled: false },
    ]);

    expect(sorted.map((model) => model.id)).toEqual(['a', 'b', 'c', 'z']);
  });
});
