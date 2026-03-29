// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  renderCurrentRoute: vi.fn(),
  apiFetch: vi.fn(),
  fetchAdminGroups: vi.fn(),
  renderUserOverview: vi.fn(),
  renderRolesPage: vi.fn(),
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
  renderUserOverview: (...args) => mocks.renderUserOverview(...args),
}));

vi.mock('../../public/js/features/admin/users/roles.js', () => ({
  renderRolesPage: (...args) => mocks.renderRolesPage(...args),
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
  renderGeneralSettings: (container, data) => {
    data.settingsDirtyCheckers = data.settingsDirtyCheckers || {};
    data.settingsSaveHandlers = data.settingsSaveHandlers || {};
    data.settingsDiscardHandlers = data.settingsDiscardHandlers || {};
    data.settingsDirtyCheckers.general = () => false;
    data.settingsSaveHandlers.general = async () => {};
    data.settingsDiscardHandlers.general = () => {};
    container.innerHTML = '<div data-general-page>General settings</div>';
  },
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
    mocks.renderUserOverview.mockReset();
    mocks.renderRolesPage.mockReset();
    mocks.renderPoliciesSettings.mockReset();
    mocks.renderUserOverview.mockImplementation((container, data) => {
      data.usersDirtyCheckers = data.usersDirtyCheckers || {};
      data.usersSaveHandlers = data.usersSaveHandlers || {};
      data.usersDiscardHandlers = data.usersDiscardHandlers || {};
      data.usersDirtyCheckers.overview = () => true;
      data.usersSaveHandlers.overview = async () => {
        data.usersDirtyCheckers.overview = () => false;
      };
      data.usersDiscardHandlers.overview = () => {
        data.usersDirtyCheckers.overview = () => false;
      };
      container.innerHTML = '<div data-overview-page>Users overview</div>';
    });
    mocks.renderRolesPage.mockImplementation((container, data) => {
      data.usersDirtyCheckers = data.usersDirtyCheckers || {};
      data.usersSaveHandlers = data.usersSaveHandlers || {};
      data.usersDiscardHandlers = data.usersDiscardHandlers || {};
      data.usersDirtyCheckers.roles = () => true;
      data.usersSaveHandlers.roles = async () => {
        data.usersDirtyCheckers.roles = () => false;
      };
      data.usersDiscardHandlers.roles = () => {
        data.usersDirtyCheckers.roles = () => false;
      };
      container.innerHTML = '<div data-role-page>Roles</div>';
    });
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

  it('mounts the general renderer from the canonical system route', async () => {
    history.replaceState({}, '', '/admin/system/general');
    const { renderAdminPage } = await loadModule();

    await renderAdminPage(document.getElementById('app'));

    expect(document.querySelector('a[data-nav="system"]')).not.toBeNull();
    expect(document.querySelector('#system-tabs-container a[data-subnav="general"]')).not.toBeNull();
    expect(document.body.textContent).toContain('General');
  }, 15000);

  it('renders the shared save footer for system pages from the shell', async () => {
    history.replaceState({}, '', '/admin/system/general');
    const { renderAdminPage } = await loadModule();

    await renderAdminPage(document.getElementById('app'));

    await vi.waitFor(() => expect(document.querySelector('#system-action-footer')).not.toBeNull());
    expect(document.querySelector('#system-action-footer')?.classList.contains('hidden')).toBe(false);
    expect(document.querySelector('#save-system')).not.toBeNull();
    expect(document.querySelector('#save-system')?.disabled).toBe(true);
  }, 15000);

  it('prompts before leaving users when the roles draft is dirty', async () => {
    history.replaceState({}, '', '/admin/users/roles');
    const { renderAdminPage } = await loadModule();

    await renderAdminPage(document.getElementById('app'));

    expect(mocks.renderRolesPage).toHaveBeenCalled();
    document.querySelector('a[data-nav="settings"]')?.click();

    await vi.waitFor(() => expect(document.querySelector('#admin-unsaved-modal')).not.toBeNull());
    expect(window.location.pathname).toBe('/admin/users/roles');

    document.querySelector('#unsaved-discard')?.click();
    await vi.waitFor(() => expect(window.location.pathname).toBe('/admin/settings/connections'));
  }, 15000);

  it('shows a main save footer on dirty users overview drafts', async () => {
    history.replaceState({}, '', '/admin/users/overview');
    const { renderAdminPage } = await loadModule();
    let activeOverviewData = null;
    const overviewSaveSpy = vi.fn(async () => {
      if (activeOverviewData) {
        activeOverviewData.usersDirtyCheckers.overview = () => false;
      }
    });
    mocks.renderUserOverview.mockImplementation((container, data) => {
      activeOverviewData = data;
      data.usersDirtyCheckers = data.usersDirtyCheckers || {};
      data.usersSaveHandlers = data.usersSaveHandlers || {};
      data.usersDiscardHandlers = data.usersDiscardHandlers || {};
      data.usersDirtyCheckers.overview = () => true;
      data.usersSaveHandlers.overview = overviewSaveSpy;
      data.usersDiscardHandlers.overview = () => {
        data.usersDirtyCheckers.overview = () => false;
      };
      container.innerHTML = '<div data-overview-page>Users overview</div>';
    });

    await renderAdminPage(document.getElementById('app'));

    await vi.waitFor(() => expect(document.querySelector('#save-users')).not.toBeNull());
    expect(document.querySelector('#users-action-footer')?.classList.contains('hidden')).toBe(false);

    document.querySelector('#save-users')?.click();
    await vi.waitFor(() => expect(overviewSaveSpy).toHaveBeenCalled());
    await vi.waitFor(() => expect(activeOverviewData.usersDirtyCheckers.overview()).toBe(false));
  }, 15000);

  it('blocks browser unload when the active users draft is dirty', async () => {
    history.replaceState({}, '', '/admin/users/overview');
    const { renderAdminPage } = await loadModule();
    mocks.renderUserOverview.mockImplementation((container, data) => {
      data.usersDirtyCheckers = data.usersDirtyCheckers || {};
      data.usersSaveHandlers = data.usersSaveHandlers || {};
      data.usersDiscardHandlers = data.usersDiscardHandlers || {};
      data.usersDirtyCheckers.overview = () => true;
      container.innerHTML = '<div data-overview-page>Users overview</div>';
    });

    await renderAdminPage(document.getElementById('app'));

    const event = new Event('beforeunload', { cancelable: true });
    const dispatchResult = window.dispatchEvent(event);

    expect(dispatchResult).toBe(false);
    expect(event.defaultPrevented).toBe(true);
  }, 15000);

  it('keeps the users save footer visible on the overview page before edits', async () => {
    history.replaceState({}, '', '/admin/users/overview');
    const { renderAdminPage } = await loadModule();
    mocks.renderUserOverview.mockImplementation((container, data) => {
      data.usersDirtyCheckers = data.usersDirtyCheckers || {};
      data.usersSaveHandlers = data.usersSaveHandlers || {};
      data.usersDiscardHandlers = data.usersDiscardHandlers || {};
      data.usersDirtyCheckers.overview = () => false;
      container.innerHTML = '<div data-overview-page>Users overview</div>';
    });

    await renderAdminPage(document.getElementById('app'));

    await vi.waitFor(() => expect(document.querySelector('#users-action-footer')).not.toBeNull());
    expect(document.querySelector('#users-action-footer')?.classList.contains('hidden')).toBe(false);
    expect(document.querySelector('#save-users')?.disabled).toBe(true);
    expect(document.querySelector('#users-dirty')?.classList.contains('invisible')).toBe(true);
  }, 15000);
});
