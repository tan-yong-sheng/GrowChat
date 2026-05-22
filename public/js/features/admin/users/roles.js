import {
  createAdminRbacRole,
  deleteAdminRbacRole,
  fetchAdminRbacRoles,
  updateAdminRbacRole,
} from '../../../shared/api.js';
import { setModalSaveButtonState } from '../modal-save-helpers.js';
import { createAdminModalShell } from '../modal-shell.js';
import { renderButton } from '../../../shared/components/button.js';

const ROLE_PRESETS = [
  {
    id: 'admin',
    name: 'Admin',
    description: 'Full platform access',
    system: true,
    defaultPermissions: [
      'chat.read',
      'chat.write',
      'chat.delete',
      'chat.share',
      'file.upload',
      'file.delete',
      'model.use',
      'model.admin',
      'admin.user.read',
      'admin.user.write',
      'admin.audit.read',
      'admin.rbac.admin',
    ],
  },
  {
    id: 'member',
    name: 'Member',
    description: 'Base app access',
    system: true,
    defaultPermissions: ['chat.read', 'chat.write', 'file.upload', 'model.use'],
  },
];

const PERMISSION_GROUPS = [
  {
    key: 'chat',
    label: 'Chat',
    permissions: [
      { key: 'chat.read', label: 'Read chats', note: 'Open conversations' },
      { key: 'chat.write', label: 'Send messages', note: 'Compose or reply' },
      { key: 'chat.delete', label: 'Delete chats', note: 'Remove chats from the account' },
      { key: 'chat.share', label: 'Share chats', note: 'Create shareable links' },
    ],
  },
  {
    key: 'files',
    label: 'Files',
    permissions: [
      { key: 'file.upload', label: 'Upload files', note: 'Add files to chats' },
      { key: 'file.delete', label: 'Delete files', note: 'Remove uploaded files' },
    ],
  },
  {
    key: 'models',
    label: 'Models',
    permissions: [
      { key: 'model.use', label: 'Use models', note: 'Chat with any model' },
      { key: 'model.admin', label: 'Manage models', note: 'Change model settings' },
    ],
  },
  {
    key: 'admin',
    label: 'Admin',
    sensitive: true,
    permissions: [
      { key: 'admin.user.read', label: 'Read users', note: 'View user records' },
      { key: 'admin.user.write', label: 'Manage users', note: 'Edit user accounts' },
      { key: 'admin.audit.read', label: 'Read audit logs', note: 'Review access changes' },
      { key: 'admin.rbac.admin', label: 'Edit roles', note: 'Change templates and permissions' },
    ],
  },
];

const DEFAULT_GROUP_COLLAPSE = {
  chat: false,
  files: false,
  models: false,
  admin: false,
};

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function clonePermissions(source) {
  return new Set(Array.from(source || []));
}

function cloneRole(role) {
  return {
    id: role.id,
    name: role.name,
    description: role.description,
    system: Boolean(role.system),
    sourceRoleId: role.sourceRoleId || null,
    permissions: clonePermissions(role.permissions),
    defaultPermissions: clonePermissions(role.defaultPermissions),
    initialPermissions: clonePermissions(role.initialPermissions),
  };
}

function createInitialRoles() {
  return ROLE_PRESETS.map((role) => {
    const permissions = clonePermissions(role.defaultPermissions);
    return {
      id: role.id,
      name: role.name,
      description: role.description,
      system: true,
      sourceRoleId: null,
      permissions,
      defaultPermissions: clonePermissions(role.defaultPermissions),
      initialPermissions: clonePermissions(permissions),
    };
  });
}

function normalizeLoadedRole(role) {
  const preset = ROLE_PRESETS.find((item) => item.id === role?.id);
  const permissions = clonePermissions(role?.permissions || []);
  return {
    id: role.id,
    name: role.name,
    description:
      role.description || preset?.description || (role.system ? 'System role' : 'Custom role'),
    system: Boolean(role.system),
    sourceRoleId: role.sourceRoleId || null,
    permissions,
    defaultPermissions: clonePermissions(role.defaultPermissions || permissions),
    initialPermissions: clonePermissions(role.initialPermissions || permissions),
  };
}

function getNextCustomIndex(roles) {
  const indexes = (Array.isArray(roles) ? roles : [])
    .filter((role) => !role.system)
    .map((role) => {
      const match = /^Custom\s+(\d+)$/i.exec(String(role.name || '').trim());
      return match ? Number(match[1]) : 0;
    })
    .filter((value) => Number.isFinite(value) && value > 0);
  return (indexes.length ? Math.max(...indexes) : 0) + 1;
}

