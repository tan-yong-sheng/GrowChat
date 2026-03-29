import { describe, expect, it } from 'vitest';
import { renderSettingsNavPane } from '../../public/js/shared/components/settings-nav.js';

describe('settings nav pane', () => {
  it('renders grouped settings navigation with active state', () => {
    const html = renderSettingsNavPane({
      id: 'nav-test',
      activeKey: 'general',
      groups: [
        {
          title: 'Profile',
          items: [
            { href: '/account/profile/overview', key: 'overview', label: 'Overview' },
          ],
        },
        {
          title: 'Settings',
          items: [
            { href: '/account/profile/general', key: 'general', label: 'General' },
          ],
        },
      ],
      className: 'grid gap-3',
    });

    expect(html).toContain('Profile');
    expect(html).toContain('Settings');
    expect(html).toContain('data-subnav="general"');
    expect(html).toContain('bg-gray-100 text-gray-900');
  });
});
