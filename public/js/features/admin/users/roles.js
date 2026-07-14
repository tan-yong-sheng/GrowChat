/**
 * Admin roles page renderer.
 */
import {
  createAdminRbacRole,
  deleteAdminRbacRole,
  fetchAdminRbacRoles,
  updateAdminRbacRole,
} from '../../../shared/api.js';
import { renderButton } from '../../../shared/components/button.js';
import {
  escapeHtml,
  createInitialRoles,
  normalizeLoadedRole,
  getNextCustomIndex,
  loadRolesFromServer,
  ensureRolesLoaded,
  renderLoadingState,
  renderErrorState,
} from './roles-helpers.js';
import { openRoleModal } from './roles-modal.js';
import { renderRoleList } from './roles-render.js';

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
    await loadRolesFromServer(state);
    renderRolesPage(container, data);
  };

  if (state.rolesLoading && !state.rolesLoaded) {
    container.innerHTML = renderLoadingState();
    return;
  }

  if (!state.rolesLoaded && !state.rolesLoading) {
    container.innerHTML = renderLoadingState();
    void ensureRolesLoaded(container, state, data, renderRolesPage);
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
            ${renderButton({
              label: '+ New Role',
              variant: 'secondary',
              id: 'create-role-btn',
              className: 'px-3 py-1.5 text-xs shadow-sm',
            })}
          </div>
        </div>
      </div>
      <div class="flex flex-col flex-1 min-h-0 py-2.5 bg-white rounded-lg border border-gray-100/50 shadow-sm">
        <div class="flex flex-col sm:flex-row sm:items-center w-full gap-2 py-1 px-4 mb-1">
          <div class="flex flex-1 items-center bg-gray-50/50 px-3 py-1.5 rounded-md border border-gray-100/30">
            <div class="text-gray-400 mr-2.5">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="size-5">
                <path fill-rule="evenodd" d="M9 3.5a5.5 5.5 0 100 11 5.5 5.5 0 000-11zM2 9a7 7 0 1112.452 4.391l3.328 3.329a.75.75 0 11-1.06 1.06l-3.329-3.328A7 7 0 012 9z" clip-rule="evenodd" />
              </svg>
            </div>
            <input class="w-full text-sm outline-none bg-transparent text-gray-700 placeholder-gray-400" placeholder="Search Roles" id="roles-search" value="${escapeHtml(state.query)}">
            <div id="roles-clear-search-container" class="${state.query ? '' : 'hidden'} ml-1.5">
              <button id="roles-clear-search-btn" class="p-0.5 rounded-full hover:bg-gray-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary/20 transition">
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
    async function saveAdminRole(creating, currentRoleId, payload) {
      const result = creating
        ? await createAdminRbacRole(payload)
        : await updateAdminRbacRole(currentRoleId, payload);
      const role = result?.role || result;
      if (role?.id) {
        await reloadRolesFromServer();
      }
    }

    closeModal();
    state.modalCleanup = openRoleModal(container, state, data, {
      roleId,
      isNew,
      onSaveRole: saveAdminRole,
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
