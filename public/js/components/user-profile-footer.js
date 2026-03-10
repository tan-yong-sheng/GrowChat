import { apiFetch } from '../api.js';
import { state, subscribe } from '../store.js';

const PRESENCE_IDLE_MS = 5 * 60 * 1000;
const ACTIVITY_EVENTS = ['pointerdown', 'pointermove', 'keydown', 'focus', 'visibilitychange'];

function computePresence(lastActiveAt) {
  if (typeof document !== 'undefined' && document.visibilityState === 'hidden') {
    return 'away';
  }
  return Date.now() - lastActiveAt <= PRESENCE_IDLE_MS ? 'online' : 'away';
}

async function renderAdminRoute() {
  const { renderAdminPage } = await import('../admin.js');
  return renderAdminPage(document.getElementById('app'));
}

function getStoredAuthUser() {
  try {
    const raw = localStorage.getItem('growchat_auth');
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed?.user || null;
  } catch {
    return null;
  }
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function getAvatarLabel(user) {
  return user.avatar_emoji || (user.name ? user.name[0] : 'U');
}

function buildFooterMarkup(user, hasAdminPerm) {
  const avatar = escapeHtml(getAvatarLabel(user));
  const name = escapeHtml(user.name || 'User');

  return `
    <div class="relative w-full">
      <button class="user-profile-btn w-full flex items-center gap-3 p-2 rounded-xl hover:bg-white transition-all text-left group/user">
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

      <div class="user-menu-dropdown hidden absolute bottom-full left-0 w-full mb-2 bg-white border border-gray-100 rounded-2xl shadow-xl z-50 overflow-hidden p-1">
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
          <button data-action="status" class="mb-1 w-full px-3 py-1.5 gap-2 rounded-xl bg-gray-50 hover:bg-gray-100 text-gray-700 transition text-xs flex items-center justify-center border border-gray-100/50">
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M8 14s1.5 2 4 2 4-2 4-2"/><line x1="9" y1="9" x2="9.01" y2="9"/><line x1="15" y1="9" x2="15.01" y2="9"/></svg>
            <span>Update your status</span>
          </button>
        </div>

        <div class="space-y-0.5">
          <button data-action="preferences" class="menu-item flex items-center gap-3 w-full text-left px-3 py-2 rounded-xl text-sm hover:bg-gray-50 transition-colors text-gray-700 group">
            <div class="text-gray-400 group-hover:text-gray-600 transition-colors">
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.1a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/></svg>
            </div>
            <span>Settings</span>
          </button>

          <button data-action="archived" class="menu-item flex items-center gap-3 w-full text-left px-3 py-2 rounded-xl text-sm hover:bg-gray-50 transition-colors text-gray-700 group">
            <div class="text-gray-400 group-hover:text-gray-600 transition-colors">
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect width="20" height="5" x="2" y="3" rx="1"/><path d="M4 8v11a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8"/><path d="M10 12h4"/></svg>
            </div>
            <span>Archived Chats</span>
          </button>

          ${hasAdminPerm ? `
            <button data-action="admin" class="menu-item flex items-center gap-3 w-full text-left px-3 py-2 rounded-xl text-sm hover:bg-gray-50 transition-colors text-gray-700 group">
              <div class="text-gray-400 group-hover:text-gray-600 transition-colors">
                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
              </div>
              <span>Admin Settings</span>
            </button>
          ` : ''}

          <hr class="border-gray-50 my-1">

          <button data-action="logout" class="menu-item flex items-center gap-3 w-full text-left px-3 py-2 rounded-xl text-sm hover:bg-red-50 transition-colors text-red-500 group">
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

export async function createUserProfileFooter() {
  const storedUser = getStoredAuthUser();
  let user = {
    name: storedUser?.name || 'User',
    status: storedUser?.status || 'away',
    avatar_emoji: storedUser?.avatar_emoji || (storedUser?.name ? storedUser.name[0] : 'U')
  };
  let lastActiveAt = Date.now();
  let presenceTimer = null;
  let manualStatus = user.status && user.status !== 'online' && user.status !== 'away'
    ? user.status
    : null;

  const element = document.createElement('div');
  element.className = 'user-profile-footer border-t border-gray-100 p-4 bg-[#f9f9f9] z-20';

  const hasAdminPerm = state.permissions?.includes('admin.rbac.admin') || false;
  element.innerHTML = buildFooterMarkup(user, hasAdminPerm);

  let menu = element.querySelector('.user-menu-dropdown');
  let profileBtn = element.querySelector('.user-profile-btn');
  let presenceLabel = element.querySelector('[data-presence-label]');
  let presenceDot = element.querySelector('[data-presence-dot]');
  let menuPresenceLabel = element.querySelector('[data-menu-presence-label]');
  let menuPresenceDot = element.querySelector('[data-menu-presence-dot]');
  let unsubscribe = null;

  const updatePresenceUi = () => {
    const presence = manualStatus || computePresence(lastActiveAt);
    const color = getStatusColor(presence);
    if (presenceLabel) presenceLabel.textContent = presence;
    if (presenceDot) presenceDot.className = `status-indicator w-2 h-2 rounded-full ${color}`;
    if (menuPresenceLabel) menuPresenceLabel.textContent = presence;
    if (menuPresenceDot) menuPresenceDot.className = `w-2 h-2 rounded-full ${color}`;
  };

  function bindFooterNodes() {
    menu = element.querySelector('.user-menu-dropdown');
    profileBtn = element.querySelector('.user-profile-btn');
    presenceLabel = element.querySelector('[data-presence-label]');
    presenceDot = element.querySelector('[data-presence-dot]');
    menuPresenceLabel = element.querySelector('[data-menu-presence-label]');
    menuPresenceDot = element.querySelector('[data-menu-presence-dot]');

    profileBtn?.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      menu?.classList.toggle('hidden');
    });

    updatePresenceUi();
  }

  function rerenderFooter() {
    const hasAdminPerm = state.permissions?.includes('admin.rbac.admin') || false;
    element.innerHTML = buildFooterMarkup(user, hasAdminPerm);
    bindFooterNodes();
  }

  bindFooterNodes();

  element.addEventListener('click', async (e) => {
    const actionBtn = e.target.closest('button[data-action]');
    if (!actionBtn) return;

    const action = actionBtn.dataset.action;
    if (action === 'admin') {
      window.history.pushState({}, '', '/admin/users/overview');
      await renderAdminRoute();
    } else if (action === 'status' || action === 'profile' || action === 'preferences') {
      await showPreferencesModal({ ...user, status: computePresence(lastActiveAt) });
    } else if (action === 'archived') {
      window.dispatchEvent(new CustomEvent('growchat:open-archived'));
    } else if (action === 'logout') {
      localStorage.removeItem('growchat_auth');
      window.location.href = '/auth.html';
    }
    menu.classList.add('hidden');
  });

  const markActive = () => {
    lastActiveAt = Date.now();
    updatePresenceUi();
  };

  ACTIVITY_EVENTS.forEach((eventName) => {
    window.addEventListener(eventName, markActive, { passive: true });
  });

  const onDocumentClick = (e) => {
    if (!element.contains(e.target)) {
      menu.classList.add('hidden');
    }
  };
  document.addEventListener('click', onDocumentClick);

  presenceTimer = window.setInterval(updatePresenceUi, 30000);
  updatePresenceUi();

  let lastAdminPerm = state.permissions?.includes('admin.rbac.admin') || false;
  unsubscribe = subscribe((currentState) => {
    const nextAdminPerm = currentState.permissions?.includes('admin.rbac.admin') || false;
    if (nextAdminPerm !== lastAdminPerm) {
      lastAdminPerm = nextAdminPerm;
      rerenderFooter();
    }
  });

  element.__cleanup = () => {
    if (presenceTimer) window.clearInterval(presenceTimer);
    ACTIVITY_EVENTS.forEach((eventName) => {
      window.removeEventListener(eventName, markActive);
    });
    document.removeEventListener('click', onDocumentClick);
    unsubscribe?.();
  };

  return element;
}

function getStatusColor(status) {
  switch (status) {
    case 'online': return 'bg-green-500';
    case 'away': return 'bg-yellow-500';
    case 'offline': return 'bg-gray-400';
    default: return 'bg-green-500';
  }
}

async function showPreferencesModal(user) {
  const modal = document.createElement('div');
  modal.className = 'modal-overlay fixed inset-0 bg-black/50 flex items-center justify-center z-[200] p-4';
  modal.innerHTML = `
    <div class="modal-content bg-white dark:bg-gray-800 rounded-2xl shadow-2xl p-6 max-w-md w-full animate-in fade-in zoom-in duration-200">
      <div class="modal-header flex items-center justify-between mb-6">
        <h3 class="text-xl font-bold text-gray-900 dark:text-white">Preferences</h3>
        <button class="modal-close p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-full transition-colors text-gray-500">✕</button>
      </div>

      <div class="space-y-5">
        <div class="form-group">
          <label class="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">Avatar Emoji</label>
          <input type="text" value="${user.avatar_emoji || ''}" maxlength="2"
            class="pref-avatar w-full px-4 py-2.5 border border-gray-200 dark:border-gray-700 rounded-xl dark:bg-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none transition-all">
        </div>

        <div class="form-group">
          <label class="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">Status</label>
          <select class="pref-status w-full px-4 py-2.5 border border-gray-200 dark:border-gray-700 rounded-xl dark:bg-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none transition-all">
            <option value="online" ${user.status === 'online' ? 'selected' : ''}>Online</option>
            <option value="away" ${user.status === 'away' ? 'selected' : ''}>Away</option>
            <option value="offline" ${user.status === 'offline' ? 'selected' : ''}>Offline</option>
          </select>
        </div>

        <div class="form-group">
          <label class="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">Theme</label>
          <select class="pref-theme w-full px-4 py-2.5 border border-gray-200 dark:border-gray-700 rounded-xl dark:bg-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none transition-all">
            <option value="light" ${user.preferences?.theme === 'light' ? 'selected' : ''}>Light</option>
            <option value="dark" ${user.preferences?.theme === 'dark' ? 'selected' : ''}>Dark</option>
            <option value="system" ${user.preferences?.theme === 'system' ? 'selected' : ''}>System</option>
          </select>
        </div>
      </div>

      <div class="mt-8">
        <button class="save-preferences w-full px-4 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold shadow-lg shadow-blue-500/30 transition-all active:scale-[0.98]">
          Save Changes
        </button>
      </div>
    </div>
  `;

  return new Promise((resolve) => {
    const close = () => {
      modal.remove();
      resolve();
    };

    modal.querySelector('.save-preferences').addEventListener('click', async () => {
      const updates = {
        avatar_emoji: modal.querySelector('.pref-avatar').value,
        status: modal.querySelector('.pref-status').value,
        preferences: {
          theme: modal.querySelector('.pref-theme').value
        }
      };

      try {
        await apiFetch('/api/users/me', {
          method: 'PUT',
          body: JSON.stringify(updates)
        });
        window.location.reload();
      } catch (err) {
        console.error('Failed to update preferences:', err);
      }
      close();
    });

    modal.addEventListener('click', (e) => {
      if (e.target.classList.contains('modal-overlay') || e.target.closest('.modal-close')) {
        close();
      }
    });

    document.body.appendChild(modal);
  });
}
