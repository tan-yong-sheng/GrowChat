function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

export function renderFolderEmptyStateMarkup() {
  return '';
}

export function renderFolderListMarkup(folders = [], expandedFolders = {}) {
  if (!Array.isArray(folders) || folders.length === 0) return renderFolderEmptyStateMarkup();
  return `
    <div class="folder-list px-3 py-2">
      <h3 class="folder-header text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2 px-1">Folders</h3>
      <div class="folder-items space-y-1">
        ${folders.map((folder) => `
          <div class="folder-item" data-folder-id="${folder.id}">
            <button class="folder-toggle w-full flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-800 transition-colors text-left text-sm font-medium text-gray-700 dark:text-gray-300">
              <span class="folder-arrow transition-transform duration-200 ${expandedFolders?.[folder.id] ? 'rotate-90' : ''}">
                <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="m9 18 6-6-6-6"/></svg>
              </span>
              <span class="folder-icon text-lg">${escapeHtml(folder.icon || '📁')}</span>
              <span class="folder-name flex-1 truncate">${escapeHtml(folder.name)}</span>
              <span class="folder-count text-xs text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-gray-700 px-1.5 py-0.5 rounded-full">${folder.chatCount || 0}</span>
            </button>
            <div class="folder-chats hidden ml-4 mt-1 border-l-2 border-gray-200 dark:border-gray-700 pl-1 space-y-0.5" style="${expandedFolders?.[folder.id] ? 'display: block;' : ''}"></div>
          </div>
        `).join('')}
      </div>
    </div>
  `;
}
