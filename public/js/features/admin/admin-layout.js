import { escapeHtml } from '../../shared/utils/dom-escape.js';
import {
  DEFAULT_SETTINGS_BODY_PADDING_CLASS,
  renderSettingsViewport,
} from '../../shared/components/settings-viewport.js';
import { renderSettingsShell } from '../../shared/components/settings-shell.js';
import { buildWorkspaceSettingsSubnavItems } from '../../shared/components/workspace-settings-subnav-config.js';
import { renderWorkspaceVerticalTabs } from '../../shared/components/workspace-vertical-tabs.js';

export const ADMIN_SHELL_BODY_PADDING_CLASS = DEFAULT_SETTINGS_BODY_PADDING_CLASS;
export const ADMIN_SETTINGS_VIEWPORT_CLASS = 'w-full px-4 py-6 flex-1 min-h-0 flex flex-col';

export function renderLoadingState() {
  return '<div class="flex items-center justify-center h-64"><div class="animate-spin rounded-full h-6 w-6 border-b-2 border-gray-900 dark:border-white"></div></div>';
}

export function renderSettingsSkeleton() {
  return `
    <div class="${ADMIN_SETTINGS_VIEWPORT_CLASS}">
      <div id="admin-sub-body" class="flex-1 min-h-0 overflow-auto scrollbar-thin-auto ${ADMIN_SHELL_BODY_PADDING_CLASS}">
        <div class="flex flex-col min-h-0 animate-in fade-in duration-150 w-full">
          <div class="pt-0.5 pb-6 bg-white">
            <div class="max-w-2xl mx-auto w-full flex justify-between items-center">
              <div class="h-6 w-32 bg-gray-100 rounded animate-pulse"></div>
            </div>
          </div>
          <div class="flex-1 min-h-0">
            <div class="max-w-2xl mx-auto w-full space-y-6 pb-6">
              <div class="space-y-3">
                <div class="h-4 w-24 bg-gray-100 rounded animate-pulse"></div>
                <div class="h-10 w-full bg-gray-100 rounded-md animate-pulse"></div>
                <div class="h-10 w-full bg-gray-100 rounded-md animate-pulse"></div>
              </div>
              <div class="space-y-3">
                <div class="h-4 w-28 bg-gray-100 rounded animate-pulse"></div>
                <div class="h-10 w-full bg-gray-100 rounded-md animate-pulse"></div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  `;
}

export function renderErrorState(message) {
  return `
    <div class="flex items-center justify-center h-full ${ADMIN_SHELL_BODY_PADDING_CLASS} p-6">
      <div class="max-w-md w-full rounded-lg border border-red-100 bg-red-50/60 p-6 text-center">
        <div class="text-sm font-semibold text-red-700">Unable to load admin content</div>
        <div class="mt-2 text-sm text-red-600">${escapeHtml(String(message || ''))}</div>
      </div>
    </div>
  `;
}

export function renderSettingsLayout(subTab) {
  return `
    ${renderSettingsViewport({
      viewportClass: ADMIN_SETTINGS_VIEWPORT_CLASS,
      contentHtml: renderSettingsShell({
        navPaneHtml: renderWorkspaceVerticalTabs({
          id: 'settings-tabs-container',
          items: buildWorkspaceSettingsSubnavItems({
            basePath: '/admin/settings',
            currentKey: subTab,
          }),
        }),
        bodyId: 'admin-sub-body',
        contentId: 'admin-sub-content',
        bodyPaddingClass: ADMIN_SHELL_BODY_PADDING_CLASS,
      }),
    })}
  `;
}

