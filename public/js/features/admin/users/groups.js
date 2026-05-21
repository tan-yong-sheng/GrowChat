import {
  createAdminGroup,
  deleteAdminGroup,
  fetchAdminGroup,
  fetchAdminGroups,
  fetchAdminUsers,
  updateAdminGroup,
} from '../../../shared/api.js';
import { setModalSaveButtonState } from '../modal-save-helpers.js';
import { createAdminModalShell } from '../modal-shell.js';
import { buildMemberSet, clampUserLimit, filterUsers } from './groups-members-helpers.js';
import { sortGroups } from './groups-list-helpers.js';
import { renderButton } from '../../../shared/components/button.js';

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
    sidebarInactive: 'text-gray-700 hover:text-gray-900',
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
  draft = null,
  users = [],
  usersTotal = 0,
  usersError = null,
  onSave,
  onDelete,
  navigationState = null,
}) {
  const groupId = group?.id || '';
  const isEdit = mode === 'edit';
  const selectedMembers = buildMemberSet(draft?.member_ids || members);
  const originalMembers = buildMemberSet(draft?.member_ids || members);
  const originalName = String(draft?.name || group?.name || '');
  const originalDescription = String(draft?.description || group?.description || '');
  const memberState = {
    query: '',
  };
  const originalMembersSignature = Array.from(originalMembers).sort().join('|');
  const allUsers = Array.isArray(users) ? users : [];
  const theme = getGroupModalTheme();
  const { modal: overlay } = createAdminModalShell({
    preset: 'groupEditor',
    title: isEdit ? 'Edit User Group' : 'Add User Group',
    body: `
      <div class="flex flex-1 min-h-0 flex-col md:flex-row">
        <div class="w-full md:w-32 lg:w-36 ${theme.sidebar} border-r-0 md:border-r p-3 md:p-3.5 text-sm shrink-0 border-b md:border-b-0">
          <div class="flex flex-wrap md:flex-col gap-2 md:gap-1.5">
            <button class="group-tab flex-1 md:w-full text-left px-3 py-2 rounded-xl transition focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 ${theme.sidebarActive}" data-tab="general">
              <span class="flex items-center gap-2">General</span>
            </button>
            <button class="group-tab flex-1 md:w-full text-left px-3 py-2 rounded-xl transition focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 ${theme.sidebarInactive}" data-tab="members">
              <span class="flex items-center gap-2">Members</span>
            </button>
          </div>
        </div>
        <div class="flex-1 min-h-0 overflow-y-auto p-4 sm:p-5 md:p-6">
          <div data-panel="general" class="space-y-5">
            <div class="space-y-2">
              <label class="text-xs uppercase tracking-wider text-gray-700 font-semibold">Name</label>
              <input id="group-name-input" class="w-full ${theme.input} rounded-2xl px-4 py-3 text-sm outline-none" placeholder="Group Name" value="${escapeHtml(draft?.name || group?.name || '')}">
            </div>
            <div class="space-y-2">
              <label class="text-xs uppercase tracking-wider text-gray-700 font-semibold">Description</label>
              <textarea id="group-description-input" rows="3" class="w-full ${theme.input} rounded-2xl px-4 py-3 text-sm outline-none resize-none" placeholder="Group Description">${escapeHtml(draft?.description || group?.description || '')}</textarea>
            </div>
          </div>
          <div data-panel="members" class="space-y-4 hidden">
            <div class="flex items-center justify-between">
              <div>
                <div class="text-sm font-semibold text-gray-900">Members</div>
                <div class="text-[11px] text-gray-700" id="members-count"></div>
              </div>
              <div class="text-[11px] text-gray-700">${usersTotal ? `Showing ${Math.min(allUsers.length, usersTotal)} of ${usersTotal}` : ''}</div>
            </div>
            <div class="flex items-center gap-1.5 bg-gray-50/50 px-3 py-1.5 rounded-xl border border-gray-100/30">
              <div class="flex-shrink-0 text-gray-700">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="size-5">
                  <path fill-rule="evenodd" d="M9 3.5a5.5 5.5 0 100 11 5.5 5.5 0 000-11zM2 9a7 7 0 1112.452 4.391l3.328 3.329a.75.75 0 11-1.06 1.06l-3.329-3.328A7 7 0 012 9z" clip-rule="evenodd" />
                </svg>
              </div>
              <input id="group-member-search" class="w-full bg-transparent text-sm text-gray-700 placeholder:text-gray-700 outline-none" placeholder="Search users">
              <div id="group-member-clear-container" class="hidden ml-1.5">
                <button type="button" id="group-member-clear-btn" class="p-0.5 rounded-full hover:bg-gray-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition">
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2.5" stroke="currentColor" class="size-5">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>
            <div id="group-members-error" class="text-sm text-red-500 ${usersError ? '' : 'hidden'}">${usersError || ''}</div>
            <div id="group-members-list" class="space-y-2 max-h-64 overflow-y-auto scrollbar-hidden pr-1"></div>
          </div>
        </div>
      </div>
    `,
    footer: `
      <div class="text-sm text-red-600" id="group-modal-error"></div>
      <div class="flex items-center gap-2">
        ${isEdit ? `<button id="group-policies-btn" class="px-4 py-2 text-sm text-gray-600 hover:text-gray-800 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 rounded transition">Manage Policies</button>` : ''}
        ${isEdit ? '<button id="group-delete-btn" class="px-4 py-2 text-sm text-red-500 hover:text-red-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 rounded transition">Delete</button>' : ''}
        <button type="button" id="group-save-btn" class="px-4 py-2 text-sm font-semibold rounded-xl transition focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500">Save</button>
      </div>
    `,
    closeAttr: 'data-close-group-modal',
    rootAttrs: 'id="group-modal"',
  });

  const modalState = {
    dirty: false,
    saving: false,
  };

  const isDirty = () => {
    const name = String(overlay.querySelector('#group-name-input')?.value || '').trim();
    const description = String(
      overlay.querySelector('#group-description-input')?.value || ''
    ).trim();
    const membersSignature = Array.from(selectedMembers).sort().join('|');
    return (
      name !== originalName.trim() ||
      description !== originalDescription.trim() ||
      membersSignature !== originalMembersSignature
    );
  };

  const close = () => {
    overlay.remove();
  };
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
        other.classList.toggle('text-gray-700', other !== btn);
      });
    });
  });

  const membersListEl = overlay.querySelector('#group-members-list');
  const membersCountEl = overlay.querySelector('#members-count');
  const membersSearchInput = overlay.querySelector('#group-member-search');
  const membersClearContainer = overlay.querySelector('#group-member-clear-container');
  const membersClearBtn = overlay.querySelector('#group-member-clear-btn');
  const nameInput = overlay.querySelector('#group-name-input');
  const descriptionInput = overlay.querySelector('#group-description-input');
  const saveBtn = overlay.querySelector('#group-save-btn');

  const syncDirty = () => {
    modalState.dirty = isDirty();
    setModalSaveButtonState(saveBtn, { enabled: modalState.dirty, saving: modalState.saving });
  };

  const renderMembers = () => {
    if (!membersListEl) return;
    const filtered = filterUsers(allUsers, memberState.query);
    if (!filtered.length) {
      membersListEl.innerHTML = `
        <div class="text-sm text-gray-700 py-6 text-center">No users found.</div>
      `;
    } else {
      membersListEl.innerHTML = filtered
        .map((user) => {
          const isSelected = selectedMembers.has(user.id);
          const initials =
            String(user.name || user.email || '?')
              .trim()
              .charAt(0)
              .toUpperCase() || '?';
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
                <div class="text-[11px] text-gray-700">${escapeHtml(user.email || '')}</div>
              </div>
            </div>
            ${renderButton({
              label: buttonLabel,
              variant: isSelected ? 'secondary' : 'ghost',
              className: `member-toggle text-[11px] px-3 py-1 ${buttonClass}`,
              dataAttrs: { 'user-id': user.id },
            })}
          </div>
        `;
        })
        .join('');
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
        syncDirty();
      });
    });
  };

  if (membersSearchInput) {
    membersSearchInput.addEventListener('input', (e) => {
      memberState.query = e.target.value || '';
      if (membersClearContainer) {
        membersClearContainer.classList.toggle('hidden', !memberState.query);
      }
      renderMembers();
    });
  }

  nameInput?.addEventListener('input', syncDirty);
  descriptionInput?.addEventListener('input', syncDirty);

  membersClearBtn?.addEventListener('click', () => {
    memberState.query = '';
    if (membersSearchInput) {
      membersSearchInput.value = '';
    }
    if (membersClearContainer) {
      membersClearContainer.classList.add('hidden');
    }
    renderMembers();
    membersSearchInput?.focus();
  });

  renderMembers();
  syncDirty();

  const showError = (message) => {
    const el = overlay.querySelector('#group-modal-error');
    if (el) el.textContent = message || '';
  };

  const saveGroup = async () => {
    if (modalState.saving) return;
    modalState.saving = true;
    syncDirty();
    try {
      const name = String(nameInput?.value || '').trim();
      const description = String(descriptionInput?.value || '').trim();
      const memberIds = Array.from(selectedMembers);
      await onSave({
        name,
        description,
        member_ids: memberIds,
      });
      close();
    } catch (err) {
      showError(err?.message || 'Failed to save group.');
    } finally {
      modalState.saving = false;
      syncDirty();
    }
  };

  overlay.querySelector('#group-delete-btn')?.addEventListener('click', async () => {
    if (!group?.id) return;
    try {
      await onDelete?.(group.id, close);
    } catch (err) {
      showError(err?.message || 'Failed to delete group.');
    }
  });

  overlay.querySelector('#group-policies-btn')?.addEventListener('click', () => {
    if (!groupId) return;
    const navigate = async () => {
      const allowed = await navigationState?.guardNavigation?.();
      if (!allowed) return;
      window.location.href = `/admin/users/policies?group=${encodeURIComponent(groupId)}`;
    };
    void navigate();
  });

  saveBtn?.addEventListener('click', () => {
    void saveGroup();
  });

  return overlay;
}

async function openCreateModal({ onRefresh, onCreate, navigationState }) {
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

  renderGroupModal({
    mode: 'create',
    draft: null,
    users,
    usersTotal,
    usersError,
    navigationState,
    onSave: async (payload) => {
      if (!payload.name) throw new Error('Group name is required.');
      const created = await createAdminGroup({
        name: payload.name,
        description: payload.description,
        member_ids: payload.member_ids || [],
      });
      if (typeof onCreate === 'function') {
        onCreate({
          ...created.group,
          member_count:
            created?.group?.member_count ??
            (Array.isArray(payload.member_ids) ? payload.member_ids.length : 0),
        });
      } else {
        await onRefresh?.();
      }
    },
  });
}

async function openEditModal(groupId, { onRefresh, onUpdate, onDelete, navigationState }) {
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
  renderGroupModal({
    mode: 'edit',
    group: detail.group,
    members: detail.members || [],
    draft: null,
    users,
    usersTotal,
    usersError,
    navigationState,
    onSave: async (payload) => {
      if (!payload.name) throw new Error('Group name is required.');
      const updated = await updateAdminGroup(groupId, {
        name: payload.name,
        description: payload.description,
        member_ids: payload.member_ids || [],
      });
      if (typeof onUpdate === 'function') {
        onUpdate({
          ...updated.group,
          member_count:
            updated?.group?.member_count ??
            (Array.isArray(payload.member_ids) ? payload.member_ids.length : 0),
        });
      } else {
        await onRefresh?.();
      }
    },
    onDelete: async (targetGroupId, closeModal) => {
      if (typeof onDelete === 'function') {
        return onDelete(targetGroupId || groupId, closeModal);
      }
      return false;
    },
  });
}

function renderEmptyState() {
  return `
    <div class="w-full flex flex-col justify-center items-center py-16 px-4">
      <div class="flex flex-col items-center max-w-xs text-center">
        <div class="text-4xl mb-4 bg-gray-50 p-6 rounded-[2.5rem] text-blue-500 shadow-inner">
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="size-5">
            <path stroke-linecap="round" stroke-linejoin="round" d="M15 19.128a9.38 9.38 0 0 0 2.625.372 9.337 9.337 0 0 0 4.121-.952 4.125 4.125 0 0 0-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 0 1 8.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0 1 11.964-3.07M12 6.375a3.375 3.375 0 1 1-6.75 0 3.375 3.375 0 0 1 6.75 0Zm8.25 2.25a2.625 2.625 0 1 1-5.25 0 2.625 2.625 0 0 1 5.25 0Z" />
          </svg>
        </div>
        <div class="text-lg font-bold text-gray-900 mb-1.5">No groups found</div>
        <div class="text-gray-700 text-xs leading-relaxed">Use groups to organize your users and manage members.</div>
      </div>
    </div>
  `;
}

export function renderGroupsOverview(container, data, actions = {}) {
  const deleteGroup = async (groupId) => {
    const group = (data.groups || []).find((item) => item.id === groupId) || null;
    if (!group || group.is_system) return false;
    if (!window.confirm(`Delete group ${group.name}? This will permanently remove the group.`))
      return false;
    await deleteAdminGroup(group.id);
    if (typeof actions.onDelete === 'function') {
      actions.onDelete(group.id);
    } else {
      await actions.reload?.();
    }
    return true;
  };
  const sortKey = data.groupsSort || 'members';
  const groups = sortGroups(data.groups || [], sortKey);
  const isLoading = data.groupsLoading;
  const error = data.groupsError;

  container.innerHTML = `
    <div class="flex flex-col flex-1 min-h-0 animate-in fade-in duration-300">
      <div class="flex flex-col gap-1 px-1 mt-1.5 mb-3">
        <div class="flex items-center justify-between gap-2">
          <div class="flex items-center md:self-center text-xl font-medium px-0.5 gap-2 shrink-0">
            <div class="text-gray-900">Groups</div>
            <div class="text-lg font-medium text-gray-700">${groups.length}</div>
          </div>
          <div class="flex items-center justify-end gap-1.5 shrink-0">
            ${renderButton({ label: '+ New Group', variant: 'secondary', id: 'create-group-btn', className: 'px-3 py-1.5 text-xs shadow-sm' })}
          </div>
        </div>
      </div>

      <div class="flex-1 min-h-0 py-2.5 bg-white rounded-[2rem] border border-gray-100/50 shadow-sm flex flex-col">
        <div class="flex flex-col sm:flex-row sm:items-center w-full gap-2 py-1 px-4 mb-1">
          <div class="flex flex-1 items-center bg-gray-50/50 px-3 py-1.5 rounded-xl border border-gray-100/30">
            <div class="text-gray-700 mr-2.5">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="size-5">
                <circle cx="11" cy="11" r="8"></circle>
                <path d="m21 21-4.3-4.3"></path>
              </svg>
            </div>
            <input class="w-full text-sm outline-none bg-transparent text-gray-700 placeholder-gray-400" placeholder="Search Groups" id="group-search-input">
            <div id="clear-search-container" class="hidden ml-1.5">
              <button id="clear-search-btn" class="p-0.5 rounded-full hover:bg-gray-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2.5" stroke="currentColor" class="size-5">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>
        </div>

        ${
          isLoading
            ? `
          <div class="p-10 text-center text-sm text-gray-700">Loading groups...</div>
        `
            : error
              ? `
          <div class="p-10 text-center text-sm text-red-500">${error}</div>
        `
              : groups.length
                ? `
          <div class="px-4 pb-2 pr-5">
            <div class="grid grid-cols-1 gap-1">
              ${groups
                .map((group) => {
                  const rowClasses =
                    'flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between px-3.5 py-3 rounded-2xl transition-all border border-transparent hover:border-gray-100/50 hover:bg-gray-50/80 group cursor-pointer';
                  const deleteButton = group.is_system
                    ? ''
                    : `
                    <button type="button" class="p-2 hover:bg-red-50 rounded-xl text-gray-700 hover:text-red-500 transition-all focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 btn-delete-group" data-group-id="${group.id}" data-group-name="${escapeHtml(group.name)}" aria-label="Delete group">
                      <svg xmlns="http://www.w3.org/2000/svg" fill="currentColor" viewBox="0 0 20 20" class="size-5">
                        <path fill-rule="evenodd" d="M8.75 1A2.75 2.75 0 0 0 6 3.75V4H5a2 2 0 0 0-2 2v.5a.5.5 0 0 0 .5.5h13a.5.5 0 0 0 .5-.5V6a2 2 0 0 0-2-2h-1v-.25A2.75 2.75 0 0 0 11.25 1h-2.5ZM8 4h4v-.25A1.25 1.25 0 0 0 10.75 2.5h-1.5A1.25 1.25 0 0 0 8 3.75V4ZM5 8.5V17a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2V8.5h-10Z" clip-rule="evenodd" />
                      </svg>
                    </button>
                  `;
                  return `
                <div class="${rowClasses}" data-group-row="${group.id}">
                  <div class="flex items-center gap-3.5">
                    <div class="w-9 h-9 rounded-full bg-gray-100 flex items-center justify-center text-gray-700">
                      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="size-5">
                        <path stroke-linecap="round" stroke-linejoin="round" d="M15 19.128a9.38 9.38 0 0 0 2.625.372 9.337 9.337 0 0 0 4.121-.952 4.125 4.125 0 0 0-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 0 1 8.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0 1 11.964-3.07M12 6.375a3.375 3.375 0 1 1-6.75 0 3.375 3.375 0 0 1 6.75 0Zm8.25 2.25a2.625 2.625 0 1 1-5.25 0 2.625 2.625 0 0 1 5.25 0Z" />
                      </svg>
                    </div>
                    <div class="flex flex-col min-w-0">
                      <div class="flex items-center gap-1.5 min-w-0">
                        <div class="font-semibold text-gray-900 text-sm truncate">${group.name}</div>
                      </div>
                      <div class="text-[11px] text-gray-700 font-medium">${group.member_count || 0} members</div>
                    </div>
                  </div>
                  <div class="flex items-center justify-end gap-1.5 self-end sm:self-auto">
                    <a href="/admin/users/policies?group=${encodeURIComponent(group.id)}" class="px-2.5 py-1.5 text-[11px] font-semibold rounded-full border border-gray-200 bg-white text-gray-700 transition-all hover:bg-gray-50 btn-manage-group-policies">
                      Manage Policies
                    </a>
                    <button type="button" class="p-2 hover:bg-gray-200 rounded-xl text-gray-700 transition-all focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 btn-edit-group" data-group-id="${group.id}" aria-label="Edit group">
                      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="size-5">
                        <path stroke-linecap="round" stroke-linejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L6.832 19.82a4.5 4.5 0 0 1-1.897 1.13l-2.685.8.8-2.685a4.5 4.5 0 0 1 1.13-1.897L16.863 4.487Zm0 0L19.5 7.125" />
                      </svg>
                    </button>
                    ${deleteButton}
                  </div>
                </div>
              `;
                })
                .join('')}
            </div>
          </div>
        `
                : renderEmptyState()
        }
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
      navigationState: data,
    });
  });
  container.querySelectorAll('.btn-edit-group').forEach((btn) =>
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      await openEditModal(btn.dataset.groupId, {
        onRefresh: reload,
        onUpdate: actions.onUpdate,
        onDelete: deleteGroup,
        navigationState: data,
      });
    })
  );

  container.querySelectorAll('.btn-delete-group').forEach((btn) =>
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      await deleteGroup(btn.dataset.groupId);
    })
  );

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
}

export async function preloadGroupsData() {
  return fetchAdminGroups();
}
