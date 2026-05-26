import { apiFetch } from '../../shared/api.js';
import { ensureMarkedReady, showToast } from '../../shared/utils.js';
import { renderSettingsShell } from '../../shared/components/settings-shell.js';
import { renderSettingsDrawerShell } from '../../shared/components/settings-drawer-shell.js';
import { renderWorkspaceShell } from '../../shared/components/workspace-shell.js';
import {
  renderWorkspaceSidebar,
  wireWorkspaceSidebar,
} from '../../shared/components/workspace-sidebar.js';
import { buildWorkspaceTopNavConfig } from '../../shared/components/workspace-top-nav-config.js';
import { renderWorkspaceTopNav } from '../../shared/components/settings-top-nav.js';
import { renderWorkspaceVerticalTabs } from '../../shared/components/workspace-vertical-tabs.js';
import { createSettingsRouteCache } from '../../shared/utils/settings-route-cache.js';
import { setSidebarRouteScope } from '../../shared/utils/sidebar-visibility.js';
import { normalizeWorkspaceCapabilities } from '../../shared/utils/workspace-capabilities.js';
import { renderSessionsSection } from './sessions.js';

import {
  normalizeAccountSection,
  resolveAccountSectionFromPath,
  getAccountSectionPath,
  escapeHtml,
  renderOverview,
  loadAccountSectionRenderer,
  loadAccountState,
} from './account-utils.js';

function getAccountNavItems(section) {
  const activeSection = normalizeAccountSection(section);

  return [
    {
      href: '#connections',
      key: 'connections',
      label: 'Connections',
      active: activeSection === 'connections',
    },
    {
      href: '#models',
      key: 'models',
      label: 'Models',
      active: activeSection === 'models',
    },
    {
      href: '#integrations',
      key: 'integrations',
      label: 'Integrations',
      active: activeSection === 'integrations',
    },
    {
      href: '#sessions',
      key: 'sessions',
      label: 'Sessions',
      active: activeSection === 'sessions',
    },
  ];
}

async function renderAccountSection({
  section,
  accountState,
  content,
  footerHost,
  settingsRouteCache,
  onRefresh,
}) {
  if (section === 'overview') {
    content.innerHTML = renderOverview(accountState);
    if (footerHost) footerHost.innerHTML = '';
    return;
  }

  if (section === 'connections') {
    const rerenderConnections = async () => {
      await onRefresh?.();
      return accountState;
    };
    const renderConnectionsSection = await loadAccountSectionRenderer('connections');
    renderConnectionsSection(content, accountState, {
      onRefresh: rerenderConnections,
      footerHost,
      routeCache: settingsRouteCache,
    });
    return;
  }

  if (section === 'models') {
    const refreshModels = async () => {
      await onRefresh?.();
      return accountState;
    };
    const renderModelsSection = await loadAccountSectionRenderer('models');
    renderModelsSection(content, accountState, {
      onRefresh: refreshModels,
      footerHost,
      routeCache: settingsRouteCache,
    });
    return;
  }

  if (section === 'integrations') {
    const refreshIntegrations = async () => {
      await onRefresh?.();
      return accountState;
    };
    const renderIntegrationsSection = await loadAccountSectionRenderer('integrations');
    renderIntegrationsSection(content, accountState, {
      onRefresh: refreshIntegrations,
      footerHost,
      routeCache: settingsRouteCache,
    });
    return;
  }

  if (section === 'sessions') {
    const sessionsEl = await renderSessionsSection({
      apiFetch,
      showToast: (message) => showToast(message),
    });
    content.replaceChildren(sessionsEl);
    if (footerHost) footerHost.innerHTML = '';
    return;
  }

  content.innerHTML = renderOverview(accountState);
  if (footerHost) footerHost.innerHTML = '';
}

export async function renderAccountPage(container) {
  ensureMarkedReady();
  setSidebarRouteScope('account');
  const section = normalizeAccountSection(resolveAccountSectionFromPath(window.location.pathname));
  container.dataset.view = 'account';
  const previousCleanup = typeof container.__cleanup === 'function' ? container.__cleanup : null;
  previousCleanup?.();
  const settingsRouteCache = createSettingsRouteCache();
  let removeSettingsRouteCache = null;
  let accountState = null;

  const loadCurrentState = async () => {
    accountState = normalizeWorkspaceCapabilities(await loadAccountState(), { route: 'account' });
    return accountState;
  };

  container.innerHTML = renderWorkspaceShell({
    sidebarHtml: renderWorkspaceSidebar({
      homeHref: '/',
      homeId: 'workspace-home-link',
      homeLabel: 'GrowChat',
      footerId: 'sidebar-footer',
    }),
    mainHtml: `
      <div class="relative flex-1 min-h-0 overflow-hidden bg-[#fafafa] text-gray-900">
        ${renderSettingsDrawerShell({
          rootId: 'account-settings-drawer',
          title: 'My Settings',
          subtitle: 'Personal account preferences and tools.',
          scopeLabel: 'Personal',
          closeId: 'account-settings-close',
          overlayId: 'account-settings-overlay',
          body: `
            <div class="flex h-full min-h-0 flex-col overflow-hidden">
              ${renderWorkspaceTopNav({
                ...buildWorkspaceTopNavConfig({
                  variant: 'account',
                  currentKey: section,
                }),
              })}
              ${renderSettingsShell({
                navPaneHtml: renderWorkspaceVerticalTabs({
                  id: 'account-tabs-container',
                  items: getAccountNavItems(section),
                }),
                bodyId: 'account-main-body',
                contentId: 'account-main-content',
                footerId: 'account-main-footer',
                contentHtml: `
                  <div data-account-content class="h-full min-h-0">
                    <div class="text-sm text-gray-500">Loading account settings...</div>
                  </div>
                `,
              })}
            </div>
          `,
        })}
      </div>
    `,
  });

  container.insertAdjacentHTML(
    'beforeend',
    '<div id="search-modal-container"></div><div id="files-modal-container"></div>'
  );

  wireWorkspaceSidebar(container, {
    navigateHome: async () => {
      window.location.href = '/';
    },
    searchModalContainerSelector: '#search-modal-container',
    filesModalContainerSelector: '#files-modal-container',
    footerId: 'sidebar-footer',
  });

  const content = container.querySelector('[data-account-content]');
  const footerHost = container.querySelector('#account-main-footer');
  removeSettingsRouteCache = settingsRouteCache.bind();
  container.__cleanup = () => {
    removeSettingsRouteCache?.();
  };

  try {
    await loadCurrentState();
    await renderAccountSection({
      section,
      accountState,
      content,
      footerHost,
      settingsRouteCache,
      onRefresh: loadCurrentState,
    });
  } catch (err) {
    content.innerHTML = `<div class="text-sm text-red-600">${escapeHtml(err.message || 'Failed to load account settings')}</div>`;
    if (footerHost) footerHost.innerHTML = '';
  }

  const closeBtn = container.querySelector('#account-settings-close');
  const closeOverlay = container.querySelector('#account-settings-overlay');
  const closeSettings = () => {
    window.history.replaceState({}, '', '/');
    window.dispatchEvent(new PopStateEvent('popstate'));
  };

  closeBtn?.addEventListener('click', closeSettings);
  closeOverlay?.addEventListener('click', closeSettings);
}

