import {
  addGroupMembers,
  createAdminGroup,
  deleteAdminGroup,
  fetchAdminGroup,
  fetchAdminGroups,
  fetchAdminUsers,
  removeGroupMembers,
  updateAdminGroup,
} from '../../../shared/api.js';
import { buildMemberSet, clampUserLimit, diffMemberSets, filterUsers } from './groups-members-helpers.js';
import { formatSortLabel, nextGroupSort, sortGroups } from './groups-list-helpers.js';

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function getGroupModalTheme() {
  return {
    overlay: 'bg-black/25',
    container: 'bg-white text-gray-900 border border-gray-200 shadow-2xl',
    sidebar: 'border-r border-gray-200 bg-white',
    sidebarActive: 'bg-gray-100 text-gray-900',
    sidebarInactive: 'text-gray-500 hover:text-gray-800',
    panelLabel: 'text-gray-600',
    panelText: 'text-gray-900',
    input: 'bg-white border-gray-300 text-gray-900 placeholder:text-gray-400 focus:border-gray-400',
    select: 'bg-white border-gray-300 text-gray-900 focus:border-gray-400',
    footer: 'border-t border-gray-200 bg-white',
  };
}

function renderGroupModal({
  mode,
  group = null,
  members = [],
  users = [],
  usersTotal = 0,
  usersError = null,
  onSave,
  onDelete,
}) {
  const groupId = group?.id || '';
  const isEdit = mode === 'edit';
  const selectedMembers = buildMemberSet(members);
  const originalMembers = buildMemberSet(members);
  const memberState = {
    query: '',
  };
  const allUsers = Array.isArray(users) ? users : [];
  const theme = getGroupModalTheme();
  const overlay = document.createElement('div');
  overlay.id = 'group-modal';
  overlay.className = 'fixed inset-0 z-[140] flex items-center justify-center p-3 sm:p-4';
  overlay.innerHTML = `
    <div class="absolute inset-0 ${theme.overlay}"></div>
    <div class="relative w-full max-w-6xl ${theme.container} rounded-[2.5rem] overflow-hidden flex flex-col max-h-[90vh]">
      <div class="flex items-center justify-between px-4 sm:px-5 py-4 border-b border-gray-100 shrink-0">
        <div class="text-lg font-semibold">${isEdit ? 'Edit User Group' : 'Add User Group'}</div>
        <button class="p-2 rounded-full hover:bg-gray-100 transition" data-close-group-modal>
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="size-4">
            <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
      <div class="flex flex-1 min-h-0 flex-col md:flex-row">
        <div class="w-full md:w-32 lg:w-36 ${theme.sidebar} border-r-0 md:border-r p-3 md:p-3.5 text-sm shrink-0 border-b md:border-b-0">
          <div class="flex flex-wrap md:flex-col gap-2 md:gap-1.5">
            <button class="group-tab flex-1 md:w-full text-left px-3 py-2 rounded-xl transition ${theme.sidebarActive}" data-tab="general">
            <span class="flex items-center gap-2">General</span>
          </button>
            <button class="group-tab flex-1 md:w-full text-left px-3 py-2 rounded-xl transition ${theme.sidebarInactive}" data-tab="members">
            <span class="flex items-center gap-2">Members</span>
          </button>
          </div>
        </div>
        <div class="flex-1 min-h-0 overflow-y-auto p-4 sm:p-5 md:p-6">
          <div data-panel="general" class="space-y-5">
            <div class="space-y-2">
              <label class="text-xs uppercase tracking-wider text-gray-600 font-semibold">Name</label>
              <input id="group-name-input" class="w-full ${theme.input} rounded-2xl px-4 py-3 text-sm outline-none" placeholder="Group Name" value="${group?.name || ''}">
            </div>
            <div class="space-y-2">
              <label class="text-xs uppercase tracking-wider text-gray-600 font-semibold">Description</label>
              <textarea id="group-description-input" rows="3" class="w-full ${theme.input} rounded-2xl px-4 py-3 text-sm outline-none resize-none" placeholder="Group Description">${group?.description || ''}</textarea>
            </div>
          </div>
          <div data-panel="members" class="space-y-4 hidden">
            <div class="flex items-center justify-between">
              <div>
                <div class="text-sm font-semibold text-gray-900">Members</div>
                <div class="text-[11px] text-gray-500" id="members-count"></div>
              </div>
              <div class="text-[11px] text-gray-400">${usersTotal ? `Showing ${Math.min(allUsers.length, usersTotal)} of ${usersTotal}` : ''}</div>
            </div>
            <div class="flex items-center bg-gray-50 border border-gray-200 rounded-2xl px-3 py-2">
              <input id="group-member-search" class="w-full bg-transparent text-sm text-gray-900 placeholder:text-gray-400 outline-none" placeholder="Search users">
            </div>
            <div id="group-members-error" class="text-sm text-red-500 ${usersError ? '' : 'hidden'}">${usersError || ''}</div>
            <div id="group-members-list" class="space-y-2 max-h-64 overflow-y-auto scrollbar-hidden pr-1"></div>
          </div>
        </div>
      </div>
      <div class="px-5 py-3 ${theme.footer} flex items-center justify-between shrink-0">
        <div class="text-sm text-red-600" id="group-modal-error"></div>
        <div class="flex items-center gap-2">
          ${isEdit ? `<button id="group-policies-btn" class="px-4 py-2 text-sm text-gray-600 hover:text-gray-800">Manage Policies</button>` : ''}
          ${isEdit ? '<button id="group-delete-btn" class="px-4 py-2 text-sm text-red-500 hover:text-red-600">Delete</button>' : ''}
          <button id="group-save-btn" class="px-5 py-2 text-sm font-semibold rounded-full bg-gray-900 text-white hover:bg-gray-800">Save</button>
        </div>
      </div>
    </div>
  `;

  const close = () => overlay.remove();
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay || e.target.closest('[data-close-group-modal]')) close();
  });

  const tabButtons = overlay.querySelectorAll('.group-tab');
  tabButtons.forEach((btn) => {
    btn.addEventListener('click', () => {
      const tab = btn.dataset.tab;
      overlay.querySelectorAll('[data-panel]').forEach((panel) => {
        panel.classList.toggle('hidden', panel.dataset.panel !== tab);
      });
      tabButtons.forEach((other) => {
        other.classList.toggle('bg-gray-100', other === btn);
        other.classList.toggle('text-gray-900', other === btn);
        other.classList.toggle('text-gray-500', other !== btn);
      });
    });
  });

  const membersListEl = overlay.querySelector('#group-members-list');
  const membersCountEl = overlay.querySelector('#members-count');
  const membersSearchInput = overlay.querySelector('#group-member-search');

  const renderMembers = () => {
    if (!membersListEl) return;
    const filtered = filterUsers(allUsers, memberState.query);
    if (!filtered.length) {
      membersListEl.innerHTML = `
        <div class="text-sm text-gray-500 py-6 text-center">No users found.</div>
      `;
    } else {
      membersListEl.innerHTML = filtered.map((user) => {
        const isSelected = selectedMembers.has(user.id);
        const initials = String(user.name || user.email || '?').trim().charAt(0).toUpperCase() || '?';
        const buttonLabel = isSelected ? 'Member' : 'Add';
        const buttonClass = isSelected
          ? 'bg-emerald-500/15 text-emerald-700 border-emerald-500/30'
          : 'bg-gray-100 text-gray-600 border-gray-200 hover:border-gray-300';
        return `
          <div class="flex items-center justify-between gap-3 rounded-2xl border border-gray-200 bg-white px-3 py-2">
            <div class="flex items-center gap-3">
              <div class="w-9 h-9 rounded-full bg-gray-100 flex items-center justify-center text-sm font-semibold text-gray-700">${escapeHtml(initials)}</div>
              <div class="flex flex-col">
                <div class="text-sm font-medium text-gray-900">${escapeHtml(user.name || 'Unknown')}</div>
                <div class="text-[11px] text-gray-500">${escapeHtml(user.email || '')}</div>
              </div>
            </div>
            <button type="button" class="member-toggle text-[11px] font-semibold px-3 py-1 rounded-full border transition ${buttonClass}" data-user-id="${escapeHtml(user.id)}">
              ${buttonLabel}
            </button>
          </div>
        `;
      }).join('');
    }

    if (membersCountEl) {
      membersCountEl.textContent = `${selectedMembers.size} selected`;
    }

    membersListEl.querySelectorAll('.member-toggle').forEach((btn) => {
      btn.addEventListener('click', () => {
        const userId = btn.dataset.userId;
        if (!userId) return;
        if (selectedMembers.has(userId)) {
          selectedMembers.delete(userId);
        } else {
          selectedMembers.add(userId);
        }
        renderMembers();
      });
    });
  };

  if (membersSearchInput) {
    membersSearchInput.addEventListener('input', (e) => {
      memberState.query = e.target.value || '';
      renderMembers();
    });
  }

  renderMembers();

  const showError = (message) => {
    const el = overlay.querySelector('#group-modal-error');
    if (el) el.textContent = message || '';
  };

  overlay.querySelector('#group-save-btn')?.addEventListener('click', async () => {
    const name = overlay.querySelector('#group-name-input')?.value || '';
    const description = overlay.querySelector('#group-description-input')?.value || '';
    const memberIds = Array.from(selectedMembers);
    try {
      await onSave({
        name: name.trim(),
        description: description.trim(),
        member_ids: memberIds,
        original_member_ids: Array.from(originalMembers),
      });
      close();
    } catch (err) {
      showError(err?.message || 'Failed to save group.');
    }
  });

  overlay.querySelector('#group-delete-btn')?.addEventListener('click', async () => {
    if (!group?.id) return;
    try {
      await onDelete?.(group.id);
      close();
    } catch (err) {
      showError(err?.message || 'Failed to delete group.');
    }
  });

  overlay.querySelector('#group-policies-btn')?.addEventListener('click', () => {
    if (!groupId) return;
    window.location.href = `/admin/settings/policies?group=${encodeURIComponent(groupId)}`;
  });

  return overlay;
}

