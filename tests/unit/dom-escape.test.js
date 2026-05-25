import { describe, expect, it } from 'vitest';
import { escapeHtml, escapeSelector } from '../../public/js/shared/utils/dom-escape.js';

describe('escapeHtml', () => {
  it('escapes all HTML special characters', () => {
    expect(escapeHtml('<img onerror=alert(1) src=x>')).toBe('&lt;img onerror=alert(1) src=x&gt;');
    expect(escapeHtml('"quoted"')).toBe('&quot;quoted&quot;');
    expect(escapeHtml("it's")).toBe('it&#39;s');
    expect(escapeHtml('a & b')).toBe('a &amp; b');
  });

  it('escapes combined attack vectors', () => {
    expect(escapeHtml('<script>alert("xss")</script>')).toBe(
      '&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;'
    );
    expect(escapeHtml('" onclick="alert(1)')).toBe('&quot; onclick=&quot;alert(1)');
  });

  it('handles empty and falsy values', () => {
    expect(escapeHtml('')).toBe('');
    expect(escapeHtml(null)).toBe('');
    expect(escapeHtml(undefined)).toBe('');
  });

  it('passes through safe text unchanged', () => {
    expect(escapeHtml('Hello World')).toBe('Hello World');
    expect(escapeHtml('model-123')).toBe('model-123');
  });
});

describe('escapeSelector', () => {
  it('escapes CSS selector special characters', () => {
    const escaped = escapeSelector('openai/env-openai-0:gemini-2.5-flash');
    // The escaped value should be safe to use in querySelector
    expect(escaped).not.toBe('openai/env-openai-0:gemini-2.5-flash');
  });

  it('handles simple alphanumeric selectors unchanged', () => {
    expect(escapeSelector('simple-id')).toBe('simple-id');
    expect(escapeSelector('id_123')).toBe('id_123');
  });
});
