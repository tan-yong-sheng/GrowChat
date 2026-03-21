import { beforeEach, describe, expect, it, vi } from 'vitest';
import { broadcastModelsInvalidation, consumeModelsInvalidation } from '../../public/js/shared/utils/model-sync.js';

describe('model sync helpers', () => {
  let storage;
  let session;

  beforeEach(() => {
    storage = new Map();
    session = new Map();
    globalThis.localStorage = {
      getItem: (key) => storage.get(key) ?? null,
      setItem: (key, value) => { storage.set(key, String(value)); },
      removeItem: (key) => { storage.delete(key); },
    };
    globalThis.sessionStorage = {
      getItem: (key) => session.get(key) ?? null,
      setItem: (key, value) => { session.set(key, String(value)); },
      removeItem: (key) => { session.delete(key); },
    };
    globalThis.dispatchEvent = vi.fn();
    globalThis.CustomEvent = class CustomEvent {
      constructor(type, init = {}) {
        this.type = type;
        this.detail = init.detail;
      }
    };
  });

  it('broadcasts a token and clears the cached models state', () => {
    storage.set('growchat_models_cache_v1', '{"savedAt":1,"value":{"models":[]}}');

    const token = broadcastModelsInvalidation('token-123');

    expect(token).toBe('token-123');
    expect(storage.get('growchat_models_invalidate')).toBe('token-123');
    expect(storage.has('growchat_models_cache_v1')).toBe(false);
    expect(globalThis.dispatchEvent).toHaveBeenCalledTimes(1);
  });

  it('consumes a token once per session', () => {
    storage.set('growchat_models_invalidate', 'token-abc');

    expect(consumeModelsInvalidation()).toBe('token-abc');
    expect(session.get('growchat_models_invalidate_seen')).toBe('token-abc');
    expect(consumeModelsInvalidation()).toBe(null);
  });

  it('returns null when storage is unavailable', () => {
    delete globalThis.localStorage;
    delete globalThis.sessionStorage;

    expect(consumeModelsInvalidation()).toBe(null);
  });
});