export function renderSystemLayout(subTab) {
  return `
    ${renderSettingsViewport({
      viewportClass: ADMIN_SETTINGS_VIEWPORT_CLASS,
      contentHtml: renderSettingsShell({
        navPaneHtml: renderWorkspaceVerticalTabs({
          id: 'system-tabs-container',
          items: [
            {
              href: '/admin/system/registration',
              key: 'registration',
              label: 'Registration',
              active: subTab === 'registration',
              icon: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" class="size-5"><path d="M8 8a2 2 0 1 0 0-4 2 2 0 0 0 0 4ZM3 12a3 3 0 0 1 3-3h4a3 3 0 0 1 3 3v1H3v-1Z"/></svg>',
            },
            {
              href: '/admin/system/email',
              key: 'email',
              label: 'Email Delivery',
              active: subTab === 'email',
              icon: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" class="size-5"><path d="M2.5 3A1.5 1.5 0 0 0 1 4.5v7A1.5 1.5 0 0 0 2.5 13h11a1.5 1.5 0 0 0 1.5-1.5v-7A1.5 1.5 0 0 0 13.5 3h-11ZM2 4.5a.5.5 0 0 1 .5-.5h11a.5.5 0 0 1 .5.5v.387l-6 3.2-6-3.2V4.5ZM2 6.013V11.5a.5.5 0 0 0 .5.5h11a.5.5 0 0 0 .5-.5V6.013l-6 3.2a.5.5 0 0 1-.5 0l-6-3.2Z"/></svg>',
            },
            {
              href: '/admin/system/security',
              key: 'security',
              label: 'Security Info',
              active: subTab === 'security',
              icon: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" class="size-5"><path fill-rule="evenodd" d="M8 1a.75.75 0 0 1 .75.75v1.258a5.25 5.25 0 1 1-1.5 0V1.75A.75.75 0 0 1 8 1ZM8 4a.75.75 0 0 1 .75.75v3.5a.75.75 0 0 1-1.5 0v-3.5A.75.75 0 0 1 8 4Z" clip-rule="evenodd"/></svg>',
            },
            {
              href: '/admin/system/activity',
              key: 'activity',
              label: 'Activity Log',
              active: subTab === 'activity',
              icon: '<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="size-5"><path stroke-linecap="round" stroke-linejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>',
            },
          ],
        }),
        bodyId: 'admin-sub-body',
        contentId: 'admin-sub-content',
        bodyPaddingClass: ADMIN_SHELL_BODY_PADDING_CLASS,
      }),
    })}
  `;
}

/**
 * Render inline subnav links for the Users tab (horizontal pill-style).
 * Used by renderSubContent when the tabs container already exists.
 */
