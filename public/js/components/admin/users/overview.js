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

function renderUserRows(users) {
  return users.map((u) => `
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
          <button class="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors btn-edit-user" data-user-id="${u.id}" data-user-name="${u.name}" data-user-email="${u.email}" data-user-role="${u.role}" title="Edit User">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="size-4">
              <path d="m2.695 14.763-1.262 3.154a.5.5 0 0 0 .65.65l3.154-1.262a.5.5 0 0 0 .145-.11l10.19-10.192-2.877-2.878L2.805 14.618a.5.5 0 0 0-.11.145Z" />
              <path d="M15.53 3.47a.75.75 0 0 1 1.06 0l1.44 1.44a.75.75 0 0 1 0 1.06l-1.44 1.44-2.5-2.5 1.44-1.44Z" />
            </svg>
          </button>
          <button class="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors btn-delete-user" data-user-id="${u.id}" data-user-name="${u.name}" title="Delete User">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="size-4">
              <path fill-rule="evenodd" d="M8.75 1A2.75 2.75 0 0 0 6 3.75V4H5a2 2 0 0 0-2 2v.5a.5.5 0 0 0 .5.5h13a.5.5 0 0 0 .5-.5V6a2 2 0 0 0-2-2h-1v-.25A2.75 2.75 0 0 0 11.25 1h-2.5ZM8 4h4v-.25A1.25 1.25 0 0 0 10.75 2.5h-1.5A1.25 1.25 0 0 0 8 3.75V4ZM5 8.5V17a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2V8.5h-10Z" clip-rule="evenodd" />
            </svg>
          </button>
        </div>
      </td>
    </tr>
  `).join('');
}

function renderLoadingRows(count = 10) {
  return Array.from({ length: count }, () => `
    <tr class="bg-white text-xs animate-pulse">
      <td class="px-3 py-4"><div class="h-5 w-14 rounded bg-gray-100"></div></td>
      <td class="px-3 py-4"><div class="flex items-center gap-2.5"><div class="w-7 h-7 rounded-full bg-gray-100"></div><div class="h-4 w-28 rounded bg-gray-100"></div></div></td>
      <td class="px-3 py-4"><div class="h-4 w-40 rounded bg-gray-100"></div></td>
      <td class="px-3 py-4"><div class="h-4 w-16 rounded bg-gray-100"></div></td>
      <td class="px-3 py-4"><div class="h-4 w-14 rounded bg-gray-100"></div></td>
      <td class="px-3 py-4"><div class="ml-auto h-8 w-20 rounded bg-gray-100"></div></td>
    </tr>
  `).join('');
}

