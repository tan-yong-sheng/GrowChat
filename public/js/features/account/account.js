import { apiFetch } from '../../shared/api.js';
import { ensureMarkedReady } from '../../shared/utils.js';
import { renderSettingsShell } from '../../shared/components/settings-shell.js';
import { renderSettingsViewport } from '../../shared/components/settings-viewport.js';
import { renderWorkspaceShell } from '../../shared/components/workspace-shell.js';
import { renderWorkspaceSidebar, wireWorkspaceSidebar } from '../../shared/components/workspace-sidebar.js';
import { buildWorkspaceTopNavConfig } from '../../shared/components/workspace-top-nav-config.js';
import { buildWorkspaceSettingsSubnavItems } from '../../shared/components/workspace-settings-subnav-config.js';
import {
  renderWorkspaceTopNav,
  renderWorkspaceTopNavSidebarToggle,
} from '../../shared/components/settings-top-nav.js';
import { renderWorkspaceVerticalTabs } from '../../shared/components/workspace-vertical-tabs.js';
import { renderAccountConnectionsSection } from './account-connections.js';
import { renderAccountIntegrationsSection } from './account-integrations.js';
import { renderAccountModelsSection } from './account-models.js';

function getSection(pathname) {
  if (pathname === '/account' || pathname === '/account/') return 'overview';
  if (pathname.startsWith('/account/profile/overview')) return 'overview';
  if (pathname.startsWith('/account/settings/connections')) return 'connections';
  if (pathname.startsWith('/account/settings/models')) return 'models';
  if (pathname.startsWith('/account/settings/integrations')) return 'integrations';
  return 'overview';
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
  const res = await apiFetch('/api/users/me/settings?include=permissions,roles');
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
  if (section === 'overview') {
    return [{
      href: '/account/profile/overview',
      key: 'overview',
      label: 'Overview',
      active: section === 'overview',
      icon: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" class="size-4"><path d="M8.5 4.5a2.5 2.5 0 1 1-5 0 2.5 2.5 0 0 1 5 0ZM10.9 12.006c.11.542-.348.994-.9.994H2c-.553 0-1.01-.452-.902-.994a5.002 5.002 0 0 1 9.803 0ZM14.002 12h-1.59a2.556 2.556 0 0 0-.04-.29 6.476 6.476 0 0 0-1.167-2.603 3.002 3.002 0 0 1 3.633 1.911c.18.522-.283.982-.836.982ZM12 8a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z"/></svg>',
    }];
  }

  return buildWorkspaceSettingsSubnavItems({
    basePath: '/account/settings',
    currentKey: section,
  });
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

export async function renderAccountPage(container) {
  ensureMarkedReady();
  const section = getSection(window.location.pathname);
  const isOverview = section === 'overview';
  container.dataset.view = 'account';
  let accountState = null;

  const loadCurrentState = async () => {
    accountState = await loadAccountState();
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
      <div class="flex-1 min-h-0 flex flex-col overflow-hidden bg-[#fafafa] text-gray-900">
          ${renderWorkspaceTopNav({
            ...buildWorkspaceTopNavConfig({
              variant: 'account',
              currentKey: section,
            }),
            leadingSlotHtml: renderWorkspaceTopNavSidebarToggle({
              id: 'toggle-sidebar-mobile',
              title: 'Open Sidebar',
              className: 'p-2 mr-2 hover:bg-gray-100 rounded-lg transition text-gray-500 md:hidden',
            }),
          })}
        ${renderSettingsViewport({
          contentHtml: renderSettingsShell({
            navPaneHtml: renderWorkspaceVerticalTabs({
              id: 'account-tabs-container',
              items: getAccountNavItems(section),
            }),
            bodyId: 'account-main-body',
            contentId: 'account-main-content',
            footerId: 'account-main-footer',
            contentHtml: `
              ${isOverview ? `
                <div class="pt-0.5 pb-6 sticky top-0 z-10 bg-white">
                  <div class="w-full">
                    <h1 data-account-section-title class="text-xl font-medium text-gray-900"></h1>
                  </div>
                </div>
              ` : ''}
              <div data-account-content class="h-full min-h-0">
                <div class="text-sm text-gray-500">Loading account settings...</div>
              </div>
            `,
          }),
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
  const sectionTitle = container.querySelector('[data-account-section-title]');
  const footerHost = container.querySelector('#account-main-footer');

  try {
    await loadCurrentState();
    if (sectionTitle) {
      sectionTitle.classList.toggle('hidden', !isOverview);
      sectionTitle.textContent = formatSectionLabel(section);
    }

    if (section === 'overview') {
      content.innerHTML = renderOverview(accountState);
      if (footerHost) footerHost.innerHTML = '';
    } else if (section === 'connections') {
      const rerenderConnections = async () => {
        await loadCurrentState();
        return accountState;
      };
      renderAccountConnectionsSection(content, accountState, {
        onRefresh: rerenderConnections,
        footerHost,
      });
    } else if (section === 'models') {
      renderAccountModelsSection(content, accountState, {
        footerHost,
      });
    } else if (section === 'integrations') {
      const refreshIntegrations = async () => {
        await loadCurrentState();
        return accountState;
      };
      renderAccountIntegrationsSection(content, accountState, {
        onRefresh: refreshIntegrations,
        footerHost,
      });
    } else {
      content.innerHTML = renderOverview(accountState);
      if (footerHost) footerHost.innerHTML = '';
    }
  } catch (err) {
    content.innerHTML = `<div class="text-sm text-red-600">${escapeHtml(err.message || 'Failed to load account settings')}</div>`;
    if (footerHost) footerHost.innerHTML = '';
  }
}
