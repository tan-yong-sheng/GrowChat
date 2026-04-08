import { state, setState, subscribe } from '../../shared/store.js';
import { apiFetch, fetchAdminGroups } from '../../shared/api.js';
import { renderWorkspaceShell } from '../../shared/components/workspace-shell.js';
import { renderWorkspaceSidebar, wireWorkspaceSidebar } from '../../shared/components/workspace-sidebar.js';
import { buildWorkspaceTopNavConfig } from '../../shared/components/workspace-top-nav-config.js';
import {
  renderWorkspaceTopNav,
  renderWorkspaceTopNavSidebarToggle,
} from '../../shared/components/settings-top-nav.js';
import { normalizeWorkspaceCapabilities } from '../../shared/utils/workspace-capabilities.js';
import { renderUserOverview } from './users/overview.js';
import { preloadGroupsData, renderGroupsOverview } from './users/groups.js';
import { shouldLoadGroups } from './users/groups-helpers.js';
import { removeGroupById, updateGroupMemberCount, upsertGroup } from './users/groups-list-helpers.js';
import { renderGeneralSettings } from './settings/general.js';
import { renderSecuritySettings } from './settings/security.js';
import { renderConnectionsSettings } from './settings/connections.js';
import { renderModelsSettings } from './settings/models.js';
import { renderIntegrationsSettings } from './settings/integrations.js';
import { renderPoliciesSettings } from './settings/policies.js';
import { renderRolesPage } from './users/roles.js';
import { createAdminShellController } from './admin-shell-controller.js';
import { createSettingsRouteCache } from '../../shared/utils/settings-route-cache.js';
import {
  getAdminSubnavPath,
  getAdminTopNavPath,
  resolveAdminRouteState,
} from './admin-route-state.js';
import {
  ADMIN_SHELL_BODY_PADDING_CLASS,
  ADMIN_SHELL_FOOTER_PADDING_CLASS,
  renderErrorState,
  renderLoadingState,
  renderSettingsLayout,
  renderSettingsSkeleton,
  renderSystemLayout,
  renderUsersLayout,
} from './admin-layout.js';
import { renderCurrentRoute } from '../../bootstrap/app.js';