function renderAddUserModal() {
  return `
    <div id="add-user-modal" class="fixed inset-0 z-[140] bg-black/30 backdrop-blur-sm flex items-center justify-center p-4">
      <div class="w-full max-w-lg rounded-[1.5rem] bg-white shadow-2xl border border-gray-100 overflow-hidden">
        <div class="flex items-center justify-between px-5 pt-5 pb-3">
          <div>
            <h3 class="text-xl font-semibold text-gray-900">Add User</h3>
          </div>
          <button type="button" data-close-add-user class="p-2 text-gray-400 hover:text-gray-600 rounded-lg">
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
          </button>
        </div>
        <div class="px-5 pb-5">
          <div class="flex items-center gap-5 border-b border-gray-100 mb-4">
            <button type="button" data-add-user-tab="form" class="pb-3 text-base font-medium text-gray-900 border-b-2 border-gray-900">Form</button>
            <button type="button" data-add-user-tab="csv" class="pb-3 text-base font-medium text-gray-400 border-b-2 border-transparent">CSV Import</button>
          </div>
          <form id="add-user-form" class="space-y-3.5">
            <label class="block">
              <span class="block text-sm text-gray-400 mb-2">Role</span>
              <select name="role" class="w-full rounded-xl border border-gray-200 px-4 py-2.5 text-sm text-gray-900 outline-none focus:ring-1 focus:ring-gray-300 bg-white">
                <option value="user">User</option>
                <option value="admin">Admin</option>
                <option value="inactive">Inactive</option>
              </select>
            </label>
            <label class="block">
              <span class="block text-sm text-gray-400 mb-2">Name</span>
              <input name="name" type="text" class="w-full rounded-xl border border-gray-200 px-4 py-2.5 text-sm text-gray-900 outline-none focus:ring-1 focus:ring-gray-300" placeholder="Enter Your Full Name" required>
            </label>
            <label class="block">
              <span class="block text-sm text-gray-400 mb-2">Email</span>
              <input name="email" type="email" class="w-full rounded-xl border border-gray-200 px-4 py-2.5 text-sm text-gray-900 outline-none focus:ring-1 focus:ring-gray-300" placeholder="Enter Your Email" required>
            </label>
            <label class="block">
              <span class="block text-sm text-gray-400 mb-2">Password</span>
              <input name="password" type="password" class="w-full rounded-xl border border-gray-200 px-4 py-2.5 text-sm text-gray-900 outline-none focus:ring-1 focus:ring-gray-300" placeholder="Enter Your Password" minlength="8" required>
            </label>
            <div id="add-user-error" class="hidden rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-600"></div>
            <div class="flex justify-end pt-2">
              <button type="submit" class="rounded-full bg-black text-white px-5 py-2 text-sm font-semibold hover:bg-gray-800 transition-colors">Save</button>
            </div>
          </form>
          <form id="add-user-csv-form" class="space-y-4 hidden">
            <label class="block">
              <span class="block text-sm text-gray-400 mb-2">CSV Content</span>
              <textarea name="csv" rows="7" class="w-full rounded-xl border border-gray-200 px-4 py-3 text-sm text-gray-900 outline-none focus:ring-1 focus:ring-gray-300 resize-none" placeholder="Name,Email,Password,Role&#10;Jane Doe,jane@example.com,Password123,user&#10;John Admin,john@example.com,Password123,admin"></textarea>
            </label>
            <div class="rounded-xl border border-gray-100 bg-gray-50 px-4 py-3 text-sm text-gray-500">
              CSV order: <span class="font-medium text-gray-700">Name, Email, Password, Role</span>
            </div>
            <div id="add-user-csv-error" class="hidden rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-600"></div>
            <div id="add-user-csv-result" class="hidden rounded-xl border border-gray-100 bg-gray-50 px-4 py-3 text-sm text-gray-600 max-h-48 overflow-auto"></div>
            <div class="flex justify-end pt-2">
              <button type="submit" class="rounded-full bg-black text-white px-5 py-2 text-sm font-semibold hover:bg-gray-800 transition-colors">Save</button>
            </div>
          </form>
        </div>
      </div>
    </div>
  `;
}

