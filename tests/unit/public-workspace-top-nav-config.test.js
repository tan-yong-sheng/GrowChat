import { describe, expect, it } from 'vitest';
import { buildWorkspaceTopNavConfig } from '../../public/js/shared/components/workspace-top-nav-config.js';

describe('workspace top nav config', () => {
  it('builds the account tab set and active key for the drawer shell', () => {
    const overview = buildWorkspaceTopNavConfig({
      variant: 'account',
      currentKey: 'overview',
    });

    const settings = buildWorkspaceTopNavConfig({
      variant: 'account',
      currentKey: 'connections',
    });

    expect(overview.tabs.map((tab) => tab.label)).toEqual(['Settings']);
    expect(overview.activeKey).toBe('settings');
    expect(overview.dataAttrName).toBe('data-account-area-tab');
    expect(settings.activeKey).toBe('settings');
  });

  it('builds the admin tab set and active key from the current main tab', () => {
    const config = buildWorkspaceTopNavConfig({
      variant: 'admin',
      currentKey: 'system',
    });

    expect(config.tabs.map((tab) => tab.label)).toEqual([
      'Overview',
      'Users',
      'Settings',
      'System',
    ]);
    expect(config.activeKey).toBe('system');
    expect(config.dataAttrName).toBe('data-nav');
  });
});
