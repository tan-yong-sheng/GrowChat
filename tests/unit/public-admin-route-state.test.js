import { describe, expect, it } from 'vitest';
import {
  getAdminSubnavPath,
  getAdminTopNavPath,
  resolveAdminRouteState,
} from '../../public/js/features/admin/admin-route-state.js';

describe('admin route state', () => {
  it('resolves canonical route state for top-level admin paths', () => {
    expect(resolveAdminRouteState('/admin')).toEqual({
      mainTab: 'overview',
      subTab: 'usage',
      canonicalPath: '/admin/overview',
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
      subTab: 'registration',
      canonicalPath: '/admin/system/registration',
    });
  });

  it('resolves system sub-routes correctly', () => {
    expect(resolveAdminRouteState('/admin/system/registration')).toEqual({
      mainTab: 'system',
      subTab: 'registration',
      canonicalPath: '/admin/system/registration',
    });
    expect(resolveAdminRouteState('/admin/system/email')).toEqual({
      mainTab: 'system',
      subTab: 'email',
      canonicalPath: '/admin/system/email',
    });
    expect(resolveAdminRouteState('/admin/system/security')).toEqual({
      mainTab: 'system',
      subTab: 'security',
      canonicalPath: '/admin/system/security',
    });
    expect(resolveAdminRouteState('/admin/system/activity')).toEqual({
      mainTab: 'system',
      subTab: 'activity',
      canonicalPath: '/admin/system/activity',
    });
  });

  it('builds top and sub navigation paths consistently', () => {
    expect(getAdminTopNavPath('overview')).toBe('/admin/overview');
    expect(getAdminTopNavPath('users')).toBe('/admin/users/overview');
    expect(getAdminTopNavPath('settings')).toBe('/admin/settings/connections');
    expect(getAdminTopNavPath('system')).toBe('/admin/system/registration');
    expect(getAdminSubnavPath('overview', 'usage')).toBe('/admin/overview');
    expect(getAdminSubnavPath('users', 'groups')).toBe('/admin/users/groups');
    expect(getAdminSubnavPath('settings', 'connections')).toBe('/admin/settings/connections');
    expect(getAdminSubnavPath('system', 'registration')).toBe('/admin/system/registration');
  });
});
