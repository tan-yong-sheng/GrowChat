import { escapeHtml } from '../utils/dom-escape.js';
function renderNavItem(item, activeKey) {
  const active = activeKey === item.key;
  const icon = item.icon || '';
  return `
    <a href="${escapeHtml(item.href)}" data-subnav="${escapeHtml(item.key)}" class="flex items-center gap-2 px-3 py-2 rounded-lg transition border-b-2 ${active ? 'bg-gray-100 text-gray-900 border-gray-900' : 'text-gray-400 hover:text-gray-700 border-transparent'}">
      ${icon}
      <span class="whitespace-nowrap">${escapeHtml(item.label)}</span>
    </a>
  `;
}

export function renderSettingsNavPane({
  id,
  groups = [],
  activeKey,
  className = 'w-full md:w-52 flex-none flex flex-row md:flex-col p-2 md:p-4 gap-1 text-sm font-medium border-b md:border-b-0 md:border-r border-gray-50 overflow-x-auto',
}) {
  return `
    <div id="${escapeHtml(id)}" class="${className}">
      ${groups
        .map((group) => {
          if (group?.compact) {
            return `<div class="grid gap-1">${(group.items || []).map((item) => renderNavItem(item, activeKey)).join('')}</div>`;
          }

          return `
          <div class="space-y-1.5">
            ${group?.title ? `<div class="px-3 pt-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-gray-400">${escapeHtml(group.title)}</div>` : ''}
            <div class="grid gap-1">
              ${(group.items || []).map((item) => renderNavItem(item, activeKey)).join('')}
            </div>
          </div>
        `;
        })
        .join('')}
    </div>
  `;
}
