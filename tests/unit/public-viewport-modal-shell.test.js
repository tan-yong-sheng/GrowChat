// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { buildViewportModalShellMarkup } from '../../public/js/shared/components/viewport-modal-shell.js';

describe('viewport modal shell', () => {
  it('renders a top-aligned viewport-safe shell by default', () => {
    const markup = buildViewportModalShellMarkup({
      rootId: 'test-modal',
      title: 'Test Modal',
      body: '<div>Body</div>',
    });

    expect(markup).toContain('fixed inset-0 flex items-start justify-center overflow-y-auto');
    expect(markup).toContain('max-h-[90vh]');
    expect(markup).toContain('role="dialog"');
    expect(markup).toContain('aria-modal="true"');
    expect(markup).toContain('id="test-modal"');
    expect(markup).toContain('Test Modal');
  });
});
