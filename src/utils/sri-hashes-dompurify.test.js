// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { injectSriHashes, SRI_RESOURCES, SRI_INJECT_PATTERNS } from './sri-hashes.js';

describe('SRI hashes for DOMPurify', () => {
  it('includes dompurify in SRI_RESOURCES', () => {
    // DOMPurify should be defined in SRI_RESOURCES
    expect(SRI_RESOURCES).toHaveProperty('dompurify');
    expect(SRI_RESOURCES.dompurify.url).toContain('dompurify');
  });

  it('includes dompurify in SRI_INJECT_PATTERNS', () => {
    // DOMPurify should have an injection pattern
    expect(SRI_INJECT_PATTERNS.has('dompurify')).toBe(true);
  });

  it('injects dompurify as a module script with SRI attributes', () => {
    const hashes = { dompurify: 'sha384-testhash' };
    const html =
      '<script src="https://cdn.jsdelivr.net/npm/dompurify@3.2.6/dist/purify.es.mjs" data-sri-key="dompurify"></script>';
    const result = injectSriHashes(html, hashes);
    expect(result).toContain('type="module"');
    expect(result).toContain('integrity="sha384-testhash"');
    expect(result).toContain('crossorigin="anonymous"');
  });

  it('uses correct CDN URL for DOMPurify', () => {
    expect(SRI_RESOURCES.dompurify.url).toBe(
      'https://cdn.jsdelivr.net/npm/dompurify@3.2.6/dist/purify.es.mjs'
    );
  });
});
