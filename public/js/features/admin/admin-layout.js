import { renderSettingsShell } from '../../shared/components/settings-shell.js';
import {
  DEFAULT_SETTINGS_BODY_PADDING_CLASS,
  DEFAULT_SETTINGS_FOOTER_PADDING_CLASS,
  renderSettingsViewport,
} from '../../shared/components/settings-viewport.js';
import { buildWorkspaceSettingsSubnavItems } from '../../shared/components/workspace-settings-subnav-config.js';
import { renderWorkspaceVerticalTabs } from '../../shared/components/workspace-vertical-tabs.js';

export const ADMIN_SHELL_BODY_PADDING_CLASS = DEFAULT_SETTINGS_BODY_PADDING_CLASS;
export const ADMIN_SHELL_FOOTER_PADDING_CLASS = DEFAULT_SETTINGS_FOOTER_PADDING_CLASS;
export const ADMIN_SETTINGS_VIEWPORT_CLASS = 'w-full px-4 py-6 flex-1 min-h-0 overflow-hidden';

export function renderLoadingState() {
  return '<div class="flex items-center justify-center h-64"><div class="animate-spin rounded-full h-6 w-6 border-b-2 border-gray-900 dark:border-white"></div></div>';
}

export function renderSettingsSkeleton() {
  return `
    <div class="${ADMIN_SETTINGS_VIEWPORT_CLASS}">
      <div id="admin-sub-body" class="flex-1 min-h-0 flex flex-col overflow-hidden ${ADMIN_SHELL_BODY_PADDING_CLASS}">
        <div class="flex flex-col h-full min-h-0 animate-in fade-in duration-150 w-full">
          <div class="pt-0.5 pb-6 sticky top-0 z-10 bg-white">
            <div class="max-w-2xl mx-auto w-full flex justify-between items-center">
              <div class="h-6 w-32 bg-gray-100 rounded animate-pulse"></div>
            </div>
          </div>
          <div class="flex-1 min-h-0 overflow-y-auto scrollbar-hidden">
            <div class="max-w-2xl mx-auto w-full space-y-6 pb-6">
              <div class="space-y-3">
                <div class="h-4 w-24 bg-gray-100 rounded animate-pulse"></div>
                <div class="h-10 w-full bg-gray-100 rounded-xl animate-pulse"></div>
                <div class="h-10 w-full bg-gray-100 rounded-xl animate-pulse"></div>
              </div>
              <div class="space-y-3">
                <div class="h-4 w-28 bg-gray-100 rounded animate-pulse"></div>
                <div class="h-10 w-full bg-gray-100 rounded-xl animate-pulse"></div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
    <div id="admin-main-action-footer-host" class="shrink-0 ${ADMIN_SHELL_FOOTER_PADDING_CLASS}" style="transform: translateY(-24px);"></div>
  `;
}

export function renderErrorState(message) {
  return `
    <div class="flex items-center justify-center h-full ${ADMIN_SHELL_BODY_PADDING_CLASS} p-6">
      <div class="max-w-md w-full rounded-3xl border border-red-100 bg-red-50/60 p-6 text-center">
        <div class="text-sm font-semibold text-red-700">Unable to load admin content</div>
        <div class="mt-2 text-sm text-red-600">${message}</div>
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
        footerId: 'admin-main-action-footer-host',
        bodyPaddingClass: ADMIN_SHELL_BODY_PADDING_CLASS,
        footerPaddingClass: ADMIN_SHELL_FOOTER_PADDING_CLASS,
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
          items: [{
            href: '/admin/system/general',
            key: 'general',
            label: 'General',
            active: subTab === 'general',
            icon: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" class="size-4"><path d="M8 8a2 2 0 1 0 0-4 2 2 0 0 0 0 4ZM3 12a3 3 0 0 1 3-3h4a3 3 0 0 1 3 3v1H3v-1Z"/></svg>',
          }, {
            href: '/admin/system/security',
            key: 'security',
            label: 'Security',
            active: subTab === 'security',
            icon: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" class="size-4"><path d="M8 1a.75.75 0 0 1 .75.75v1.258a5.25 5.25 0 1 1-1.5 0V1.75A.75.75 0 0 1 8 1ZM8 4a.75.75 0 0 1 .75.75v3.5a.75.75 0 0 1-1.5 0v-3.5A.75.75 0 0 1 8 4Z"/></svg>',
          }],
        }),
        bodyId: 'admin-sub-body',
        contentId: 'admin-sub-content',
        footerId: 'admin-main-action-footer-host',
        bodyPaddingClass: ADMIN_SHELL_BODY_PADDING_CLASS,
        footerPaddingClass: ADMIN_SHELL_FOOTER_PADDING_CLASS,
      }),
    })}
  `;
}

