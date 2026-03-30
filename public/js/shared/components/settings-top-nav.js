import { renderWorkspaceTopTabs } from './workspace-top-tabs.js';

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

export function renderWorkspaceTopNavSidebarToggle({
  id,
  title,
  className,
} = {}) {
  return `
    <button id="${escapeHtml(id)}" class="${escapeHtml(className)}" title="${escapeHtml(title)}">
      <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="3" y1="12" x2="21" y2="12"></line><line x1="3" y1="6" x2="21" y2="6"></line><line x1="3" y1="18" x2="21" y2="18"></line></svg>
    </button>
  `;
}

export function renderWorkspaceTopNav({
  tabs = [],
  activeKey = '',
  dataAttrName = 'data-nav',
  navClass = 'px-4 pt-2 border-b border-gray-50 bg-white/80 backdrop-blur-md sticky top-0 z-20',
  innerClass = 'flex items-center gap-1',
  leadingSlotHtml = '',
  leadingHtml = '',
  showSidebarToggle = false,
  sidebarToggleId = 'toggle-sidebar-mobile',
  sidebarToggleTitle = 'Open Sidebar',
  sidebarToggleClass = 'p-2 mr-2 hover:bg-gray-100 rounded-lg transition text-gray-500 md:hidden',
} = {}) {
  const leadingContent = leadingSlotHtml || leadingHtml || (showSidebarToggle ? renderWorkspaceTopNavSidebarToggle({
    id: sidebarToggleId,
    title: sidebarToggleTitle,
    className: sidebarToggleClass,
  }) : '');

  return `
    <nav class="${escapeHtml(navClass)}">
      <div class="${escapeHtml(innerClass)}">
        ${leadingContent}
        ${renderWorkspaceTopTabs({
          tabs,
          activeKey,
          dataAttrName,
        })}
      </div>
    </nav>
  `;
}