function renderEditUserModal(user) {
  return `
    <div id="edit-user-modal" class="fixed inset-0 z-[140] bg-black/30 backdrop-blur-sm flex items-center justify-center p-4">
      <div class="w-full max-w-lg rounded-[1.5rem] bg-white shadow-2xl border border-gray-100 overflow-hidden">
        <div class="flex items-center justify-between px-5 pt-5 pb-3">
          <div>
            <h3 class="text-xl font-semibold text-gray-900">Edit User</h3>
          </div>
          <button type="button" data-close-edit-user class="p-2 text-gray-400 hover:text-gray-600 rounded-lg">
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
          </button>
        </div>
        <form id="edit-user-form" class="px-5 pb-5 space-y-3.5">
          <label class="block">
            <span class="block text-sm text-gray-400 mb-2">Role</span>
            <select name="role" class="w-full rounded-xl border border-gray-200 px-4 py-2.5 text-sm text-gray-900 outline-none focus:ring-1 focus:ring-gray-300 bg-white">
              <option value="user" ${user.role === 'user' ? 'selected' : ''}>User</option>
              <option value="admin" ${user.role === 'admin' ? 'selected' : ''}>Admin</option>
              <option value="inactive" ${user.role === 'inactive' ? 'selected' : ''}>Inactive</option>
            </select>
          </label>
          <label class="block">
            <span class="block text-sm text-gray-400 mb-2">Name</span>
            <input name="name" type="text" value="${user.name || ''}" class="w-full rounded-xl border border-gray-200 px-4 py-2.5 text-sm text-gray-900 outline-none focus:ring-1 focus:ring-gray-300" required>
          </label>
          <label class="block">
            <span class="block text-sm text-gray-400 mb-2">Email</span>
            <input name="email" type="email" value="${user.email || ''}" class="w-full rounded-xl border border-gray-200 px-4 py-2.5 text-sm text-gray-900 outline-none focus:ring-1 focus:ring-gray-300" required>
          </label>
          <label class="block">
            <span class="block text-sm text-gray-400 mb-2">New Password</span>
            <input name="password" type="password" class="w-full rounded-xl border border-gray-200 px-4 py-2.5 text-sm text-gray-900 outline-none focus:ring-1 focus:ring-gray-300" minlength="8" placeholder="Leave blank to keep current password">
          </label>
          <div id="edit-user-error" class="hidden rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-600"></div>
          <div class="flex justify-end pt-2">
            <button type="submit" class="rounded-full bg-black text-white px-5 py-2 text-sm font-semibold hover:bg-gray-800 transition-colors">Save Changes</button>
          </div>
        </form>
      </div>
    </div>
  `;
}

