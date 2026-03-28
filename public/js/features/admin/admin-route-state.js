export function resolveAdminRouteState(pathname) {
  if (pathname === '/admin/users' || pathname === '/admin/users/') {
    return { mainTab: 'users', subTab: 'overview', canonicalPath: '/admin/users/overview' };
  }

  if (pathname === '/admin/settings' || pathname === '/admin/settings/') {
    return { mainTab: 'settings', subTab: 'general', canonicalPath: '/admin/settings/general' };
  }

  if (pathname === '/admin/users/roles' || pathname.startsWith('/admin/users/roles/')) {
    return { mainTab: 'users', subTab: 'roles', canonicalPath: pathname };
  }

  if (pathname === '/admin/users/policies' || pathname.startsWith('/admin/users/policies/')) {
    return { mainTab: 'users', subTab: 'policies', canonicalPath: pathname };
  }

  if (pathname === '/admin/settings/roles' || pathname.startsWith('/admin/settings/roles/')) {
    return { mainTab: 'users', subTab: 'roles', canonicalPath: '/admin/users/roles' };
  }

  if (pathname === '/admin/settings/policies' || pathname.startsWith('/admin/settings/policies/')) {
    return { mainTab: 'users', subTab: 'policies', canonicalPath: '/admin/users/policies' };
  }

  if (pathname.startsWith('/admin/settings')) {
    let subTab = 'general';
    if (pathname.includes('/connections')) subTab = 'connections';
    else if (pathname.includes('/integrations')) subTab = 'integrations';
    else if (pathname.includes('/models')) subTab = 'models';
    return { mainTab: 'settings', subTab, canonicalPath: pathname };
  }

  let subTab = 'overview';
  if (pathname.includes('/roles')) subTab = 'roles';
  else if (pathname.includes('/policies')) subTab = 'policies';
  else if (pathname.includes('/groups')) subTab = 'groups';
  return { mainTab: 'users', subTab, canonicalPath: pathname };
}

export function getAdminTopNavPath(mainTab) {
  return mainTab === 'users' ? '/admin/users/overview' : '/admin/settings/general';
}

export function getAdminSubnavPath(mainTab, subTab) {
  return mainTab === 'users'
    ? `/admin/users/${subTab}`
    : `/admin/settings/${subTab}`;
}
