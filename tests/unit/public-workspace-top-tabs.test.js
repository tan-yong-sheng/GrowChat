import { describe, expect, it } from 'vitest';
import { renderWorkspaceTopTabs } from '../../public/js/shared/components/workspace-top-tabs.js';

describe('workspace top tabs', () => {
  it('renders the admin-style tab row for shared shells', () => {
    const html = renderWorkspaceTopTabs({
      tabs: [
        { href: '/admin/users', key: 'users', label: 'Users' },
        { href: '/admin/settings', key: 'settings', label: 'Settings' },
      ],
      activeKey: 'settings',
      dataAttrName: 'data-nav',
    });

    expect(html).toContain('flex w-full');
    expect(html).toContain('data-nav="users"');
    expect(html).toContain('data-nav="settings"');
    expect(html).toContain('underline underline-offset-[10px] decoration-2');
    expect(html).toContain('text-gray-300 hover:text-gray-700');
  });
});