async function openCreateModal({ onRefresh, onCreate }) {
  let users = [];
  let usersTotal = 0;
  let usersError = null;
  try {
    const payload = await fetchAdminUsers({ limit: clampUserLimit(100), offset: 0 });
    users = payload.users || [];
    usersTotal = payload.total || users.length;
  } catch (err) {
    usersError = err.message || 'Unable to load users.';
  }

  const modal = renderGroupModal({
    mode: 'create',
    users,
    usersTotal,
    usersError,
    onSave: async (payload) => {
      if (!payload.name) throw new Error('Group name is required.');
      const created = await createAdminGroup(payload);
      const groupId = created?.group?.id;
      if (groupId && payload.member_ids?.length) {
        await addGroupMembers(groupId, payload.member_ids);
      }
      if (typeof onCreate === 'function') {
        onCreate({
          ...created.group,
          member_count: payload.member_ids?.length || 0,
        });
      } else {
        await onRefresh?.();
      }
    },
  });
  document.body.appendChild(modal);
}

async function openEditModal(groupId, { onRefresh, onUpdate, onDelete, onMemberDelta }) {
  const detail = await fetchAdminGroup(groupId);
  let users = [];
  let usersTotal = 0;
  let usersError = null;
  try {
    const payload = await fetchAdminUsers({ limit: clampUserLimit(100), offset: 0 });
    users = payload.users || [];
    usersTotal = payload.total || users.length;
  } catch (err) {
    usersError = err.message || 'Unable to load users.';
  }
  const modal = renderGroupModal({
    mode: 'edit',
    group: detail.group,
    members: detail.members || [],
    users,
    usersTotal,
    usersError,
    onSave: async (payload) => {
      if (!payload.name) throw new Error('Group name is required.');
      const updated = await updateAdminGroup(groupId, payload);
      const before = new Set(payload.original_member_ids || []);
      const after = new Set(payload.member_ids || []);
      const diff = diffMemberSets(before, after);
      if (diff.add.length) {
        await addGroupMembers(groupId, diff.add);
      }
      if (diff.remove.length) {
        await removeGroupMembers(groupId, diff.remove);
      }
      if (typeof onUpdate === 'function') {
        onUpdate({
          ...updated.group,
        });
      }
      if (typeof onMemberDelta === 'function') {
        onMemberDelta(groupId, diff.add.length - diff.remove.length);
      }
      if (!onUpdate) {
        await onRefresh?.();
      }
    },
    onDelete: async () => {
      await deleteAdminGroup(groupId);
      if (typeof onDelete === 'function') {
        onDelete(groupId);
      } else {
        await onRefresh?.();
      }
    },
  });
  document.body.appendChild(modal);
}