export function renderUsersLayout(subTab) {
  return `
    <div class="flex flex-col md:flex-row h-full w-full">
      <div id="users-tabs-container" class="w-full md:w-52 flex-none flex flex-row md:flex-col p-2 md:p-4 gap-1 text-sm font-medium border-b md:border-b-0 md:border-r border-gray-50 overflow-x-auto">
        <a href="/admin/users/overview" data-subnav="overview" class="flex items-center gap-2 px-3 py-2 rounded-lg transition ${subTab === 'overview' ? 'bg-gray-100 text-gray-900' : 'text-gray-400 hover:text-gray-700'}">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" class="size-4">
            <path d="M8.5 4.5a2.5 2.5 0 1 1-5 0 2.5 2.5 0 0 1 5 0ZM10.9 12.006c.11.542-.348.994-.9.994H2c-.553 0-1.01-.452-.902-.994a5.002 5.002 0 0 1 9.803 0ZM14.002 12h-1.59a2.556 2.556 0 0 0-.04-.29 6.476 6.476 0 0 0-1.167-2.603 3.002 3.002 0 0 1 3.633 1.911c.18.522-.283.982-.836.982ZM12 8a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z"/>
          </svg>
          <span class="whitespace-nowrap">Overview</span>
        </a>
        <a href="/admin/users/roles" data-subnav="roles" class="flex items-center gap-2 px-3 py-2 rounded-lg transition ${subTab === 'roles' ? 'bg-gray-100 text-gray-900' : 'text-gray-400 hover:text-gray-700'}">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" class="size-4">
            <path d="M8 1.75a3.25 3.25 0 1 0 0 6.5 3.25 3.25 0 0 0 0-6.5ZM2.5 13.25a5.5 5.5 0 0 1 11 0v.25H2.5v-.25Z"/>
          </svg>
          <span class="whitespace-nowrap">Roles</span>
        </a>
        <a href="/admin/users/groups" data-subnav="groups" class="flex items-center gap-2 px-3 py-2 rounded-lg transition ${subTab === 'groups' ? 'bg-gray-100 text-gray-900' : 'text-gray-400 hover:text-gray-700'}">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" class="size-4">
            <path d="M8 8a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5ZM3.156 11.763c.16-.629.44-1.21.813-1.72a2.5 2.5 0 0 0-2.725 1.377c-.136.287.102.58.418.58h1.449c.01-.077.025-.156.045-.237ZM12.847 11.763c.02.08.036.16.046.237h1.446c.316 0 .554-.293.417-.579a2.5 2.5 0 0 0-2.722-1.378c.374.51.653 1.09.813 1.72ZM14 7.5a1.5 1.5 0 1 1-3 0 1.5 1.5 0 0 1 3 0ZM3.5 9a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3ZM5 13c-.552 0-1.013-.455-.876-.99a4.002 4.002 0 0 1 7.753 0c.136.535-.324.99-.877.99H5Z"/>
          </svg>
          <span class="whitespace-nowrap">Groups</span>
        </a>
        <a href="/admin/users/policies" data-subnav="policies" class="flex items-center gap-2 px-3 py-2 rounded-lg transition ${subTab === 'policies' ? 'bg-gray-100 text-gray-900' : 'text-gray-400 hover:text-gray-700'}">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" class="size-4">
            <path fill-rule="evenodd" d="M2 4.25A2.25 2.25 0 0 1 4.25 2h7.5A2.25 2.25 0 0 1 14 4.25v7.5A2.25 2.25 0 0 1 11.75 14h-7.5A2.25 2.25 0 0 1 2 11.75v-7.5Zm2.25-.75a.75.75 0 0 0-.75.75v7.5c0 .414.336.75.75.75h7.5a.75.75 0 0 0 .75-.75v-7.5a.75.75 0 0 0-.75-.75h-7.5Z" clip-rule="evenodd" />
            <path d="M5 5.5a.75.75 0 0 1 .75-.75h4.5a.75.75 0 0 1 0 1.5h-4.5A.75.75 0 0 1 5 5.5ZM5 8a.75.75 0 0 1 .75-.75h4.5a.75.75 0 0 1 0 1.5h-4.5A.75.75 0 0 1 5 8ZM5 10.5a.75.75 0 0 1 .75-.75h2.5a.75.75 0 0 1 0 1.5h-2.5A.75.75 0 0 1 5 10.5Z" />
          </svg>
          <span class="whitespace-nowrap">Policies</span>
        </a>
      </div>
      <div class="flex-1 min-h-0 flex flex-col overflow-hidden">
        <div id="admin-sub-content" class="flex-1 min-h-0 flex flex-col overflow-hidden">
          <div id="admin-sub-body" class="flex-1 min-h-0 flex flex-col overflow-hidden ${ADMIN_SHELL_BODY_PADDING_CLASS}"></div>
          <div id="admin-main-action-footer-host" class="shrink-0 ${ADMIN_SHELL_FOOTER_PADDING_CLASS}" style="transform: translateY(-24px);"></div>
        </div>
      </div>
    </div>
  `;
}
