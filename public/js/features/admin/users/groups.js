export function renderGroupsOverview(container, data) {
  const groups = data.groups || [];

  container.innerHTML = `
    <div class="flex flex-col h-full animate-in fade-in duration-300">
      <div class="flex flex-col gap-1 px-1 mt-1.5 mb-3">
        <div class="flex justify-between items-center">
          <div class="flex items-center md:self-center text-xl font-medium px-0.5 gap-2 shrink-0">
            <div class="text-gray-900">Groups</div>
            <div class="text-lg font-medium text-gray-500">${groups.length}</div>
          </div>
          <div class="flex w-full justify-end gap-1.5">
            <button class="px-3 py-1.5 rounded-xl bg-gray-900 text-white transition-all hover:opacity-90 font-medium text-sm flex items-center shadow-sm" id="create-group-btn">
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="3" stroke="currentColor" class="size-3.5">
                <path stroke-linecap="round" stroke-linejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
              </svg>
              <div class="ml-1.5 text-xs font-bold">New Group</div>
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
            <span class="text-xs font-medium text-gray-700">Members</span>
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2.5" stroke="currentColor" class="size-3.5 text-gray-400">
              <path stroke-linecap="round" stroke-linejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
            </svg>
          </button>
        </div>

        ${groups.length > 0 ? `
          <div class="my-2 px-4 grid grid-cols-1 gap-1">
            ${groups.map((group) => `
              <div class="flex items-center justify-between px-3.5 py-3 rounded-2xl hover:bg-gray-50/80 transition-all group cursor-pointer border border-transparent hover:border-gray-100/50">
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
                <button class="p-2 hover:bg-gray-200 rounded-xl text-gray-400 opacity-0 group-hover:opacity-100 transition-all btn-edit-group" data-group-id="${group.id}">
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="size-4">
                    <path stroke-linecap="round" stroke-linejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L6.832 19.82a4.5 4.5 0 0 1-1.897 1.13l-2.685.8.8-2.685a4.5 4.5 0 0 1 1.13-1.897L16.863 4.487Zm0 0L19.5 7.125" />
                  </svg>
                </button>
              </div>
            `).join('')}
          </div>
        ` : `
          <div class="w-full flex flex-col justify-center items-center py-16 px-4">
            <div class="flex flex-col items-center max-w-xs text-center">
              <div class="text-4xl mb-4 bg-gray-50 p-6 rounded-[2.5rem] text-blue-500 shadow-inner">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="size-12">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M15 19.128a9.38 9.38 0 0 0 2.625.372 9.337 9.337 0 0 0 4.121-.952 4.125 4.125 0 0 0-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 0 1 8.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0 1 11.964-3.07M12 6.375a3.375 3.375 0 1 1-6.75 0 3.375 3.375 0 0 1 6.75 0Zm8.25 2.25a2.625 2.625 0 1 1-5.25 0 2.625 2.625 0 0 1 5.25 0Z" />
                </svg>
              </div>
              <div class="text-lg font-bold text-gray-900 mb-1.5">No groups found</div>
              <div class="text-gray-500 text-xs leading-relaxed">Use groups to organize your users and assign permissions.</div>
            </div>
          </div>
        `}
      </div>

      <button class="flex items-center justify-between rounded-[1.25rem] w-full transition-all mt-6 hover:bg-gray-50/80 p-3 group border border-transparent hover:border-gray-100/50" id="default-permissions-btn">
        <div class="flex items-center gap-3.5">
          <div class="p-2.5 bg-gray-100 rounded-full text-gray-500 group-hover:bg-gray-200 transition-colors">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="size-4.5">
              <path stroke-linecap="round" stroke-linejoin="round" d="M15.75 6a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0ZM4.501 20.118a7.5 7.5 0 0 1 14.998 0A17.933 17.933 0 0 1 12 21.75c-2.676 0-5.216-.584-7.499-1.632Z" />
            </svg>
          </div>
          <div class="text-left">
            <div class="text-sm font-bold text-gray-900">Default permissions</div>
            <div class="flex text-[11px] mt-0.5 text-gray-500 font-medium">applies to all users with the "user" role</div>
          </div>
        </div>
        <div class="text-gray-400 group-hover:text-gray-600 transition-colors mr-1">
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="3" stroke="currentColor" class="size-4">
            <path stroke-linecap="round" stroke-linejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" />
          </svg>
        </div>
      </button>
    </div>
  `;

  container.querySelector('#create-group-btn')?.addEventListener('click', () => {
    window.alert('Group creation UI is not implemented yet.');
  });
  container.querySelector('#sort-groups-btn')?.addEventListener('click', () => {
    window.alert('Group sorting is not implemented yet.');
  });
  container.querySelector('#default-permissions-btn')?.addEventListener('click', () => {
    window.alert('Default permissions editing is not implemented yet.');
  });
  container.querySelectorAll('.btn-edit-group').forEach((btn) => btn.addEventListener('click', (e) => {
    e.stopPropagation();
    window.alert(`Editing group ${btn.dataset.groupId} is not implemented yet.`);
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
    const groupItems = container.querySelectorAll('.grid > div');
    groupItems.forEach((item) => {
      const text = item.textContent.toLowerCase();
      item.style.display = text.includes(query) ? 'flex' : 'none';
    });
  });

  clearSearchBtn?.addEventListener('click', () => {
    searchInput.value = '';
    clearSearchContainer?.classList.add('hidden');
    searchInput.focus();
    searchInput.dispatchEvent(new Event('input'));
  });
}
