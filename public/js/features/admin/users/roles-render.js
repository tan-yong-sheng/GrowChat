/**
 * Row and list render helpers for the admin roles page.
 */
import {
  escapeHtml,
  ROLE_PRESETS,
  createInitialRoles,
  buildVisibleRoles,
  buildVisibleGroups,
  formatRoleSummary,
  renderLoadingState,
  renderErrorState,
} from './roles-helpers.js';

export function renderRoleRow(role) {
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

export function bindRoleRowEvents(container, openRole, deleteRole) {
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

export function renderRoleList(container, state, openRole, deleteRole) {
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
