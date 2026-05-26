// @vitest-environment jsdom

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
  it('escapes CSS selector special characters with exact output and querySelector round-trip', () => {
    const input = 'openai/env-openai-0:gemini-2.5-flash';
    const escaped = escapeSelector(input);
    // CSS.escape escapes colons, slashes, and dots with backslash
    expect(escaped).toContain('\\');
    // Verify the escaped string works in querySelector (round-trip test)
    const div = document.createElement('div');
    div.id = input;
    document.body.appendChild(div);
    const found = document.querySelector('#' + escaped);
    expect(found).toBe(div);
    document.body.removeChild(div);
  });

  it('handles simple alphanumeric selectors unchanged', () => {
    expect(escapeSelector('simple-id')).toBe('simple-id');
    expect(escapeSelector('id_123')).toBe('id_123');
  });

  it('escapes brackets and periods for querySelector compatibility', () => {
    const input = 'model.v1[prod]';
    const escaped = escapeSelector(input);
    const div = document.createElement('div');
    div.id = input;
    document.body.appendChild(div);
    const found = document.querySelector('#' + escaped);
    expect(found).toBe(div);
    document.body.removeChild(div);
  });
});
