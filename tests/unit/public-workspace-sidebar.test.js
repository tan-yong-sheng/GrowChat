// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';

vi.mock('../../public/js/shared/store.js', () => ({
  state: {},
  setState: vi.fn(),
  subscribe: () => () => {},
}));

vi.mock('../../public/js/shared/components/sidebar.js', () => ({
  renderSidebar: () => () => {},
}));

vi.mock('../../public/js/shared/components/user-profile-footer.js', () => ({
  createUserProfileFooter: async () => document.createElement('div'),
}));

vi.mock('../../public/js/shared/components/search-modal.js', () => ({
  renderSearchModal: () => null,
}));

vi.mock('../../public/js/shared/components/files-modal.js', () => ({
  renderFilesModal: () => null,
}));

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
