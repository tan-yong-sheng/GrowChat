import { describe, expect, it } from 'vitest';
import {
  getAdminSubnavPath,
  getAdminTopNavPath,
  resolveAdminRouteState,
} from '../../public/js/features/admin/admin-route-state.js';

describe('admin route state', () => {
  it('resolves canonical route state for top-level admin paths', () => {
    expect(resolveAdminRouteState('/admin')).toEqual({
      mainTab: 'users',
      subTab: 'overview',
      canonicalPath: '/admin/users/overview',
    });

    expect(resolveAdminRouteState('/admin/users')).toEqual({
      mainTab: 'users',
      subTab: 'overview',
      canonicalPath: '/admin/users/overview',
    });

    expect(resolveAdminRouteState('/admin/settings')).toEqual({
      mainTab: 'settings',
      subTab: 'connections',
      canonicalPath: '/admin/settings/connections',
    });

    expect(resolveAdminRouteState('/admin/system')).toEqual({
      mainTab: 'system',
      subTab: 'general',
      canonicalPath: '/admin/system/general',
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

    expect(resolveAdminRouteState('/admin/settings/general')).toEqual({
      mainTab: 'system',
      subTab: 'general',
      canonicalPath: '/admin/system/general',
    });
  });

  it('builds top and sub navigation paths consistently', () => {
    expect(getAdminTopNavPath('users')).toBe('/admin/users/overview');
    expect(getAdminTopNavPath('settings')).toBe('/admin/settings/connections');
    expect(getAdminTopNavPath('system')).toBe('/admin/system/general');
    expect(getAdminSubnavPath('users', 'groups')).toBe('/admin/users/groups');
    expect(getAdminSubnavPath('settings', 'connections')).toBe('/admin/settings/connections');
    expect(getAdminSubnavPath('system', 'general')).toBe('/admin/system/general');
  });
});