function permissionsSignature(role) {
  return `${role.id}:${String(role.name || '').trim()}:${Array.from(role.permissions || [])
    .sort()
    .join(',')}`;
}

function rolesSignature(roles) {
  return (Array.isArray(roles) ? roles : []).map((role) => permissionsSignature(role)).join('|');
}

function countSensitivePermissions(role) {
  return Array.from(role?.permissions || []).filter((permissionKey) =>
    permissionKey.startsWith('admin.')
  ).length;
}

function buildVisibleRoles(query, roles) {
  const normalized = String(query || '')
    .trim()
    .toLowerCase();
  return (Array.isArray(roles) ? roles : []).filter((role) => {
    if (!normalized) return true;
    return `${role.name} ${role.description} ${role.system ? 'system' : 'custom'} ${Array.from(role.permissions || []).join(' ')}`
      .toLowerCase()
      .includes(normalized);
  });
}

function buildVisibleGroups(query) {
  const normalized = String(query || '')
    .trim()
    .toLowerCase();
  return PERMISSION_GROUPS.map((group) => {
    const permissions = group.permissions.filter((permission) => {
      if (!normalized) return true;
      return `${permission.key} ${permission.label} ${permission.note} ${group.label}`
        .toLowerCase()
        .includes(normalized);
    });
    return {
      ...group,
      permissions,
      visible: permissions.length > 0 || !normalized,
    };
  }).filter((group) => group.visible || normalized);
}

function formatRoleSummary(role) {
  const enabledCount = role?.permissions?.size || 0;
  const sensitiveCount = countSensitivePermissions(role);
  return `${enabledCount} permissions${sensitiveCount ? ` · ${sensitiveCount} sensitive` : ''}`;
}

function renderLoadingState() {
  return `
    <div class="flex min-h-[320px] items-center justify-center rounded-[2rem] border border-gray-100 bg-white text-sm text-gray-700">
      Loading roles...
    </div>
  `;
}

function renderErrorState(message) {
  return `
    <div class="flex min-h-[320px] items-center justify-center rounded-[2rem] border border-red-100 bg-red-50/60 p-6 text-center">
      <div class="max-w-sm">
        <div class="text-sm font-semibold text-red-700">Unable to load roles</div>
        <div class="mt-1 text-sm text-red-600">${escapeHtml(message || 'Please try again.')}</div>
        ${renderButton({ label: 'Retry', variant: 'secondary', className: 'mt-3 px-3 py-1 text-xs text-red-700 border-red-200 hover:bg-red-50 focus:ring-red-500', dataAttrs: { 'role-retry': '' } })}
      </div>
    </div>
  `;
}

async function ensureRolesLoaded(container, state, data) {
  if (state.rolesLoaded || state.rolesLoading) return;
  state.rolesLoading = true;
  state.rolesError = null;
  renderRolesPage(container, data);

  try {
    const payload = await fetchAdminRbacRoles({ cache: 'no-store' });
    const roles =
      Array.isArray(payload?.roles) && payload.roles.length
        ? payload.roles.map((role) => normalizeLoadedRole(role))
        : createInitialRoles();
    state.roles = roles;
    state.nextCustomIndex = getNextCustomIndex(state.roles);
  } catch (err) {
    state.roles = createInitialRoles();
    state.nextCustomIndex = getNextCustomIndex(state.roles);
    state.rolesError = err?.message || 'Failed to load roles.';
  } finally {
    state.rolesLoaded = true;
    state.rolesLoading = false;
    renderRolesPage(container, data);
  }
}

function createRoleDraft(role, { isNew = false, sourceRoleId = null, nextCustomIndex = 1 } = {}) {
  const cloned = cloneRole(role);
  if (isNew) {
    cloned.id = `custom-${nextCustomIndex}`;
    cloned.name = `Custom ${nextCustomIndex}`;
    cloned.description = 'Custom role';
    cloned.system = false;
    cloned.sourceRoleId = sourceRoleId || 'member';
  }
  return cloned;
}