export function renderUsersSubnavLinks(subTab) {
  return `
 <a href="/admin/users/overview" data-subnav="overview" class="flex items-center gap-2 px-3 py-2 rounded-lg transition ${subTab === 'overview' ? 'bg-gray-100 text-gray-900' : 'text-gray-700 hover:text-gray-900'}">
 <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" class="size-5">
 <path d="M8.5 4.5a2.5 2.5 0 1 1-5 0 2.5 2.5 0 0 1 5 0ZM10.9 12.006c.11.542-.348.994-.9.994H2c-.553 0-1.01-.452-.902-.994a5.002 5.002 0 0 1 9.803 0ZM14.002 12h-1.59a2.556 2.556 0 0 0-.04-.29 6.476 6.476 0 0 0-1.167-2.603 3.002 3.002 0 0 1 3.633 1.911c.18.522-.283.982-.836.982ZM12 8a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z"/>
 </svg>
 <span>Overview</span>
 </a>
 <a href="/admin/users/roles" data-subnav="roles" class="flex items-center gap-2 px-3 py-2 rounded-lg transition ${subTab === 'roles' ? 'bg-gray-100 text-gray-900' : 'text-gray-600 hover:text-gray-900'}">
 <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" class="size-5">
 <path d="M8 1.75a3.25 3.25 0 1 0 0 6.5 3.25 3.25 0 0 0 0-6.5ZM2.5 13.25a5.5 5.5 0 0 1 11 0v.25H2.5v-.25Z"/>
 </svg>
 <span>Roles</span>
 </a>
 <a href="/admin/users/groups" data-subnav="groups" class="flex items-center gap-2 px-3 py-2 rounded-lg transition ${subTab === 'groups' ? 'bg-gray-100 text-gray-900' : 'text-gray-600 hover:text-gray-900'}">
 <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" class="size-5">
 <path d="M8 8a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5ZM3.156 11.763c.16-.629.44-1.21.813-1.72a2.5 2.5 0 0 0-2.725 1.377c-.136.287.102.58.418.58h1.449c.01-.077.025-.156.045-.237ZM12.847 11.763c.02.08.036.16.046.237h1.446c.316 0 .554-.293.417-.579a2.5 2.5 0 0 0-2.722-1.378c.374.51.653 1.09.813 1.72ZM14 7.5a1.5 1.5 0 1 1-3 0 1.5 1.5 0 0 1 3 0ZM3.5 9a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3ZM5 13c-.552 0-1.013-.455-.876-.99a4.002 4.002 0 0 1 7.753 0c.136.535-.324.99-.877.99H5Z"/>
 </svg>
 <span>Groups</span>
 </a>
 <a href="/admin/users/policies" data-subnav="policies" class="flex items-center gap-2 px-3 py-2 rounded-lg transition ${subTab === 'policies' ? 'bg-gray-100 text-gray-900' : 'text-gray-600 hover:text-gray-900'}">
 <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" class="size-5">
 <path fill-rule="evenodd" d="M2 4.25A2.25 2.25 0 0 1 4.25 2h7.5A2.25 2.25 0 0 1 14 4.25v7.5A2.25 2.25 0 0 1 11.75 14h-7.5A2.25 2.25 0 0 1 2 11.75v-7.5Zm2.25-.75a.75.75 0 0 0-.75.75v7.5c0 .414.336.75.75.75h7.5a.75.75 0 0 0 .75-.75v-7.5a.75.75 0 0 0-.75-.75h-7.5Z" clip-rule="evenodd"/>
 <path d="M5 5.5a.75.75 0 0 1 .75-.75h4.5a.75.75 0 0 1 0 1.5h-4.5A.75.75 0 0 1 5 5.5ZM5 8a.75.75 0 0 1 .75-.75h4.5a.75.75 0 0 1 0 1.5h-4.5A.75.75 0 0 1 5 8ZM5 10.5a.75.75 0 0 1 .75-.75h2.5a.75.75 0 0 1 0 1.5h-2.5A.75.75 0 0 1 5 10.5Z"/>
 </svg>
 <span>Policies</span>
 </a>
 `;
}

/**
 * Render inline subnav links for the Settings tab (horizontal pill-style).
 * Used by renderSubContent when the tabs container already exists.
 */