function renderEmptyState() {
  return `
    <div class="w-full flex flex-col justify-center items-center py-16 px-4">
      <div class="flex flex-col items-center max-w-xs text-center">
        <div class="text-4xl mb-4 bg-gray-50 p-6 rounded-[2.5rem] text-blue-500 shadow-inner">
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="size-12">
            <path stroke-linecap="round" stroke-linejoin="round" d="M15 19.128a9.38 9.38 0 0 0 2.625.372 9.337 9.337 0 0 0 4.121-.952 4.125 4.125 0 0 0-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 0 1 8.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0 1 11.964-3.07M12 6.375a3.375 3.375 0 1 1-6.75 0 3.375 3.375 0 0 1 6.75 0Zm8.25 2.25a2.625 2.625 0 1 1-5.25 0 2.625 2.625 0 0 1 5.25 0Z" />
          </svg>
        </div>
        <div class="text-lg font-bold text-gray-900 mb-1.5">No groups found</div>
        <div class="text-gray-500 text-xs leading-relaxed">Use groups to organize your users and manage members.</div>
      </div>
    </div>
  `;
}

export function renderGroupsOverview(container, data, actions = {}) {
  const sortKey = data.groupsSort || 'members';
  const groups = sortGroups(data.groups || [], sortKey);
  const isLoading = data.groupsLoading;
  const error = data.groupsError;

  container.innerHTML = `
    <div class="flex flex-col h-full animate-in fade-in duration-300">
      <div class="flex flex-col gap-1 px-1 mt-1.5 mb-3">
        <div class="flex justify-between items-center">
          <div class="flex items-center md:self-center text-xl font-medium px-0.5 gap-2 shrink-0">
            <div class="text-gray-900">Groups</div>
            <div class="text-lg font-medium text-gray-500">${groups.length}</div>
          </div>
          <div class="flex w-full justify-end gap-1.5">
            <button class="px-4 py-1.5 rounded-full bg-gray-100 text-gray-900 transition-all hover:bg-gray-200 font-semibold text-xs flex items-center shadow-sm" id="create-group-btn">
              <span class="mr-2 text-sm">+</span>
              <span>New Group</span>
            </button>
          </div>
        </div>
      </div>

      <div class="py-2.5 bg-white rounded-[2rem] border border-gray-100/50 shadow-sm overflow-hidden">
        <div class="flex items-center w-full space-x-2 py-1 px-4 mb-1">
          <div class="flex flex-1 items-center bg-gray-50/50 px-3 py-1.5 rounded-xl border border-gray-100/30">
            <div class="text-gray-400 mr-2.5">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="size-3.5">
                <circle cx="11" cy="11" r="8"></circle>
                <path d="m21 21-4.3-4.3"></path>
              </svg>
            </div>
            <input class="w-full text-sm outline-none bg-transparent text-gray-700 placeholder-gray-400" placeholder="Search Groups" id="group-search-input">
            <div id="clear-search-container" class="hidden ml-1.5">
              <button id="clear-search-btn" class="p-0.5 rounded-full hover:bg-gray-200 transition">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2.5" stroke="currentColor" class="size-3">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>
          <button class="relative flex items-center gap-1.5 px-3 py-2 text-sm bg-gray-50/50 hover:bg-gray-100 border border-gray-100/30 rounded-xl shrink-0 transition-colors" id="sort-groups-btn">
            <span class="text-xs font-medium text-gray-700">${formatSortLabel(sortKey)}</span>
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2.5" stroke="currentColor" class="size-3.5 text-gray-400">
              <path stroke-linecap="round" stroke-linejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
            </svg>
          </button>
        </div>

        ${isLoading ? `
          <div class="p-10 text-center text-sm text-gray-500">Loading groups...</div>
        ` : error ? `
          <div class="p-10 text-center text-sm text-red-500">${error}</div>
        ` : groups.length ? `
          <div class="my-2 px-4 grid grid-cols-1 gap-1">
            ${groups.map((group) => `
              <div class="flex items-center justify-between px-3.5 py-3 rounded-2xl hover:bg-gray-50/80 transition-all group cursor-pointer border border-transparent hover:border-gray-100/50" data-group-row="${group.id}">
                <div class="flex items-center gap-3.5">
                  <div class="w-9 h-9 rounded-full bg-gray-100 flex items-center justify-center text-gray-500">
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="size-5">
                      <path stroke-linecap="round" stroke-linejoin="round" d="M15 19.128a9.38 9.38 0 0 0 2.625.372 9.337 9.337 0 0 0 4.121-.952 4.125 4.125 0 0 0-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 0 1 8.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0 1 11.964-3.07M12 6.375a3.375 3.375 0 1 1-6.75 0 3.375 3.375 0 0 1 6.75 0Zm8.25 2.25a2.625 2.625 0 1 1-5.25 0 2.625 2.625 0 0 1 5.25 0Z" />
                    </svg>
                  </div>
                  <div class="flex flex-col">
                    <div class="font-semibold text-gray-900 text-sm">${group.name}</div>
                    <div class="text-[11px] text-gray-500 font-medium">${group.member_count || 0} members</div>
                  </div>
                </div>
                <div class="flex items-center gap-1.5">
                  <a href="/admin/settings/policies?group=${encodeURIComponent(group.id)}" class="px-2.5 py-1.5 text-[11px] font-semibold rounded-full border border-gray-200 bg-white text-gray-700 transition-all hover:bg-gray-50 btn-manage-group-policies">
                    Manage Policies
                  </a>
                  <button class="p-2 hover:bg-gray-200 rounded-xl text-gray-400 transition-all btn-edit-group" data-group-id="${group.id}">
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="size-4">
                      <path stroke-linecap="round" stroke-linejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L6.832 19.82a4.5 4.5 0 0 1-1.897 1.13l-2.685.8.8-2.685a4.5 4.5 0 0 1 1.13-1.897L16.863 4.487Zm0 0L19.5 7.125" />
                    </svg>
                  </button>
                </div>
              </div>
            `).join('')}
          </div>
        ` : renderEmptyState()}
      </div>

    </div>
  `;

  const reload = async () => {
    await actions.reload?.();
  };

  container.querySelector('#create-group-btn')?.addEventListener('click', async () => {
    await openCreateModal({
      onRefresh: reload,
      onCreate: actions.onCreate,
    });
  });
  container.querySelectorAll('.btn-edit-group').forEach((btn) => btn.addEventListener('click', async (e) => {
    e.stopPropagation();
    await openEditModal(btn.dataset.groupId, {
      onRefresh: reload,
      onUpdate: actions.onUpdate,
      onDelete: actions.onDelete,
      onMemberDelta: actions.onMemberDelta,
    });
  }));

  const searchInput = container.querySelector('#group-search-input');
  const clearSearchBtn = container.querySelector('#clear-search-btn');
  const clearSearchContainer = container.querySelector('#clear-search-container');

  searchInput?.addEventListener('input', (e) => {
    if (e.target.value) {
      clearSearchContainer?.classList.remove('hidden');
    } else {
      clearSearchContainer?.classList.add('hidden');
    }

    const query = String(e.target.value || '').toLowerCase();
    const groupItems = container.querySelectorAll('[data-group-row]');
    groupItems.forEach((item) => {
      const text = item.textContent.toLowerCase();
      item.style.display = text.includes(query) ? 'flex' : 'none';
    });
  });

  clearSearchBtn?.addEventListener('click', () => {
    if (!searchInput) return;
    searchInput.value = '';
    clearSearchContainer?.classList.add('hidden');
    searchInput.focus();
    searchInput.dispatchEvent(new Event('input'));
  });

  container.querySelector('#sort-groups-btn')?.addEventListener('click', () => {
    const next = nextGroupSort(sortKey);
    actions.onSortChange?.(next);
  });
}

export async function preloadGroupsData() {
  return fetchAdminGroups();
}
