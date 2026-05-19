import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('sri-hashes utils', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.restoreAllMocks();
  });

  it('warns missing SRI hash only once per key', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { injectSriHashes } = await import('./sri-hashes.js');

    const html = '<script data-sri-key="marked"></script>';
    injectSriHashes(html, { marked: null });
    injectSriHashes(html, { marked: null });

    // Structured logger emits JSON string via console.warn
    const matchingWarnings = warnSpy.mock.calls.filter((call) => {
      try {
        const parsed = JSON.parse(call?.[0] || '');
        return (
          parsed.message === 'SRI hash missing; resource will load without integrity check' &&
          parsed.key === 'marked'
        );
      } catch {
        return false;
      }
    });
    expect(matchingWarnings).toHaveLength(1);
  });

  it('injects integrity attributes when hash exists', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { injectSriHashes } = await import('./sri-hashes.js');

    const html = '<script data-sri-key="marked"></script>';
    const next = injectSriHashes(html, { marked: 'sha384-testhash' });

    expect(next).toContain('integrity="sha384-testhash"');
    expect(next).toContain('crossorigin="anonymous"');
    expect(warnSpy).not.toHaveBeenCalled();
  });
});