export function renderSettingsSubnavLinks(subTab) {
  return `
 <a href="/admin/settings/connections" data-subnav="connections" class="flex items-center gap-2 px-3 py-2 rounded-lg transition ${subTab === 'connections' ? 'bg-gray-100 text-gray-900' : 'text-gray-600 hover:text-gray-900'}">
 <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" class="size-5">
 <path d="M4 3a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2H4Zm0 1.5h8a.5.5 0 0 1 .5.5v2.5h-9V5a.5.5 0 0 1 .5-.5Zm8 7H4a.5.5 0 0 1-.5-.5v-2h9v2a.5.5 0 0 1-.5.5Z"/>
 </svg>
 <span>Connections</span>
 </a>
 <a href="/admin/settings/models" data-subnav="models" class="flex items-center gap-2 px-3 py-2 rounded-lg transition ${subTab === 'models' ? 'bg-gray-100 text-gray-900' : 'text-gray-600 hover:text-gray-900'}">
 <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" class="size-5">
 <path fill-rule="evenodd" d="M2 4.25A2.25 2.25 0 0 1 4.25 2h7.5A2.25 2.25 0 0 1 14 4.25v7.5A2.25 2.25 0 0 1 11.75 14h-7.5A2.25 2.25 0 0 1 2 11.75v-7.5Zm2.25-.75a.75.75 0 0 0-.75.75v7.5c0 .414.336.75.75.75h7.5a.75.75 0 0 0 .75-.75v-7.5a.75.75 0 0 0-.75-.75h-7.5Z" clip-rule="evenodd" />
 <path d="M4.75 5.5a.75.75 0 0 1 .75-.75h5a.75.75 0 0 1 0 1.5h-5a.75.75 0 0 1-.75-.75ZM4.75 8a.75.75 0 0 1 .75-.75h5a.75.75 0 0 1 0 1.5h-5A.75.75 0 0 1 4.75 8ZM5.5 9.75a.75.75 0 0 0 0 1.5h3a.75.75 0 0 0 0-1.5h-3Z" />
 </svg>
 <span>Models</span>
 </a>
 <a href="/admin/settings/integrations" data-subnav="integrations" class="flex items-center gap-2 px-3 py-2 rounded-lg transition ${subTab === 'integrations' ? 'bg-gray-100 text-gray-900' : 'text-gray-600 hover:text-gray-900'}">
 <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" class="size-5">
 <path fill-rule="evenodd" d="M3.75 3A1.75 1.75 0 0 0 2 4.75v6.5c0 .966.784 1.75 1.75 1.75h8.5A1.75 1.75 0 0 0 14 11.25v-6.5A1.75 1.75 0 0 0 12.25 3h-8.5ZM12.5 4.75a.25.25 0 0 0-.25-.25h-8.5a.25.25 0 0 0-.25.25v6.5c0 .138.112.25.25.25h8.5a.25.25 0 0 0 .25-.25v-6.5Z" clip-rule="evenodd" />
 <path fill-rule="evenodd" d="M6 7a1 1 0 1 1 2 0 1 1 0 0 1-2 0ZM10 7a1 1 0 1 1 2 0 1 1 0 0 1-2 0ZM6 9a1 1 0 1 1 2 0 1 1 0 0 1-2 0ZM10 9a1 1 0 1 1 2 0 1 1 0 0 1-2 0Z" clip-rule="evenodd" />
 </svg>
 <span>Integrations</span>
 </a>
 `;
}

/**
 * Render an "under development" placeholder section.
 */
export function renderUnderDevPlaceholder(sectionTitle) {
  return `
 <div class="flex flex-col items-center justify-center h-full text-center p-10">
 <div class="w-16 h-16 bg-gray-50 rounded-lg flex items-center justify-center mb-4 text-gray-300">
 <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="size-5">
 <path stroke-linecap="round" stroke-linejoin="round" d="M11.42 15.17L17.25 21A2.652 2.652 0 0021 17.25l-5.83-5.83m0 0a2.978 2.978 0 01-3.34-3.34L15 2.25 10.5 2.25l-4.5 4.5v1.5a1.5 1.5 0 001.5 1.5h1.5l3.93 3.93m2.856 2.856l1.5 1.5a1.5 1.5 0 001.5-1.5V10.5l-4.5-4.5H6" />
 </svg>
 </div>
 <h3 class="text-lg font-medium text-gray-900 mb-1">${escapeHtml(String(sectionTitle || ''))}</h3>
 <p class="text-sm text-gray-700 max-w-xs">This section is currently under development.</p>
 </div>
 `;
}

