/**
 * Group editor modals for the admin groups page.
 */
import {
  apiFetch,
  fetchAdminGroups,
  fetchAdminGroup,
  fetchAdminUsers,
  createAdminGroup,
  updateAdminGroup,
} from '../../../shared/api.js';
import { setModalSaveButtonState } from '../modal-save-helpers.js';
import { createAdminModalShell } from '../modal-shell.js';
import { renderButton } from '../../../shared/components/button.js';
import { escapeHtml, getGroupModalTheme } from './groups-list-helpers.js';
import { buildMemberSet, clampUserLimit, filterUsers } from './groups-members-helpers.js';

const loadUsers = async () => {
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
  return { users, usersTotal, usersError };
};

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
            <button class="group-tab flex-1 md:w-full text-left px-3 py-2 rounded-md transition focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary/20 ${theme.sidebarActive}" data-tab="general">
              <span class="flex items-center gap-2">General</span>
            </button>
            <button class="group-tab flex-1 md:w-full text-left px-3 py-2 rounded-md transition focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary/20 ${theme.sidebarInactive}" data-tab="members">
              <span class="flex items-center gap-2">Members</span>
            </button>
          </div>
        </div>
        <div class="flex-1 min-h-0 overflow-y-auto p-4 sm:p-5 md:p-6">
          <div data-panel="general" class="space-y-5">
            <div class="space-y-2">
              <label class="text-xs uppercase tracking-wider text-gray-700 font-semibold">Name</label>
              <input id="group-name-input" class="w-full ${theme.input} rounded-lg px-4 py-3 text-sm outline-none" placeholder="Group Name" value="${escapeHtml(draft?.name || group?.name || '')}">
            </div>
            <div class="space-y-2">
              <label class="text-xs uppercase tracking-wider text-gray-700 font-semibold">Description</label>
              <textarea id="group-description-input" rows="3" class="w-full ${theme.input} rounded-lg px-4 py-3 text-sm outline-none resize-none" placeholder="Group Description">${escapeHtml(draft?.description || group?.description || '')}</textarea>
            </div>
          </div>
          <div data-panel="members" class="space-y-4 hidden">
            <div class="flex items-center justify-between">
              <div>
                <div class="text-sm font-semibold text-gray-900">Members</div>
                <div class="text-label-sm text-gray-700" id="members-count"></div>
              </div>
              <div class="text-label-sm text-gray-700">${usersTotal ? `Showing ${Math.min(allUsers.length, usersTotal)} of ${usersTotal}` : ''}</div>
            </div>
            <div class="flex items-center gap-1.5 bg-gray-50/50 px-3 py-1.5 rounded-md border border-gray-100/30">
              <div class="flex-shrink-0 text-gray-700">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="size-5">
                  <path fill-rule="evenodd" d="M9 3.5a5.5 5.5 0 100 11 5.5 5.5 0 000-11zM2 9a7 7 0 1112.452 4.391l3.328 3.329a.75.75 0 11-1.06 1.06l-3.329-3.328A7 7 0 012 9z" clip-rule="evenodd" />
                </svg>
              </div>
              <input id="group-member-search" class="w-full bg-transparent text-sm text-gray-700 placeholder:text-gray-700 outline-none" placeholder="Search users">
              <div id="group-member-clear-container" class="hidden ml-1.5">
                <button type="button" id="group-member-clear-btn" class="p-0.5 rounded-full hover:bg-gray-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary/20 transition">
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
        ${isEdit ? `<button id="group-policies-btn" class="px-4 py-2 text-sm text-gray-600 hover:text-gray-800 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary/20 rounded transition">Manage Policies</button>` : ''}
        ${isEdit ? '<button id="group-delete-btn" class="px-4 py-2 text-sm text-red-500 hover:text-red-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 rounded transition">Delete</button>' : ''}
        <button type="button" id="group-save-btn" class="px-4 py-2 text-sm font-semibold rounded-md transition focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary/20">Save</button>
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
          <div class="flex items-center justify-between gap-3 rounded-lg border border-gray-200 bg-white px-3 py-2">
            <div class="flex items-center gap-3">
              <div class="w-9 h-9 rounded-full bg-gray-100 flex items-center justify-center text-sm font-semibold text-gray-700">${escapeHtml(initials)}</div>
              <div class="flex flex-col">
                <div class="text-sm font-medium text-gray-900">${escapeHtml(user.name || 'Unknown')}</div>
                <div class="text-label-sm text-gray-700">${escapeHtml(user.email || '')}</div>
              </div>
            </div>
            ${renderButton({
              label: buttonLabel,
              variant: isSelected ? 'secondary' : 'ghost',
              className: `member-toggle text-label-sm px-3 py-1 ${buttonClass}`,
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

export async function openCreateModal({ onRefresh, onCreate, navigationState }) {
  const { users, usersTotal, usersError } = await loadUsers();

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

export async function openEditModal(groupId, { onRefresh, onUpdate, onDelete, navigationState }) {
  const detail = await fetchAdminGroup(groupId);
  const { users, usersTotal, usersError } = await loadUsers();

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
