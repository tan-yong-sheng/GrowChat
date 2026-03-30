import { describe, expect, it } from 'vitest';
import {
  renderWorkspaceTopNav,
  renderWorkspaceTopNavSidebarToggle,
} from '../../public/js/shared/components/settings-top-nav.js';

describe('settings top nav', () => {
  it('renders the shared nav wrapper with the sidebar toggle when enabled', () => {
    const html = renderWorkspaceTopNav({
      tabs: [
        { href: '/admin/users', key: 'users', label: 'Users' },
        { href: '/admin/settings/connections', key: 'settings', label: 'Settings' },
      ],
      activeKey: 'settings',
      dataAttrName: 'data-nav',
      leadingSlotHtml: renderWorkspaceTopNavSidebarToggle({
        id: 'toggle-sidebar-mobile',
        title: 'Open Sidebar',
        className: 'p-2 mr-2 hover:bg-gray-100 rounded-lg transition text-gray-500 md:hidden',
      }),
    });

    expect(html).toContain('<nav class="px-4 pt-2 border-b border-gray-50 bg-white/80 backdrop-blur-md sticky top-0 z-20">');
    expect(html).toContain('id="toggle-sidebar-mobile"');
    expect(html).toContain('title="Open Sidebar"');
    expect(html).toContain('data-nav="users"');
    expect(html).toContain('data-nav="settings"');
    expect(html).toContain('underline underline-offset-[10px] decoration-2');
  });

  it('renders the same wrapper without the sidebar toggle when disabled', () => {
    const html = renderWorkspaceTopNav({
      tabs: [
        { href: '/account/profile/overview', key: 'profile', label: 'Profile' },
        { href: '/account/settings/connections', key: 'settings', label: 'Settings' },
      ],
      activeKey: 'profile',
      dataAttrName: 'data-account-area-tab',
    });

    expect(html).toContain('data-account-area-tab="profile"');
    expect(html).toContain('data-account-area-tab="settings"');
    expect(html).not.toContain('toggle-sidebar-mobile');
    expect(html).toContain('text-gray-900 underline underline-offset-[10px] decoration-2');
  });

  it('allows custom leading controls to replace the default toggle', () => {
    const html = renderWorkspaceTopNav({
      tabs: [
        { href: '/admin/users', key: 'users', label: 'Users' },
      ],
      activeKey: 'users',
      leadingSlotHtml: '<button id="custom-lead">Lead</button>',
      showSidebarToggle: true,
    });

    expect(html).toContain('id="custom-lead"');
    expect(html).not.toContain('toggle-sidebar-mobile');
  });
});
