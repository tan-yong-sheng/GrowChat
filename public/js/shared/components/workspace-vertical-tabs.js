function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

export function renderWorkspaceVerticalTabs({
  id,
  items = [],
  className = 'w-full md:w-52 flex-none flex flex-row md:flex-col p-2 md:p-4 gap-1 text-sm font-medium border-b md:border-b-0 md:border-r border-gray-50 overflow-x-auto',
  itemClassName = 'flex items-center gap-2 px-3 py-2 rounded-lg transition',
  activeClassName = 'bg-gray-100 text-gray-900',
  inactiveClassName = 'text-gray-400 hover:text-gray-700',
} = {}) {
  return `
    <div id="${escapeHtml(id)}" class="${className}">
      ${items
        .map((item) => {
          const active = Boolean(item.active);
          return `
          <a href="${escapeHtml(item.href)}" data-subnav="${escapeHtml(item.key)}" class="${itemClassName} ${active ? activeClassName : inactiveClassName}">
            ${item.icon || ''}
            <span class="whitespace-nowrap">${escapeHtml(item.label)}</span>
          </a>
        `;
        })
        .join('')}
    </div>
  `;
}