function buildUsersTabItems(subTab) {
  return [
    {
      href: '/admin/users/overview',
      key: 'overview',
      label: 'Overview',
      active: subTab === 'overview',
      icon: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" class="size-5"><path d="M8.5 4.5a2.5 2.5 0 1 1-5 0 2.5 2.5 0 0 1 5 0ZM10.9 12.006c.11.542-.348.994-.9.994H2c-.553 0-1.01-.452-.902-.994a5.002 5.002 0 0 1 9.803 0ZM14.002 12h-1.59a2.556 2.556 0 0 0-.04-.29 6.476 6.476 0 0 0-1.167-2.603 3.002 3.002 0 0 1 3.633 1.911c.18.522-.283.982-.836.982ZM12 8a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z"/></svg>',
    },
    {
      href: '/admin/users/roles',
      key: 'roles',
      label: 'Roles',
      active: subTab === 'roles',
      icon: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" class="size-5"><path d="M8 1.75a3.25 3.25 0 1 0 0 6.5 3.25 3.25 0 0 0 0-6.5ZM2.5 13.25a5.5 5.5 0 0 1 11 0v.25H2.5v-.25Z"/></svg>',
    },
    {
      href: '/admin/users/groups',
      key: 'groups',
      label: 'Groups',
      active: subTab === 'groups',
      icon: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" class="size-5"><path d="M8 8a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5ZM3.156 11.763c.16-.629.44-1.21.813-1.72a2.5 2.5 0 0 0-2.725 1.377c-.136.287.102.58.418.58h1.449c.01-.077.025-.156.045-.237ZM12.847 11.763c.02.08.036.16.046.237h1.446c.316 0 .554-.293.417-.579a2.5 2.5 0 0 0-2.722-1.378c.374.51.653 1.09.813 1.72ZM14 7.5a1.5 1.5 0 1 1-3 0 1.5 1.5 0 0 1 3 0ZM3.5 9a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3ZM5 13c-.552 0-1.013-.455-.876-.99a4.002 4.002 0 0 1 7.753 0c.136.535-.324.99-.877.99H5Z"/></svg>',
    },
    {
      href: '/admin/users/policies',
      key: 'policies',
      label: 'Policies',
      active: subTab === 'policies',
      icon: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" class="size-5"><path fill-rule="evenodd" d="M2 4.25A2.25 2.25 0 0 1 4.25 2h7.5A2.25 2.25 0 0 1 14 4.25v7.5A2.25 2.25 0 0 1 11.75 14h-7.5A2.25 2.25 0 0 1 2 11.75v-7.5Zm2.25-.75a.75.75 0 0 0-.75.75v7.5c0 .414.336.75.75.75h7.5a.75.75 0 0 0 .75-.75v-7.5a.75.75 0 0 0-.75-.75h-7.5Z" clip-rule="evenodd"/><path d="M5 5.5a.75.75 0 0 1 .75-.75h4.5a.75.75 0 0 1 0 1.5h-4.5A.75.75 0 0 1 5 5.5ZM5 8a.75.75 0 0 1 .75-.75h4.5a.75.75 0 0 1 0 1.5h-4.5A.75.75 0 0 1 5 8ZM5 10.5a.75.75 0 0 1 .75-.75h2.5a.75.75 0 0 1 0 1.5h-2.5A.75.75 0 0 1 5 10.5Z"/></svg>',
    },
  ];
}

function buildUsersToolbar() {
  return `
    <div class="pt-0.5 pb-2.5 flex justify-between items-center bg-white">
      <div class="flex items-center text-xl font-medium px-0.5 gap-2">
        <h1 class="flex-shrink-0 text-gray-900">Users</h1>
        <div class="text-gray-500 font-normal ml-0.5" id="users-total-count"></div>
      </div>
      <div class="flex items-center gap-3">
        <div class="flex items-center gap-1.5 bg-gray-50/50 px-3 py-1.5 rounded-md border border-gray-100/30 w-64">
          <div class="flex-shrink-0 text-gray-600">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="w-4 h-4">
              <path fill-rule="evenodd" d="M9 3.5a5.5 5.5 0 100 11 5.5 5.5 0 000-11zM2 9a7 7 0 1112.452 4.391l3.328 3.329a.75.75 0 11-1.06 1.06l-3.329-3.328A7 7 0 012 9z" clip-rule="evenodd" />
            </svg>
          </div>
          <input class="w-full text-sm outline-none bg-transparent text-gray-700 placeholder-gray-400" placeholder="Search users" id="user-search-input">
          <div id="clear-search-container" class="hidden ml-1.5">
            <button id="clear-search-btn" class="p-0.5 rounded-full hover:bg-gray-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary/20 transition">
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2.5" stroke="currentColor" class="size-5">
                <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>
        <button id="open-add-user-modal" class="w-10 h-10 rounded-md text-gray-500 hover:text-gray-700 hover:bg-gray-100 transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary/20 flex items-center justify-center" title="Add User">
          <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v14"></path><path d="M5 12h14"></path></svg>
        </button>
      </div>
    </div>
  `;
}

