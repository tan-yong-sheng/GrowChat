import { describe, expect, it } from 'vitest';
import {
  getAdminSubnavPath,
  getAdminTopNavPath,
  resolveAdminRouteState,
} from '../../public/js/features/admin/admin-route-state.js';

describe('admin route state', () => {
  it('resolves canonical route state for top-level admin paths', () => {
    expect(resolveAdminRouteState('/admin/users')).toEqual({
      mainTab: 'users',
      subTab: 'overview',
      canonicalPath: '/admin/users/overview',
    });

    expect(resolveAdminRouteState('/admin/settings')).toEqual({
      mainTab: 'settings',
      subTab: 'general',
      canonicalPath: '/admin/settings/general',
    });
  });

  it('resolves alias routes to the canonical users pages', () => {
    expect(resolveAdminRouteState('/admin/settings/roles')).toEqual({
      mainTab: 'users',
      subTab: 'roles',
      canonicalPath: '/admin/users/roles',
    });

    expect(resolveAdminRouteState('/admin/settings/policies')).toEqual({
      mainTab: 'users',
      subTab: 'policies',
      canonicalPath: '/admin/users/policies',
    });
  });

  it('builds top and sub navigation paths consistently', () => {
    expect(getAdminTopNavPath('users')).toBe('/admin/users/overview');
    expect(getAdminTopNavPath('settings')).toBe('/admin/settings/general');
    expect(getAdminSubnavPath('users', 'groups')).toBe('/admin/users/groups');
    expect(getAdminSubnavPath('settings', 'connections')).toBe('/admin/settings/connections');
  });
});