export async function renderAdminPage(container) {
  const capabilities = normalizeWorkspaceCapabilities({
    permissions: state.permissions,
    primaryRole: state.userRoles?.[0]?.role_name || 'admin',
  }, { route: 'admin' });
  let mainTab = 'users';
  let subTab = 'overview';
  let shellMounted = false;
  let data = {
    capabilities,
    users: [],
    total: 0,
    groups: [],
    groupsLoading: false,
    groupsSort: 'members',
    loading: false,
    loadingMode: 'initial',
    error: null,
    groupsError: null,
    usersCache: {},
    pagination: {
      page: 1,
      pageSize: 20,
    },
    settingsDirtyCheckers: {},
    settingsSaveHandlers: {},
    settingsDiscardHandlers: {},
    usersDirtyCheckers: {},
    usersSaveHandlers: {},
    usersDiscardHandlers: {},
  };

  const shellController = createAdminShellController({
    container,
    data,
    getMainTab: () => mainTab,
    getSubTab: () => subTab,
  });
  const guardNavigation = shellController.guardNavigation;
  const handleBeforeUnload = shellController.handleBeforeUnload;
  const renderMainActionFooter = shellController.renderSharedActionFooter;
  const updateMainActionFooter = shellController.updateSharedActionFooter;
  const settingsRouteCache = createSettingsRouteCache();
  let removeInvalidationListeners = null;
  data.settingsRouteCache = settingsRouteCache;

  const updateRouteInfo = () => {
    const routeState = resolveAdminRouteState(window.location.pathname);
    mainTab = routeState.mainTab;
    subTab = routeState.subTab;
    if (routeState.canonicalPath !== window.location.pathname) {
      window.history.replaceState({}, '', routeState.canonicalPath);
    }
  };

  const sortUsers = (users) => users
    .slice()
    .sort((a, b) => {
      const roleOrder = { admin: 0, member: 1 };
      const statusOrder = { active: 0, pending: 1 };
      const roleDiff = (roleOrder[a.primary_role] ?? 2) - (roleOrder[b.primary_role] ?? 2);
      if (roleDiff !== 0) return roleDiff;
      const statusDiff = (statusOrder[a.account_status] ?? 2) - (statusOrder[b.account_status] ?? 2);
      if (statusDiff !== 0) return statusDiff;
      const nameDiff = String(a.name || '').localeCompare(String(b.name || ''), undefined, { sensitivity: 'base' });
      if (nameDiff !== 0) return nameDiff;
      return String(a.email || '').localeCompare(String(b.email || ''), undefined, { sensitivity: 'base' });
    });

  const clearUsersCache = () => {
    data.usersCache = {};
  };

  const updateCachedUser = (updatedUser) => {
    Object.keys(data.usersCache).forEach((key) => {
      const cached = data.usersCache[key];
      const hasUser = cached.users.some((user) => user.id === updatedUser.id);
      if (!hasUser) return;
      cached.users = sortUsers(cached.users.map((user) => user.id === updatedUser.id ? { ...user, ...updatedUser } : user));
    });
  };

  const removeCachedUser = (userId) => {
    clearUsersCache();
    data.users = data.users.filter((user) => user.id !== userId);
    data.total = Math.max(0, data.total - 1);
  };

  const prependCachedUser = (user) => {
    clearUsersCache();
    data.users = sortUsers([user, ...data.users]).slice(0, data.pagination.pageSize);
    data.total += 1;
  };

  const renderSubContent = () => {
    const mainContentEl = container.querySelector('#admin-main-content');
    if (!mainContentEl) return;

    const tabsContainer = container.querySelector('#users-tabs-container')
      || container.querySelector('#settings-tabs-container')
      || container.querySelector('#system-tabs-container');

    if (!tabsContainer) {
      if (mainTab === 'users') {
        mainContentEl.innerHTML = renderUsersLayout(subTab);
      } else if (mainTab === 'system') {
        mainContentEl.innerHTML = renderSystemLayout(subTab);
      } else {
        mainContentEl.innerHTML = renderSettingsLayout(subTab);
      }
      bindSubnav();
    } else {
      if (mainTab === 'users') {
        tabsContainer.id = 'users-tabs-container';
        tabsContainer.innerHTML = `
          <a href="/admin/users/overview" data-subnav="overview" class="flex items-center gap-2 px-3 py-2 rounded-lg transition ${subTab === 'overview' ? 'bg-gray-100 text-gray-900' : 'text-gray-700 hover:text-gray-900'}">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" class="size-5">
              <path d="M8.5 4.5a2.5 2.5 0 1 1-5 0 2.5 2.5 0 0 1 5 0ZM10.9 12.006c.11.542-.348.994-.9.994H2c-.553 0-1.01-.452-.902-.994a5.002 5.002 0 0 1 9.803 0ZM14.002 12h-1.59a2.556 2.556 0 0 0-.04-.29 6.476 6.476 0 0 0-1.167-2.603 3.002 3.002 0 0 1 3.633 1.911c.18.522-.283.982-.836.982ZM12 8a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z"/>
            </svg>
            <span>Overview</span>
          </a>
          <a href="/admin/users/roles" data-subnav="roles" class="flex items-center gap-2 px-3 py-2 rounded-lg transition ${subTab === 'roles' ? 'bg-gray-100 text-gray-900' : 'text-gray-400 hover:text-gray-700'}">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" class="size-5">
              <path d="M8 1.75a3.25 3.25 0 1 0 0 6.5 3.25 3.25 0 0 0 0-6.5ZM2.5 13.25a5.5 5.5 0 0 1 11 0v.25H2.5v-.25Z"/>
            </svg>
            <span>Roles</span>
          </a>
          <a href="/admin/users/groups" data-subnav="groups" class="flex items-center gap-2 px-3 py-2 rounded-lg transition ${subTab === 'groups' ? 'bg-gray-100 text-gray-900' : 'text-gray-400 hover:text-gray-700'}">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" class="size-5">
              <path d="M8 8a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5ZM3.156 11.763c.16-.629.44-1.21.813-1.72a2.5 2.5 0 0 0-2.725 1.377c-.136.287.102.58.418.58h1.449c.01-.077.025-.156.045-.237ZM12.847 11.763c.02.08.036.16.046.237h1.446c.316 0 .554-.293.417-.579a2.5 2.5 0 0 0-2.722-1.378c.374.51.653 1.09.813 1.72ZM14 7.5a1.5 1.5 0 1 1-3 0 1.5 1.5 0 0 1 3 0ZM3.5 9a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3ZM5 13c-.552 0-1.013-.455-.876-.99a4.002 4.002 0 0 1 7.753 0c.136.535-.324.99-.877.99H5Z"/>
            </svg>
            <span>Groups</span>
          </a>
          <a href="/admin/users/policies" data-subnav="policies" class="flex items-center gap-2 px-3 py-2 rounded-lg transition ${subTab === 'policies' ? 'bg-gray-100 text-gray-900' : 'text-gray-400 hover:text-gray-700'}">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" class="size-5">
              <path fill-rule="evenodd" d="M2 4.25A2.25 2.25 0 0 1 4.25 2h7.5A2.25 2.25 0 0 1 14 4.25v7.5A2.25 2.25 0 0 1 11.75 14h-7.5A2.25 2.25 0 0 1 2 11.75v-7.5Zm2.25-.75a.75.75 0 0 0-.75.75v7.5c0 .414.336.75.75.75h7.5a.75.75 0 0 0 .75-.75v-7.5a.75.75 0 0 0-.75-.75h-7.5Z" clip-rule="evenodd" />
              <path d="M5 5.5a.75.75 0 0 1 .75-.75h4.5a.75.75 0 0 1 0 1.5h-4.5A.75.75 0 0 1 5 5.5ZM5 8a.75.75 0 0 1 .75-.75h4.5a.75.75 0 0 1 0 1.5h-4.5A.75.75 0 0 1 5 8ZM5 10.5a.75.75 0 0 1 .75-.75h2.5a.75.75 0 0 1 0 1.5h-2.5A.75.75 0 0 1 5 10.5Z" />
            </svg>
            <span>Policies</span>
          </a>
        `;
      } else if (mainTab === 'system') {
        tabsContainer.id = 'system-tabs-container';
        tabsContainer.innerHTML = `
          <a href="/admin/system/general" data-subnav="general" class="flex items-center gap-2 px-3 py-2 rounded-lg transition ${subTab === 'general' ? 'bg-gray-100 text-gray-900' : 'text-gray-400 hover:text-gray-700'}">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" class="size-5">
              <path d="M8 8a2 2 0 1 0 0-4 2 2 0 0 0 0 4ZM3 12a3 3 0 0 1 3-3h4a3 3 0 0 1 3 3v1H3v-1Z"/>
            </svg>
            <span>General</span>
          </a>
          <a href="/admin/system/security" data-subnav="security" class="flex items-center gap-2 px-3 py-2 rounded-lg transition ${subTab === 'security' ? 'bg-gray-100 text-gray-900' : 'text-gray-400 hover:text-gray-700'}">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" class="size-5"><path d="M8 1a.75.75 0 0 1 .75.75v1.258a5.25 5.25 0 1 1-1.5 0V1.75A.75.75 0 0 1 8 1ZM8 4a.75.75 0 0 1 .75.75v3.5a.75.75 0 0 1-1.5 0v-3.5A.75.75 0 0 1 8 4Z"/></svg>
            <span>Security</span>
          </a>
        `;
      } else {
        tabsContainer.id = 'settings-tabs-container';
        tabsContainer.innerHTML = `
          <a href="/admin/settings/connections" data-subnav="connections" class="flex items-center gap-2 px-3 py-2 rounded-lg transition ${subTab === 'connections' ? 'bg-gray-100 text-gray-900' : 'text-gray-400 hover:text-gray-700'}">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" class="size-5">
              <path d="M4 3a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2H4Zm0 1.5h8a.5.5 0 0 1 .5.5v2.5h-9V5a.5.5 0 0 1 .5-.5Zm8 7H4a.5.5 0 0 1-.5-.5v-2h9v2a.5.5 0 0 1-.5.5Z"/>
            </svg>
            <span>Connections</span>
          </a>
          <a href="/admin/settings/models" data-subnav="models" class="flex items-center gap-2 px-3 py-2 rounded-lg transition ${subTab === 'models' ? 'bg-gray-100 text-gray-900' : 'text-gray-400 hover:text-gray-700'}">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" class="size-5">
              <path fill-rule="evenodd" d="M2 4.25A2.25 2.25 0 0 1 4.25 2h7.5A2.25 2.25 0 0 1 14 4.25v7.5A2.25 2.25 0 0 1 11.75 14h-7.5A2.25 2.25 0 0 1 2 11.75v-7.5Zm2.25-.75a.75.75 0 0 0-.75.75v7.5c0 .414.336.75.75.75h7.5a.75.75 0 0 0 .75-.75v-7.5a.75.75 0 0 0-.75-.75h-7.5Z" clip-rule="evenodd" />
              <path d="M4.75 5.5a.75.75 0 0 1 .75-.75h5a.75.75 0 0 1 0 1.5h-5a.75.75 0 0 1-.75-.75ZM4.75 8a.75.75 0 0 1 .75-.75h5a.75.75 0 0 1 0 1.5h-5A.75.75 0 0 1 4.75 8ZM5.5 9.75a.75.75 0 0 0 0 1.5h3a.75.75 0 0 0 0-1.5h-3Z" />
            </svg>
            <span>Models</span>
          </a>
          <a href="/admin/settings/integrations" data-subnav="integrations" class="flex items-center gap-2 px-3 py-2 rounded-lg transition ${subTab === 'integrations' ? 'bg-gray-100 text-gray-900' : 'text-gray-400 hover:text-gray-700'}">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" class="size-5">
              <path fill-rule="evenodd" d="M3.75 3A1.75 1.75 0 0 0 2 4.75v6.5c0 .966.784 1.75 1.75 1.75h8.5A1.75 1.75 0 0 0 14 11.25v-6.5A1.75 1.75 0 0 0 12.25 3h-8.5ZM12.5 4.75a.25.25 0 0 0-.25-.25h-8.5a.25.25 0 0 0-.25.25v6.5c0 .138.112.25.25.25h8.5a.25.25 0 0 0 .25-.25v-6.5Z" clip-rule="evenodd" />
              <path fill-rule="evenodd" d="M6 7a1 1 0 1 1 2 0 1 1 0 0 1-2 0ZM10 7a1 1 0 1 1 2 0 1 1 0 0 1-2 0ZM6 9a1 1 0 1 1 2 0 1 1 0 0 1-2 0ZM10 9a1 1 0 1 1 2 0 1 1 0 0 1-2 0Z" clip-rule="evenodd" />
              </svg>
              <span>Integrations</span>
            </a>
        `;
      }
      bindSubnav();
    }

    const subContentEl = container.querySelector('#admin-sub-body') || container.querySelector('#admin-sub-content');
    if (!subContentEl) return;

    subContentEl.dataset.settingsTab = subTab;
    data.sharedActionFooter = true;
    renderMainActionFooter();

    if (mainTab === 'settings') {
      if (subTab === 'connections') {
        renderConnectionsSettings(subContentEl, data);
      } else if (subTab === 'models') {
        renderModelsSettings(subContentEl, data);
      } else if (subTab === 'integrations') {
        renderIntegrationsSettings(subContentEl, data);
      } else {
        subContentEl.innerHTML = `
          <div class="flex flex-col items-center justify-center h-full text-center p-10">
            <div class="w-16 h-16 bg-gray-50 rounded-2xl flex items-center justify-center mb-4 text-gray-300">
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="size-5">
                <path stroke-linecap="round" stroke-linejoin="round" d="M11.42 15.17L17.25 21A2.652 2.652 0 0021 17.25l-5.83-5.83m0 0a2.978 2.978 0 01-3.34-3.34L15 2.25 10.5 2.25l-4.5 4.5v1.5a1.5 1.5 0 001.5 1.5h1.5l3.93 3.93m2.856 2.856l1.5 1.5a1.5 1.5 0 001.5-1.5V10.5l-4.5-4.5H6" />
              </svg>
            </div>
            <h3 class="text-lg font-medium text-gray-900 mb-1">${subTab.charAt(0).toUpperCase() + subTab.slice(1)} Settings</h3>
            <p class="text-sm text-gray-700 max-w-xs">This section is currently under development.</p>
          </div>
        `;
      }
      renderMainActionFooter();
      updateMainActionFooter();
      return;
    }

    if (mainTab === 'system') {
      if (subTab === 'general') {
        renderGeneralSettings(subContentEl, data);
      } else if (subTab === 'security') {
        renderSecuritySettings(subContentEl, data);
      } else {
        subContentEl.innerHTML = `
          <div class="flex flex-col items-center justify-center h-full text-center p-10">
            <div class="w-16 h-16 bg-gray-50 rounded-2xl flex items-center justify-center mb-4 text-gray-300">
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="size-5">
                <path stroke-linecap="round" stroke-linejoin="round" d="M11.42 15.17L17.25 21A2.652 2.652 0 0021 17.25l-5.83-5.83m0 0a2.978 2.978 0 01-3.34-3.34L15 2.25 10.5 2.25l-4.5 4.5v1.5a1.5 1.5 0 001.5 1.5h1.5l3.93 3.93m2.856 2.856l1.5 1.5a1.5 1.5 0 001.5-1.5V10.5l-4.5-4.5H6" />
              </svg>
            </div>
            <h3 class="text-lg font-medium text-gray-900 mb-1">${subTab.charAt(0).toUpperCase() + subTab.slice(1)} System</h3>
            <p class="text-sm text-gray-700 max-w-xs">This section is currently under development.</p>
          </div>
        `;
      }
      renderMainActionFooter();
      updateMainActionFooter();
      return;
    }

    if (mainTab === 'users' && subTab === 'roles') {
      renderRolesPage(subContentEl, data);
      renderMainActionFooter();
      updateMainActionFooter();
      return;
    }

    if (mainTab === 'users' && subTab === 'policies') {
      renderPoliciesSettings(subContentEl, data);
      renderMainActionFooter();
      updateMainActionFooter();
      return;
    }

    if (data.error) {
      subContentEl.innerHTML = renderErrorState(data.error);
    } else if (subTab === 'overview') {
      renderUserOverview(subContentEl, data, {
        reload: loadUsers,
        setUsers(nextUsers, total = nextUsers.length) {
          data.users = nextUsers;
          data.total = total;
          clearUsersCache();
          renderSubContent();
        },
        updateUser(updatedUser) {
          updateCachedUser(updatedUser);
          data.users = sortUsers(data.users.map((user) => user.id === updatedUser.id ? { ...user, ...updatedUser } : user));
          renderSubContent();
        },
        removeUser(userId) {
          removeCachedUser(userId);
          renderSubContent();
        },
        prependUser(user) {
          prependCachedUser(user);
          renderSubContent();
        },
        invalidateCache() {
          clearUsersCache();
          renderSubContent();
        },
      });
    } else if (data.loading && data.loadingMode === 'initial') {
      subContentEl.innerHTML = renderLoadingState();
    } else {
      renderGroupsOverview(subContentEl, data, {
        reload: loadGroups,
        onSortChange(nextSort) {
          data.groupsSort = nextSort;
          renderSubContent();
        },
        onCreate(group) {
          data.groups = upsertGroup(data.groups, group);
          renderSubContent();
        },
        onUpdate(group) {
          data.groups = upsertGroup(data.groups, group);
          renderSubContent();
        },
        onDelete(groupId) {
          data.groups = removeGroupById(data.groups, groupId);
          renderSubContent();
        },
        onMemberDelta(groupId, delta) {
          if (!delta) return;
          data.groups = updateGroupMemberCount(data.groups, groupId, delta);
          renderSubContent();
        },
      });
    }
    renderMainActionFooter();
    updateMainActionFooter();
  };

  async function loadUsers({ preserveContent = true } = {}) {
    const cacheKey = `${data.pagination.page}:${data.pagination.pageSize}`;
    const cached = data.usersCache[cacheKey];

    if (cached) {
      data.users = cached.users;
      data.total = cached.total;
      data.error = null;
      data.loading = false;
      data.loadingMode = 'idle';
      renderSubContent();
      return;
    }

    data.loading = true;
    data.loadingMode = preserveContent ? 'table' : 'initial';
    data.error = null;
    renderSubContent();

    try {
      const offset = (data.pagination.page - 1) * data.pagination.pageSize;
      const res = await apiFetch(`/api/admin/users?limit=${data.pagination.pageSize}&offset=${offset}`);
      if (res.status === 403) {
        data.error = 'You do not have permission to manage users.';
      } else if (!res.ok) {
        throw new Error(`Failed to fetch users (${res.status})`);
      } else {
        const payload = await res.json();
        data.users = payload.users || [];
        data.total = payload.total || 0;
        data.usersCache[cacheKey] = {
          users: data.users,
          total: data.total,
        };
      }
    } catch (err) {
      data.error = err.message || 'Failed to fetch users.';
    } finally {
      data.loading = false;
      data.loadingMode = 'idle';
      renderSubContent();
    }
  }

  async function loadGroups({ preserveContent = true } = {}) {
    data.groupsLoading = true;
    data.groupsError = null;
    if (!preserveContent) {
      data.groups = [];
    }
    renderSubContent();

    try {
      const res = await fetchAdminGroups();
      data.groups = res.groups || [];
    } catch (err) {
      if (err?.status === 403) {
        data.groupsError = 'You do not have permission to manage groups.';
      } else {
        data.groupsError = err.message || 'Failed to fetch groups.';
      }
    } finally {
      data.groupsLoading = false;
      renderSubContent();
    }
  }

  data.requestUsersFooterSync = updateMainActionFooter;
  data.requestSettingsFooterSync = updateMainActionFooter;
  data.requestSharedActionFooterSync = updateMainActionFooter;
  data.guardNavigation = guardNavigation;

  function bindTopNav() {
    container.querySelectorAll('a[data-nav]').forEach((link) => {
      link.onclick = async (e) => {
        e.preventDefault();
        const allowed = await guardNavigation();
        if (!allowed) return;
        const nav = link.dataset.nav;
        const newPath = getAdminTopNavPath(nav);
        window.history.pushState({}, '', newPath);
        updateRouteInfo();

        container.querySelectorAll('a[data-nav]').forEach((navLink) => {
          const active = navLink.dataset.nav === mainTab;
          navLink.className = `min-w-fit p-1.5 transition select-none ${active ? 'text-gray-900 underline underline-offset-[10px] decoration-2' : 'text-gray-300 hover:text-gray-700'}`;
        });

        mountShell();
        renderSubContent();
        if (mainTab === 'users' && data.users.length === 0 && !data.loading) {
          await loadUsers({ preserveContent: false });
        }
      };
    });
  }

  function bindSubnav() {
    container.querySelectorAll('a[data-subnav]').forEach((link) => {
      link.onclick = async (e) => {
        e.preventDefault();
        const allowed = await guardNavigation();
        if (!allowed) return;
        const nav = link.dataset.subnav;
        window.history.pushState({}, '', getAdminSubnavPath(mainTab, nav));
        updateRouteInfo();
        const subContentEl = container.querySelector('#admin-sub-content');
        if (subContentEl && (mainTab === 'settings' || mainTab === 'system')) {
          subContentEl.innerHTML = renderSettingsSkeleton();
          renderMainActionFooter();
          updateMainActionFooter();
          requestAnimationFrame(() => renderSubContent());
          return;
        }
        renderSubContent();
        if (mainTab === 'users' && subTab === 'groups' && shouldLoadGroups(data)) {
          await loadGroups({ preserveContent: false });
        }
      };
    });
  }

  function mountShell() {
    const previousCleanup = typeof container.__cleanup === 'function' ? container.__cleanup : null;
    if (typeof container.__cleanup === 'function') {
      container.__cleanup();
    }

    container.innerHTML = renderWorkspaceShell({
      sidebarHtml: renderWorkspaceSidebar({
        homeHref: '/',
        homeId: 'workspace-home-link',
        homeLabel: 'GrowChat',
        footerId: 'sidebar-footer',
      }),
      mainHtml: `
          ${renderWorkspaceTopNav({
            ...buildWorkspaceTopNavConfig({
              variant: 'admin',
              currentKey: mainTab,
            }),
            leadingSlotHtml: renderWorkspaceTopNavSidebarToggle({
              id: 'toggle-sidebar-mobile',
              title: 'Open Sidebar',
              className: 'p-2 mr-2 hover:bg-gray-100 rounded-lg transition text-gray-700 md:hidden',
            }),
          })}
          <div class="flex-1 flex overflow-hidden" id="admin-main-content"></div>
        `,
    });
    container.insertAdjacentHTML('beforeend', '<div id="search-modal-container"></div><div id="files-modal-container"></div>');

    wireWorkspaceSidebar(container, {
      guardNavigation,
      navigateHome: async () => {
        window.history.pushState({}, '', '/');
        renderCurrentRoute();
      },
      searchModalContainerSelector: '#search-modal-container',
      filesModalContainerSelector: '#files-modal-container',
      footerId: 'sidebar-footer',
    });
    bindTopNav();
    if (!container.__sharedFooterClickBound) {
      container.__sharedFooterClickBound = true;
    }
    window.addEventListener('beforeunload', handleBeforeUnload);
    shellMounted = true;
    renderMainActionFooter();
    const priorCleanup = previousCleanup;
    container.__cleanup = () => {
      priorCleanup?.();
      removeInvalidationListeners?.();
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }

  const unregisterConnections = settingsRouteCache.registerConnectionsRefresh(() => {
    if (mainTab !== 'settings' && mainTab !== 'system') return;
    if (data.connectionsSettings) data.connectionsSettings.loaded = false;
    if (data.generalSettings) data.generalSettings.models = [];
    renderSubContent();
  });
  const unregisterToolServers = settingsRouteCache.registerToolServersRefresh(() => {
    if (mainTab !== 'settings' && mainTab !== 'system') return;
    if (data.integrationsSettings) data.integrationsSettings.loaded = false;
    renderSubContent();
  });
  const unregisterModels = settingsRouteCache.registerModelsRefresh(() => {
    if (mainTab !== 'settings' && mainTab !== 'system') return;
    data.modelsSettingsInvalidate = Date.now();
    if (data.generalSettings) {
      data.generalSettings.modelsInvalidateToken = data.modelsSettingsInvalidate;
      data.generalSettings.models = [];
    }
    renderSubContent();
  });

  updateRouteInfo();
  if (!shellMounted) {
    mountShell();
  }
  renderSubContent();
  const routeCacheCleanup = settingsRouteCache.bind();
  removeInvalidationListeners = () => {
    unregisterConnections?.();
    unregisterToolServers?.();
    unregisterModels?.();
    routeCacheCleanup?.();
  };
  if (mainTab === 'users' && data.users.length === 0) {
    await loadUsers({ preserveContent: false });
  }
  if (mainTab === 'users' && subTab === 'groups' && shouldLoadGroups(data)) {
    try {
      const preload = await preloadGroupsData();
      data.groups = preload.groups || [];
      data.groupsError = null;
      data.groupsLoading = false;
      renderSubContent();
    } catch (err) {
      data.groupsError = err.message || 'Failed to fetch groups.';
    }
  }
}
