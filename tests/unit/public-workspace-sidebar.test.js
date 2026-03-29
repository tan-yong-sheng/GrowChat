// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { renderWorkspaceSidebar } from '../../public/js/shared/components/workspace-sidebar.js';

describe('workspace sidebar', () => {
  it('renders the shared global sidebar chrome', () => {
    const html = renderWorkspaceSidebar();

    expect(html).toContain('id="sidebar-backdrop"');
    expect(html).toContain('id="sidebar"');
    expect(html).toContain('id="workspace-home-link"');
    expect(html).toContain('id="new-chat"');
    expect(html).toContain('id="open-search"');
    expect(html).toContain('id="sidebar-footer"');
  });
});
