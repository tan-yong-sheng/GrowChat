const ROUTE_TABLE = [
  {
    match: (p) => p === '/admin' || p === '/admin/',
    state: { mainTab: 'users', subTab: 'overview', canonicalPath: '/admin/users/overview' },
  },
  {
    match: (p) => p === '/admin/users' || p === '/admin/users/',
    state: { mainTab: 'users', subTab: 'overview', canonicalPath: '/admin/users/overview' },
  },
  {
    match: (p) => p === '/admin/users/overview' || p.startsWith('/admin/users/overview/'),
    state: { mainTab: 'users', subTab: 'overview', canonicalPath: '/admin/users/overview' },
  },
  {
    match: (p) => p === '/admin/settings' || p === '/admin/settings/',
    state: {
      mainTab: 'settings',
      subTab: 'connections',
      canonicalPath: '/admin/settings/connections',
    },
  },
  {
    match: (p) => p === '/admin/system' || p === '/admin/system/',
    state: {
      mainTab: 'system',
      subTab: 'registration',
      canonicalPath: '/admin/system/registration',
    },
  },
  {
    match: (p) => p === '/admin/users/roles' || p.startsWith('/admin/users/roles/'),
    state: (p) => ({ mainTab: 'users', subTab: 'roles', canonicalPath: p }),
  },
  {
    match: (p) => p === '/admin/users/groups' || p.startsWith('/admin/users/groups/'),
    state: { mainTab: 'users', subTab: 'groups', canonicalPath: '/admin/users/groups' },
  },
  {
    match: (p) => p === '/admin/users/policy' || p.startsWith('/admin/users/policy/'),
    state: {
      mainTab: 'users',
      subTab: 'policies',
      canonicalPath: '/admin/users/policies',
    },
  },
  {
    match: (p) => p === '/admin/users/policies' || p.startsWith('/admin/users/policies/'),
    state: (p) => ({ mainTab: 'users', subTab: 'policies', canonicalPath: p }),
  },
  {
    match: (p) => p === '/admin/system/registration' || p.startsWith('/admin/system/registration/'),
    state: {
      mainTab: 'system',
      subTab: 'registration',
      canonicalPath: '/admin/system/registration',
    },
  },
  {
    match: (p) => p === '/admin/system/email' || p.startsWith('/admin/system/email/'),
    state: {
      mainTab: 'system',
      subTab: 'email',
      canonicalPath: '/admin/system/email',
    },
  },
  {
    match: (p) => p === '/admin/system/security' || p.startsWith('/admin/system/security/'),
    state: {
      mainTab: 'system',
      subTab: 'security',
      canonicalPath: '/admin/system/security',
    },
  },
  {
    match: (p) => p === '/admin/system/activity' || p.startsWith('/admin/system/activity/'),
    state: {
      mainTab: 'system',
      subTab: 'activity',
      canonicalPath: '/admin/system/activity',
    },
  },
];

function resolveSettingsSubTab(pathname) {
  if (pathname.includes('/connections')) return 'connections';
  if (pathname.includes('/integrations')) return 'integrations';
  if (pathname.includes('/models')) return 'models';
  return 'connections';
}

function resolveSystemSubTab(pathname) {
  if (pathname.includes('/email')) return 'email';
  if (pathname.includes('/security')) return 'security';
  if (pathname.includes('/activity')) return 'activity';
  return 'registration';
}

function resolveUsersSubTab(pathname) {
  if (pathname.includes('/roles')) return 'roles';
  if (pathname.includes('/policies')) return 'policies';
  if (pathname.includes('/groups')) return 'groups';
  return 'overview';
}

function resolveRouteState(pathname) {
  for (const route of ROUTE_TABLE) {
    if (route.match(pathname)) {
      return typeof route.state === 'function' ? route.state(pathname) : route.state;
    }
  }
  if (pathname.startsWith('/admin/settings')) {
    return {
      mainTab: 'settings',
      subTab: resolveSettingsSubTab(pathname),
      canonicalPath: pathname,
    };
  }
  if (pathname.startsWith('/admin/system')) {
    const subTab = resolveSystemSubTab(pathname);
    return { mainTab: 'system', subTab, canonicalPath: `/admin/system/${subTab}` };
  }
  return {
    mainTab: 'users',
    subTab: resolveUsersSubTab(pathname),
    canonicalPath: pathname,
  };
}

export function resolveAdminRouteState(pathname) {
  return resolveRouteState(pathname);
}

export function getAdminTopNavPath(mainTab) {
  if (mainTab === 'users') return '/admin/users/overview';
  if (mainTab === 'system') return '/admin/system/registration';
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
