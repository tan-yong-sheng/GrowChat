// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { ensureMarkedReady, renderMessageContent } from '../../public/js/shared/utils.js';
import { enhanceMarkdownSpecialBlocks } from '../../public/js/shared/markdown-renderer.js';

function textToken(text) {
  return { type: 'text', raw: text, text };
}

describe('markdown rendering utilities', () => {
  const originalMarked = globalThis.window?.marked;

  beforeEach(() => {
    if (globalThis.window) {
      delete globalThis.window.marked;
      delete globalThis.window.katex;
      delete globalThis.window.mermaid;
      delete globalThis.window.Graphviz;
      delete globalThis.window.graphviz;
    }
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: vi.fn() },
      configurable: true,
    });
    if (document?.body) document.body.innerHTML = '';
  });

  afterEach(() => {
    if (globalThis.window) {
      globalThis.window.marked = originalMarked;
    }
  });

  it('uses marked.lexer when available and applies configuration', () => {
    const lexer = vi.fn(() => [
      { type: 'paragraph', tokens: [textToken('Hello world')] },
    ]);
    const setOptions = vi.fn();
    globalThis.window.marked = { lexer, setOptions };

    const html = renderMessageContent('Hello world alpha');

    expect(lexer).toHaveBeenCalledWith('Hello world alpha');
    expect(setOptions).toHaveBeenCalled();
    expect(html).toContain('<p dir="auto">Hello world</p>');
  });

  it('renders paragraphs, tables, and code blocks from tokens', () => {
    const lexer = vi.fn(() => [
      { type: 'paragraph', tokens: [textToken('Hello world')] },
      {
        type: 'paragraph',
        tokens: [
          textToken('Visit '),
          {
            type: 'link',
            href: 'https://example.com/docs',
            title: 'Docs',
            tokens: [textToken('Example Docs')],
          },
        ],
      },
      {
        type: 'code',
        lang: 'js',
        text: 'const name = "GrowChat";',
        raw: '```js\nconst name = "GrowChat";\n```',
      },
      {
        type: 'table',
        header: [
          { tokens: [textToken('Name')] },
          { tokens: [textToken('Value')] },
        ],
        rows: [
          [
            { tokens: [textToken('A')] },
            { tokens: [textToken('10')] },
          ],
        ],
        align: [null, null],
      },
    ]);
    globalThis.window.marked = { lexer, setOptions: vi.fn() };

    const html = renderMessageContent('Hello world beta');

    expect(html).toContain('data-markdown-code-block');
    expect(html).toContain('data-markdown-code-copy');
    expect(html).toContain('data-markdown-code-toggle');
    expect(html).toContain('<a href="https://example.com/docs" target="_blank" rel="noopener noreferrer" title="Docs">Example Docs</a>');
    expect(html).toContain('<pre class="gc-markdown-code-block" data-markdown-code-body><code class="language-text">');
    expect(html).toContain('</code></pre>');
    expect(html).toContain('<table class="gc-markdown-table"');
    expect(html).toContain('<p dir="auto">Hello world</p>');
    expect(html).toContain('const name = &quot;GrowChat&quot;');
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
    globalThis.window.marked = {
      lexer: vi.fn(() => []),
      setOptions: vi.fn(),
    };

    const ready = await ensureMarkedReady();

    expect(ready).toBe(true);
    expect(globalThis.window.marked.setOptions).toHaveBeenCalled();
  });

  it('renders KaTeX preview and code toggle for display math', async () => {
    globalThis.window.marked = {
      lexer: vi.fn(() => [
        { type: 'code', lang: 'katex', text: 'E = mc^2', raw: '```katex\nE = mc^2\n```' },
      ]),
      setOptions: vi.fn(),
    };
    globalThis.window.katex = {
      renderToString: vi.fn((source) => `<span class="katex-rendered">${source}</span>`),
    };

    const html = renderMessageContent('$$\nE = mc^2\n$$ alpha');
    document.body.innerHTML = `<div id="fixture">${html}</div>`;
    await enhanceMarkdownSpecialBlocks(document.body);

    const block = document.querySelector('[data-markdown-special-kind="katex"]');
    expect(block).toBeTruthy();
    expect(block.querySelector('.gc-markdown-special-toolbar [data-markdown-special-copy]')).toBeTruthy();
    expect(block.querySelector('.gc-markdown-special-toolbar [data-markdown-special-collapse]')).toBeTruthy();
    expect(block.querySelector('[data-markdown-special-code-shell] .gc-markdown-code-toolbar')).toBeNull();
    expect(block.querySelector('[data-markdown-special-mode-btn="preview"]')?.getAttribute('aria-pressed')).toBe('true');
    expect(block.querySelector('[data-markdown-special-mode-btn="code"]')).toBeTruthy();
    expect(block.querySelector('.katex-rendered')?.textContent).toBe('E = mc^2');
    expect(block.querySelector('[data-markdown-special-code] code')?.textContent).toContain('E = mc^2');
    expect(block.querySelector('[data-markdown-special-error]')).toBeNull();
    block.querySelector('[data-markdown-special-copy]').click();
    await Promise.resolve();
    await Promise.resolve();
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith('E = mc^2');
    expect(document.body.textContent).toContain('Copied');
    block.querySelector('[data-markdown-special-mode-btn="code"]').click();
    expect(block.querySelector('[data-markdown-special-code-shell]')?.classList.contains('hidden')).toBe(false);
    block.querySelector('[data-markdown-special-copy]').click();
    expect(navigator.clipboard.writeText).toHaveBeenCalledTimes(2);
    block.querySelector('[data-markdown-special-collapse]').click();
    expect(block.dataset.markdownSpecialCollapsed).toBe('1');
    expect(block.querySelector('[data-markdown-special-preview]')?.classList.contains('hidden')).toBe(true);
    expect(block.querySelector('[data-markdown-special-code-shell]')?.classList.contains('hidden')).toBe(true);
    expect(block.querySelector('[data-markdown-special-collapse-label]')?.textContent).toBe('Expand');
    block.querySelector('[data-markdown-special-collapse]').click();
    expect(block.dataset.markdownSpecialCollapsed).toBe('0');
    expect(block.querySelector('[data-markdown-special-collapse-label]')?.textContent).toBe('Collapse');
  });

  it('surfaces raw KaTeX parser errors in code mode', async () => {
    globalThis.window.marked = {
      lexer: vi.fn(() => [
        {
          type: 'code',
          lang: 'katex',
          text: '\\frac{1}{',
          raw: '```katex\n\\frac{1}{\n```',
        },
      ]),
      setOptions: vi.fn(),
    };
    globalThis.window.katex = {
      renderToString: vi.fn(() => {
        throw new Error('ParseError: KaTeX parse error: Expected } at end of input at position 9');
      }),
    };

    const html = renderMessageContent('$$\n\\frac{1}{\n$$');
    document.body.innerHTML = `<div>${html}</div>`;
    await enhanceMarkdownSpecialBlocks(document.body);

    const block = document.querySelector('[data-markdown-special-kind="katex"]');
    expect(globalThis.window.katex.renderToString).toHaveBeenCalled();
    expect(block.dataset.markdownSpecialMode).toBe('code');
    expect(block.querySelector('[data-markdown-special-mode-btn="preview"]')?.disabled).toBe(true);
    expect(block.querySelector('[data-markdown-special-error-body]')?.textContent).toContain('Expected } at end of input');
  });

  it('keeps special blocks in code mode while streaming and skips preview enhancement', () => {
    const originalRaf = globalThis.window.requestAnimationFrame;
    const raf = vi.fn();
    globalThis.window.requestAnimationFrame = raf;
    globalThis.window.marked = {
      lexer: vi.fn(() => [
        { type: 'code', lang: 'mermaid', text: 'graph TD\n  A --> B', raw: '```mermaid\ngraph TD\n  A --> B\n```' },
      ]),
      setOptions: vi.fn(),
    };
    globalThis.window.mermaid = {
      initialize: vi.fn(),
      run: vi.fn(),
    };

    const html = renderMessageContent('```mermaid\ngraph TD\n  A --> B\n``` stream', { streaming: true });

    expect(html).toContain('data-markdown-special-mode="code"');
    expect(html).toContain('data-markdown-special-streaming="1"');
    expect(html).toContain('data-markdown-special-mode-btn="preview"');
    expect(html).toContain('disabled aria-disabled="true"');
    expect(html).toContain('gc-markdown-special-preview hidden');
    expect(html).toContain('gc-markdown-special-code-shell');
    expect(raf).not.toHaveBeenCalled();
    globalThis.window.requestAnimationFrame = originalRaf;
  });

  it('renders Mermaid preview when mermaid blocks are present', async () => {
    globalThis.window.marked = {
      lexer: vi.fn(() => [
        { type: 'code', lang: 'mermaid', text: 'graph TD\n  A --> B', raw: '```mermaid\ngraph TD\n  A --> B\n```' },
      ]),
      setOptions: vi.fn(),
    };
    globalThis.window.mermaid = {
      initialize: vi.fn(),
      run: vi.fn(async ({ nodes }) => {
        nodes[0].innerHTML = `<svg data-mermaid-id="mermaid"><text>${nodes[0].textContent}</text></svg>`;
      }),
    };

    const html = renderMessageContent('```mermaid\ngraph TD\n  A --> B\n``` beta');
    document.body.innerHTML = `<div>${html}</div>`;
    await enhanceMarkdownSpecialBlocks(document.body);

    const block = document.querySelector('[data-markdown-special-kind="mermaid"]');
    expect(block.querySelector('svg')).toBeTruthy();
    expect(block.querySelector('svg text')?.textContent).toContain('graph TD');
    expect(block.querySelector('[data-markdown-special-error]')).toBeNull();
  });

  it('renders Graphviz preview when graphviz blocks are present', async () => {
    globalThis.window.marked = {
      lexer: vi.fn(() => [
        { type: 'code', lang: 'dot', text: 'digraph G { A -> B; }', raw: '```dot\ndigraph G { A -> B; }\n```' },
      ]),
      setOptions: vi.fn(),
    };
    globalThis.window.Graphviz = {
      load: vi.fn(async () => ({
        dot: vi.fn(async (source) => `<svg data-graphviz="1"><text>${source}</text></svg>`),
      })),
    };

    const html = renderMessageContent('```dot\ndigraph G { A -> B; }\n``` gamma');
    document.body.innerHTML = `<div>${html}</div>`;
    await enhanceMarkdownSpecialBlocks(document.body);

    const block = document.querySelector('[data-markdown-special-kind="graphviz"]');
    expect(block.querySelector('svg')).toBeTruthy();
    expect(block.querySelector('svg text')?.textContent).toContain('A -> B');
    expect(block.querySelector('[data-markdown-special-error]')).toBeNull();
  });

  it('falls back to code mode when a preview renderer fails', async () => {
    globalThis.window.marked = {
      lexer: vi.fn(() => [
        { type: 'code', lang: 'katex', text: 'fail', raw: '```katex\nfail\n```' },
      ]),
      setOptions: vi.fn(),
    };
    globalThis.window.katex = {
      renderToString: vi.fn(() => {
        throw new Error('render failed');
      }),
    };

    const html = renderMessageContent('$$\nfail\n$$ delta');
    document.body.innerHTML = `<div>${html}</div>`;
    await enhanceMarkdownSpecialBlocks(document.body);

    const block = document.querySelector('[data-markdown-special-kind="katex"]');
    expect(block.dataset.markdownSpecialMode).toBe('code');
    expect(block.querySelector('[data-markdown-special-mode-btn="preview"]')?.disabled).toBe(true);
    expect(block.querySelector('[data-markdown-special-error]')).toBeTruthy();
    expect(block.querySelector('[data-markdown-special-error-body]')?.textContent).toContain('render failed');
    expect(block.querySelector('[data-markdown-special-code-shell]')?.nextElementSibling).toBe(block.querySelector('[data-markdown-special-error]'));
  });

  it('shows parser errors directly under the code shell for invalid mermaid blocks', async () => {
    globalThis.window.marked = {
      lexer: vi.fn(() => [
        { type: 'code', lang: 'mermaid', text: 'flowchart TD\n  A[Broken <br/> label] --> B', raw: '```mermaid\nflowchart TD\n  A[Broken <br/> label] --> B\n```' },
      ]),
      setOptions: vi.fn(),
    };
    globalThis.window.mermaid = {
      initialize: vi.fn(),
      run: vi.fn(async () => {
        throw new Error('Parse error on line 3: got PS');
      }),
    };

    const html = renderMessageContent('```mermaid\nflowchart TD\n  A[Broken <br/> label] --> B\n``` epsilon');
    document.body.innerHTML = `<div>${html}</div>`;
    await enhanceMarkdownSpecialBlocks(document.body);

    const block = document.querySelector('[data-markdown-special-kind="mermaid"]');
    const codeShell = block.querySelector('[data-markdown-special-code-shell]');
    const errorEl = block.querySelector('[data-markdown-special-error]');
    expect(block.dataset.markdownSpecialMode).toBe('code');
    expect(block.querySelector('[data-markdown-special-mode-btn="preview"]')?.disabled).toBe(true);
    expect(errorEl).toBeTruthy();
    expect(errorEl.textContent).toContain('Preview unavailable');
    expect(errorEl.textContent).toContain('Parse error on line 3');
    expect(codeShell?.nextElementSibling).toBe(errorEl);
  });
});