export async function openAccountSettingsDrawer({ section = 'connections' } = {}) {
  ensureMarkedReady();
  const existing = document.getElementById('account-settings-drawer-modal');
  existing?.remove();

  const normalizedSection = normalizeAccountSection(section);
  const targetPath = getAccountSectionPath(normalizedSection);
  setSidebarRouteScope('account');
  if (window.location.pathname !== targetPath) {
    window.history.pushState({}, '', targetPath);
  }

  const mount = document.createElement('div');
  mount.dataset.accountSettingsDrawerMount = '1';
  document.body.appendChild(mount);

  const settingsRouteCache = createSettingsRouteCache();
  let removeSettingsRouteCache = null;
  let accountState = null;
  let currentSection = normalizeAccountSection(section);
  let drawer = null;
  let content = null;
  let footerHost = null;

  const loadCurrentState = async () => {
    accountState = normalizeWorkspaceCapabilities(await loadAccountState(), { route: 'account' });
    return accountState;
  };

  removeSettingsRouteCache = settingsRouteCache.bind();

  const closeDrawer = () => {
    removeSettingsRouteCache?.();
    window.history.replaceState({}, '', '/');
    window.dispatchEvent(new PopStateEvent('popstate'));
    drawer?.remove();
    mount.remove();
  };

  const renderDrawer = async () => {
    mount.innerHTML = renderSettingsDrawerShell({
      rootId: 'account-settings-drawer-modal',
      title: 'My Settings',
      subtitle: 'Personal account preferences and tools.',
      scopeLabel: 'Personal',
      closeId: 'account-settings-drawer-close',
      overlayId: 'account-settings-drawer-overlay',
      body: `
        <div class="flex h-full min-h-0 flex-col overflow-hidden">
          ${renderSettingsShell({
            navPaneHtml: renderWorkspaceVerticalTabs({
              id: 'account-drawer-tabs-container',
              items: getAccountNavItems(currentSection),
            }),
            bodyId: 'account-drawer-body',
            contentId: 'account-drawer-content',
            footerId: 'account-drawer-footer',
            contentHtml: `
              <div data-account-drawer-content class="h-full min-h-0">
                <div class="text-sm text-gray-500">Loading account settings...</div>
              </div>
            `,
          })}
        </div>
      `,
    });

    drawer = mount.querySelector('#account-settings-drawer-modal');
    content = mount.querySelector('[data-account-drawer-content]');
    footerHost = mount.querySelector('#account-drawer-footer');

    drawer?.querySelector('#account-settings-drawer-close')?.addEventListener('click', closeDrawer);
    drawer
      ?.querySelector('#account-settings-drawer-overlay')
      ?.addEventListener('click', closeDrawer);
    drawer?.querySelectorAll('a[data-subnav]').forEach((link) => {
      link.addEventListener('click', async (event) => {
        event.preventDefault();
        const nav = link.dataset.accountAreaTab || link.dataset.subnav;
        if (!nav) return;
        currentSection = normalizeAccountSection(nav);
        const nextPath = getAccountSectionPath(currentSection);
        if (window.location.pathname !== nextPath) {
          window.history.replaceState({}, '', nextPath);
        }
        await renderDrawer();
      });
    });

    await loadCurrentState();
    await renderAccountSection({
      section: currentSection,
      accountState,
      content,
      footerHost,
      settingsRouteCache,
      onRefresh: loadCurrentState,
    });
  };

  try {
    await renderDrawer();
  } catch (err) {
    content.innerHTML = `<div class="text-sm text-red-600">${escapeHtml(err.message || 'Failed to load account settings')}</div>`;
    if (footerHost) footerHost.innerHTML = '';
  }

  mount.__cleanup = () => {
    removeSettingsRouteCache?.();
    drawer?.remove();
    mount.remove();
  };

  return drawer;
}