function buildUsersTable() {
  return `
    <div class="relative w-full rounded-lg border border-gray-100 bg-white">
        <div class="min-w-[1120px]">
          <table class="w-full text-sm text-left text-gray-500 table-fixed">
            <thead class="text-label-sm text-gray-900 font-bold uppercase bg-gray-50/50">
              <tr class="border-b border-gray-100">
                <th scope="col" class="px-3 py-3 w-24">Role</th>
                <th scope="col" class="px-3 py-3 w-1/4">Name</th>
                <th scope="col" class="px-3 py-3 w-24">Status</th>
                <th scope="col" class="px-3 py-3 w-1/3">Email</th>
                <th scope="col" class="px-3 py-3 w-24">Last Active</th>
                <th scope="col" class="px-3 py-3 w-28">Created At</th>
                <th scope="col" class="px-3 py-3 w-24 text-right"><span class="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody id="users-table-body" class="divide-y divide-gray-50/50"></tbody>
          </table>
        </div>
    </div>
  `;
}

function buildUsersPagination() {
  return `
    <div class="flex items-center justify-between gap-4 py-4 px-0.5 text-sm text-gray-500">
      <div class="flex items-center gap-3">
        <span>Show</span>
        <select id="users-page-size" aria-label="Users per page" class="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 outline-none focus:ring-1 focus:ring-gray-300">
          <option value="20">20</option>
          <option value="50">50</option>
          <option value="100">100</option>
        </select>
        <span>per page</span>
      </div>
      <div class="flex items-center gap-4">
        <div class="text-xs text-gray-600" id="users-page-range"></div>
        <div class="flex items-center gap-2">
          <button id="users-page-prev" class="px-3 py-2 rounded-lg border border-gray-200 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary/20 transition disabled:opacity-50">Prev</button>
          <div class="text-sm text-gray-600" id="users-page-label"></div>
          <button id="users-page-next" class="px-3 py-2 rounded-lg border border-gray-200 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary/20 transition disabled:opacity-50">Next</button>
        </div>
      </div>
    </div>
    <div class="text-gray-600 text-label-sm flex items-center justify-end gap-1.5 px-0.5">
      <span>Users are managed through the admin workspace shell.</span>
    </div>
  `;
}

function buildUsersContent() {
  return `
    <div class="flex flex-col min-h-0 animate-in fade-in duration-300">
      ${buildUsersToolbar()}
      ${buildUsersTable()}
      ${buildUsersPagination()}
    </div>
  `;
}

export function renderUsersLayout(subTab) {
  return `
    ${renderSettingsViewport({
      viewportClass: ADMIN_SETTINGS_VIEWPORT_CLASS,
      contentHtml: renderSettingsShell({
        navPaneHtml: renderWorkspaceVerticalTabs({
          id: 'users-tabs-container',
          items: buildUsersTabItems(subTab),
          inactiveClassName: 'text-gray-700 hover:text-gray-900',
        }),
        bodyId: 'admin-sub-body',
        contentId: 'admin-sub-content',
        bodyPaddingClass: ADMIN_SHELL_BODY_PADDING_CLASS,
        contentHtml: buildUsersContent(),
      }),
    })}
  `;
}
