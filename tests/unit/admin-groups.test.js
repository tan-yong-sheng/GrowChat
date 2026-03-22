import { describe, expect, it } from 'vitest';
import { getGroupModalTheme, getPermissionCatalog } from '../../public/js/features/admin/users/groups.js';

describe('admin groups permission catalog', () => {
  it('includes labels and tooltips for every permission', () => {
    const catalog = getPermissionCatalog();
    const items = catalog.flatMap((section) => section.items || []);
    const keys = items.flatMap((item) => {
      if (item.key) return [item.key];
      if (Array.isArray(item.options)) return item.options.map((option) => option.key);
      return [];
    });

    expect(keys).toEqual(expect.arrayContaining([
      'chat.read',
      'chat.write',
      'chat.delete',
      'chat.share',
      'model.use',
      'model.admin',
      'file.upload',
      'file.delete',
      'admin.user.read',
      'admin.user.write',
      'admin.audit.read',
      'admin.rbac.admin',
    ]));

    items.forEach((item) => {
      expect(item.label).toBeTruthy();
      expect(item.tooltip).toBeTruthy();
      if (Array.isArray(item.options)) {
        item.options.forEach((option) => {
          expect(option.label).toBeTruthy();
          expect(option.key).toBeTruthy();
        });
      }
    });
  });

  it('uses clearer labels for admin permissions', () => {
    const catalog = getPermissionCatalog();
    const items = catalog.flatMap((section) => section.items || []);
    const rbac = items.find((item) => item.key === 'admin.rbac.admin');
    const audit = items.find((item) => item.key === 'admin.audit.read');

    expect(rbac?.label).toBe('RBAC Management');
    expect(audit?.label).toBe('Audit Log');
  });

  it('uses light modal theme for readability', () => {
    const theme = getGroupModalTheme();
    expect(theme.container).toContain('bg-white');
    expect(theme.container).toContain('text-gray-900');
    expect(theme.sidebarActive).toContain('bg-gray-100');
    expect(theme.sidebarInactive).toContain('text-gray-500');
  });
});
