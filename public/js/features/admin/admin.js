import { state } from '../../shared/store.js';
import { normalizeWorkspaceCapabilities } from '../../shared/utils/workspace-capabilities.js';

const loadAdminUsersOverviewModule = () => import('./users/overview.js');
const loadAdminUsersGroupsModule = () => import('./users/groups.js');
const loadAdminUsersGroupsHelpersModule = () => import('./users/groups-helpers.js');
const loadAdminUsersGroupsListHelpersModule = () => import('./users/groups-list-helpers.js');
const loadAdminSettingsRegistrationModule = () => import('./settings/registration.js');
const loadAdminSettingsEmailDeliveryModule = () => import('./settings/email-delivery.js');
const loadAdminSettingsSecurityOverviewModule = () => import('./settings/security-overview.js');
const loadAdminSettingsConnectionsModule = () => import('./settings/connections.js');
const loadAdminSettingsModelsModule = () => import('./settings/models.js');
const loadAdminSettingsIntegrationsModule = () => import('./settings/integrations.js');
const loadAdminSettingsPoliciesModule = () => import('./settings/policies.js');
const loadAdminAuditLogsModule = () => import('./audit-logs.js');
const loadAdminUsersRolesModule = () => import('./users/roles.js');

import { createSettingsRouteCache } from '../../shared/utils/settings-route-cache.js';
import { setSidebarRouteScope } from '../../shared/utils/sidebar-visibility.js';
import { resolveAdminRouteState } from './admin-route-state.js';
import { createAdminController } from './admin-controller.js';

