const ACCOUNT_TOP_NAV_TABS = Object.freeze([
  Object.freeze({ href: '/account/settings/connections', key: 'settings', label: 'Settings' }),
]);

const ADMIN_TOP_NAV_TABS = Object.freeze([
  Object.freeze({ href: '/admin/overview', key: 'overview', label: 'Overview' }),
  Object.freeze({ href: '/admin/users', key: 'users', label: 'Users' }),
  Object.freeze({ href: '/admin/settings/connections', key: 'settings', label: 'Settings' }),
  Object.freeze({ href: '/admin/system/registration', key: 'system', label: 'System' }),
]);

function cloneTabs(tabs) {
  return tabs.map((tab) => ({ ...tab }));
}

export function buildWorkspaceTopNavConfig({ variant = 'admin', currentKey = '' } = {}) {
  if (variant === 'account') {
    return {
      tabs: cloneTabs(ACCOUNT_TOP_NAV_TABS),
      activeKey: 'settings',
      dataAttrName: 'data-account-area-tab',
    };
  }
  if (variant === 'admin') {
    return {
      tabs: cloneTabs(ADMIN_TOP_NAV_TABS),
      activeKey: currentKey || 'overview',
      dataAttrName: 'data-nav',
    };
  }
  return { tabs: [], activeKey: '', dataAttrName: 'data-nav' };
}
