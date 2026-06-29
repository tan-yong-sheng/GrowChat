/**
 * Admin groups page renderer.
 */
import { deleteAdminGroup, fetchAdminGroups } from '../../../shared/api.js';
import { sortGroups, escapeHtml, getGroupModalTheme } from './groups-list-helpers.js';
import { renderButton } from '../../../shared/components/button.js';
import { openCreateModal, openEditModal } from './groups-modal.js';

export function renderEmptyState() {
  return `
    <div class="w-full flex flex-col justify-center items-center py-16 px-4">
      <div class="flex flex-col items-center max-w-xs text-center">
        <div class="text-4xl mb-4 bg-gray-50 p-6 rounded-lg text-blue-500 bg-surface-container">
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

      <div class="flex-1 min-h-0 py-2.5 bg-white rounded-lg border border-gray-100/50 shadow-sm flex flex-col">
        <div class="flex flex-col sm:flex-row sm:items-center w-full gap-2 py-1 px-4 mb-1">
          <div class="flex flex-1 items-center bg-gray-50/50 px-3 py-1.5 rounded-md border border-gray-100/30">
            <div class="text-gray-700 mr-2.5">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="size-5">
                <circle cx="11" cy="11" r="8"></circle>
                <path d="m21 21-4.3-4.3"></path>
              </svg>
            </div>
            <input class="w-full text-sm outline-none bg-transparent text-gray-700 placeholder-gray-400" placeholder="Search Groups" id="group-search-input">
            <div id="clear-search-container" class="hidden ml-1.5">
              <button id="clear-search-btn" class="p-0.5 rounded-full hover:bg-gray-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary/20 transition">
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
                    'flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between px-3.5 py-3 rounded-lg transition-all border border-transparent hover:border-gray-100/50 hover:bg-gray-50/80 group cursor-pointer';
                  const deleteButton = group.is_system
                    ? ''
                    : `
                    <button type="button" class="p-2 hover:bg-red-50 rounded-md text-gray-700 hover:text-red-500 transition-all focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 btn-delete-group" data-group-id="${group.id}" data-group-name="${escapeHtml(group.name)}" aria-label="Delete group">
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
                      <div class="text-label-sm text-gray-700 font-medium">${group.member_count || 0} members</div>
                    </div>
                  </div>
                  <div class="flex items-center justify-end gap-1.5 self-end sm:self-auto">
                    <a href="/admin/users/policies?group=${encodeURIComponent(group.id)}" class="px-2.5 py-1.5 text-label-sm font-semibold rounded-full border border-gray-200 bg-white text-gray-700 transition-all hover:bg-gray-50 btn-manage-group-policies">
                      Manage Policies
                    </a>
                    <button type="button" class="p-2 hover:bg-gray-200 rounded-md text-gray-700 transition-all focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary/20 btn-edit-group" data-group-id="${group.id}" aria-label="Edit group">
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
