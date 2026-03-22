import { describe, expect, it } from 'vitest';

import {
  buildProviderOptions,
  filterModelsByProvider,
  filterModelsBySearchAndProvider,
  getModelProviderLabel,
  getModelProviderKey,
} from './model-filters.js';

describe('model filters', () => {
  it('normalizes provider key from model fields', () => {
    expect(getModelProviderKey({ connection_name: 'My OpenAI' })).toBe('my openai');
    expect(getModelProviderKey({ provider_family: 'OpenAI' })).toBe('openai');
    expect(getModelProviderKey({ provider_type: 'Google' })).toBe('google');
    expect(getModelProviderKey({ provider: 'Anthropic' })).toBe('anthropic');
    expect(getModelProviderKey({})).toBe('unknown');
  });

  it('builds provider options with counts', () => {
    const models = [
      { id: 'a', provider_family: 'openai', connection_name: 'OpenAI Main', enabled: true },
      { id: 'b', provider_family: 'openai', connection_name: 'OpenAI Main', enabled: false },
      { id: 'c', provider_family: 'google', connection_name: 'Gemini', enabled: true },
    ];
    const options = buildProviderOptions(models);
    const all = options.find((option) => option.value === 'all');
    const openai = options.find((option) => option.value === 'openai main');
    const google = options.find((option) => option.value === 'gemini');

    expect(all?.total).toBe(3);
    expect(all?.active).toBe(2);
    expect(openai?.total).toBe(2);
    expect(openai?.active).toBe(1);
    expect(google?.total).toBe(1);
    expect(google?.active).toBe(1);
    expect(openai?.label).toBe('OpenAI Main');
    expect(google?.label).toBe('Gemini');
    expect(getModelProviderLabel(models[0])).toBe('OpenAI Main');
  });

  it('filters models by provider and search', () => {
    const models = [
      { id: 'openai/gpt-4', name: 'GPT-4', provider_family: 'openai', connection_name: 'OpenAI Main' },
      { id: 'google/gemini', name: 'Gemini', provider_family: 'google', connection_name: 'Gemini' },
    ];
    const providerFiltered = filterModelsByProvider(models, 'gemini');
    expect(providerFiltered).toHaveLength(1);
    expect(providerFiltered[0].id).toBe('google/gemini');

    const searchFiltered = filterModelsBySearchAndProvider(models, { query: 'gpt', provider: 'all' });
    expect(searchFiltered).toHaveLength(1);
    expect(searchFiltered[0].id).toBe('openai/gpt-4');
  });
});
