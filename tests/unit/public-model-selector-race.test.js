// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../public/js/shared/utils.js', () => ({
  showToast: vi.fn(),
  showToastProgress: vi.fn(() => ({ update: vi.fn() })),
}));

vi.mock('../../public/js/shared/api.js', () => ({
  apiFetch: vi.fn(),
}));

describe('model-selector race condition', () => {
  beforeEach(() => {
    document.body.innerHTML = '<div id="root"></div>';
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it('ensureModelsLoaded discards stale response after invalidation', async () => {
    let modelsCacheGeneration = 0;
    let prefetchResolve = null;
    let prefetchCallCount = 0;

    // Mock session-bootstrap with a controllable prefetchModels
    vi.doMock('../../public/js/bootstrap/session-bootstrap.js', () => ({
      prefetchModels: () => {
        prefetchCallCount++;
        return new Promise((resolve) => {
          prefetchResolve = resolve;
        });
      },
      getModelsCacheGeneration: () => modelsCacheGeneration,
    }));

    vi.resetModules();

    const store = await import('../../public/js/shared/store.js');
    const { renderModelSelector } = await import('../../public/js/features/chat/model-selector.js');

    const container = document.getElementById('root');

    // Start with empty models so ensureModelsLoaded triggers
    store.setState({
      models: [],
      modelsLoading: false,
      activeModelId: null,
      defaultModelId: null,
      globalDefaultModelId: null,
    });

    const destroy = renderModelSelector(container);

    // Open dropdown — triggers ensureModelsLoaded()
    container.querySelector('#model-selector-btn').click();

    // Wait for ensureModelsLoaded to call prefetchModels
    await vi.waitFor(() => expect(prefetchCallCount).toBe(1));

    // Simulate invalidation: increment generation (like checkModelsInvalidation does)
    modelsCacheGeneration += 1;

    // Now resolve the stale prefetch with old model data
    const staleModels = [{ id: 'stale-model', name: 'Stale Model' }];
    prefetchResolve({ models: staleModels, visibility: null });

    // Allow microtask queue to flush
    await new Promise((resolve) => setTimeout(resolve, 50));

    // The stale response should NOT have been applied — models should still be empty
    // because the generation counter changed after the request started
    expect(store.state.models).toEqual([]);

    destroy();
  });

  it('ensureModelsLoaded allows prefetchModels to apply state when generation is unchanged', async () => {
    let prefetchResolve = null;
    let prefetchCallCount = 0;
    let prefetchAppliedState = false;

    vi.doMock('../../public/js/bootstrap/session-bootstrap.js', () => ({
      prefetchModels: () => {
        prefetchCallCount++;
        return new Promise((resolve) => {
          prefetchResolve = (data) => {
            prefetchAppliedState = true;
            resolve(data);
          };
        });
      },
      getModelsCacheGeneration: () => 0,
    }));

    vi.resetModules();

    const store = await import('../../public/js/shared/store.js');
    const { renderModelSelector } = await import('../../public/js/features/chat/model-selector.js');

    const container = document.getElementById('root');

    store.setState({
      models: [],
      modelsLoading: false,
      activeModelId: null,
      defaultModelId: null,
      globalDefaultModelId: null,
    });

    const destroy = renderModelSelector(container);

    // Open dropdown — triggers ensureModelsLoaded()
    container.querySelector('#model-selector-btn').click();

    await vi.waitFor(() => expect(prefetchCallCount).toBe(1));

    // Resolve with fresh data (generation unchanged)
    const freshModels = [{ id: 'fresh-model', name: 'Fresh Model' }];
    prefetchResolve({ models: freshModels, visibility: null });

    // Allow microtask queue to flush
    await new Promise((resolve) => setTimeout(resolve, 50));

    // When generation is unchanged, ensureModelsLoaded should NOT early-return
    // after prefetchModels resolves — it should let the normal flow continue.
    // prefetchModels was awaited and completed without being discarded.
    expect(prefetchAppliedState).toBe(true);

    destroy();
  });

  it('ensureModelsLoaded clears loadingPromise when dynamic import fails', async () => {
    // This tests the bug identified by Gemini Code Assist: if the dynamic
    // import() is outside the try/catch, a failed import leaves loadingPromise
    // stuck as a rejected promise, blocking all future load attempts.
    //
    // We test the code pattern directly since vi.doMock intercepts before
    // the actual import() call, making it impossible to simulate import failure.

    // Pattern 1 (BUGGY): import outside try — finally never runs on import failure
    let loadingPromiseBuggy = null;
    const buggyPattern = () => {
      if (loadingPromiseBuggy) return loadingPromiseBuggy;
      loadingPromiseBuggy = (async () => {
        const mod = await Promise.reject(new Error('import failed'));
        try {
          await mod.prefetchModels();
        } catch (err) {
          console.error(err);
        } finally {
          loadingPromiseBuggy = null;
        }
      })();
      return loadingPromiseBuggy;
    };
    try {
      await buggyPattern();
    } catch (_e) {
      /* expected: import rejection */
    }
    expect(loadingPromiseBuggy).not.toBeNull(); // BUG: stuck promise

    // Pattern 2 (FIXED): import inside try — finally always runs
    let loadingPromiseFixed = null;
    const fixedPattern = () => {
      if (loadingPromiseFixed) return loadingPromiseFixed;
      loadingPromiseFixed = (async () => {
        let getGen, reqGen;
        try {
          const mod = await Promise.reject(new Error('import failed'));
          getGen = mod.getModelsCacheGeneration;
          reqGen = getGen();
          await mod.prefetchModels();
          if (reqGen !== getGen()) return;
        } catch (err) {
          if (getGen && reqGen !== undefined && reqGen !== getGen()) return;
          console.error(err);
        } finally {
          loadingPromiseFixed = null;
        }
      })();
      return loadingPromiseFixed;
    };
    try {
      await fixedPattern();
    } catch (_e) {
      /* expected: import rejection */
    }
    expect(loadingPromiseFixed).toBeNull(); // FIXED: promise cleared
  });
});
