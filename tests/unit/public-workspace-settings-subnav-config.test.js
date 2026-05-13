import { describe, expect, it } from 'vitest';
import { buildWorkspaceSettingsSubnavItems } from '../../public/js/shared/components/workspace-settings-subnav-config.js';

describe('workspace settings subnav config', () => {
  it('builds the account settings item set from the shared definitions', () => {
    const items = buildWorkspaceSettingsSubnavItems({
      basePath: '/account/settings',
      currentKey: 'models',
    });

    expect(items.map((item) => item.label)).toEqual(['Connections', 'Models', 'Integrations']);
    expect(items.map((item) => item.href)).toEqual([
      '/account/settings/connections',
      '/account/settings/models',
      '/account/settings/integrations',
    ]);
    expect(items.map((item) => item.active)).toEqual([false, true, false]);
  });

  it('builds the admin settings item set from the shared definitions', () => {
    const items = buildWorkspaceSettingsSubnavItems({
      basePath: '/admin/settings',
      currentKey: 'integrations',
    });

    expect(items.map((item) => item.href)).toEqual([
      '/admin/settings/connections',
      '/admin/settings/models',
      '/admin/settings/integrations',
    ]);
    expect(items.map((item) => item.active)).toEqual([false, false, true]);
  });
});
