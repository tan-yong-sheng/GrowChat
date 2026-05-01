// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('https://cdn.jsdelivr.net/npm/dompurify@3.2.6/dist/purify.es.mjs', () => ({
  default: {
    sanitize: (html) => html,
  },
}));
import {
  enhanceMarkdownSpecialBlocks,
  renderMarkdownContent,
  resetMarkdownSpecialBlockState,
} from '../../public/js/shared/markdown-renderer.js';

afterEach(() => {
  document.body.innerHTML = '';
  delete globalThis.marked;
  delete globalThis.katex;
  resetMarkdownSpecialBlockState();
});

describe('markdown-renderer shared mode', () => {
  it('keeps Preview and Code in sync for the current chat thread', async () => {
    globalThis.marked = {
      lexer(content) {
        const text = String(content ?? '');
        const codeFenceMatch = text.match(/^```([^\n]*)\n([\s\S]*?)\n```$/);
        if (codeFenceMatch) {
          return [
            {
              type: 'code',
              lang: codeFenceMatch[1].trim(),
              text: codeFenceMatch[2],
            },
          ];
        }
        return [
          {
            type: 'paragraph',
            tokens: [{ type: 'text', text }],
          },
        ];
      },
    };
    globalThis.katex = {
      renderToString(text) {
        return `<span class="katex">${String(text)}</span>`;
      },
    };

    document.body.innerHTML = `
      <div id="root">
        ${renderMarkdownContent(['```latex', 'a^2 + b^2 = c^2', '```'].join('\n'), { specialBlockScope: 'chat-a' })}
        ${renderMarkdownContent(['```latex', 'x^2 + y^2 = z^2', '```'].join('\n'), { specialBlockScope: 'chat-a' })}
      </div>
    `;

    await enhanceMarkdownSpecialBlocks(document);

    const blocks = Array.from(document.querySelectorAll('[data-markdown-special-block]'));
    expect(blocks).toHaveLength(2);
    expect(blocks.every((block) => block.dataset.markdownSpecialMode === 'preview')).toBe(true);

    const firstCodeButton = blocks[0].querySelector('[data-markdown-special-mode-btn="code"]');
    firstCodeButton.click();

    expect(blocks.every((block) => block.dataset.markdownSpecialMode === 'code')).toBe(true);

    const secondPreviewButton = blocks[1].querySelector(
      '[data-markdown-special-mode-btn="preview"]'
    );
    secondPreviewButton.click();

    expect(blocks.every((block) => block.dataset.markdownSpecialMode === 'preview')).toBe(true);
  });
});
