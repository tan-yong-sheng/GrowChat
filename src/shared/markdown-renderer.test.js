// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('https://cdn.jsdelivr.net/npm/dompurify@3.2.6/dist/purify.es.mjs', () => ({
  default: {
    sanitize: (html) => html,
  },
}));
import {
  convertDisplayMathBlocks,
  isFullLatexDocument,
  renderMarkdownContent,
  resetMarkdownSpecialBlockState,
} from '../../public/js/shared/markdown-renderer.js';

function installMarkedLexer() {
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
}

afterEach(() => {
  delete globalThis.marked;
  resetMarkdownSpecialBlockState();
});

describe('markdown-renderer', () => {
  it('normalizes Open-WebUI display math delimiters into katex code fences', () => {
    const converted = convertDisplayMathBlocks(
      [
        '\\[',
        '  a^2 + b^2 = c^2',
        '\\]',
        '',
        '\\begin{equation}',
        '  x + y = z',
        '\\end{equation}',
      ].join('\n')
    );

    expect(converted).toContain('```katex');
    expect(converted).toContain('a^2 + b^2 = c^2');
    expect(converted).toContain('x + y = z');
  });

  it('detects full LaTeX documents', () => {
    expect(
      isFullLatexDocument('\\documentclass{article}\n\\begin{document}\nHi\n\\end{document}')
    ).toBe(true);
    expect(isFullLatexDocument('x^2 + y^2 = z^2')).toBe(false);
  });

  it('renders a full latex document as a normal code block', () => {
    installMarkedLexer();

    const html = renderMarkdownContent(
      [
        '```latex',
        '\\documentclass{article}',
        '\\begin{document}',
        'Hello',
        '\\end{document}',
        '```',
      ].join('\n')
    );

    expect(html).toContain('data-markdown-code-block');
    expect(html).toContain('language-latex');
    expect(html).not.toContain('data-markdown-special-block');
    expect(html).not.toContain('Preview');
  });

  it('still renders simple latex snippets in the KaTeX preview shell', () => {
    installMarkedLexer();

    const html = renderMarkdownContent(['```latex', 'x^2 + y^2 = z^2', '```'].join('\n'));

    expect(html).toContain('data-markdown-special-block');
    expect(html).toContain('data-markdown-special-kind="katex"');
    expect(html).toContain('Preview');
  });
});
