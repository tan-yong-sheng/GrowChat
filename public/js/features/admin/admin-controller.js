/**
 * Admin page controller — rendering, data loading, event binding, and lifecycle.
 * Receives a shared mutable context object (ctx) and returns controller methods.
 */

import { apiFetch, fetchAdminGroups } from '../../shared/api.js';
import { renderWorkspaceShell } from '../../shared/components/workspace-shell.js';
import {
  renderWorkspaceSidebar,
  wireWorkspaceSidebar,
} from '../../shared/components/workspace-sidebar.js';
import { buildWorkspaceTopNavConfig } from '../../shared/components/workspace-top-nav-config.js';
import {
  renderWorkspaceTopNav,
  renderWorkspaceTopNavSidebarToggle,
} from '../../shared/components/settings-top-nav.js';
import { getAdminSubnavPath, getAdminTopNavPath } from './admin-route-state.js';
import {
  renderErrorState,
  renderLoadingState,
  renderSettingsLayout,
  renderSettingsSkeleton,
  renderSettingsSubnavLinks,
  renderSystemLayout,
  renderUsersLayout,
  renderUsersSubnavLinks,
} from './admin-layout.js';
import {
  renderSettingsSubContent,
  renderSystemSubContent,
  renderUsersSubContent,
} from './admin-controller-subcontent.js';

