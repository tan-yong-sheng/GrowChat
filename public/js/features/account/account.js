import { escapeHtml } from '../../shared/utils/dom-escape.js';
import { ensureMarkedReady } from '../../shared/utils.js';
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

import {
  normalizeAccountSection,
  resolveAccountSectionFromPath,
  getAccountSectionPath,
  renderOverview,
  loadAccountSectionRenderer,
  loadAccountState,
} from './account-utils.js';

export { resolveAccountSectionFromPath };

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
      href: '#security',
      key: 'security',
      label: 'Security',
      active: activeSection === 'security',
    },
  ];
}

function renderOverviewSection(content, accountState, footerHost) {
  content.innerHTML = renderOverview(accountState);
  if (footerHost) footerHost.innerHTML = '';
}

async function renderDynamicSection({
  content,
  accountState,
  footerHost,
  settingsRouteCache,
  onRefresh,
  sectionKey,
}) {
  const renderer = await loadAccountSectionRenderer(sectionKey);
  if (onRefresh) {
    const refresh = async () => {
      await onRefresh();
      return accountState;
    };
    renderer(content, accountState, {
      onRefresh: refresh,
      footerHost,
      routeCache: settingsRouteCache,
    });
  } else {
    renderer(content, accountState, {
      footerHost,
      routeCache: settingsRouteCache,
    });
  }
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
    renderOverviewSection(content, accountState, footerHost);
    return;
  }
  if (section === 'security') {
    await renderDynamicSection({
      content,
      accountState,
      footerHost,
      settingsRouteCache,
      sectionKey: 'security',
    });
    return;
  }
  const REFRESHABLE_SECTIONS = new Set(['connections', 'models', 'integrations']);
  if (REFRESHABLE_SECTIONS.has(section)) {
    await renderDynamicSection({
      content,
      accountState,
      footerHost,
      settingsRouteCache,
      onRefresh,
      sectionKey: section,
    });
    return;
  }
  renderOverviewSection(content, accountState, footerHost);
}

function buildAccountMainHtml(section) {
  return `
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
    `;
}

function bindAccountCloseHandlers(container) {
  const closeBtn = container.querySelector('#account-settings-close');
  const closeOverlay = container.querySelector('#account-settings-overlay');
  const closeSettings = () => {
    window.history.replaceState({}, '', '/');
    window.dispatchEvent(new PopStateEvent('popstate'));
  };
  closeBtn?.addEventListener('click', closeSettings);
  closeOverlay?.addEventListener('click', closeSettings);
}

async function loadAndRenderAccountSection({
  section,
  content,
  footerHost,
  settingsRouteCache,
  loadCurrentState,
}) {
  try {
    await loadCurrentState();
    await renderAccountSection({
      section,
      accountState: undefined,
      content,
      footerHost,
      settingsRouteCache,
      onRefresh: loadCurrentState,
    });
  } catch (err) {
    content.innerHTML = `<div class="text-sm text-red-600">${escapeHtml(err.message || 'Failed to load account settings')}</div>`;
    if (footerHost) footerHost.innerHTML = '';
  }
}

