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

    const matchingWarnings = warnSpy.mock.calls.filter(
      (call) =>
        String(call?.[0] || '').includes(
          'SRI hash missing; resource will load without integrity check'
        ) && call?.[1]?.key === 'marked'
    );

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
