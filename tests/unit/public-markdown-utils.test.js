// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { renderMessageContent, ensureMarkedReady } from '../../public/js/shared/utils.js';

describe('markdown rendering utilities', () => {
  const originalMarked = globalThis.window?.marked;

  beforeEach(() => {
    if (globalThis.window) {
      delete globalThis.window.marked;
    }
  });

  afterEach(() => {
    if (globalThis.window) {
      globalThis.window.marked = originalMarked;
    }
  });

  it('uses marked when available and applies configuration', () => {
    const parse = vi.fn(() => '<p>ok</p>');
    const setOptions = vi.fn();
    globalThis.window.marked = { parse, setOptions };

    const html = renderMessageContent('Hello');

    expect(parse).toHaveBeenCalledWith('Hello');
    expect(setOptions).toHaveBeenCalled();
    expect(html).toBe('<p>ok</p>');
  });

  it('falls back to paragraph and code fence rendering when marked is missing', () => {
    const html = renderMessageContent(`Hello

\`\`\`js
console.log(1)
\`\`\`

Next`);

    expect(html).toContain('<p>Hello</p>');
    expect(html).toContain('<pre><code>');
    expect(html).toContain('console.log(1)');
    expect(html).toContain('<p>Next</p>');
  });

  it('ensureMarkedReady resolves true when marked is present', async () => {
    const parse = vi.fn(() => '<p>ok</p>');
    const setOptions = vi.fn();
    globalThis.window.marked = { parse, setOptions };

    const ready = await ensureMarkedReady();

    expect(ready).toBe(true);
    expect(setOptions).toHaveBeenCalled();
  });
});
