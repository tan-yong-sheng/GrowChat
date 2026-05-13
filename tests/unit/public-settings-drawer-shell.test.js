import { describe, expect, it } from 'vitest';
import { renderSettingsDrawerShell } from '../../public/js/shared/components/settings-drawer-shell.js';

describe('settings drawer shell', () => {
  it('keeps a visible outer gutter on all breakpoints', () => {
    const markup = renderSettingsDrawerShell({
      rootId: 'drawer',
      title: 'My Settings',
      body: '<div>Body</div>',
    });

    expect(markup).toContain('p-3 sm:p-4 lg:p-5');
    expect(markup).toContain('px-2 py-2 sm:px-3 sm:py-3');
    expect(markup).toContain('h-[calc(100dvh-1.5rem)]');
    expect(markup).toContain('w-[calc(100vw-1.5rem)]');
    expect(markup).toContain('sm:h-[calc(100vh-2rem)]');
    expect(markup).toContain('sm:w-[calc(100vw-2rem)]');
    expect(markup).toContain('lg:h-[calc(100vh-2.5rem)]');
    expect(markup).toContain('lg:w-[calc(100vw-2.5rem)]');
  });
});


