// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';

vi.mock('https://cdn.jsdelivr.net/npm/dompurify@3.2.6/dist/purify.es.mjs', () => ({
  default: {
    sanitize: (html, opts) => {
      // Minimal DOMPurify-like behavior for tests: strip script tags,
      // event-handler attributes, and dangerous URL schemes.
      const doc = new DOMParser().parseFromString(html, 'text/html');
      const dangerous = new Set(['script', 'iframe', 'object', 'embed', 'applet', 'form']);
      for (const tag of dangerous) {
        for (const node of doc.querySelectorAll(tag)) {
          node.remove();
        }
      }
      for (const node of doc.querySelectorAll('*')) {
        for (const attr of [...node.attributes]) {
          if (/^on/i.test(attr.name) || /^\s*(javascript|data|vbscript):/i.test(attr.value)) {
            node.removeAttributeNode(attr);
          }
        }
      }
      return doc.body.innerHTML;
    },
  },
}));

import { setSafeHtml } from '../../public/js/shared/markdown-special-block-runtime.js';

describe('markdown special block runtime sanitizer', () => {
  function render(html) {
    const el = document.createElement('div');
    setSafeHtml(el, html);
    return el.innerHTML;
  }

  it('removes script tags', () => {
    const html = '<p>Hello</p><script>alert(1)</script>';
    expect(render(html)).not.toContain('<script');
    expect(render(html)).not.toContain('alert');
  });

  it('removes event handler attributes', () => {
    const html = '<img src="x" onerror="alert(1)">';
    const out = render(html);
    expect(out).not.toContain('onerror');
  });

  it('removes javascript: URLs', () => {
    const html = '<a href="javascript:alert(1)">click</a>';
    const out = render(html);
    expect(out).not.toContain('javascript:');
  });

  it('preserves safe SVG content', () => {
    const html = '<svg><circle cx="50" cy="50" r="40" /></svg>';
    const out = render(html);
    expect(out).toContain('<svg');
    expect(out).toContain('<circle');
  });

  it('preserves KaTeX generated math markup', () => {
    const html = '<span class="katex">\\sqrt{x}</span>';
    const out = render(html);
    expect(out).toContain('katex');
  });
});