function createModalShell({ title, subtitle, showDelete = false } = {}) {
  const { modal } = createAdminModalShell({
    preset: 'roleEditor',
    title,
    subtitle,
    modalHash: 'role-modal',
    body: '<div data-modal-body></div>',
    footer: `
      <div class="text-[9px] text-gray-700 leading-tight" data-modal-note></div>
      <div class="flex items-center gap-1.5">
        ${showDelete ? renderButton({ label: 'Delete', variant: 'secondary', className: 'px-2 py-0.75 text-[9px] text-red-600 border-red-200 hover:bg-red-50 focus:ring-red-500', dataAttrs: { 'role-modal-delete': '' } }) : ''}
        ${renderButton({ label: 'Discard', variant: 'secondary', className: 'px-2 py-0.75 text-[9px]', dataAttrs: { 'modal-discard': '' } })}
        ${renderButton({ label: 'Restore defaults', variant: 'secondary', className: 'px-2 py-0.75 text-[9px]', dataAttrs: { 'modal-reset': '' } })}
        ${renderButton({ label: 'Save', variant: 'primary', className: 'px-2.5 py-0.75 text-[9px]', dataAttrs: { 'role-save': '' } })}
      </div>
    `,
    closeAttr: 'data-modal-close',
  });
  return modal;
}

function renderPermissionGroup(group, draft, modalState) {
  const collapsed =
    Boolean(modalState.groupCollapsed[group.key]) && !String(modalState.query || '').trim();
  const visiblePermissions = group.permissions.filter((permission) => {
    const normalized = String(modalState.query || '')
      .trim()
      .toLowerCase();
    if (!normalized) return true;
    return `${permission.key} ${permission.label} ${permission.note} ${group.label}`
      .toLowerCase()
      .includes(normalized);
  });
  if (!visiblePermissions.length && String(modalState.query || '').trim()) return '';

  return `
    <div id="role-group-${escapeHtml(group.key)}" class="border-b border-gray-100 last:border-b-0 scroll-mt-20">
      <button type="button" data-group-toggle="${escapeHtml(group.key)}" class="flex w-full items-center justify-between px-2.5 py-1.25 hover:bg-gray-50 transition">
        <div class="flex items-center gap-2">
          <span class="text-[9px] font-semibold uppercase tracking-wider text-gray-400">${escapeHtml(group.label)}</span>
          ${group.sensitive ? '<span class="rounded-full border border-amber-200 bg-amber-100 px-1 py-0.5 text-[8px] font-semibold uppercase tracking-wide text-amber-700">Sensitive</span>' : ''}
        </div>
        <div class="text-[10px] text-gray-400">${collapsed ? '▸' : '▾'}</div>
      </button>
      ${
        collapsed
          ? ''
          : visiblePermissions
              .map((permission) => {
                const primary = modalState.advanced ? permission.key : permission.label;
                const secondary = modalState.advanced ? permission.label : permission.key;
                const isSensitive = group.sensitive || permission.key.startsWith('admin.');
                const rowTitle = `${permission.label} · ${permission.key} · ${permission.note}`;
                return `
          <label title="${escapeHtml(rowTitle)}" class="flex items-center justify-between gap-2 border-t border-gray-50 px-2.5 py-1 text-[9px] ${isSensitive ? 'bg-amber-50/30' : ''}">
            <div class="min-w-0 flex-1 flex items-center gap-1.5">
              <span class="font-medium text-gray-900 whitespace-nowrap">${escapeHtml(primary)}</span>
              ${isSensitive ? '<span class="rounded-full border border-amber-200 bg-amber-100 px-1 py-0.5 text-[8px] font-semibold uppercase tracking-wide text-amber-700 whitespace-nowrap">Sensitive</span>' : ''}
              <span class="text-[8px] text-gray-400 whitespace-nowrap">· ${escapeHtml(secondary)}</span>
              <span class="text-[8px] text-gray-500 whitespace-nowrap">· ${escapeHtml(permission.note)}</span>
            </div>
            <input
              type="checkbox"
              data-permission-toggle="${escapeHtml(permission.key)}"
              ${draft.permissions.has(permission.key) ? 'checked' : ''}
              class="h-3.5 w-3.5 rounded border-gray-300 text-black focus:ring-gray-300"
            >
          </label>
        `;
              })
              .join('')
      }
    </div>
  `;
}

