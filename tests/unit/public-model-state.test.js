import { describe, expect, it } from 'vitest';
import { countEnabledModels, sortModelsByActiveThenName } from '../../public/js/utils/model-state.js';

describe('public model state helpers', () => {
  it('counts enabled models from arrays and ignores non-arrays', () => {
    expect(countEnabledModels([
      { id: 'a', enabled: true },
      { id: 'b', enabled: false },
      { id: 'c' },
    ])).toBe(2);
    expect(countEnabledModels(null)).toBe(0);
  });

  it('sorts enabled models first and breaks ties consistently', () => {
    const sorted = sortModelsByActiveThenName([
      { id: 'z', name: 'Zulu', enabled: false },
      { id: 'b', name: 'Beta', enabled: true },
      { id: 'a', name: 'Alpha', enabled: true },
      { id: 'c', name: 'Alpha', enabled: true, connection_name: 'z-conn' },
      { id: 'd', connection_id: 'connection-1', enabled: true },
    ]);

    expect(sorted.map((model) => model.id)).toEqual(['a', 'c', 'b', 'd', 'z']);
  });

  it('breaks ties on the connection name when labels and ids match', () => {
    const sorted = sortModelsByActiveThenName([
      { id: 'shared', name: 'Alpha', connection_name: 'z-conn', enabled: true },
      { id: 'shared', name: 'Alpha', connection_name: 'a-conn', enabled: true },
    ]);

    expect(sorted.map((model) => model.connection_name)).toEqual(['a-conn', 'z-conn']);
  });

  it('uses connection labels when name and id are missing', () => {
    const sorted = sortModelsByActiveThenName([
      { connection_id: 'beta-1', enabled: true },
      { connection_name: 'alpha-1', enabled: true },
    ]);

    expect(sorted.map((model) => model.connection_name || model.connection_id)).toEqual(['alpha-1', 'beta-1']);
  });
});
