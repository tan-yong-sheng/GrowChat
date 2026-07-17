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

function createGroupModalState(
  overlay,
  selectedMembers,
  originalMembers,
  originalName,
  originalDescription
) {
  const modalState = { dirty: false, saving: false };
  const originalMembersSignature = Array.from(originalMembers).sort().join('|');
  return { modalState, originalMembersSignature };
}

function handleGroupModalClose(overlay) {
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay || e.target.closest('[data-close-group-modal]')) {
      overlay.remove();
    }
  });
}

function handleGroupModalTabs(overlay) {
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
}

function renderGroupMembersList(overlay, membersListEl, filtered, selectedMembers) {
  membersListEl.innerHTML = filtered.length
    ? renderGroupMembersRows(filtered, selectedMembers, overlay)
    : renderGroupMembersEmpty();
  renderGroupMembersCount(overlay, selectedMembers);
  bindGroupMemberToggleHandlers(overlay, membersListEl, selectedMembers);
}

function renderGroupMembersRows(filtered, selectedMembers, overlay) {
  return filtered
    .map((user) => renderGroupMemberRow(user, selectedMembers.has(user.id), overlay))
    .join('');
}

function renderGroupMemberRow(user, isSelected, overlay) {
  const initials = getGroupMemberInitials(user);
  return `<div class="flex items-center justify-between gap-3 rounded-lg border border-gray-200 bg-white px-3 py-2"><div class="flex items-center gap-3"><div class="w-9 h-9 rounded-full bg-gray-100 flex items-center justify-center text-sm font-semibold text-gray-700">${escapeHtml(initials)}</div><div class="flex flex-col"><div class="text-sm font-medium text-gray-900">${escapeHtml(user.name || 'Unknown')}</div><div class="text-label-sm text-gray-700">${escapeHtml(user.email || '')}</div></div></div>${renderGroupMemberToggle(isSelected, user.id)}</div>`;
}

function renderGroupMemberToggle(isSelected, userId) {
  return renderButton({
    label: isSelected ? 'Member' : 'Add',
    variant: isSelected ? 'secondary' : 'ghost',
    className: `member-toggle text-label-sm px-3 py-1 ${getGroupMemberButtonClass(isSelected)}`,
    dataAttrs: { 'user-id': userId },
  });
}

function getGroupMemberButtonClass(isSelected) {
  return isSelected
    ? 'bg-emerald-500/15 text-emerald-700 border-emerald-500/30'
    : 'bg-gray-100 text-gray-600 border-gray-200 hover:border-gray-300';
}

function getGroupMemberInitials(user) {
  return (
    String(user.name || user.email || '?')
      .trim()
      .charAt(0)
      .toUpperCase() || '?'
  );
}

function bindGroupMemberToggleHandlers(overlay, membersListEl, selectedMembers) {
  membersListEl.querySelectorAll('.member-toggle').forEach((btn) => {
    btn.addEventListener('click', () => {
      const userId = btn.dataset.userId;
      if (!userId) return;
      if (selectedMembers.has(userId)) selectedMembers.delete(userId);
      else selectedMembers.add(userId);
      renderGroupMembersList(overlay, membersListEl, [], selectedMembers);
    });
  });
}

function renderGroupMembersCount(overlay, selectedMembers) {
  const membersCountEl = overlay.querySelector('#members-count');
  if (membersCountEl) membersCountEl.textContent = `${selectedMembers.size} selected`;
}

function renderGroupMembersEmpty() {
  return '<div class="text-sm text-gray-700 py-6 text-center">No users found.</div>';
}

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

function getGroupModalDirty(
  overlay,
  selectedMembers,
  originalName,
  originalDescription,
  originalMembersSignature
) {
  const name = String(overlay.querySelector('#group-name-input')?.value || '').trim();
  const description = String(overlay.querySelector('#group-description-input')?.value || '').trim();
  const membersSignature = Array.from(selectedMembers).sort().join('|');
  const isDirty =
    name !== originalName.trim() ||
    description !== originalDescription.trim() ||
    membersSignature !== originalMembersSignature;
  setModalSaveButtonState(overlay.querySelector('#group-save-btn'), {
    enabled: isDirty,
    saving: false,
  });
  return isDirty;
}

function getGroupId(group) {
  return group?.id || '';
}

function getDraftMembers(draft, members) {
  return draft?.member_ids || members;
}

function getDraftOrGroupName(draft, group) {
  return String(draft?.name || group?.name || '');
}

function getDraftOrGroupDesc(draft, group) {
  return String(draft?.description || group?.description || '');
}

function toArrayOrEmpty(value) {
  return Array.isArray(value) ? value : [];
}

function getModalTitle(isEdit) {
  return isEdit ? 'Edit User Group' : 'Add User Group';
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
  const groupId = getGroupId(group);
  const isEdit = mode === 'edit';
  const selectedMembers = buildMemberSet(getDraftMembers(draft, members));
  const originalMembers = buildMemberSet(getDraftMembers(draft, members));
  const originalName = getDraftOrGroupName(draft, group);
  const originalDescription = getDraftOrGroupDesc(draft, group);
  const memberState = { query: '' };
  const originalMembersSignature = Array.from(originalMembers).sort().join('|');
  const allUsers = toArrayOrEmpty(users);
  const theme = getGroupModalTheme();
  const { modal: overlay } = createAdminModalShell({
    preset: 'groupEditor',
    title: getModalTitle(isEdit),
    body: `...`, // original template
    footer: `...`,
    closeAttr: 'data-close-group-modal',
    rootAttrs: 'id="group-modal"',
  });

  const modalState = { dirty: false, saving: false };
  const isDirty = getGroupModalDirty(
    overlay,
    selectedMembers,
    originalName,
    originalDescription,
    originalMembersSignature
  );

  handleGroupModalClose(overlay);

  handleGroupModalTabs(overlay);

  // ... rest of the function
}