function openRoleModal(
  container,
  state,
  data,
  { roleId = null, isNew = false, onSaveRole = null, onDeleteRole = null } = {}
) {
  const sourceRole = roleId ? state.roles.find((role) => role.id === roleId) || null : null;
  const baseRole = isNew
    ? createRoleDraft(ROLE_PRESETS.find((role) => role.id === 'member') || ROLE_PRESETS[0], {
        isNew: true,
        sourceRoleId: 'member',
        nextCustomIndex: state.nextCustomIndex,
      })
    : createRoleDraft(sourceRole || ROLE_PRESETS[0]);

  const modalState = {
    query: '',
    advanced: true,
    groupCollapsed: { ...DEFAULT_GROUP_COLLAPSE },
    draft: baseRole,
    original: cloneRole(baseRole),
    isNew,
    error: '',
    dirty: false,
  };

  const modal = createModalShell({
    title: isNew ? 'Create role' : `Edit ${baseRole.name}`,
    subtitle: isNew
      ? 'Start from Member and adjust the permissions you need.'
      : 'Edit one role at a time. Permissions are the source of truth.',
    showDelete: !isNew && !sourceRole?.system,
  });

  const bodyEl = modal.querySelector('[data-modal-body]');
  const noteEl = modal.querySelector('[data-modal-note]');
  const resetBtn = modal.querySelector('[data-modal-reset]');
  const discardBtn = modal.querySelector('[data-modal-discard]');
  const closeBtn = modal.querySelector('[data-modal-close]');
  const saveBtn = modal.querySelector('[data-role-save]');
  const deleteBtn = modal.querySelector('[data-role-modal-delete]');
  const isSystemRole = Boolean(modalState.draft.system);
  const isDirty = () =>
    rolesSignature([modalState.draft]) !== rolesSignature([modalState.original]);

  const syncDirty = () => {
    modalState.dirty = isDirty();
    setModalSaveButtonState(saveBtn, {
      enabled: modalState.dirty,
      saving: modalState.saving,
      label: 'Save',
      enabledClass:
        'rounded-full px-2.5 py-0.75 text-[9px] font-semibold transition bg-black text-white hover:bg-gray-900',
      disabledClass:
        'rounded-full px-2.5 py-0.75 text-[9px] font-semibold transition bg-gray-200 text-gray-400 cursor-not-allowed',
    });
  };

  const syncShell = () => {
    const namePreview = modal.querySelector('[data-role-name-preview]');
    const summaryPreview = modal.querySelector('[data-role-summary-preview]');
    const systemNote = modal.querySelector('[data-role-system-note]');
    const nameInput = modal.querySelector('#role-name');

    if (namePreview) namePreview.textContent = String(modalState.draft.name || '');
    if (summaryPreview) {
      summaryPreview.textContent = `${formatRoleSummary(modalState.draft)} · ${isSystemRole ? 'system' : 'custom'}`;
    }
    if (systemNote) {
      if (isSystemRole) {
        systemNote.textContent = 'System template names are fixed. Edit permissions only.';
      }
    }
    if (nameInput && !isSystemRole) {
      nameInput.value = String(modalState.draft.name || '');
    }
    const clearContainer = modal.querySelector('#role-permission-clear-container');
    if (clearContainer) {
      clearContainer.classList.toggle('hidden', !String(modalState.query || '').trim());
    }
  };

  const renderPermissionPane = () => {
    const groups = buildVisibleGroups(modalState.query, modalState.advanced);
    const paneEl = modal.querySelector('[data-role-permission-pane]');
    if (!paneEl) return;
    paneEl.innerHTML = `
      ${
        groups.length
          ? groups
              .map((group) => renderPermissionGroup(group, modalState.draft, modalState))
              .join('')
          : `
        <div class="px-3 py-6 text-center text-[10px] text-gray-500">No permissions match your search.</div>
      `
      }
    `;

    noteEl.textContent =
      modalState.draft.id === 'admin'
        ? 'Guardrail: admin permissions are sensitive; keep at least one admin-capable role.'
        : modalState.draft.id === 'member'
          ? 'Member stays the lowest-privilege baseline.'
          : 'Custom roles are cloned from a template and can be edited independently.';

    syncDirty();

    paneEl.querySelectorAll('[data-group-toggle]').forEach((button) => {
      button.addEventListener('click', () => {
        const groupKey = String(button.dataset.groupToggle || '').trim();
        if (!groupKey) return;
        modalState.groupCollapsed[groupKey] = !modalState.groupCollapsed[groupKey];
        renderPermissionPane();
      });
    });
    paneEl.querySelectorAll('[data-permission-toggle]').forEach((input) => {
      input.addEventListener('change', () => {
        const permissionKey = String(input.dataset.permissionToggle || '').trim();
        if (!permissionKey) return;
        if (input.checked) {
          modalState.draft.permissions.add(permissionKey);
        } else {
          modalState.draft.permissions.delete(permissionKey);
        }
        syncDirty();
      });
    });
  };

  const renderShell = () => {
    bodyEl.innerHTML = `
    <div class="space-y-1.5 p-1.5 sm:p-2">
      <div class="space-y-2">
        <div class="rounded-2xl border border-gray-200 bg-gray-50 px-2 py-1">
          <div class="flex items-start justify-between gap-2">
            <div class="min-w-0 flex-1">
              ${
                isSystemRole
                  ? `
                <div data-role-name-preview class="truncate text-[13px] font-semibold leading-tight text-gray-900">${escapeHtml(modalState.draft.name)}</div>
              `
                  : `
                <input
                  id="role-name"
                  value="${escapeHtml(modalState.draft.name)}"
                  spellcheck="false"
                  autocomplete="off"
                  autocapitalize="off"
                  aria-label="Role name"
                  class="w-full min-w-0 rounded-lg border border-gray-300 bg-white px-2 py-0.5 text-[13px] font-semibold leading-tight text-gray-900 outline-none placeholder:text-gray-400 focus:border-gray-400"
                  placeholder="Role name"
                >
              `
              }
            </div>
            <div class="flex shrink-0 items-center gap-1.5">
              <div data-role-summary-preview class="rounded-full border border-gray-200 bg-white px-1.5 py-0.5 text-[8px] font-semibold uppercase tracking-wide text-gray-500 whitespace-nowrap">${escapeHtml(formatRoleSummary(modalState.draft))} · ${isSystemRole ? 'system' : 'custom'}</div>
            </div>
          </div>
          ${
            isSystemRole
              ? `
            <div data-role-system-note class="mt-0.5 text-[8px] leading-tight text-gray-500">System template names are fixed. Edit permissions only.</div>
          `
              : `
            `
          }
            <div class="mt-1 flex flex-wrap items-center gap-1.5">
              <div class="min-w-0 flex-[1.5]">
                <div class="flex items-center gap-1.5 rounded-xl border border-gray-100/40 bg-gray-50/60 px-2 py-0.5">
                  <div class="flex-shrink-0 text-gray-400" aria-hidden="true">
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="size-5">
                      <path fill-rule="evenodd" d="M9 3.5a5.5 5.5 0 100 11 5.5 5.5 0 000-11zM2 9a7 7 0 1112.452 4.391l3.328 3.329a.75.75 0 11-1.06 1.06l-3.329-3.328A7 7 0 012 9z" clip-rule="evenodd" />
                    </svg>
                  </div>
                  <input
                    id="role-permission-search"
                    value="${escapeHtml(modalState.query)}"
                    spellcheck="false"
                    autocomplete="off"
                    autocapitalize="off"
                    aria-label="Search permissions"
                    class="min-w-0 flex-1 bg-transparent text-[8px] outline-none text-gray-700 placeholder-gray-400"
                    placeholder="Search permissions"
                  >
                  <div id="role-permission-clear-container" class="${modalState.query ? '' : 'hidden'} ml-1.5">
                    <button type="button" data-role-permission-clear class="p-0.5 rounded-full hover:bg-gray-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition">
                      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2.5" stroke="currentColor" class="size-5">
                        <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div class="rounded-2xl border border-gray-200 bg-white overflow-hidden">
            <div data-role-permission-pane class="pr-1"></div>
          </div>
        </div>
      </div>
    `;
    const nameInput = modal.querySelector('#role-name');
    nameInput?.addEventListener('input', (event) => {
      modalState.draft.name = String(event.target.value || '');
      syncShell();
      syncDirty();
    });

    modal.querySelector('#role-permission-search')?.addEventListener('input', (event) => {
      modalState.query = String(event.target.value || '');
      syncShell();
      renderPermissionPane();
    });

    modal.querySelector('[data-role-permission-clear]')?.addEventListener('click', () => {
      modalState.query = '';
      const searchInput = modal.querySelector('#role-permission-search');
      if (searchInput) searchInput.value = '';
      syncShell();
      renderPermissionPane();
      requestAnimationFrame(() => {
        modal.querySelector('#role-permission-search')?.focus({ preventScroll: true });
      });
    });
  };

  renderShell();
  renderPermissionPane();
  syncShell();

  const close = () => {
    window.removeEventListener('keydown', onKeydown);
    modal.remove();
    if (state.modalCleanup === close) {
      state.modalCleanup = null;
    }
  };

  const saveRole = async () => {
    if (!modalState.dirty || modalState.saving) return;
    const trimmedName = String(modalState.draft.name || '').trim();
    if (!trimmedName) {
      modalState.error = 'Role name is required.';
      noteEl.textContent = modalState.error;
      return;
    }

    try {
      modalState.saving = true;
      setModalSaveButtonState(saveBtn, {
        enabled: false,
        saving: true,
        label: 'Save',
        enabledClass:
          'rounded-full px-2.5 py-0.75 text-[9px] font-semibold transition bg-black text-white hover:bg-gray-900',
        disabledClass:
          'rounded-full px-2.5 py-0.75 text-[9px] font-semibold transition bg-gray-200 text-gray-400 cursor-not-allowed',
      });
      const payload = {
        name: trimmedName,
        permissions: Array.from(modalState.draft.permissions || []),
      };
      if (typeof onSaveRole === 'function') {
        await onSaveRole(modalState.isNew, modalState.draft.id, payload);
      }
      close();
    } catch (err) {
      modalState.error = err?.message || 'Failed to save role.';
      noteEl.textContent = modalState.error;
    } finally {
      modalState.saving = false;
      setModalSaveButtonState(saveBtn, {
        enabled: modalState.dirty,
        saving: false,
        label: 'Save',
        enabledClass:
          'rounded-full px-2.5 py-0.75 text-[9px] font-semibold transition bg-black text-white hover:bg-gray-900',
        disabledClass:
          'rounded-full px-2.5 py-0.75 text-[9px] font-semibold transition bg-gray-200 text-gray-400 cursor-not-allowed',
      });
    }
  };

  deleteBtn?.addEventListener('click', () => {
    void (async () => {
      const deleted = await onDeleteRole?.(modalState.draft.id);
      if (deleted) close();
    })();
  });

  resetBtn.addEventListener('click', () => {
    modalState.draft = modalState.isNew
      ? createRoleDraft(ROLE_PRESETS.find((role) => role.id === 'member') || ROLE_PRESETS[0], {
          isNew: true,
          sourceRoleId: 'member',
          nextCustomIndex: state.nextCustomIndex,
        })
      : createRoleDraft(sourceRole || ROLE_PRESETS[0]);
    modalState.query = '';
    modalState.advanced = true;
    modalState.groupCollapsed = { ...DEFAULT_GROUP_COLLAPSE };
    modalState.error = '';
    syncShell();
    renderPermissionPane();
  });

  discardBtn.addEventListener('click', () => {
    close();
  });
  closeBtn.addEventListener('click', close);
  saveBtn?.addEventListener('click', () => {
    void saveRole();
  });
  modal.addEventListener('click', (event) => {
    if (event.target === modal) close();
  });
  const onKeydown = (event) => {
    if (event.key === 'Escape') {
      window.removeEventListener('keydown', onKeydown);
      close();
    }
  };
  window.addEventListener('keydown', onKeydown);
  return close;
}

