import { setState, state, subscribe } from '../store.js';
import { apiFetch } from '../api.js';

export async function createUserProfileFooter() {
  let user = { name: 'User', status: 'online', avatar_emoji: '👨‍💻' };
  try {
    const res = await apiFetch('/api/users/me');
    if (res.ok) {
      const data = await res.json();
      user = { ...user, ...data?.user };
      user.status = 'online'; // Force online status since the user is active on the site
    }
  } catch (err) {
    console.error('Failed to fetch user profile:', err);
  }

  const element = document.createElement('div');
  element.className = 'user-profile-footer border-t border-gray-100 p-4 mt-auto sticky bottom-0 bg-[#f9f9f9] z-20 transition-all';
  
  const updateUI = (userData) => {
    const hasAdminPerm = state.permissions?.includes('admin.rbac.admin') || false;
    
    element.innerHTML = `
      <div class="relative w-full">
        <button class="user-profile-btn w-full flex items-center gap-3 p-2 rounded-xl hover:bg-white transition-all text-left group/user">
          <span class="user-avatar flex items-center justify-center w-8 h-8 rounded-xl bg-gradient-to-r from-blue-400 to-purple-500 text-white font-semibold text-sm flex-shrink-0 shadow-sm transition-all group-hover/user:scale-110">
            ${userData.avatar_emoji || (userData.name ? userData.name[0] : 'U')}
          </span>
          <div class="user-info flex-1 min-w-0 sidebar-full-only">
            <span class="user-name block font-semibold text-sm text-gray-900 truncate">${userData.name}</span>
            <div class="flex items-center gap-1.5">
              <span class="status-indicator w-2 h-2 rounded-full ${getStatusColor(userData.status)}"></span>
              <span class="user-status block text-xs text-gray-500 capitalize">${userData.status || 'online'}</span>
            </div>
          </div>
        </button>

        <div class="user-menu-dropdown hidden absolute bottom-full left-0 w-full mb-2 bg-white border border-gray-200 rounded-xl shadow-xl z-50 overflow-hidden">
          ${hasAdminPerm ? `
            <button data-action="admin" class="menu-item flex items-center gap-3 w-full text-left px-4 py-2.5 text-sm hover:bg-gray-100 transition-colors text-gray-700">
              <span>🛡️</span> Admin Panel
            </button>
            <hr class="border-gray-100">
          ` : ''}
          <button data-action="profile" class="menu-item flex items-center gap-3 w-full text-left px-4 py-2.5 text-sm hover:bg-gray-100 transition-colors text-gray-700">
            <span>👤</span> Profile
          </button>
          <button data-action="preferences" class="menu-item flex items-center gap-3 w-full text-left px-4 py-2.5 text-sm hover:bg-gray-100 transition-colors text-gray-700">
            <span>⚙️</span> Preferences
          </button>
          <hr class="border-gray-100">
          <button data-action="logout" class="menu-item flex items-center gap-3 w-full text-left px-4 py-2.5 text-sm text-red-600 hover:bg-red-50 transition-colors">
            <span>🚪</span> Logout
          </button>
        </div>
      </div>
    `;

    const btn = element.querySelector('.user-profile-btn');
    const menu = element.querySelector('.user-menu-dropdown');

    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      menu.classList.toggle('hidden');
    });

    element.addEventListener('click', async (e) => {
      const actionBtn = e.target.closest('button[data-action]');
      if (!actionBtn) return;
      
      const action = actionBtn.dataset.action;
      if (action === 'admin') {
          showAdminModal();
      } else if (action === 'profile') {
          // Implement profile modal
          console.log('Profile action');
      } else if (action === 'preferences') {
          await showPreferencesModal(userData);
      } else if (action === 'logout') {
          localStorage.removeItem('growchat_auth');
          window.location.href = '/auth.html';
      }
      menu.classList.add('hidden');
    });
  };

  updateUI(user);

  // Close menu on outside click
  document.addEventListener('click', (e) => {
    if (!element.contains(e.target)) {
      const menu = element.querySelector('.user-menu-dropdown');
      if (menu) menu.classList.add('hidden');
    }
  });

  return element;
}

function showAdminModal() {
  const modal = document.createElement('div');
  modal.className = 'modal-overlay fixed inset-0 bg-black/50 flex items-center justify-center z-[200] p-4';
  modal.innerHTML = `
    <div class="modal-content bg-white dark:bg-gray-800 rounded-2xl shadow-2xl p-6 max-w-md w-full animate-in fade-in zoom-in duration-200">
      <div class="modal-header flex items-center justify-between mb-6">
        <h3 class="text-xl font-bold text-gray-900 dark:text-white">Admin Panel</h3>
        <button class="modal-close p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-full transition-colors text-gray-500">✕</button>
      </div>

      <div class="flex flex-col items-center justify-center py-10">
        <div class="w-16 h-16 rounded-full bg-orange-100 flex items-center justify-center mb-4 text-orange-600">
          <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><path d="M12 9v4"/><path d="M12 17h.01"/></svg>
        </div>
        <h3 class="text-lg font-semibold text-gray-800 dark:text-white mb-2">Backend api not found</h3>
        <p class="text-sm text-gray-500 text-center">The RBAC admin interface is currently being integrated with the backend.</p>
      </div>

      <div class="mt-8">
        <button class="modal-close w-full px-4 py-3 bg-gray-100 hover:bg-gray-200 text-gray-800 rounded-xl font-bold transition-all active:scale-[0.98]">
          Close
        </button>
      </div>
    </div>
  `;

  const close = () => modal.remove();
  modal.querySelectorAll('.modal-close').forEach(b => b.onclick = close);
  modal.onclick = (e) => { if (e.target === modal) close(); };
  document.body.appendChild(modal);
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
          // Update global state if needed or trigger a reload
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
