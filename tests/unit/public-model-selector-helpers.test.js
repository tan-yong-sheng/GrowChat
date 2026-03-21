import { describe, expect, it, vi } from 'vitest';
import {
  getModelDisplayLabel,
  getModelSelectorDerivedState,
  getPreferredModelId,
  persistDefaultModelSelection,
  renderModelSelectorOption,
} from '../../public/js/features/chat/model-selector-helpers.js';

describe('model selector helpers', () => {
  it('formats model display labels', () => {
    expect(getModelDisplayLabel({ name: 'GPT Mini' })).toBe('GPT Mini');
    expect(getModelDisplayLabel({ id: 'm1' })).toBe('m1');
  });

  it('derives filtered and visible model slices', () => {
    const models = [
      { id: 'm1', name: 'Alpha' },
      { id: 'm2', name: 'Beta' },
      { id: 'm3', name: 'Gamma' },
    ];
    const derived = getModelSelectorDerivedState({
      sortedModels: models,
      searchQuery: 'be',
      visibleCount: 10,
      pageSize: 2,
      maxVisibleNoScroll: 40,
    });

    expect(derived.allFilteredModels).toEqual([models[1]]);
    expect(derived.visibleModels).toEqual([models[1]]);
    expect(derived.visibleCount).toBe(1);
  });

  it('falls back to the first alphabetically sorted model when no preferred id matches', () => {
    const models = [
      { id: 'm2', name: 'Zulu' },
      { id: 'm1', name: 'Alpha' },
    ];

    expect(getPreferredModelId(models, [null, 'missing'])).toBe('m1');
    expect(getPreferredModelId([], ['m1'])).toBeNull();
  });

  it('renders the selected model option markup', () => {
    const html = renderModelSelectorOption({ id: 'm1', name: 'GPT Mini' }, { activeModelId: 'm1' });
    expect(html).toContain('data-model-id="m1"');
    expect(html).toContain('aria-selected="true"');
    expect(html).toContain('GPT Mini');
  });

  it('persists default model preference or falls back to session storage', async () => {
    const storage = new Map();
    globalThis.localStorage = {
      getItem: (key) => storage.get(key) ?? null,
      setItem: (key, value) => { storage.set(key, String(value)); },
      removeItem: (key) => { storage.delete(key); },
      clear: () => storage.clear(),
    };
    const apiFetch = vi.fn().mockResolvedValue(new Response('{}', {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }));
    const onSuccess = vi.fn();
    const result = await persistDefaultModelSelection({
      apiFetch,
      modelId: 'm2',
      currentPreferences: { theme: 'light' },
      onSuccess,
    });

    expect(result.ok).toBe(true);
    expect(onSuccess).toHaveBeenCalledWith('Default model set');
    expect(globalThis.localStorage.getItem('defaultModelId')).toBe('m2');
    expect(apiFetch).toHaveBeenCalledWith('/api/users/me', expect.objectContaining({
      method: 'PUT',
      body: JSON.stringify({ preferences: { theme: 'light', defaultModelId: 'm2' } }),
    }));
  });

  it('clears the persisted default model when unsetting', async () => {
    const storage = new Map([['defaultModelId', 'm2']]);
    globalThis.localStorage = {
      getItem: (key) => storage.get(key) ?? null,
      setItem: (key, value) => { storage.set(key, String(value)); },
      removeItem: (key) => { storage.delete(key); },
      clear: () => storage.clear(),
    };
    const apiFetch = vi.fn().mockResolvedValue(new Response('{}', {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }));
    const onSuccess = vi.fn();
    const result = await persistDefaultModelSelection({
      apiFetch,
      modelId: null,
      currentPreferences: { theme: 'light', defaultModelId: 'm2' },
      onSuccess,
    });

    expect(result.ok).toBe(true);
    expect(onSuccess).toHaveBeenCalledWith('Default model cleared');
    expect(globalThis.localStorage.getItem('defaultModelId')).toBeNull();
    expect(apiFetch).toHaveBeenCalledWith('/api/users/me', expect.objectContaining({
      method: 'PUT',
      body: JSON.stringify({ preferences: { theme: 'light' } }),
    }));
  });
});


