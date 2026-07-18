import { escapeHtml } from '../utils/dom-escape.js';
export function getAvatarLabel(user) {
  return user.avatar_emoji || (user.name ? user.name[0] : 'U');
}

export function getStatusColor(status) {
  switch (status) {
    case 'online':
      return 'bg-green-500';
    case 'away':
      return 'bg-yellow-500';
    case 'offline':
      return 'bg-gray-400';
    default:
      return 'bg-green-500';
  }
}

export function computePresence(lastActiveAt, { isHidden = false } = {}) {
  const hidden =
    isHidden || (typeof document !== 'undefined' && document.visibilityState === 'hidden');
  if (hidden) return 'away';
  // 5 minutes = 300,000ms
  // idle timeout
  const idleMs = 5 * 60 * 1000;
  return Date.now() - lastActiveAt <= idleMs ? 'online' : 'away';
}

export function buildFooterMarkup(user, hasAdminPerm) {
  const avatar = escapeHtml(getAvatarLabel(user));
  const name = escapeHtml(user.name || 'User');

  return `
    <div class="relative w-full">
      <button class="user-profile-btn w-full flex items-center gap-3 p-2 rounded-md hover:bg-white transition-all text-left group/user">
        <span class="user-avatar flex items-center justify-center w-9 h-9 rounded-full bg-gray-200 text-gray-700 font-semibold text-sm flex-shrink-0 shadow-sm transition-all group-hover/user:scale-105 border border-white">
          ${avatar}
        </span>
        <div class="user-info flex-1 min-w-0 sidebar-full-only">
          <span class="user-name block font-semibold text-sm text-gray-900 truncate">${name}</span>
          <div class="flex items-center gap-1.5">
            <span data-presence-dot class="status-indicator w-2 h-2 rounded-full"></span>
            <span data-presence-label class="user-status block text-xs text-gray-500 capitalize"></span>
          </div>
        </div>
      </button>

      <div class="user-menu-dropdown hidden absolute bottom-full left-0 w-64 mb-2 bg-white border border-gray-100 rounded-lg shadow-xl z-50 overflow-hidden p-1">
        <div class="flex gap-3 w-full p-2.5 items-center border-b border-gray-50">
          <div class="user-avatar flex items-center justify-center w-10 h-10 rounded-full bg-gray-200 text-gray-700 font-semibold text-sm flex-shrink-0 shadow-sm">
            ${avatar}
          </div>
          <div class="flex flex-col flex-1 min-w-0">
            <div class="font-medium text-sm text-gray-900 truncate">${name}</div>
            <div class="flex items-center gap-1.5">
              <span data-menu-presence-dot class="w-2 h-2 rounded-full"></span>
              <span data-menu-presence-label class="text-xs text-gray-500 capitalize"></span>
            </div>
          </div>
        </div>

        <div class="p-1">
          <button data-action="status" class="mb-1 w-full px-3 py-1.5 gap-2 rounded-md bg-gray-50 hover:bg-gray-100 text-gray-700 transition text-xs flex items-center justify-center border border-gray-100/50">
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M8 14s1.5 2 4 2 4-2 4-2"/><line x1="9" y1="9" x2="9.01" y2="9"/><line x1="15" y1="9" x2="15.01" y2="9"/></svg>
            <span>Update your status</span>
          </button>
        </div>

        <div class="space-y-0.5">
          <button data-action="preferences" class="menu-item flex items-center gap-3 w-full text-left px-3 py-2 rounded-md text-sm hover:bg-gray-50 transition-colors text-gray-700 group">
            <div class="text-gray-400 group-hover:text-gray-600 transition-colors">
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.1a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/></svg>
            </div>
            <span>Settings</span>
          </button>

          <button data-action="archived" class="menu-item flex items-center gap-3 w-full text-left px-3 py-2 rounded-md text-sm hover:bg-gray-50 transition-colors text-gray-700 group">
            <div class="text-gray-400 group-hover:text-gray-600 transition-colors">
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect width="20" height="5" x="2" y="3" rx="1"/><path d="M4 8v11a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8"/><path d="M10 12h4"/></svg>
            </div>
            <span>Archived Chats</span>
          </button>

          ${
            hasAdminPerm
              ? `
            <button data-action="admin" class="menu-item flex items-center gap-3 w-full text-left px-3 py-2 rounded-md text-sm hover:bg-gray-50 transition-colors text-gray-700 group">
              <div class="text-gray-400 group-hover:text-gray-600 transition-colors">
                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
              </div>
              <span>Admin Settings</span>
            </button>
          `
              : ''
          }

          <hr class="border-gray-50 my-1">

          <button data-action="logout" class="menu-item flex items-center gap-3 w-full text-left px-3 py-2 rounded-md text-sm hover:bg-red-50 transition-colors text-red-500 group">
            <div class="text-red-400 group-hover:text-red-500 transition-colors">
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
            </div>
            <span>Sign Out</span>
          </button>
        </div>
      </div>
    </div>
  `;
}
