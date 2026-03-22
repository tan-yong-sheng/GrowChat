// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  renderCurrentRoute: vi.fn(),
  apiFetch: vi.fn(),
  fetchAdminGroups: vi.fn(),
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

async function loadModule() {
  vi.resetModules();
  return import('../../public/js/features/admin/admin.js');
}

describe('admin module', () => {
  beforeEach(() => {
    document.body.innerHTML = '<div id="app"></div>';
    vi.clearAllMocks();
    mocks.renderCurrentRoute.mockReset();
  });

  it('imports without depending on the removed root app module', async () => {
    const mod = await loadModule();

    expect(typeof mod.renderAdminPage).toBe('function');
  }, 15000);
});
