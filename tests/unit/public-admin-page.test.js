// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  apiFetch: vi.fn(),
  fetchAdminGroups: vi.fn(),
  renderWorkspaceShell: vi.fn(() => `
    <div id="workspace-shell">
      <main id="admin-main-content"></main>
      <section id="admin-sub-body"></section>
    </div>
  `),
  renderWorkspaceSidebar: vi.fn(() => '<aside>sidebar</aside>'),
  wireWorkspaceSidebar: vi.fn(),
  buildWorkspaceTopNavConfig: vi.fn(() => ({ tabs: [] })),
  renderWorkspaceTopNav: vi.fn(() => '<nav>top</nav>'),
  renderWorkspaceTopNavSidebarToggle: vi.fn(() => '<button>toggle</button>'),
  normalizeWorkspaceCapabilities: vi.fn(() => ({ canManageAdmin: true })),
  createSettingsRouteCache: vi.fn(() => ({
    get: vi.fn(),
    set: vi.fn(),
    clear: vi.fn(),
    registerConnectionsRefresh: vi.fn(() => vi.fn()),
    registerToolServersRefresh: vi.fn(() => vi.fn()),
    registerModelsRefresh: vi.fn(() => vi.fn()),
    bind: vi.fn(() => vi.fn()),
  })),
  setSidebarRouteScope: vi.fn(),
  resolveAdminRouteState: vi.fn(() => ({ mainTab: 'users', subTab: 'overview', canonicalPath: '/admin/users/overview' })),
  renderErrorState: vi.fn((message) => `<div class="error">${message}</div>`),
  renderLoadingState: vi.fn(() => '<div class="loading">loading</div>'),
  renderSettingsLayout: vi.fn(() => '<div class="settings-layout"></div>'),
  renderSettingsSkeleton: vi.fn(() => '<div class="settings-skeleton"></div>'),
  renderSystemLayout: vi.fn(() => '<div class="system-layout"></div>'),
  renderUsersLayout: vi.fn(() => '<div class="users-layout"></div>'),
  state: { permissions: ['admin.rbac.admin'], userRoles: [{ role_name: 'admin' }] },
  setState: vi.fn(),
  subscribe: vi.fn(() => () => {}),
}));

vi.mock('../../public/js/shared/api.js', () => ({
  apiFetch: (...args) => mocks.apiFetch(...args),
  fetchAdminGroups: (...args) => mocks.fetchAdminGroups(...args),
}));

vi.mock('../../public/js/shared/components/workspace-shell.js', () => ({
  renderWorkspaceShell: (...args) => mocks.renderWorkspaceShell(...args),
}));

vi.mock('../../public/js/shared/components/workspace-sidebar.js', () => ({
  renderWorkspaceSidebar: (...args) => mocks.renderWorkspaceSidebar(...args),
  wireWorkspaceSidebar: (...args) => mocks.wireWorkspaceSidebar(...args),
}));

vi.mock('../../public/js/shared/components/workspace-top-nav-config.js', () => ({
  buildWorkspaceTopNavConfig: (...args) => mocks.buildWorkspaceTopNavConfig(...args),
}));

vi.mock('../../public/js/shared/components/settings-top-nav.js', () => ({
  renderWorkspaceTopNav: (...args) => mocks.renderWorkspaceTopNav(...args),
  renderWorkspaceTopNavSidebarToggle: (...args) => mocks.renderWorkspaceTopNavSidebarToggle(...args),
}));

vi.mock('../../public/js/shared/utils/workspace-capabilities.js', () => ({
  normalizeWorkspaceCapabilities: (...args) => mocks.normalizeWorkspaceCapabilities(...args),
}));

vi.mock('../../public/js/shared/utils/settings-route-cache.js', () => ({
  createSettingsRouteCache: (...args) => mocks.createSettingsRouteCache(...args),
}));

vi.mock('../../public/js/shared/utils/sidebar-visibility.js', () => ({
  setSidebarRouteScope: (...args) => mocks.setSidebarRouteScope(...args),
}));

vi.mock('../../public/js/features/admin/admin-route-state.js', () => ({
  getAdminSubnavPath: vi.fn(() => '/admin/users/overview'),
  getAdminTopNavPath: vi.fn(() => '/admin/users/overview'),
  resolveAdminRouteState: (...args) => mocks.resolveAdminRouteState(...args),
}));

vi.mock('../../public/js/features/admin/admin-layout.js', () => ({
  ADMIN_SHELL_BODY_PADDING_CLASS: 'p-0',
  renderErrorState: (...args) => mocks.renderErrorState(...args),
  renderLoadingState: (...args) => mocks.renderLoadingState(...args),
  renderSettingsLayout: (...args) => mocks.renderSettingsLayout(...args),
  renderSettingsSkeleton: (...args) => mocks.renderSettingsSkeleton(...args),
  renderSystemLayout: (...args) => mocks.renderSystemLayout(...args),
  renderUsersLayout: (...args) => mocks.renderUsersLayout(...args),
}));

async function loadModule() {
  vi.resetModules();
  return import('../../public/js/features/admin/admin.js');
}

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('admin page renderer', () => {
  beforeEach(() => {
    document.body.innerHTML = '<div id="root"></div>';
    window.history.pushState({}, '', '/admin');
    localStorage.clear();
    sessionStorage.clear();
    vi.clearAllMocks();
    mocks.apiFetch.mockResolvedValue({ ok: true, json: async () => ({}) });
    mocks.fetchAdminGroups.mockResolvedValue({ groups: [] });
  });

  it('renders the admin shell without throwing on the canonical overview route', async () => {
    const { renderAdminPage } = await loadModule();
    const container = document.getElementById('root');

    await expect(renderAdminPage(container)).resolves.not.toThrow();
    await tick();

    expect(container.innerHTML).toContain('workspace-shell');
    expect(container.innerHTML).toContain('users-layout');
    expect(mocks.resolveAdminRouteState).toHaveBeenCalledWith('/admin');
    expect(mocks.renderWorkspaceShell).toHaveBeenCalledTimes(1);
  });
});
