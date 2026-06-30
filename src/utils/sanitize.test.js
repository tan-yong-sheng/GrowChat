import { describe, expect, it } from 'vitest';
import { escapeHtml, stripHtml } from './sanitize.js';

describe('sanitize', () => {
  describe('escapeHtml', () => {
    it('escapes ampersands', () => {
      expect(escapeHtml('a&b')).toBe('a&amp;b');
    });

    it('escapes angle brackets', () => {
      expect(escapeHtml('<div>')).toBe('&lt;div&gt;');
    });

    it('escapes double quotes', () => {
      expect(escapeHtml('"hello"')).toBe('&quot;hello&quot;');
    });

    it('escapes single quotes', () => {
      expect(escapeHtml("it's")).toBe('it&#39;s');
    });

    it('escapes all special characters in one string', () => {
      expect(escapeHtml('<a href="x" onclick=\'y\'>&</a>')).toBe(
        '&lt;a href=&quot;x&quot; onclick=&#39;y&#39;&gt;&amp;&lt;/a&gt;'
      );
    });

    it('returns empty string for null input', () => {
      expect(escapeHtml(null)).toBe('');
    });

    it('returns empty string for undefined input', () => {
      expect(escapeHtml(undefined)).toBe('');
    });

    it('converts non-string to string', () => {
      expect(escapeHtml(42)).toBe('42');
    });

    it('leaves plain text unchanged', () => {
      expect(escapeHtml('hello world')).toBe('hello world');
    });
  });

  describe('stripHtml', () => {
    it('removes HTML tags', () => {
      expect(stripHtml('<b>bold</b> text')).toBe('bold text');
    });

    it('removes self-closing tags', () => {
      expect(stripHtml('before<br/>after')).toBe('beforeafter');
    });

    it('removes tags with attributes', () => {
      expect(stripHtml('<a href="http://example.com">link</a>')).toBe('link');
    });

    it('returns empty string for null input', () => {
      expect(stripHtml(null)).toBe('');
    });

    it('returns empty string for undefined input', () => {
      expect(stripHtml(undefined)).toBe('');
    });

    it('trims whitespace from result', () => {
      expect(stripHtml('  <p>text</p>  ')).toBe('text');
    });

    it('leaves plain text unchanged (trimmed)', () => {
      expect(stripHtml('  hello  ')).toBe('hello');
    });

    it('removes residual angle brackets from partial tags (defense-in-depth)', () => {
      // Partial tags like '<script' (no closing '>') are removed entirely
      // so they cannot be re-rendered as HTML when the sanitized value is
      // later inserted into a template. We drop (rather than HTML-encode)
      // the residual brackets because stripHtml is meant to produce plain
      // text for storage; encoding here would double-encode when downstream
      // renderers apply escapeHtml() on output.
      expect(stripHtml('<script')).toBe('script');
      expect(stripHtml('text> more')).toBe('text more');
      expect(stripHtml('a < b c')).toBe('a  b c');
      expect(stripHtml('x > y')).toBe('x  y');
    });
  });
});
