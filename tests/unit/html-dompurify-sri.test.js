// @vitest-environment node
import { describe, expect, it } from 'vitest';
import fs from 'fs';
import path from 'path';

describe('HTML integration for DOMPurify SRI', () => {
  it('includes DOMPurify script tag with data-sri-key attribute', () => {
    const htmlPath = path.join(process.cwd(), 'public', 'index.html');
    const html = fs.readFileSync(htmlPath, 'utf-8');

    // Should have a script tag for DOMPurify
    expect(html).toContain('dompurify');

    // Should have the data-sri-key attribute for SRI injection
    expect(html).toContain('data-sri-key="dompurify"');

    // Should reference the correct CDN URL
    expect(html).toContain('cdn.jsdelivr.net/npm/dompurify');
  });
});
