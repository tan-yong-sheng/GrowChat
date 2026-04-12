import { apiFetch } from '../api.js';
import { state, subscribe } from '../store.js';
import { clearModalHash, setModalHash } from '../utils/modal-hash.js';
import { suspendSidebarVisibility, restoreSidebarVisibility } from '../utils/sidebar-visibility.js';
import {
  buildFooterMarkup,
  computePresence,
  getStatusColor,
} from './user-profile-footer-helpers.js';

const ACTIVITY_EVENTS = ['pointerdown', 'pointermove', 'keydown', 'focus', 'visibilitychange'];

async function renderAdminRoute() {
  const { renderAdminPage } = await import('../../features/admin/admin.js');
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

function renderAdminSkeleton() {
  const app = document.getElementById('app');
  if (!app) return;
  app.innerHTML = `
    <div class="min-h-screen bg-[#fafafa] text-gray-900">
      <div class="max-w-6xl mx-auto px-4 py-6">
        <div class="grid grid-cols-1 lg:grid-cols-[260px_1fr] gap-4">
          <div class="bg-white border border-gray-100 rounded-2xl p-4 animate-pulse">
            <div class="h-4 w-28 bg-gray-200 rounded mb-4"></div>
            <div class="space-y-3">
              <div class="h-3 w-32 bg-gray-200 rounded"></div>
              <div class="h-3 w-36 bg-gray-200 rounded"></div>
              <div class="h-3 w-24 bg-gray-200 rounded"></div>
            </div>
            <div class="mt-6 h-3 w-20 bg-gray-200 rounded"></div>
          </div>
          <div class="bg-white border border-gray-100 rounded-2xl p-6 animate-pulse">
            <div class="h-5 w-44 bg-gray-200 rounded mb-4"></div>
            <div class="space-y-3">
              <div class="h-3 w-full bg-gray-200 rounded"></div>
              <div class="h-3 w-11/12 bg-gray-200 rounded"></div>
              <div class="h-3 w-10/12 bg-gray-200 rounded"></div>
            </div>
            <div class="mt-6 h-3 w-32 bg-gray-200 rounded"></div>
          </div>
        </div>
      </div>
    </div>
  `;
}

async function showPreferencesModal(user) {
  let sidebarSuspended = false;
  suspendSidebarVisibility();
  sidebarSuspended = true;
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
          <input type="text" value="${user.avatar_emoji || ''}" maxlength="2" class="pref-avatar w-full px-4 py-2.5 border border-gray-200 dark:border-gray-700 rounded-xl dark:bg-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none transition-all">
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
      if (sidebarSuspended) {
        restoreSidebarVisibility();
        sidebarSuspended = false;
      }
      clearModalHash('preferences-modal');
      resolve();
    };

    modal.querySelector('.save-preferences').addEventListener('click', async () => {
      const updates = {
        avatar_emoji: modal.querySelector('.pref-avatar').value,
        status: modal.querySelector('.pref-status').value,
        preferences: {
          theme: modal.querySelector('.pref-theme').value,
        },
      };

      try {
        await apiFetch('/api/users/me', {
          method: 'PUT',
          body: JSON.stringify(updates),
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
    setModalHash('preferences-modal');
  });
}

export async function createUserProfileFooter({
  guardNavigation = null,
} = {}) {
  const storedUser = getStoredAuthUser();
  let user = {
    name: storedUser?.name || 'User',
    status: storedUser?.status || 'away',
    avatar_emoji: storedUser?.avatar_emoji || (storedUser?.name ? storedUser.name[0] : 'U'),
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
    const hasAdminPermNow = state.permissions?.includes('admin.rbac.admin') || false;
    element.innerHTML = buildFooterMarkup(user, hasAdminPermNow);
    bindFooterNodes();
  }

  bindFooterNodes();

  element.addEventListener('click', async (e) => {
    const actionBtn = e.target.closest('button[data-action]');
    if (!actionBtn) return;

    const action = actionBtn.dataset.action;
    if (action === 'admin') {
      if (typeof guardNavigation === 'function') {
        const allowed = await guardNavigation();
        if (!allowed) return;
      }
      window.history.pushState({}, '', '/admin/users/overview');
      renderAdminSkeleton();
      await renderAdminRoute();
    } else if (action === 'status') {
      await showPreferencesModal({ ...user, status: computePresence(lastActiveAt) });
    } else if (action === 'profile') {
      if (typeof guardNavigation === 'function') {
        const allowed = await guardNavigation();
        if (!allowed) return;
      }
      window.dispatchEvent(new CustomEvent('growchat:open-account-settings', {
        detail: { section: 'connections' },
      }));
    } else if (action === 'preferences') {
      if (typeof guardNavigation === 'function') {
        const allowed = await guardNavigation();
        if (!allowed) return;
      }
      window.dispatchEvent(new CustomEvent('growchat:open-account-settings', {
        detail: { section: 'connections' },
      }));
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


