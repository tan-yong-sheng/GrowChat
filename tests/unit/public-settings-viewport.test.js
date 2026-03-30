import { describe, expect, it } from 'vitest';
import { renderSettingsViewport } from '../../public/js/shared/components/settings-viewport.js';

describe('settings viewport', () => {
  it('renders the shared outer settings wrapper with configurable classes', () => {
    const html = renderSettingsViewport({
      contentHtml: '<div data-viewport-content>Body</div>',
      viewportClass: 'w-full px-4 py-6 flex-1 min-h-0 overflow-hidden',
      innerClass: 'flex-1 min-h-0 flex flex-col overflow-hidden',
    });

    expect(html).toContain('w-full px-4 py-6 flex-1 min-h-0 overflow-hidden');
    expect(html).toContain('flex-1 min-h-0 flex flex-col overflow-hidden');
    expect(html).toContain('data-viewport-content');
    expect(html).toContain('Body');
  });
});
