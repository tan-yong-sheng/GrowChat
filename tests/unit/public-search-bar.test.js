// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { captureRenderState, restoreRenderState } from '../../public/js/shared/components/search-bar.js';

function flush() {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

describe('shared render-state helpers', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('restores scroll position and focused search input after rerender', async () => {
    vi.stubGlobal('requestAnimationFrame', (cb) => {
      cb();
      return 0;
    });

    document.body.innerHTML = `
      <div id="container">
        <div data-models-scroll="1" style="height: 100px; overflow: auto;">
          <input id="model-search-input" value="deepseek">
          <div style="height: 1000px;"></div>
        </div>
      </div>
    `;

    const container = document.getElementById('container');
    const scrollEl = container.querySelector('[data-models-scroll]');
    const input = container.querySelector('#model-search-input');
    scrollEl.scrollTop = 240;
    input.focus();
    input.setSelectionRange(3, 7);

    const snapshot = captureRenderState(container, {
      inputId: 'model-search-input',
      scrollSelector: '[data-models-scroll]',
    });

    container.innerHTML = `
      <div id="container">
        <div data-models-scroll="1" style="height: 100px; overflow: auto;">
          <input id="model-search-input" value="deepseek">
          <div style="height: 1000px;"></div>
        </div>
      </div>
    `;

    restoreRenderState(container, snapshot, {
      inputId: 'model-search-input',
      scrollSelector: '[data-models-scroll]',
    });

    expect(container.querySelector('[data-models-scroll]').scrollTop).toBe(240);
    await flush();
    expect(document.activeElement.id).toBe('model-search-input');
    expect(document.activeElement.selectionStart).toBe(3);
    expect(document.activeElement.selectionEnd).toBe(7);
  });
});