export async function renderAccountPage(container) {
  ensureMarkedReady();
  setSidebarRouteScope('account');
  const section = normalizeAccountSection(resolveAccountSectionFromPath(window.location.pathname));
  container.dataset.view = 'account';
  const previousCleanup = typeof container.__cleanup === 'function' ? container.__cleanup : null;
  previousCleanup?.();
  const settingsRouteCache = createSettingsRouteCache();

  const loadCurrentState = async () => {
    return normalizeWorkspaceCapabilities(await loadAccountState(), { route: 'account' });
  };

  container.innerHTML = renderWorkspaceShell({
    sidebarHtml: renderWorkspaceSidebar({
      homeHref: '/',
      homeId: 'workspace-home-link',
      homeLabel: 'GrowChat',
      footerId: 'sidebar-footer',
    }),
    mainHtml: buildAccountMainHtml(section),
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
  container.__cleanup = settingsRouteCache.bind();

  await loadAndRenderAccountSection({
    section,
    content,
    footerHost,
    settingsRouteCache,
    loadCurrentState,
  });
  bindAccountCloseHandlers(container);
}

function buildAccountDrawerBody(currentSection) {
  return `
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
      `;
}

function createDrawerMount({ section, mount, closeDrawer, rerender, setDrawer }) {
  mount.innerHTML = renderSettingsDrawerShell({
    rootId: 'account-settings-drawer-modal',
    title: 'My Settings',
    subtitle: 'Personal account preferences and tools.',
    scopeLabel: 'Personal',
    closeId: 'account-settings-drawer-close',
    overlayId: 'account-settings-drawer-overlay',
    body: buildAccountDrawerBody(section),
  });
  const drawerEl = mount.querySelector('#account-settings-drawer-modal');
  setDrawer(drawerEl);
  drawerEl?.querySelector('#account-settings-drawer-close')?.addEventListener('click', closeDrawer);
  drawerEl
    ?.querySelector('#account-settings-drawer-overlay')
    ?.addEventListener('click', closeDrawer);
  drawerEl?.querySelectorAll('a[data-subnav]').forEach((link) => {
    link.addEventListener('click', async (event) => {
      event.preventDefault();
      const nav = link.dataset.accountAreaTab || link.dataset.subnav;
      if (!nav) return;
      const nextSection = normalizeAccountSection(nav);
      const nextPath = getAccountSectionPath(nextSection);
      if (window.location.pathname !== nextPath) {
        window.history.replaceState({}, '', nextPath);
      }
      await rerender(nextSection);
    });
  });
  return {
    content: mount.querySelector('[data-account-drawer-content]'),
    footerHost: mount.querySelector('#account-drawer-footer'),
  };
}

function prepareAccountDrawerMount({ mount, normalizedSection }) {
  document.getElementById('account-settings-drawer-modal')?.remove();
  const targetPath = getAccountSectionPath(normalizedSection);
  setSidebarRouteScope('account');
  if (window.location.pathname !== targetPath) {
    window.history.pushState({}, '', targetPath);
  }
  mount.dataset.accountSettingsDrawerMount = '1';
  document.body.appendChild(mount);
}

function showAccountLoadError(ctx, err) {
  if (ctx.content) {
    ctx.content.innerHTML = `<div class="text-sm text-red-600">${escapeHtml(err.message || 'Failed to load account settings')}</div>`;
  }
  if (ctx.footerHost) ctx.footerHost.innerHTML = '';
}

export async function openAccountSettingsDrawer({ section = 'connections' } = {}) {
  ensureMarkedReady();
  const mount = document.createElement('div');
  const normalizedSection = normalizeAccountSection(section);
  prepareAccountDrawerMount({ mount, normalizedSection });

  const settingsRouteCache = createSettingsRouteCache();
  const removeSettingsRouteCache = settingsRouteCache.bind();

  let drawer = null;
  const ctx = { drawer: null, content: null, footerHost: null };

  const closeDrawer = () => {
    removeSettingsRouteCache?.();
    window.history.replaceState({}, '', '/');
    window.dispatchEvent(new PopStateEvent('popstate'));
    drawer?.remove();
    mount.remove();
  };

  const loadCurrentState = async () =>
    normalizeWorkspaceCapabilities(await loadAccountState(), { route: 'account' });

  const rerender = async (nextSection) => {
    const mounts = createDrawerMount({
      section: nextSection,
      mount,
      closeDrawer,
      rerender,
      setDrawer: (el) => {
        drawer = el;
        ctx.drawer = el;
      },
    });
    ctx.content = mounts.content;
    ctx.footerHost = mounts.footerHost;
    const accountState = await loadCurrentState();
    await renderAccountSection({
      section: nextSection,
      accountState,
      content: ctx.content,
      footerHost: ctx.footerHost,
      settingsRouteCache,
      onRefresh: loadCurrentState,
    });
  };

  try {
    await rerender(normalizedSection);
  } catch (err) {
    showAccountLoadError(ctx, err);
  }

  mount.__cleanup = () => {
    removeSettingsRouteCache?.();
    drawer?.remove();
    mount.remove();
  };

  return drawer;
}
