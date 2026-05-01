export function resolveAdminRouteState(pathname) {
  if (pathname === '/admin' || pathname === '/admin/') {
    return { mainTab: 'users', subTab: 'overview', canonicalPath: '/admin/users/overview' };
  }

  if (pathname === '/admin/users' || pathname === '/admin/users/') {
    return { mainTab: 'users', subTab: 'overview', canonicalPath: '/admin/users/overview' };
  }

  if (pathname === '/admin/users/overview' || pathname.startsWith('/admin/users/overview/')) {
    return { mainTab: 'users', subTab: 'overview', canonicalPath: '/admin/users/overview' };
  }

  if (pathname === '/admin/settings' || pathname === '/admin/settings/') {
    return {
      mainTab: 'settings',
      subTab: 'connections',
      canonicalPath: '/admin/settings/connections',
    };
  }

  if (pathname === '/admin/system' || pathname === '/admin/system/') {
    return { mainTab: 'system', subTab: 'general', canonicalPath: '/admin/system/general' };
  }

  if (pathname === '/admin/users/roles' || pathname.startsWith('/admin/users/roles/')) {
    return { mainTab: 'users', subTab: 'roles', canonicalPath: pathname };
  }

  if (pathname === '/admin/users/groups' || pathname.startsWith('/admin/users/groups/')) {
    return { mainTab: 'users', subTab: 'groups', canonicalPath: '/admin/users/groups' };
  }

  if (pathname === '/admin/users/policy' || pathname.startsWith('/admin/users/policy/')) {
    return { mainTab: 'users', subTab: 'policies', canonicalPath: '/admin/users/policies' };
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

  if (pathname === '/admin/settings/email' || pathname.startsWith('/admin/settings/email/')) {
    return { mainTab: 'system', subTab: 'security', canonicalPath: '/admin/system/security' };
  }

  if (pathname === '/admin/settings/general' || pathname.startsWith('/admin/settings/general/')) {
    return { mainTab: 'system', subTab: 'general', canonicalPath: '/admin/system/general' };
  }

  if (pathname === '/admin/system/general' || pathname.startsWith('/admin/system/general/')) {
    return { mainTab: 'system', subTab: 'general', canonicalPath: '/admin/system/general' };
  }

  if (pathname.startsWith('/admin/settings')) {
    let subTab = 'connections';
    if (pathname.includes('/connections')) subTab = 'connections';
    else if (pathname.includes('/integrations')) subTab = 'integrations';
    else if (pathname.includes('/models')) subTab = 'models';
    return { mainTab: 'settings', subTab, canonicalPath: pathname };
  }

  if (pathname.startsWith('/admin/system')) {
    let subTab = 'general';
    if (pathname.includes('/security')) subTab = 'security';
    return { mainTab: 'system', subTab, canonicalPath: `/admin/system/${subTab}` };
  }

  let subTab = 'overview';
  if (pathname.includes('/roles')) subTab = 'roles';
  else if (pathname.includes('/policies')) subTab = 'policies';
  else if (pathname.includes('/groups')) subTab = 'groups';
  return { mainTab: 'users', subTab, canonicalPath: pathname };
}

export function getAdminTopNavPath(mainTab) {
  if (mainTab === 'users') return '/admin/users/overview';
  if (mainTab === 'system') return '/admin/system/general';
  return '/admin/settings/connections';
}

export function getAdminSubnavPath(mainTab, subTab) {
  if (mainTab === 'users') {
    return `/admin/users/${subTab}`;
  }

  if (mainTab === 'system') {
    return `/admin/system/${subTab}`;
  }

  return `/admin/settings/${subTab}`;
}
