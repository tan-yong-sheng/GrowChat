import { describe, expect, it } from 'vitest';
import { filterModelsBySearch, normalizeModelSearchQuery } from '../../public/js/shared/utils/model-search.js';

describe('model search helpers', () => {
  it('normalizes model search queries', () => {
    expect(normalizeModelSearchQuery('  GPT-4  ')).toBe('gpt-4');
    expect(normalizeModelSearchQuery(null)).toBe('');
  });

  it('filters models by id, name, provider, and connection fields', () => {
    const models = [
      { id: 'gpt-4o', name: 'GPT-4o', provider_type: 'openai' },
      { id: 'claude-3', name: 'Claude', providerFamily: 'anthropic' },
      { id: 'llama', name: 'Llama', connection_name: 'local-gateway' },
    ];

    expect(filterModelsBySearch(models, 'gpt')).toEqual([models[0]]);
    expect(filterModelsBySearch(models, 'anthropic')).toEqual([models[1]]);
    expect(filterModelsBySearch(models, 'gateway')).toEqual([models[2]]);
    expect(filterModelsBySearch(models, '')).toEqual(models);
  });
});


