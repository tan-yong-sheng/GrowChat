import { describe, it, expect } from 'vitest';
import {
  buildProviderId,
  getConnectionProviderFamily,
  normalizeProviderFamily,
  parseProviderId,
} from './provider-registry.js';

describe('provider-registry', () => {
  it('normalizes provider families', () => {
    expect(normalizeProviderFamily('openai-compatible')).toBe('openai');
    expect(normalizeProviderFamily('gemini-compatible')).toBe('google');
    expect(normalizeProviderFamily('claude-compatible')).toBe('anthropic');
  });

  it('uses openai as the canonical prefix for openai-compatible connections', () => {
    expect(buildProviderId({ id: 'conn-1', providerType: 'openai-compatible' })).toBe(
      'openai/conn-1'
    );
    expect(buildProviderId({ id: 'conn-2', providerType: 'google' })).toBe('google/conn-2');
    expect(buildProviderId({ id: 'conn-3', providerType: 'anthropic' })).toBe('anthropic/conn-3');
  });

  it('parses provider ids back to provider families', () => {
    expect(parseProviderId('openai/conn-1')).toMatchObject({
      providerFamily: 'openai',
      connectionId: 'conn-1',
    });
    expect(parseProviderId('google/conn-2')).toMatchObject({
      providerFamily: 'google',
      connectionId: 'conn-2',
    });
    expect(parseProviderId('anthropic/conn-3')).toMatchObject({
      providerFamily: 'anthropic',
      connectionId: 'conn-3',
    });
  });

  it('prefers providerType over stale providerFamily when resolving connection family', () => {
    expect(
      getConnectionProviderFamily({
        providerType: 'google',
        providerFamily: 'openai',
      })
    ).toBe('google');
  });
});
