import { apiFetch } from '../../shared/api.js';
import { ensureMarkedReady } from '../../shared/utils.js';
import { renderSettingsShell } from '../../shared/components/settings-shell.js';
import { renderWorkspaceShell } from '../../shared/components/workspace-shell.js';
import { renderWorkspaceSidebar, wireWorkspaceSidebar } from '../../shared/components/workspace-sidebar.js';
import { renderWorkspaceTopTabs } from '../../shared/components/workspace-top-tabs.js';
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

function getAccountArea(section) {
  return section === 'overview' ? 'profile' : 'settings';
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

  return [
    {
      href: '/account/settings/connections',
      key: 'connections',
      label: 'Connections',
      active: section === 'connections',
      icon: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" class="size-4"><path d="M4 3a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2H4Zm0 1.5h8a.5.5 0 0 1 .5.5v2.5h-9V5a.5.5 0 0 1 .5-.5Zm8 7H4a.5.5 0 0 1-.5-.5v-2h9v2a.5.5 0 0 1-.5.5Z"/></svg>',
    },
    {
      href: '/account/settings/models',
      key: 'models',
      label: 'Models',
      active: section === 'models',
      icon: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" class="size-4"><path fill-rule="evenodd" d="M2 4.25A2.25 2.25 0 0 1 4.25 2h7.5A2.25 2.25 0 0 1 14 4.25v7.5A2.25 2.25 0 0 1 11.75 14h-7.5A2.25 2.25 0 0 1 2 11.75v-7.5Zm2.25-.75a.75.75 0 0 0-.75.75v7.5c0 .414.336.75.75.75h7.5a.75.75 0 0 0 .75-.75v-7.5a.75.75 0 0 0-.75-.75h-7.5Z" clip-rule="evenodd" /><path d="M4.75 5.5a.75.75 0 0 1 .75-.75h5a.75.75 0 0 1 0 1.5h-5a.75.75 0 0 1-.75-.75ZM4.75 8a.75.75 0 0 1 .75-.75h5a.75.75 0 0 1 0 1.5h-5A.75.75 0 0 1 4.75 8ZM5.5 9.75a.75.75 0 0 0 0 1.5h3a.75.75 0 0 0 0-1.5h-3Z" /></svg>',
    },
    {
      href: '/account/settings/integrations',
      key: 'integrations',
      label: 'Integrations',
      active: section === 'integrations',
      icon: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" class="size-4"><path fill-rule="evenodd" d="M3.75 3A1.75 1.75 0 0 0 2 4.75v6.5c0 .966.784 1.75 1.75 1.75h8.5A1.75 1.75 0 0 0 14 11.25v-6.5A1.75 1.75 0 0 0 12.25 3h-8.5ZM12.5 4.75a.25.25 0 0 0-.25-.25h-8.5a.25.25 0 0 0-.25.25v6.5c0 .138.112.25.25.25h8.5a.25.25 0 0 0 .25-.25v-6.5Z" clip-rule="evenodd" /><path fill-rule="evenodd" d="M6 7a1 1 0 1 1 2 0 1 1 0 0 1-2 0ZM10 7a1 1 0 1 1 2 0 1 1 0 0 1-2 0ZM6 9a1 1 0 1 1 2 0 1 1 0 0 1-2 0ZM10 9a1 1 0 1 1 2 0 1 1 0 0 1-2 0Z" clip-rule="evenodd" /></svg>',
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

export async function renderAccountPage(container) {
  ensureMarkedReady();
  const section = getSection(window.location.pathname);
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
        <div class="w-full px-4 py-6 flex-1 min-h-0 overflow-hidden">
          <div class="px-4 pt-2 border-b border-gray-50 bg-white/80 backdrop-blur-md sticky top-0 z-20">
            <div class="flex items-center gap-1">
              ${renderWorkspaceTopTabs({
                tabs: [
                  { href: '/account/profile/overview', key: 'profile', label: 'Profile' },
                  { href: '/account/settings/connections', key: 'settings', label: 'Settings' },
                ],
                activeKey: getAccountArea(section),
                dataAttrName: 'data-account-area-tab',
              })}
            </div>
          </div>
          ${renderSettingsShell({
            navPaneHtml: renderWorkspaceVerticalTabs({
              id: 'account-tabs-container',
              items: getAccountNavItems(section),
            }),
            bodyId: 'account-main-body',
            contentId: 'account-main-content',
            footerId: 'account-main-footer',
            contentHtml: `
              <div class="pt-0.5 pb-6 sticky top-0 z-10 bg-white">
              <div class="w-full">
                <h1 data-account-section-title class="text-xl font-medium text-gray-900"></h1>
              </div>
            </div>
                <div data-account-content class="h-full min-h-0">
                  <div class="text-sm text-gray-500">Loading account settings...</div>
                </div>
              `,
          })}
        </div>
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

  try {
    await loadCurrentState();
    if (sectionTitle) {
      const isOverview = section === 'overview';
      sectionTitle.classList.toggle('hidden', !isOverview);
      sectionTitle.textContent = formatSectionLabel(section);
    }

    if (section === 'overview') {
      content.innerHTML = renderOverview(accountState);
    } else if (section === 'connections') {
      const rerenderConnections = async () => {
        await loadCurrentState();
        return accountState;
      };
      renderAccountConnectionsSection(content, accountState, {
        onRefresh: rerenderConnections,
      });
    } else if (section === 'models') {
      renderAccountModelsSection(content, accountState);
    } else if (section === 'integrations') {
      const refreshIntegrations = async () => {
        await loadCurrentState();
        return accountState;
      };
      renderAccountIntegrationsSection(content, accountState, {
        onRefresh: refreshIntegrations,
      });
    } else {
      content.innerHTML = renderOverview(accountState);
    }
  } catch (err) {
    content.innerHTML = `<div class="text-sm text-red-600">${escapeHtml(err.message || 'Failed to load account settings')}</div>`;
  }
}
