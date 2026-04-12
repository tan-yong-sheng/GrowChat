import { describe, expect, it } from 'vitest';
import { resolveAdminRouteState } from '../../../public/js/features/admin/admin-route-state.js';

describe('resolveAdminRouteState', () => {
  it('keeps /admin/users/overview canonical', () => {
    expect(resolveAdminRouteState('/admin/users/overview')).toEqual({
      mainTab: 'users',
      subTab: 'overview',
      canonicalPath: '/admin/users/overview',
    });
  });

  it('keeps /admin/users/roles canonical', () => {
    expect(resolveAdminRouteState('/admin/users/roles')).toEqual({
      mainTab: 'users',
      subTab: 'roles',
      canonicalPath: '/admin/users/roles',
    });
  });

  it('maps /admin/users/policy to the policies route', () => {
    expect(resolveAdminRouteState('/admin/users/policy')).toEqual({
      mainTab: 'users',
      subTab: 'policies',
      canonicalPath: '/admin/users/policies',
    });
  });

  it('keeps /admin/users/groups canonical', () => {
    expect(resolveAdminRouteState('/admin/users/groups')).toEqual({
      mainTab: 'users',
      subTab: 'groups',
      canonicalPath: '/admin/users/groups',
    });
  });
});
