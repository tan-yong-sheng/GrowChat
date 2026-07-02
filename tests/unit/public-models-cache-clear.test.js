// @vitest-environment jsdom

import { beforeEach, describe, expect, it } from 'vitest';
import {
  clearModelsCache,
  readModelsCache,
  writeModelsCache,
} from '../../public/js/shared/api/cache.js';

describe('clearModelsCache — prefix iteration', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('removes all growchat_models_cache_v1_* scopes, including unknown sibling scopes', () => {
    writeModelsCache(['m1'], 'global');
    writeModelsCache(['m2'], 'effective');
    // Manually inject a sibling scope that the hardcoded clear would have missed.
    localStorage.setItem(
      'growchat_models_cache_v1_test',
      JSON.stringify({ savedAt: Date.now(), value: ['leaked'] })
    );
    localStorage.setItem(
      'growchat_models_cache_v1_conn_xyz',
      JSON.stringify({ savedAt: Date.now(), value: ['leaked-2'] })
    );

    expect(readModelsCache('global')).toEqual(['m1']);
    expect(readModelsCache('effective')).toEqual(['m2']);
    expect(readModelsCache('test')).toEqual(['leaked']);

    clearModelsCache();

    expect(readModelsCache('global')).toBeNull();
    expect(readModelsCache('effective')).toBeNull();
    expect(readModelsCache('test')).toBeNull();
    expect(readModelsCache('conn_xyz')).toBeNull();
    expect(localStorage.getItem('growchat_models_cache_v1_test')).toBeNull();
    expect(localStorage.getItem('growchat_models_cache_v1_conn_xyz')).toBeNull();
  });

  it('removes the legacy growchat_models_cache_v1 key', () => {
    localStorage.setItem(
      'growchat_models_cache_v1',
      JSON.stringify({ savedAt: Date.now(), value: ['legacy'] })
    );

    clearModelsCache();

    expect(localStorage.getItem('growchat_models_cache_v1')).toBeNull();
  });

  it('does not touch unrelated localStorage keys', () => {
    localStorage.setItem('defaultModelId', 'gpt-4');
    localStorage.setItem('drafts', '{"c1":"hello"}');
    localStorage.setItem(
      'growchat_models_cache_v1_global',
      JSON.stringify({ savedAt: Date.now(), value: ['m1'] })
    );

    clearModelsCache();

    expect(localStorage.getItem('defaultModelId')).toBe('gpt-4');
    expect(localStorage.getItem('drafts')).toBe('{"c1":"hello"}');
    expect(localStorage.getItem('growchat_models_cache_v1_global')).toBeNull();
  });
});