export function createAdminController(ctx) {
  const renderSubContent = async () => {
    const mainContentEl = ctx.container.querySelector('#admin-main-content');
    if (!mainContentEl) return;

    const tabsContainer =
      ctx.container.querySelector('#users-tabs-container') ||
      ctx.container.querySelector('#settings-tabs-container') ||
      ctx.container.querySelector('#system-tabs-container');

    if (!tabsContainer) {
      if (ctx.mainTab === 'users') {
        mainContentEl.innerHTML = renderUsersLayout(ctx.subTab);
      } else if (ctx.mainTab === 'system') {
        mainContentEl.innerHTML = renderSystemLayout(ctx.subTab);
      } else {
        mainContentEl.innerHTML = renderSettingsLayout(ctx.subTab);
      }
      bindSubnav();
    } else {
      if (ctx.mainTab === 'users') {
        tabsContainer.id = 'users-tabs-container';
        tabsContainer.innerHTML = renderUsersSubnavLinks(ctx.subTab);
      } else if (ctx.mainTab === 'system') {
        mainContentEl.innerHTML = renderSystemLayout(ctx.subTab);
        bindSubnav();
      } else {
        tabsContainer.id = 'settings-tabs-container';
        tabsContainer.innerHTML = renderSettingsSubnavLinks(ctx.subTab);
      }
      bindSubnav();
    }

    const subContentEl =
      ctx.container.querySelector('#admin-sub-body') ||
      ctx.container.querySelector('#admin-sub-content');
    if (!subContentEl) return;

    const needsModuleLoad =
      (ctx.mainTab === 'users' && !ctx.usersModules.renderUserOverview) ||
      (ctx.mainTab === 'system' && !ctx.systemModules.renderRegistrationSettings) ||
      (ctx.mainTab === 'settings' && !ctx.settingsModules.renderConnectionsSettings);

    if (needsModuleLoad) {
      subContentEl.innerHTML =
        ctx.mainTab === 'users' ? renderLoadingState() : renderSettingsSkeleton();
      ctx.renderMainActionFooter();
      ctx.updateMainActionFooter();
      try {
        await ctx.ensureMainTabModules(ctx.mainTab);
      } catch (err) {
        subContentEl.innerHTML = renderErrorState(err?.message || 'Failed to load admin section.');
        ctx.renderMainActionFooter();
        ctx.updateMainActionFooter();
        return;
      }
    }

    subContentEl.dataset.settingsTab = ctx.subTab;
    ctx.data.sharedActionFooter = false;
    ctx.renderMainActionFooter();

    if (ctx.mainTab === 'settings') {
      renderSettingsSubContent(ctx, subContentEl);
      ctx.renderMainActionFooter();
      ctx.updateMainActionFooter();
      return;
    }

    if (ctx.mainTab === 'system') {
      renderSystemSubContent(ctx, subContentEl);
      ctx.renderMainActionFooter();
      ctx.updateMainActionFooter();
      return;
    }

    if (ctx.mainTab === 'users') {
      renderUsersSubContent(ctx, subContentEl, { renderSubContent, loadUsers, loadGroups });
      ctx.renderMainActionFooter();
      ctx.updateMainActionFooter();
      return;
    }
  };
  async function loadUsers({ preserveContent = true } = {}) {
    const cacheKey = `${ctx.data.pagination.page}:${ctx.data.pagination.pageSize}`;
    const cached = ctx.data.usersCache[cacheKey];
    if (cached) {
      applyUsersFromCache(cached);
      renderSubContent();
      return;
    }
    setUsersLoading(preserveContent);
    renderSubContent();
    try {
      await fetchUsersPage(cacheKey);
    } catch (err) {
      ctx.data.error = err.message || 'Failed to fetch users.';
    } finally {
      ctx.data.loading = false;
      ctx.data.loadingMode = 'idle';
      renderSubContent();
    }
  }

function applyUsersFromCache(cached) {
    ctx.data.users = cached.users;
    ctx.data.total = cached.total;
    ctx.data.error = null;
    ctx.data.loading = false;
    ctx.data.loadingMode = 'idle';
}

function setUsersLoading(preserveContent) {
    ctx.data.loading = true;
    ctx.data.loadingMode = preserveContent ? 'table' : 'initial';
    ctx.data.error = null;
}

async function fetchUsersPage(cacheKey) {
    const offset = (ctx.data.pagination.page - 1) * ctx.data.pagination.pageSize;
    const res = await apiFetch(
      `/api/admin/users?limit=${ctx.data.pagination.pageSize}&offset=${offset}`
    );
    if (res.status === 403) {
      ctx.data.error = 'You do not have permission to manage users.';
      return;
    }
    if (!res.ok) throw new Error(`Failed to fetch users (${res.status})`);
    const payload = await res.json();
    ctx.data.users = payload.users || [];
    ctx.data.total = payload.total || 0;
    ctx.data.usersCache[cacheKey] = {
      users: ctx.data.users,
      total: ctx.data.total,
    };
}
  async function loadGroups({ preserveContent = true } = {}) {
    ctx.data.groupsLoading = true;
    ctx.data.groupsError = null;
    if (!preserveContent) {
      ctx.data.groups = [];
    }
    renderSubContent();
    try {
      const res = await fetchAdminGroups();
      ctx.data.groups = res.groups || [];
    } catch (err) {
      if (err?.status === 403) {
        ctx.data.groupsError = 'You do not have permission to manage groups.';
      } else {
        ctx.data.groupsError = err.message || 'Failed to fetch groups.';
      }
    } finally {
      ctx.data.groupsLoading = false;
      renderSubContent();
    }
  }
  ctx.data.guardNavigation = ctx.guardNavigation;
  function bindAdminNavLink(link, dataAttr, handler) {
    link.onclick = async (e) => {
      e.preventDefault();
      const allowed = await ctx.guardNavigation();
      if (!allowed) return;
      const nav = link.dataset[dataAttr];
      return handler(nav);
    };
  }
  function bindTopNav() {
    ctx.container.querySelectorAll('a[data-nav]').forEach((link) => {
      bindAdminNavLink(link, 'nav', async (nav) => {
        const newPath = getAdminTopNavPath(nav);
        window.history.pushState({}, '', newPath);
        ctx.updateRouteInfo();
        ctx.container.querySelectorAll('a[data-nav]').forEach((navLink) => {
          const active = navLink.dataset.nav === ctx.mainTab;
          navLink.className = `min-w-fit p-1.5 transition select-none ${active ? 'text-gray-900 underline underline-offset-[10px] decoration-2' : 'text-gray-600 hover:text-gray-900'}`;
        });
        mountShell();
        renderSubContent();
        if (ctx.mainTab === 'users' && ctx.data.users.length === 0 && !ctx.data.loading) {
          await loadUsers({ preserveContent: false });
        }
      });
    });
  }
  function bindSubnav() {
    ctx.container.querySelectorAll('a[data-subnav]').forEach((link) => {
      bindAdminNavLink(link, 'subnav', async (nav) => {
        window.history.pushState({}, '', getAdminSubnavPath(ctx.mainTab, nav));
        ctx.updateRouteInfo();
        const subContentEl = ctx.container.querySelector('#admin-sub-content');
        if (subContentEl && (ctx.mainTab === 'settings' || ctx.mainTab === 'system')) {
          subContentEl.innerHTML = renderSettingsSkeleton();
          ctx.renderMainActionFooter();
          ctx.updateMainActionFooter();
          requestAnimationFrame(() => renderSubContent());
          return;
        }
        renderSubContent();
        if (ctx.mainTab === 'users' && ctx.subTab === 'groups') {
          try {
            await ctx.ensureUsersModules();
            if (ctx.usersModules.shouldLoadGroups?.(ctx.data)) {
              await loadGroups({ preserveContent: false });
            }
          } catch {
            // Ignore route-preload failures; renderSubContent handles module-load errors.
          }
        }
      });
    });
  }
  function mountShell() {
    const previousCleanup =
      typeof ctx.container.__cleanup === 'function' ? ctx.container.__cleanup : null;
    if (typeof ctx.container.__cleanup === 'function') {
      ctx.container.__cleanup();
    }
    ctx.container.innerHTML = renderWorkspaceShell({
      sidebarHtml: renderWorkspaceSidebar({
        homeHref: '/',
        homeId: 'workspace-home-link',
        homeLabel: 'GrowChat',
        footerId: 'sidebar-footer',
      }),
      mainHtml: `
        ${renderWorkspaceTopNav({
          ...buildWorkspaceTopNavConfig({ variant: 'admin', currentKey: ctx.mainTab }),
          leadingSlotHtml: renderWorkspaceTopNavSidebarToggle({
            id: 'toggle-sidebar-mobile',
            title: 'Open Sidebar',
            className: 'p-2 mr-2 hover:bg-gray-100 rounded-lg transition text-gray-700 md:hidden',
          }),
        })}
        <div class="flex-1 flex overflow-hidden" id="admin-main-content"></div>
      `,
    });
    ctx.container.insertAdjacentHTML(
      'beforeend',
      '<div id="search-modal-container"></div><div id="files-modal-container"></div>'
    );
    wireWorkspaceSidebar(ctx.container, {
      guardNavigation: ctx.guardNavigation,
      navigateHome: async () => {
        window.history.pushState({}, '', '/');
        window.dispatchEvent(new PopStateEvent('popstate'));
      },
      searchModalContainerSelector: '#search-modal-container',
      filesModalContainerSelector: '#files-modal-container',
      footerId: 'sidebar-footer',
    });
    bindTopNav();
    if (!ctx.container.__sharedFooterClickBound) {
      ctx.container.__sharedFooterClickBound = true;
    }
    ctx.shellMounted = true;
    ctx.renderMainActionFooter();
    const priorCleanup = previousCleanup;
    ctx.container.__cleanup = () => {
      priorCleanup?.();
      ctx.removeInvalidationListeners?.();
    };
  }
  return {
    renderSubContent,
    loadUsers,
    loadGroups,
    bindTopNav,
    bindSubnav,
    mountShell,
  };
}
