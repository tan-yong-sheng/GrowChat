import { apiFetch } from '../../shared/api.js';
import { ensureMarkedReady } from '../../shared/utils.js';
import { renderSettingsShell } from '../../shared/components/settings-shell.js';
import { renderSettingsDrawerShell } from '../../shared/components/settings-drawer-shell.js';
import { renderWorkspaceShell } from '../../shared/components/workspace-shell.js';
import { renderWorkspaceSidebar, wireWorkspaceSidebar } from '../../shared/components/workspace-sidebar.js';
import { buildWorkspaceTopNavConfig } from '../../shared/components/workspace-top-nav-config.js';
import {
  renderWorkspaceTopNav,
} from '../../shared/components/settings-top-nav.js';
import { renderWorkspaceVerticalTabs } from '../../shared/components/workspace-vertical-tabs.js';
import { createSettingsRouteCache } from '../../shared/utils/settings-route-cache.js';
import { setSidebarRouteScope } from '../../shared/utils/sidebar-visibility.js';
import { normalizeWorkspaceCapabilities } from '../../shared/utils/workspace-capabilities.js';

const accountSectionRenderers = {
  connections: null,
  models: null,
  integrations: null,
};

async function loadAccountSectionRenderer(section) {
  const normalized = normalizeAccountSection(section);
  if (accountSectionRenderers[normalized]) {
    return accountSectionRenderers[normalized];
  }

  if (normalized === 'connections') {
    accountSectionRenderers.connections = import('./account-connections.js')
      .then(({ renderAccountConnectionsSection }) => renderAccountConnectionsSection);
    return accountSectionRenderers.connections;
  }

  if (normalized === 'models') {
    accountSectionRenderers.models = import('./account-models.js')
      .then(({ renderAccountModelsSection }) => renderAccountModelsSection);
    return accountSectionRenderers.models;
  }

  accountSectionRenderers.integrations = import('./account-integrations.js')
    .then(({ renderAccountIntegrationsSection }) => renderAccountIntegrationsSection);
  return accountSectionRenderers.integrations;
}

function normalizeAccountSection(section) {
  const value = String(section || '').trim();
  if (value === 'connections' || value === 'models' || value === 'integrations' || value === 'security') {
    return value;
  }
  return 'connections';
}

export function resolveAccountSectionFromPath(pathname) {
  if (pathname === '/account' || pathname === '/account/' || pathname === '/account/profile' || pathname.startsWith('/account/profile/')) {
    return 'connections';
  }
  if (pathname.startsWith('/account/settings/connections')) return 'connections';
  if (pathname.startsWith('/account/settings/models')) return 'models';
  if (pathname.startsWith('/account/settings/integrations')) return 'integrations';
  return 'connections';
}

function getAccountSectionPath(section) {
  switch (normalizeAccountSection(section)) {
    case 'connections':
      return '/account/settings/connections';
    case 'models':
      return '/account/settings/models';
    case 'integrations':
      return '/account/settings/integrations';
    default:
      return '/account/settings/connections';
  }
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function formatSectionLabel(section) {
  switch (section) {
    case 'connections':
      return 'Connections';
    case 'models':
      return 'Models';
    case 'integrations':
      return 'Integrations';
    default:
      return 'Overview';
  }
}

async function loadAccountState() {
  const res = await apiFetch('/api/users/me/settings');
  if (!res.ok) {
    throw new Error('Failed to load account settings');
  }
  return res.json();
}

function renderOverview(state) {
  const user = state.user || {};
  const preferences = state.settings?.preferences || {};
  return `
    <div class="grid gap-4 lg:grid-cols-2">
      <section class="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
        <div class="text-xs font-semibold uppercase tracking-wide text-gray-400">Profile</div>
        <div class="mt-3 flex items-center gap-3">
          <div class="flex h-12 w-12 items-center justify-center rounded-full bg-gray-100 text-lg font-semibold text-gray-700">${escapeHtml(user.avatar_emoji || user.name?.[0] || 'U')}</div>
          <div>
            <div class="text-base font-semibold text-gray-900">${escapeHtml(user.name || 'User')}</div>
            <div class="text-sm text-gray-500">${escapeHtml(user.email || '')}</div>
          </div>
        </div>
        <div class="mt-4 space-y-2 text-sm text-gray-600">
          <div><span class="font-medium text-gray-900">Status:</span> ${escapeHtml(user.status || 'offline')}</div>
          <div><span class="font-medium text-gray-900">Role:</span> ${escapeHtml(user.primary_role || 'member')}</div>
          <div><span class="font-medium text-gray-900">Theme:</span> ${escapeHtml(preferences.theme || 'system')}</div>
        </div>
      </section>
    </div>
  `;
}

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
  ];
}

function renderReadOnlySection(title, items = [], emptyText = 'Nothing to show yet.') {
  return `
    <section class="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
      <div class="text-xs font-semibold uppercase tracking-wide text-gray-400">${escapeHtml(title)}</div>
      <div class="mt-3 space-y-2">
        ${items.length ? items.map((item) => `
          <div class="rounded-xl border border-gray-100 px-3 py-2">
            <div class="font-medium text-gray-900">${escapeHtml(item.name || item.id)}</div>
            <div class="text-xs text-gray-500">${escapeHtml(item.note || item.url || '')}</div>
          </div>
        `).join('') : `<div class="text-sm text-gray-500">${escapeHtml(emptyText)}</div>`}
      </div>
    </section>
  `;
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

  container.insertAdjacentHTML('beforeend', '<div id="search-modal-container"></div><div id="files-modal-container"></div>');

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
    drawer?.querySelector('#account-settings-drawer-overlay')?.addEventListener('click', closeDrawer);
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
