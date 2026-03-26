// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  renderCurrentRoute: vi.fn(),
  apiFetch: vi.fn(),
  fetchAdminGroups: vi.fn(),
  renderPoliciesSettings: vi.fn(),
}));

vi.mock('../../public/js/bootstrap/app.js', () => ({
  renderCurrentRoute: (...args) => mocks.renderCurrentRoute(...args),
}));

vi.mock('../../public/js/shared/api.js', () => ({
  apiFetch: (...args) => mocks.apiFetch(...args),
  fetchAdminGroups: (...args) => mocks.fetchAdminGroups(...args),
}));

vi.mock('../../public/js/shared/components/sidebar.js', () => ({
  renderSidebar: () => () => {},
}));

vi.mock('../../public/js/shared/components/user-profile-footer.js', () => ({
  createUserProfileFooter: async () => document.createElement('div'),
}));

vi.mock('../../public/js/shared/components/search-modal.js', () => ({
  renderSearchModal: () => () => {},
}));

vi.mock('../../public/js/shared/components/files-modal.js', () => ({
  renderFilesModal: () => () => {},
}));

vi.mock('../../public/js/features/admin/users/overview.js', () => ({
  renderUserOverview: () => {},
}));

vi.mock('../../public/js/features/admin/users/groups.js', () => ({
  preloadGroupsData: async () => ({ groups: [] }),
  renderGroupsOverview: () => {},
}));

vi.mock('../../public/js/features/admin/users/groups-helpers.js', () => ({
  shouldLoadGroups: () => false,
}));

vi.mock('../../public/js/features/admin/users/groups-list-helpers.js', () => ({
  removeGroupById: () => [],
  updateGroupMemberCount: () => [],
  upsertGroup: () => [],
}));

vi.mock('../../public/js/features/admin/settings/general.js', () => ({
  renderGeneralSettings: () => {},
}));

vi.mock('../../public/js/features/admin/settings/connections.js', () => ({
  renderConnectionsSettings: () => {},
}));

vi.mock('../../public/js/features/admin/settings/models.js', () => ({
  renderModelsSettings: () => {},
}));

vi.mock('../../public/js/features/admin/settings/integrations.js', () => ({
  renderIntegrationsSettings: () => {},
}));

vi.mock('../../public/js/features/admin/settings/policies.js', () => ({
  renderPoliciesSettings: (...args) => mocks.renderPoliciesSettings(...args),
}));

async function loadModule() {
  vi.resetModules();
  return import('../../public/js/features/admin/admin.js');
}

describe('admin module', () => {
  beforeEach(() => {
    document.body.innerHTML = '<div id="app"></div>';
    vi.clearAllMocks();
    mocks.renderCurrentRoute.mockReset();
    mocks.renderPoliciesSettings.mockReset();
  });

  it('imports without depending on the removed root app module', async () => {
    const mod = await loadModule();

    expect(typeof mod.renderAdminPage).toBe('function');
  }, 15000);

  it('mounts the policies renderer from the canonical settings route', async () => {
    history.replaceState({}, '', '/admin/settings/policies');
    const { renderAdminPage } = await loadModule();

    await renderAdminPage(document.getElementById('app'));

    expect(mocks.renderPoliciesSettings).toHaveBeenCalled();
    expect(document.querySelector('#settings-tabs-container a[data-subnav="policies"]')).toBeNull();
  }, 15000);

  it('mounts the same policies renderer from the users alias route', async () => {
    history.replaceState({}, '', '/admin/users/policies');
    const { renderAdminPage } = await loadModule();

    await renderAdminPage(document.getElementById('app'));

    expect(mocks.renderPoliciesSettings).toHaveBeenCalled();
    expect(document.querySelector('#users-tabs-container a[data-subnav="policies"]')).not.toBeNull();
  }, 15000);

  it('hides the policies link from the settings sidebar while keeping the route reachable', async () => {
    history.replaceState({}, '', '/admin/settings/general');
    const { renderAdminPage } = await loadModule();

    await renderAdminPage(document.getElementById('app'));

    expect(document.querySelector('#settings-tabs-container a[data-subnav="policies"]')).toBeNull();
    expect(document.body.textContent).toContain('General');
  }, 15000);
});