export async function renderAdminPage(container) {
  const initialRouteState = resolveAdminRouteState(window.location.pathname);
  const capabilities = normalizeWorkspaceCapabilities(
    {
      permissions: state.permissions,
      primaryRole: state.userRoles?.[0]?.role_name || 'admin',
    },
    { route: 'admin' }
  );

  let mainTab = initialRouteState.mainTab;
  let subTab = initialRouteState.subTab;
  let shellMounted = false;
  let removeInvalidationListeners = null;

  const data = {
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
  };

  const usersModules = {
    renderUserOverview: null,
    preloadGroupsData: null,
    renderGroupsOverview: null,
    shouldLoadGroups: null,
    removeGroupById: null,
    updateGroupMemberCount: null,
    upsertGroup: null,
    renderPoliciesSettings: null,
    renderRolesPage: null,
  };

  const settingsModules = {
    renderConnectionsSettings: null,
    renderModelsSettings: null,
    renderIntegrationsSettings: null,
  };

  const systemModules = {
    renderRegistrationSettings: null,
    renderEmailDeliverySettings: null,
    renderSecuritySettings: null,
  };

  let usersModulesReadyPromise = null;
  let settingsModulesReadyPromise = null;
  let systemModulesReadyPromise = null;

  const ensureUsersModules = () => {
    if (usersModules.renderUserOverview) return Promise.resolve(usersModules);
    if (usersModulesReadyPromise) return usersModulesReadyPromise;
    usersModulesReadyPromise = Promise.all([
      loadAdminUsersOverviewModule(),
      loadAdminUsersGroupsModule(),
      loadAdminUsersGroupsHelpersModule(),
      loadAdminUsersGroupsListHelpersModule(),
      loadAdminSettingsPoliciesModule(),
      loadAdminUsersRolesModule(),
    ])
      .then(
        ([
          overviewModule,
          groupsModule,
          groupsHelpersModule,
          groupsListHelpersModule,
          policiesModule,
          rolesModule,
        ]) => {
          usersModules.renderUserOverview = overviewModule.renderUserOverview;
          usersModules.preloadGroupsData = groupsModule.preloadGroupsData;
          usersModules.renderGroupsOverview = groupsModule.renderGroupsOverview;
          usersModules.shouldLoadGroups = groupsHelpersModule.shouldLoadGroups;
          usersModules.removeGroupById = groupsListHelpersModule.removeGroupById;
          usersModules.updateGroupMemberCount = groupsListHelpersModule.updateGroupMemberCount;
          usersModules.upsertGroup = groupsListHelpersModule.upsertGroup;
          usersModules.renderPoliciesSettings = policiesModule.renderPoliciesSettings;
          usersModules.renderRolesPage = rolesModule.renderRolesPage;
          return usersModules;
        }
      )
      .catch((err) => {
        usersModulesReadyPromise = null;
        throw err;
      });
    return usersModulesReadyPromise;
  };

  const ensureSettingsModules = () => {
    if (settingsModules.renderConnectionsSettings) return Promise.resolve(settingsModules);
    if (settingsModulesReadyPromise) return settingsModulesReadyPromise;
    settingsModulesReadyPromise = Promise.all([
      loadAdminSettingsConnectionsModule(),
      loadAdminSettingsModelsModule(),
      loadAdminSettingsIntegrationsModule(),
    ])
      .then(([connectionsModule, modelsModule, integrationsModule]) => {
        settingsModules.renderConnectionsSettings = connectionsModule.renderConnectionsSettings;
        settingsModules.renderModelsSettings = modelsModule.renderModelsSettings;
        settingsModules.renderIntegrationsSettings = integrationsModule.renderIntegrationsSettings;
        return settingsModules;
      })
      .catch((err) => {
        settingsModulesReadyPromise = null;
        throw err;
      });
    return settingsModulesReadyPromise;
  };

  const ensureSystemModules = () => {
    if (systemModules.renderRegistrationSettings) return Promise.resolve(systemModules);
    if (systemModulesReadyPromise) return systemModulesReadyPromise;
    systemModulesReadyPromise = Promise.all([
      loadAdminSettingsRegistrationModule(),
      loadAdminSettingsEmailDeliveryModule(),
      loadAdminSettingsSecurityOverviewModule(),
      loadAdminAuditLogsModule(),
    ])
      .then(
        ([registrationModule, emailDeliveryModule, securityOverviewModule, auditLogsModule]) => {
          systemModules.renderRegistrationSettings = registrationModule.renderRegistrationSettings;
          systemModules.renderEmailDeliverySettings =
            emailDeliveryModule.renderEmailDeliverySettings;
          systemModules.renderSecuritySettings = securityOverviewModule.renderSecurityOverview;
          systemModules.renderAuditLogs = ({ apiFetch, showToast }) =>
            auditLogsModule.renderAuditLogsSection({ apiFetch, showToast });
          return systemModules;
        }
      )
      .catch((err) => {
        systemModulesReadyPromise = null;
        throw err;
      });
    return systemModulesReadyPromise;
  };

  const ensureMainTabModules = async (tab) => {
    if (tab === 'users') return ensureUsersModules();
    if (tab === 'system') return ensureSystemModules();
    return ensureSettingsModules();
  };

  const guardNavigation = async () => true;
  const renderMainActionFooter = () => {};
  const updateMainActionFooter = () => {};
  const settingsRouteCache = createSettingsRouteCache();
  data.settingsRouteCache = settingsRouteCache;

  const updateRouteInfo = () => {
    const routeState = resolveAdminRouteState(window.location.pathname);
    mainTab = routeState.mainTab;
    subTab = routeState.subTab;
    setSidebarRouteScope('admin');
    if (routeState.canonicalPath !== window.location.pathname) {
      window.history.replaceState({}, '', routeState.canonicalPath);
    }
  };

  const sortUsers = (users) =>
    users.slice().sort((a, b) => {
      const roleOrder = { admin: 0, member: 1 };
      const statusOrder = { active: 0, pending: 1 };
      const roleDiff = (roleOrder[a.primary_role] ?? 2) - (roleOrder[b.primary_role] ?? 2);
      if (roleDiff !== 0) return roleDiff;
      const statusDiff =
        (statusOrder[a.account_status] ?? 2) - (statusOrder[b.account_status] ?? 2);
      if (statusDiff !== 0) return statusDiff;
      const nameDiff = String(a.name || '').localeCompare(String(b.name || ''), undefined, {
        sensitivity: 'base',
      });
      if (nameDiff !== 0) return nameDiff;
      return String(a.email || '').localeCompare(String(b.email || ''), undefined, {
        sensitivity: 'base',
      });
    });

  const clearUsersCache = () => {
    data.usersCache = {};
  };

  const updateCachedUser = (updatedUser) => {
    Object.keys(data.usersCache).forEach((key) => {
      const cached = data.usersCache[key];
      const hasUser = cached.users.some((user) => user.id === updatedUser.id);
      if (!hasUser) return;
      cached.users = sortUsers(
        cached.users.map((user) =>
          user.id === updatedUser.id ? { ...user, ...updatedUser } : user
        )
      );
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

  // Build the shared context for the controller
  const ctx = {
    container,
    get mainTab() {
      return mainTab;
    },
    set mainTab(v) {
      mainTab = v;
    },
    get subTab() {
      return subTab;
    },
    set subTab(v) {
      subTab = v;
    },
    get shellMounted() {
      return shellMounted;
    },
    set shellMounted(v) {
      shellMounted = v;
    },
    get removeInvalidationListeners() {
      return removeInvalidationListeners;
    },
    set removeInvalidationListeners(v) {
      removeInvalidationListeners = v;
    },
    data,
    usersModules,
    settingsModules,
    systemModules,
    settingsRouteCache,
    ensureUsersModules,
    ensureSettingsModules,
    ensureSystemModules,
    ensureMainTabModules,
    guardNavigation,
    renderMainActionFooter,
    updateMainActionFooter,
    updateRouteInfo,
    sortUsers,
    clearUsersCache,
    updateCachedUser,
    removeCachedUser,
    prependCachedUser,
  };

  const ctrl = createAdminController(ctx);

  // Lifecycle: cache invalidation, shell mount, initial render, data loading
  const unregisterConnections = settingsRouteCache.registerConnectionsRefresh(() => {
    if (mainTab !== 'settings' && mainTab !== 'system') return;
    if (data.connectionsSettings) data.connectionsSettings.loaded = false;
    ctrl.renderSubContent();
  });
  const unregisterToolServers = settingsRouteCache.registerToolServersRefresh(() => {
    if (mainTab !== 'settings' && mainTab !== 'system') return;
    if (data.integrationsSettings) data.integrationsSettings.loaded = false;
    ctrl.renderSubContent();
  });
  const unregisterModels = settingsRouteCache.registerModelsRefresh(() => {
    if (mainTab !== 'settings' && mainTab !== 'system') return;
    data.modelsSettingsInvalidate = Date.now();
    ctrl.renderSubContent();
  });

  updateRouteInfo();
  if (!shellMounted) {
    ctrl.mountShell();
  }
  ctrl.renderSubContent();

  const routeCacheCleanup = settingsRouteCache.bind();
  removeInvalidationListeners = () => {
    unregisterConnections?.();
    unregisterToolServers?.();
    unregisterModels?.();
    routeCacheCleanup?.();
  };

  if (mainTab === 'users' && data.users.length === 0) {
    await ctrl.loadUsers({ preserveContent: false });
  }
  if (mainTab === 'users' && subTab === 'groups') {
    try {
      await ensureUsersModules();
      if (usersModules.shouldLoadGroups?.(data)) {
        const preload = await usersModules.preloadGroupsData?.();
        data.groups = preload?.groups || [];
        data.groupsError = null;
        data.groupsLoading = false;
        ctrl.renderSubContent();
      }
    } catch (err) {
      data.groupsError = err.message || 'Failed to fetch groups.';
    }
  }
}