function renderRoleRow(role) {
  const initials =
    String(role.name || '?')
      .trim()
      .charAt(0)
      .toUpperCase() || '?';
  const rowClasses =
    'flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between px-3.5 py-3 rounded-2xl hover:bg-gray-50/80 transition-all group cursor-pointer border border-transparent hover:border-gray-100/50';
  const deleteButton = role.system
    ? ''
    : `
        <button type="button" class="p-2 hover:bg-red-50 rounded-xl text-gray-400 hover:text-red-500 transition-all btn-delete-role" data-role-delete="${escapeHtml(role.id)}" aria-label="Delete role">
          <svg xmlns="http://www.w3.org/2000/svg" fill="currentColor" viewBox="0 0 20 20" class="size-5">
            <path fill-rule="evenodd" d="M8.75 1A2.75 2.75 0 0 0 6 3.75V4H5a2 2 0 0 0-2 2v.5a.5.5 0 0 0 .5.5h13a.5.5 0 0 0 .5-.5V6a2 2 0 0 0-2-2h-1v-.25A2.75 2.75 0 0 0 11.25 1h-2.5ZM8 4h4v-.25A1.25 1.25 0 0 0 10.75 2.5h-1.5A1.25 1.25 0 0 0 8 3.75V4ZM5 8.5V17a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2V8.5h-10Z" clip-rule="evenodd" />
          </svg>
        </button>
      `;
  return `
    <div
      data-role-open="${escapeHtml(role.id)}"
      class="${rowClasses}"
    >
      <div class="flex items-center gap-3.5 min-w-0">
        <div class="w-9 h-9 rounded-full bg-gray-100 flex items-center justify-center text-gray-500 text-[11px] font-semibold shrink-0">
          ${escapeHtml(initials)}
        </div>
        <div class="flex flex-col min-w-0">
          <div class="flex items-center gap-1.5 min-w-0">
            <div class="font-semibold text-gray-900 text-sm truncate">${escapeHtml(role.name)}</div>
          </div>
          <div class="text-[11px] text-gray-500 font-medium">${escapeHtml(role.description)} · ${escapeHtml(formatRoleSummary(role))}</div>
        </div>
      </div>
      <div class="flex items-center justify-end gap-1.5 shrink-0 self-end sm:self-auto">
        <button type="button" class="p-2 hover:bg-gray-200 rounded-xl text-gray-400 transition-all btn-edit-role" data-role-edit="${escapeHtml(role.id)}" aria-label="Edit role">
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="size-5">
            <path stroke-linecap="round" stroke-linejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L6.832 19.82a4.5 4.5 0 0 1-1.897 1.13l-2.685.8.8-2.685a4.5 4.5 0 0 1 1.13-1.897L16.863 4.487Zm0 0L19.5 7.125" />
          </svg>
        </button>
        ${deleteButton}
      </div>
    </div>
  `;
}

