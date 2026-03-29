import { describe, expect, it } from 'vitest';
import { renderSettingsShell } from '../../public/js/shared/components/settings-shell.js';

describe('settings shell', () => {
  it('renders the shared page frame with custom host ids', () => {
    const html = renderSettingsShell({
      navPaneHtml: '<div id="nav-pane">nav</div>',
      contentHtml: '<div id="content-slot">content</div>',
      bodyId: 'shell-body',
      contentId: 'shell-content',
      footerId: 'shell-footer',
      bodyPaddingClass: 'px-0',
      footerPaddingClass: 'px-1',
    });

    expect(html).toContain('id="shell-content"');
    expect(html).toContain('id="shell-body"');
    expect(html).toContain('id="shell-footer"');
    expect(html).toContain('id="nav-pane"');
    expect(html).toContain('id="content-slot"');
    expect(html).toContain('px-0');
    expect(html).toContain('px-1');
  });
});
