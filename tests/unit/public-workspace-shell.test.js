import { describe, expect, it } from 'vitest';
import { renderWorkspaceShell } from '../../public/js/shared/components/workspace-shell.js';

describe('workspace shell', () => {
  it('renders the shared outer frame with sidebar and main slots', () => {
    const html = renderWorkspaceShell({
      sidebarHtml: '<aside id="sidebar-slot">sidebar</aside>',
      mainHtml: '<main id="main-slot">main</main>',
    });

    expect(html).toContain('id="sidebar-slot"');
    expect(html).toContain('id="main-slot"');
    expect(html).toContain('flex h-[100dvh] w-full bg-white overflow-hidden');
    expect(html).toContain('<main id="main" class="flex-1 flex flex-col min-w-0 overflow-y-auto">');
  });
});