function bindRoleRowEvents(container, openRole, deleteRole) {
  container.querySelectorAll('[data-role-open]').forEach((button) => {
    button.addEventListener('click', () => {
      const roleId = String(button.dataset.roleOpen || '').trim();
      if (!roleId) return;
      openRole(roleId, false);
    });
  });

  container.querySelectorAll('[data-role-edit]').forEach((button) => {
    button.addEventListener('click', (event) => {
      event.stopPropagation();
      const roleId = String(button.dataset.roleEdit || '').trim();
      if (!roleId) return;
      openRole(roleId, false);
    });
  });

  container.querySelectorAll('[data-role-delete]').forEach((button) => {
    button.addEventListener('click', async (event) => {
      event.stopPropagation();
      const roleId = String(button.dataset.roleDelete || '').trim();
      if (!roleId) return;
      await deleteRole?.(roleId);
    });
  });
}

function renderRoleList(container, state, openRole, deleteRole) {
  const list = container.querySelector('[data-role-list]');
  if (!list) return;

  const visibleRoles = buildVisibleRoles(state.query, state.roles);
  const sortedRoles = [
    ...visibleRoles.filter((role) => role.system),
    ...visibleRoles.filter((role) => !role.system),
  ];

  if (sortedRoles.length) {
    list.innerHTML = `
      <div class="grid grid-cols-1 gap-1">
        ${sortedRoles.map((role) => renderRoleRow(role)).join('')}
      </div>
    `;
  } else {
    list.innerHTML = `
      <div class="flex min-h-full items-center justify-center px-4 py-6 text-center text-sm text-gray-500">No roles found.</div>
    `;
  }

  bindRoleRowEvents(container, openRole, deleteRole);
}

