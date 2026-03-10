import { apiFetch } from '../../../api.js';

function roleBadgeClass(role) {
  if (role === 'admin') return 'bg-blue-100 text-blue-700';
  if (role === 'user') return 'bg-green-100 text-green-700';
  if (role === 'inactive') return 'bg-gray-200 text-gray-600';
  return 'bg-gray-100 text-gray-700';
}

function timeSince(timestampMs) {
  if (!timestampMs) return 'N/A';
  const seconds = Math.floor((Date.now() - timestampMs) / 1000);
  const buckets = [
    [31536000, 'year'],
    [2592000, 'month'],
    [86400, 'day'],
    [3600, 'hour'],
    [60, 'minute'],
  ];
  for (const [size, label] of buckets) {
    const value = Math.floor(seconds / size);
    if (value >= 1) return `${value} ${label}${value > 1 ? 's' : ''} ago`;
  }
  return `${Math.max(seconds, 0)} seconds ago`;
}

function getActionError(payload, fallback) {
  return payload?.error || payload?.message || fallback;
}

export function renderUserOverview(container, data, onReload) {
  const users = data.users || [];
  const total = data.total || users.length;

  async function updateRole(userId, role) {
    const res = await apiFetch(`/api/admin/users/${userId}`, {
      method: 'PUT',
      body: JSON.stringify({ role })
    });
    const payload = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(getActionError(payload, `Failed to update user (${res.status})`));
    }
    await onReload();
  }

  async function deactivateUser(userId) {
    const res = await apiFetch(`/api/admin/users/${userId}`, { method: 'DELETE' });
    const payload = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(getActionError(payload, `Failed to deactivate user (${res.status})`));
    }
    await onReload();
  }

  container.innerHTML = `
    <div class="flex flex-col h-full animate-in fade-in duration-300">
      <div class="pt-0.5 pb-2.5 flex justify-between items-center sticky top-0 z-10 bg-white">
        <div class="flex items-center text-xl font-medium px-0.5 gap-2">
          <div class="flex-shrink-0 text-gray-900">Users</div>
          <div class="text-gray-500 font-normal ml-0.5">${total}</div>
        </div>
        <div class="flex items-center gap-1.5 bg-gray-50/50 px-3 py-1.5 rounded-xl border border-gray-100/30 w-64">
          <div class="flex-shrink-0 text-gray-400">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="w-4 h-4">
              <path fill-rule="evenodd" d="M9 3.5a5.5 5.5 0 100 11 5.5 5.5 0 000-11zM2 9a7 7 0 1112.452 4.391l3.328 3.329a.75.75 0 11-1.06 1.06l-3.329-3.328A7 7 0 012 9z" clip-rule="evenodd" />
            </svg>
          </div>
          <input class="w-full text-sm outline-none bg-transparent text-gray-700 placeholder-gray-400" placeholder="Search" id="user-search-input">
        </div>
      </div>
      <div class="relative overflow-hidden w-full rounded-3xl border border-gray-100">
        <table class="w-full text-sm text-left text-gray-500 table-fixed">
          <thead class="text-[11px] text-gray-900 font-bold uppercase bg-gray-50/50">
            <tr class="border-b border-gray-100">
              <th scope="col" class="px-3 py-3 w-24">Role</th>
              <th scope="col" class="px-3 py-3 w-1/4">Name</th>
              <th scope="col" class="px-3 py-3 w-1/3">Email</th>
              <th scope="col" class="px-3 py-3 w-24">Last Active</th>
              <th scope="col" class="px-3 py-3 w-28">Created At</th>
              <th scope="col" class="px-3 py-3 w-24 text-right"></th>
            </tr>
          </thead>
          <tbody class="divide-y divide-gray-50/50">
            ${users.map((u) => `
              <tr class="bg-white text-xs hover:bg-gray-50/50 transition-colors">
                <td class="px-3 py-4 whitespace-nowrap">
                  <button class="btn-change-role" data-user-id="${u.id}" data-user-role="${u.role}" data-user-name="${u.name}">
                    <span class="px-2 py-0.5 rounded-md text-[10px] font-bold ${roleBadgeClass(u.role)} uppercase">${u.role}</span>
                  </button>
                </td>
                <td class="px-3 py-4 font-medium text-gray-900 overflow-hidden">
                  <div class="flex items-center gap-2.5 min-w-0">
                    <div class="w-7 h-7 rounded-full bg-gray-100 flex items-center justify-center text-[10px] font-bold text-gray-600 overflow-hidden shrink-0">
                      ${u.avatar ? `<img class="w-full h-full object-cover" src="${u.avatar}" alt="">` : (u.name ? u.name.split(' ').map((n) => n[0]).join('').toUpperCase().substring(0, 2) : '??')}
                    </div>
                    <div class="truncate">${u.name}</div>
                  </div>
                </td>
                <td class="px-3 py-4 text-gray-500 truncate" title="${u.email}">${u.email}</td>
                <td class="px-3 py-4 text-gray-400 font-normal uppercase text-[10px] whitespace-nowrap">${u.last_active_at ? timeSince(u.last_active_at * 1000) : 'N/A'}</td>
                <td class="px-3 py-4 text-gray-400 font-normal text-[10px] whitespace-nowrap">${u.created_at ? new Date(u.created_at * 1000).toLocaleDateString() : 'N/A'}</td>
                <td class="px-3 py-4 text-right whitespace-nowrap">
                  <div class="flex justify-end items-center gap-1">
                    <button class="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors btn-user-chats" data-user-id="${u.id}" title="Chats">
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="size-4">
                        <path fill-rule="evenodd" d="M10 2c-2.236 0-4.43.18-6.57.524C2.337 2.69 1 3.845 1 5.25v5.5c0 1.405 1.337 2.56 2.43 2.726a31.501 31.501 0 0 0 6.57.524c2.236 0 4.43-.18 6.57-.524 1.093-.166 2.43-1.321 2.43-2.726v-5.5c0-1.405-1.337-2.56-2.43-2.726A31.498 31.498 0 0 0 10 2Z" clip-rule="evenodd" />
                      </svg>
                    </button>
                    <button class="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors btn-edit-user" data-user-id="${u.id}" title="Edit User">
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="size-4">
                        <path d="m2.695 14.763-1.262 3.154a.5.5 0 0 0 .65.65l3.154-1.262a.5.5 0 0 0 .145-.11l10.19-10.192-2.877-2.878L2.805 14.618a.5.5 0 0 0-.11.145Z" />
                        <path d="M15.53 3.47a.75.75 0 0 1 1.06 0l1.44 1.44a.75.75 0 0 1 0 1.06l-1.44 1.44-2.5-2.5 1.44-1.44Z" />
                      </svg>
                    </button>
                    <button class="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors btn-delete-user" data-user-id="${u.id}" data-user-name="${u.name}" title="Deactivate User">
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="size-4">
                        <path fill-rule="evenodd" d="M8.75 1A2.75 2.75 0 0 0 6 3.75V4H5a2 2 0 0 0-2 2v.5a.5.5 0 0 0 .5.5h13a.5.5 0 0 0 .5-.5V6a2 2 0 0 0-2-2h-1v-.25A2.75 2.75 0 0 0 11.25 1h-2.5ZM8 4h4v-.25A1.25 1.25 0 0 0 10.75 2.5h-1.5A1.25 1.25 0 0 0 8 3.75V4ZM5 8.5V17a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2V8.5h-10Z" clip-rule="evenodd" />
                      </svg>
                    </button>
                  </div>
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
      <div class="text-gray-400 text-[11px] mt-6 flex items-center justify-end gap-1.5 px-0.5">
        <span>ⓘ</span>
        <span>Click the role badge to promote or demote a user.</span>
      </div>
    </div>
  `;

  container.querySelectorAll('.btn-change-role').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const currentRole = btn.dataset.userRole;
      const userName = btn.dataset.userName;
      const nextRole = currentRole === 'admin' ? 'user' : 'admin';
      if (!window.confirm(`Change role for ${userName} to ${nextRole.toUpperCase()}?`)) return;
      try {
        await updateRole(btn.dataset.userId, nextRole);
      } catch (err) {
        window.alert(err.message);
      }
    });
  });

  container.querySelectorAll('.btn-delete-user').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const userName = btn.dataset.userName;
      if (!window.confirm(`Deactivate ${userName}?`)) return;
      try {
        await deactivateUser(btn.dataset.userId);
      } catch (err) {
        window.alert(err.message);
      }
    });
  });

  container.querySelectorAll('.btn-user-chats').forEach((btn) => {
    btn.addEventListener('click', () => {
      window.alert('User chat drill-down is not implemented yet.');
    });
  });

  container.querySelectorAll('.btn-edit-user').forEach((btn) => {
    btn.addEventListener('click', () => {
      window.alert('Inline user editing is not implemented yet.');
    });
  });

  const searchInput = container.querySelector('#user-search-input');
  searchInput?.addEventListener('input', (e) => {
    const query = String(e.target.value || '').toLowerCase();
    const rows = container.querySelectorAll('tbody tr');
    rows.forEach((row) => {
      const text = row.textContent.toLowerCase();
      row.style.display = text.includes(query) ? '' : 'none';
    });
  });
}
