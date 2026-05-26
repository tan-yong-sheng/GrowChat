/**
 * Role editor modal for the admin roles page.
 */
import {
  createAdminRbacRole,
  updateAdminRbacRole,
  deleteAdminRbacRole,
  fetchAdminRbacRoles,
} from '../../../shared/api.js';
import { setModalSaveButtonState } from '../modal-save-helpers.js';
import {
  ROLE_PRESETS,
  PERMISSION_GROUPS,
  DEFAULT_GROUP_COLLAPSE,
  escapeHtml,
  cloneRole,
  rolesSignature,
  buildVisibleRoles,
  buildVisibleGroups,
  formatRoleSummary,
  createRoleDraft,
  createModalShell,
  renderPermissionGroup,
} from './roles-helpers.js';

export function openRoleModal(
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