export function renderRolesPage(container, data = {}) {
  const state =
    container.__rolesState ||
    (container.__rolesState = {
      roles: [],
      focusedRoleId: 'admin',
      nextCustomIndex: 1,
      query: '',
      modalCleanup: null,
      rolesLoaded: false,
      rolesLoading: false,
      rolesError: null,
    });

  if (!Array.isArray(state.roles)) {
    state.roles = [];
  }
  if (!state.nextCustomIndex || !Number.isFinite(state.nextCustomIndex)) {
    state.nextCustomIndex = getNextCustomIndex(state.roles);
  }

  const closeModal = () => {
    if (typeof state.modalCleanup === 'function') {
      state.modalCleanup();
      state.modalCleanup = null;
    }
  };

  const reloadRolesFromServer = async () => {
    const payload = await fetchAdminRbacRoles({ cache: 'no-store' });
    const roles =
      Array.isArray(payload?.roles) && payload.roles.length
        ? payload.roles.map((role) => normalizeLoadedRole(role))
        : createInitialRoles();
    state.roles = roles;
    state.nextCustomIndex = getNextCustomIndex(state.roles);
    renderRolesPage(container, data);
  };

  if (state.rolesLoading && !state.rolesLoaded) {
    container.innerHTML = renderLoadingState();
    return;
  }

  if (!state.rolesLoaded && !state.rolesLoading) {
    container.innerHTML = renderLoadingState();
    void ensureRolesLoaded(container, state, data);
    return;
  }

  if (state.rolesError && !state.roles.length) {
    container.innerHTML = renderErrorState(state.rolesError);
    container.querySelector('[data-role-retry]')?.addEventListener('click', () => {
      state.rolesLoaded = false;
      state.rolesLoading = false;
      state.rolesError = null;
      renderRolesPage(container, data);
    });
    return;
  }

  const roleCount = state.roles.length;

  container.innerHTML = `
    <div class="flex flex-col flex-1 min-h-0 animate-in fade-in duration-300">
      <div class="flex flex-col gap-1 px-1 mt-1.5 mb-3">
        <div class="flex items-center justify-between gap-2">
          <div class="flex items-center md:self-center text-xl font-medium px-0.5 gap-2 shrink-0">
            <div class="text-gray-900">Roles</div>
            <div class="text-lg font-medium text-gray-500">${roleCount}</div>
          </div>
          <div class="flex items-center justify-end gap-1.5 shrink-0">
            ${renderButton({ label: '+ New Role', variant: 'secondary', id: 'create-role-btn', className: 'px-3 py-1.5 text-xs shadow-sm' })}
          </div>
        </div>
      </div>

      <div class="flex flex-col flex-1 min-h-0 py-2.5 bg-white rounded-[2rem] border border-gray-100/50 shadow-sm">
        <div class="flex flex-col sm:flex-row sm:items-center w-full gap-2 py-1 px-4 mb-1">
          <div class="flex flex-1 items-center bg-gray-50/50 px-3 py-1.5 rounded-xl border border-gray-100/30">
            <div class="text-gray-400 mr-2.5">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="size-5">
                <path fill-rule="evenodd" d="M9 3.5a5.5 5.5 0 100 11 5.5 5.5 0 000-11zM2 9a7 7 0 1112.452 4.391l3.328 3.329a.75.75 0 11-1.06 1.06l-3.329-3.328A7 7 0 012 9z" clip-rule="evenodd" />
              </svg>
            </div>
            <input class="w-full text-sm outline-none bg-transparent text-gray-700 placeholder-gray-400" placeholder="Search Roles" id="roles-search" value="${escapeHtml(state.query)}">
            <div id="roles-clear-search-container" class="${state.query ? '' : 'hidden'} ml-1.5">
              <button id="roles-clear-search-btn" class="p-0.5 rounded-full hover:bg-gray-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2.5" stroke="currentColor" class="size-5">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>
        </div>

        <div data-role-list class="px-4 pb-2 pr-5"></div>
      </div>
    </div>
  `;

  const deleteRole = async (roleId) => {
    const role = state.roles.find((item) => item.id === roleId) || null;
    if (!role || role.system) return false;
    if (
      !window.confirm(
        `Delete role ${role.name}? This will permanently remove the role and its assignments.`
      )
    )
      return false;
    const result = await deleteAdminRbacRole(role.id);
    if (result?.error) {
      throw new Error(result.error);
    }
    await reloadRolesFromServer();
    return true;
  };

  const openRole = (roleId, isNew = false) => {
    closeModal();
    state.modalCleanup = openRoleModal(container, state, data, {
      roleId,
      isNew,
      onSaveRole: async (creating, currentRoleId, payload) => {
        if (creating) {
          const result = await createAdminRbacRole(payload);
          const role = result?.role || result;
          if (role?.id) {
            await reloadRolesFromServer();
          }
          return;
        }

        const result = await updateAdminRbacRole(currentRoleId, payload);
        const role = result?.role || result;
        if (role?.id) {
          await reloadRolesFromServer();
        }
      },
      onDeleteRole: deleteRole,
    });
  };

  container.querySelector('#create-role-btn')?.addEventListener('click', () => {
    openRole(null, true);
  });

  container.querySelector('#roles-search')?.addEventListener('input', (event) => {
    const clearSearchContainer = container.querySelector('#roles-clear-search-container');
    if (event.target.value) {
      clearSearchContainer?.classList.remove('hidden');
    } else {
      clearSearchContainer?.classList.add('hidden');
    }
    state.query = String(event.target.value || '');
    renderRoleList(container, state, openRole, deleteRole);
  });

  container.querySelector('#roles-clear-search-btn')?.addEventListener('click', () => {
    const searchInput = container.querySelector('#roles-search');
    const clearSearchContainer = container.querySelector('#roles-clear-search-container');
    if (!searchInput) return;
    searchInput.value = '';
    clearSearchContainer?.classList.add('hidden');
    searchInput.focus();
    state.query = '';
    renderRoleList(container, state, openRole, deleteRole);
  });

  renderRoleList(container, state, openRole, deleteRole);
}