export function renderUserOverview(container, data, actions) {
  const uiState = data.userOverviewUi || (data.userOverviewUi = {
    query: '',
    pending: {},
  });

  container.innerHTML = `
    <div class="flex flex-col h-full min-h-0 animate-in fade-in duration-300">
      <div class="pt-0.5 pb-2.5 flex justify-between items-center sticky top-0 z-10 bg-white">
        <div class="flex items-center text-xl font-medium px-0.5 gap-2">
          <div class="flex-shrink-0 text-gray-900">Users</div>
          <div class="text-gray-500 font-normal ml-0.5" id="users-total-count"></div>
        </div>
        <div class="flex items-center gap-3">
          <div class="flex items-center gap-1.5 bg-gray-50/50 px-3 py-1.5 rounded-xl border border-gray-100/30 w-64">
            <div class="flex-shrink-0 text-gray-400">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="w-4 h-4">
                <path fill-rule="evenodd" d="M9 3.5a5.5 5.5 0 100 11 5.5 5.5 0 000-11zM2 9a7 7 0 1112.452 4.391l3.328 3.329a.75.75 0 11-1.06 1.06l-3.329-3.328A7 7 0 012 9z" clip-rule="evenodd" />
              </svg>
            </div>
            <input class="w-full text-sm outline-none bg-transparent text-gray-700 placeholder-gray-400" placeholder="Search" id="user-search-input">
          </div>
          <button id="open-add-user-modal" class="w-10 h-10 rounded-xl text-gray-500 hover:text-gray-700 hover:bg-gray-100 transition-colors flex items-center justify-center" title="Add User">
            <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v14"></path><path d="M5 12h14"></path></svg>
          </button>
        </div>
      </div>
      <div class="relative flex-1 min-h-0 overflow-hidden w-full rounded-3xl border border-gray-100 bg-white">
        <div class="h-full overflow-auto">
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
            <tbody id="users-table-body" class="divide-y divide-gray-50/50"></tbody>
          </table>
        </div>
      </div>
      <div class="flex items-center justify-between gap-4 py-4 px-0.5 text-sm text-gray-500">
        <div class="flex items-center gap-3">
          <span>Show</span>
          <select id="users-page-size" class="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 outline-none focus:ring-1 focus:ring-gray-300">
            <option value="20">20</option>
            <option value="50">50</option>
            <option value="100">100</option>
          </select>
          <span>per page</span>
        </div>
        <div class="flex items-center gap-4">
          <div class="text-xs text-gray-400" id="users-page-range"></div>
          <div class="flex items-center gap-2">
            <button id="users-page-prev" class="px-3 py-2 rounded-lg border border-gray-200 hover:bg-gray-50 disabled:opacity-50">Prev</button>
            <div class="text-sm text-gray-600" id="users-page-label"></div>
            <button id="users-page-next" class="px-3 py-2 rounded-lg border border-gray-200 hover:bg-gray-50 disabled:opacity-50">Next</button>
          </div>
        </div>
      </div>
      <div class="text-gray-400 text-[11px] flex items-center justify-end gap-1.5 px-0.5">
        <span>ⓘ</span>
        <span>Admins are listed first, then all users are sorted alphabetically.</span>
      </div>
    </div>
  `;

  const searchInput = container.querySelector('#user-search-input');
  const tbody = container.querySelector('#users-table-body');
  const totalCount = container.querySelector('#users-total-count');
  const pageRange = container.querySelector('#users-page-range');
  const pageLabel = container.querySelector('#users-page-label');
  const prevButton = container.querySelector('#users-page-prev');
  const nextButton = container.querySelector('#users-page-next');
  const pageSizeSelect = container.querySelector('#users-page-size');

  function getPendingKey(type, userId) {
    return `${type}:${userId}`;
  }

  function setPending(type, userId, value) {
    uiState.pending[getPendingKey(type, userId)] = value;
    syncPendingState();
  }

  function isPending(type, userId) {
    return Boolean(uiState.pending[getPendingKey(type, userId)]);
  }

  function applySearchFilter() {
    const query = String(uiState.query || '').toLowerCase();
    tbody.querySelectorAll('tr').forEach((row) => {
      const text = row.textContent.toLowerCase();
      row.style.display = text.includes(query) ? '' : 'none';
    });
  }

  function syncPendingState() {
    tbody.querySelectorAll('.btn-change-role').forEach((btn) => {
      btn.disabled = isPending('role', btn.dataset.userId);
      btn.classList.toggle('opacity-50', btn.disabled);
      btn.classList.toggle('pointer-events-none', btn.disabled);
    });
    tbody.querySelectorAll('.btn-edit-user').forEach((btn) => {
      btn.disabled = isPending('edit', btn.dataset.userId);
      btn.classList.toggle('opacity-50', btn.disabled);
      btn.classList.toggle('pointer-events-none', btn.disabled);
    });
    tbody.querySelectorAll('.btn-delete-user').forEach((btn) => {
      btn.disabled = isPending('delete', btn.dataset.userId);
      btn.classList.toggle('opacity-50', btn.disabled);
      btn.classList.toggle('pointer-events-none', btn.disabled);
    });
  }

  function bindRowActions() {
    tbody.querySelectorAll('.btn-change-role').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const currentRole = btn.dataset.userRole;
        const userName = btn.dataset.userName;
        const nextRole = currentRole === 'admin' ? 'user' : 'admin';
        if (!window.confirm(`Change role for ${userName} to ${nextRole.toUpperCase()}?`)) return;
        setPending('role', btn.dataset.userId, true);
        try {
          const res = await apiFetch(`/api/admin/users/${btn.dataset.userId}`, {
            method: 'PUT',
            body: JSON.stringify({ role: nextRole })
          });
          const payload = await res.json().catch(() => ({}));
          if (!res.ok) {
            throw new Error(getActionError(payload, `Failed to update user (${res.status})`));
          }
          actions.updateUser(payload.user);
        } catch (err) {
          window.alert(err.message);
        } finally {
          setPending('role', btn.dataset.userId, false);
        }
      });
    });

    tbody.querySelectorAll('.btn-delete-user').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const userName = btn.dataset.userName;
        if (!window.confirm(`Delete user ${userName}? This will deactivate the account.`)) return;
        setPending('delete', btn.dataset.userId, true);
        try {
          const res = await apiFetch(`/api/admin/users/${btn.dataset.userId}`, { method: 'DELETE' });
          const payload = await res.json().catch(() => ({}));
          if (!res.ok) {
            throw new Error(getActionError(payload, `Failed to deactivate user (${res.status})`));
          }
          actions.removeUser(btn.dataset.userId);
        } catch (err) {
          window.alert(err.message);
        } finally {
          setPending('delete', btn.dataset.userId, false);
        }
      });
    });

    tbody.querySelectorAll('.btn-edit-user').forEach((btn) => {
      btn.addEventListener('click', async () => {
        try {
          const user = {
            id: btn.dataset.userId,
            name: btn.dataset.userName || '',
            email: btn.dataset.userEmail || '',
            role: btn.dataset.userRole || 'user',
          };
          document.body.insertAdjacentHTML('beforeend', renderEditUserModal(user));

          const modal = document.getElementById('edit-user-modal');
          const form = document.getElementById('edit-user-form');
          const errorBox = document.getElementById('edit-user-error');
          const close = () => modal?.remove();

          modal?.addEventListener('click', (e) => {
            if (e.target === modal || e.target.closest('[data-close-edit-user]')) {
              close();
            }
          });

          form?.addEventListener('submit', async (e) => {
            e.preventDefault();
            errorBox?.classList.add('hidden');
            setPending('edit', btn.dataset.userId, true);
            const fd = new FormData(form);
            const payload = {
              role: String(fd.get('role') || 'user'),
              name: String(fd.get('name') || '').trim(),
              email: String(fd.get('email') || '').trim(),
            };
            const password = String(fd.get('password') || '');
            if (password) payload.password = password;

            try {
              const res = await apiFetch(`/api/admin/users/${btn.dataset.userId}`, {
                method: 'PUT',
                body: JSON.stringify(payload)
              });
              const responsePayload = await res.json().catch(() => ({}));
              if (!res.ok) {
                throw new Error(getActionError(responsePayload, `Failed to update user (${res.status})`));
              }
              actions.updateUser(responsePayload.user);
              close();
            } catch (err) {
              if (errorBox) {
                errorBox.textContent = err.message;
                errorBox.classList.remove('hidden');
              }
            } finally {
              setPending('edit', btn.dataset.userId, false);
            }
          });
        } catch (err) {
          window.alert(err.message);
        }
      });
    });
  }

  function updateView() {
    const users = data.users || [];
    const total = data.total || users.length;
    const page = data.pagination?.page || 1;
    const pageSize = data.pagination?.pageSize || 20;
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    const pageStart = total === 0 ? 0 : ((page - 1) * pageSize) + 1;
    const pageEnd = Math.min(page * pageSize, total);

    totalCount.textContent = String(total);
    tbody.innerHTML = data.loading && data.loadingMode === 'table'
      ? renderLoadingRows(Math.min(pageSize, 10))
      : renderUserRows(users);
    pageRange.textContent = `${pageStart}-${pageEnd} of ${total}`;
    pageLabel.textContent = `Page ${page} / ${totalPages}`;
    prevButton.disabled = data.loading || page <= 1;
    nextButton.disabled = data.loading || page >= totalPages;
    pageSizeSelect.disabled = data.loading;
    pageSizeSelect.value = String(pageSize);
    searchInput.value = uiState.query;
    if (!(data.loading && data.loadingMode === 'table')) {
      bindRowActions();
      applySearchFilter();
      syncPendingState();
    }
  }

  searchInput?.addEventListener('input', (e) => {
    uiState.query = String(e.target.value || '');
    applySearchFilter();
  });

  pageSizeSelect?.addEventListener('change', async (e) => {
    data.pagination.pageSize = parseInt(e.target.value, 10);
    data.pagination.page = 1;
    await actions.reload({ preserveContent: true });
  });

  prevButton?.addEventListener('click', async () => {
    if (data.pagination.page <= 1) return;
    data.pagination.page -= 1;
    await actions.reload({ preserveContent: true });
  });

  nextButton?.addEventListener('click', async () => {
    const totalPages = Math.max(1, Math.ceil((data.total || 0) / (data.pagination?.pageSize || 20)));
    if (data.pagination.page >= totalPages) return;
    data.pagination.page += 1;
    await actions.reload({ preserveContent: true });
  });

  container.querySelector('#open-add-user-modal')?.addEventListener('click', () => {
    document.body.insertAdjacentHTML('beforeend', renderAddUserModal());
    const modal = document.getElementById('add-user-modal');
    const form = document.getElementById('add-user-form');
    const csvForm = document.getElementById('add-user-csv-form');
    const errorBox = document.getElementById('add-user-error');
    const csvErrorBox = document.getElementById('add-user-csv-error');
    const csvResultBox = document.getElementById('add-user-csv-result');
    const formTab = modal?.querySelector('[data-add-user-tab="form"]');
    const csvTab = modal?.querySelector('[data-add-user-tab="csv"]');
    const close = () => modal?.remove();

    const setTab = (tab) => {
      const isForm = tab === 'form';
      form?.classList.toggle('hidden', !isForm);
      csvForm?.classList.toggle('hidden', isForm);
      formTab?.classList.toggle('text-gray-900', isForm);
      formTab?.classList.toggle('border-gray-900', isForm);
      formTab?.classList.toggle('text-gray-400', !isForm);
      formTab?.classList.toggle('border-transparent', !isForm);
      csvTab?.classList.toggle('text-gray-900', !isForm);
      csvTab?.classList.toggle('border-gray-900', !isForm);
      csvTab?.classList.toggle('text-gray-400', isForm);
      csvTab?.classList.toggle('border-transparent', isForm);
    };

    formTab?.addEventListener('click', () => setTab('form'));
    csvTab?.addEventListener('click', () => setTab('csv'));

    modal?.addEventListener('click', (e) => {
      if (e.target === modal || e.target.closest('[data-close-add-user]')) {
        close();
      }
    });

    form?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = new FormData(form);
      errorBox?.classList.add('hidden');
      try {
        const res = await apiFetch('/api/admin/users', {
          method: 'POST',
          body: JSON.stringify({
            role: String(fd.get('role') || 'user'),
            name: String(fd.get('name') || '').trim(),
            email: String(fd.get('email') || '').trim(),
            password: String(fd.get('password') || ''),
          })
        });
        const payload = await res.json().catch(() => ({}));
        if (!res.ok) {
          throw new Error(getActionError(payload, `Failed to create user (${res.status})`));
        }
        actions.prependUser(payload.user);
        close();
      } catch (err) {
        if (errorBox) {
          errorBox.textContent = err.message;
          errorBox.classList.remove('hidden');
        }
      }
    });

    csvForm?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = new FormData(csvForm);
      const csv = String(fd.get('csv') || '').trim();
      csvErrorBox?.classList.add('hidden');
      csvResultBox?.classList.add('hidden');

      try {
        const res = await apiFetch('/api/admin/users/import', {
          method: 'POST',
          body: JSON.stringify({ csv })
        });
        const payload = await res.json().catch(() => ({}));
        if (!res.ok) {
          throw new Error(getActionError(payload, `Failed to import users (${res.status})`));
        }
        await actions.reload({ preserveContent: true });
        if (csvResultBox) {
          csvResultBox.textContent = payload.results
            .map((result) => result.ok
              ? `Row ${result.row}: created ${result.email} (${result.role})`
              : `Row ${result.row}: ${result.error}`)
            .join('\n');
          csvResultBox.classList.remove('hidden');
        }
      } catch (err) {
        if (csvErrorBox) {
          csvErrorBox.textContent = err.message;
          csvErrorBox.classList.remove('hidden');
        }
      }
    });
  });

  updateView();
}
