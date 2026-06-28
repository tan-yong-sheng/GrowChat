import { describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  discoverConnectionModels: vi.fn(),
  extractConnectionModelId: vi.fn(),
  normalizeConnectionManualModels: vi.fn(),
  dedupeConnectionConfigs: vi.fn(),
  normalizeProviderFamily: vi.fn(),
  buildProviderId: vi.fn(),
  formatModelId: vi.fn(),
  normalizeConnectionModelId: vi.fn(),
  normalizeConnectionModelSelectionMode: vi.fn(),
}));

vi.mock('../../llm/connections.js', () => ({
  dedupeConnectionConfigs: (...args) => mocks.dedupeConnectionConfigs(...args),
  discoverConnectionModels: (...args) => mocks.discoverConnectionModels(...args),
  extractConnectionModelId: (...args) => mocks.extractConnectionModelId(...args),
  normalizeConnectionManualModels: (...args) => mocks.normalizeConnectionManualModels(...args),
}));

vi.mock('../../llm/provider-registry.js', () => ({
  buildProviderId: (...args) => mocks.buildProviderId(...args),
  formatModelId: (...args) => mocks.formatModelId(...args),
  normalizeConnectionModelId: (...args) => mocks.normalizeConnectionModelId(...args),
  normalizeProviderFamily: (...args) => mocks.normalizeProviderFamily(...args),
}));

vi.mock('../../../public/js/shared/utils/connection-model-selection.js', () => ({
  normalizeConnectionModelSelectionMode: (...args) =>
    mocks.normalizeConnectionModelSelectionMode(...args),
}));

import {
  toPublicModel,
  applyUserModelVisibilityOverrides,
  splitModelScopeByUserVisibility,
  isOpenAIProvider,
  getProviderKey,
  buildProviderStats,
} from './models-discovery.js';

describe('models-discovery utilities', () => {
  describe('toPublicModel', () => {
    it('maps model fields correctly', () => {
      const model = {
        id: 'openai/gpt-4o',
        name: 'gpt-4o',
        provider: 'openai',
        provider_type: 'openai',
        provider_family: 'openai',
        provider_id: 'openai',
        connection_id: 'c1',
        connection_name: 'OpenAI',
        free: true,
        description: 'GPT-4o model',
        enabled: true,
      };
      const result = toPublicModel(model);
      expect(result.id).toBe('openai/gpt-4o');
      expect(result.name).toBe('gpt-4o');
      expect(result.enabled).toBe(true);
      expect(result.free).toBe(true);
    });

    it('defaults enabled to true', () => {
      const result = toPublicModel({ id: 'x', name: 'y', provider: 'openai' });
      expect(result.enabled).toBe(true);
    });
  });

  describe('applyUserModelVisibilityOverrides', () => {
    it('hides models in hiddenModelIds', () => {
      const models = [
        { id: 'm1', enabled: true },
        { id: 'm2', enabled: true },
      ];
      const result = applyUserModelVisibilityOverrides(models, new Set(['m1']));
      expect(result[0].visible_for_user).toBe(false);
      expect(result[0].hidden_for_user).toBe(true);
      expect(result[1].visible_for_user).toBe(true);
    });

    it('handles empty models array', () => {
      const result = applyUserModelVisibilityOverrides([], new Set());
      expect(result).toEqual([]);
    });
  });

  describe('splitModelScopeByUserVisibility', () => {
    it('splits visible and hidden models', () => {
      const models = [
        { id: 'm1', enabled: true },
        { id: 'm2', enabled: true },
      ];
      const { visibleModels, hiddenModels } = splitModelScopeByUserVisibility(
        models,
        new Set(['m2'])
      );
      expect(visibleModels).toHaveLength(1);
      expect(hiddenModels).toHaveLength(1);
    });
  });

  describe('isOpenAIProvider', () => {
    it('returns true for openai family', () => {
      mocks.normalizeProviderFamily.mockReturnValue('openai');
      expect(isOpenAIProvider({ provider_family: 'openai' })).toBe(true);
    });

    it('returns false for other families', () => {
      mocks.normalizeProviderFamily.mockReturnValue('google');
      expect(isOpenAIProvider({ provider_family: 'google' })).toBe(false);
    });
  });

  describe('getProviderKey', () => {
    it('returns lowercase provider key', () => {
      expect(getProviderKey({ provider: 'OpenAI' })).toBe('openai');
    });

    it('returns unknown for empty values', () => {
      expect(getProviderKey({})).toBe('unknown');
    });
  });

  describe('buildProviderStats', () => {
    it('builds stats from model list', () => {
      const models = [
        { provider: 'openai', enabled: true, connection_name: 'OpenAI' },
        { provider: 'openai', enabled: false, connection_name: 'OpenAI' },
        { provider: 'google', enabled: true, connection_name: 'Google' },
      ];
      const result = buildProviderStats(models);
      expect(result).toHaveLength(2);
      const openai = result.find((s) => s.value === 'openai');
      expect(openai.total).toBe(2);
      expect(openai.active).toBe(1);
    });
  });
});
