export function resolveAdminRouteState(pathname) {
  // Default /admin redirect → system/usage
  if (pathname === '/admin' || pathname === '/admin/') {
    return { mainTab: 'system', subTab: 'usage', canonicalPath: '/admin/system/usage' };
  }

  // Users routes
  if (pathname === '/admin/users' || pathname === '/admin/users/') {
    return { mainTab: 'users', subTab: 'overview', canonicalPath: '/admin/users/overview' };
  }
  if (pathname === '/admin/users/overview' || pathname.startsWith('/admin/users/overview/')) {
    return { mainTab: 'users', subTab: 'overview', canonicalPath: '/admin/users/overview' };
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

  // Settings routes
  if (pathname === '/admin/settings' || pathname === '/admin/settings/') {
    return {
      mainTab: 'settings',
      subTab: 'connections',
      canonicalPath: '/admin/settings/connections',
    };
  }
  if (pathname.startsWith('/admin/settings')) {
    let subTab = 'connections';
    if (pathname.includes('/connections')) subTab = 'connections';
    else if (pathname.includes('/integrations')) subTab = 'integrations';
    else if (pathname.includes('/models')) subTab = 'models';
    return { mainTab: 'settings', subTab, canonicalPath: pathname };
  }

  // System routes
  if (pathname === '/admin/system' || pathname === '/admin/system/') {
    return { mainTab: 'system', subTab: 'usage', canonicalPath: '/admin/system/usage' };
  }
  if (pathname === '/admin/system/usage' || pathname.startsWith('/admin/system/usage/')) {
    return { mainTab: 'system', subTab: 'usage', canonicalPath: '/admin/system/usage' };
  }
  if (
    pathname === '/admin/system/registration' ||
    pathname.startsWith('/admin/system/registration/')
  ) {
    return {
      mainTab: 'system',
      subTab: 'registration',
      canonicalPath: '/admin/system/registration',
    };
  }
  if (pathname === '/admin/system/email' || pathname.startsWith('/admin/system/email/')) {
    return { mainTab: 'system', subTab: 'email', canonicalPath: '/admin/system/email' };
  }
  if (pathname === '/admin/system/security' || pathname.startsWith('/admin/system/security/')) {
    return { mainTab: 'system', subTab: 'security', canonicalPath: '/admin/system/security' };
  }
  if (pathname === '/admin/system/activity' || pathname.startsWith('/admin/system/activity/')) {
    return { mainTab: 'system', subTab: 'activity', canonicalPath: '/admin/system/activity' };
  }

  // System fallback
  if (pathname.startsWith('/admin/system')) {
    let subTab = 'usage';
    if (pathname.includes('/registration')) subTab = 'registration';
    else if (pathname.includes('/email')) subTab = 'email';
    else if (pathname.includes('/security')) subTab = 'security';
    else if (pathname.includes('/activity')) subTab = 'activity';
    return { mainTab: 'system', subTab, canonicalPath: `/admin/system/${subTab}` };
  }

  // Users fallback
  let subTab = 'overview';
  if (pathname.includes('/roles')) subTab = 'roles';
  else if (pathname.includes('/policies')) subTab = 'policies';
  else if (pathname.includes('/groups')) subTab = 'groups';
  return { mainTab: 'users', subTab, canonicalPath: pathname };
}

export function getAdminTopNavPath(mainTab) {
  if (mainTab === 'users') return '/admin/users/overview';
  if (mainTab === 'system') return '/admin/system/usage';
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
