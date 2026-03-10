import { state, setState, subscribe } from './store.js';
import { apiFetch, toggleArchiveChat } from './api.js';
import { renderSidebar } from './components/sidebar.js';
import { createUserProfileFooter } from './components/user-profile-footer.js';
import { createFolderSidebar } from './components/folder-sidebar.js';
import { createChatRow } from './components/chat-row.js';
import { groupChatsByTime } from './utils/time-grouping.js';
import { renderSearchModal } from './components/search-modal.js';
import { renderFilesModal } from './components/files-modal.js';
import { renderUserOverview } from './components/admin/users/overview.js';
import { renderGroupsOverview } from './components/admin/users/groups.js';

function wireSidebar(root) {
  const toggleChatsBtn = root.querySelector('#toggle-chats-btn');
  const toggleChatsIcon = root.querySelector('#toggle-chats-icon');
  const chatListContainer = root.querySelector('#chat-list-container');
  const chatList = root.querySelector('#chat-list');
  const newChatBtn = root.querySelector('#new-chat');
  const toggleSidebarMobile = root.querySelector('#toggle-sidebar-mobile');
  const toggleSidebarDesktop = root.querySelector('#toggle-sidebar-desktop');
  const sidebar = root.querySelector('#sidebar');
  const sidebarBackdrop = root.querySelector('#sidebar-backdrop');
  const openSearchBtn = root.querySelector('#open-search');
  const searchModalContainer = root.querySelector('#search-modal-container');
  const filesModalContainer = root.querySelector('#files-modal-container');

  const PINNED_COLLAPSED_KEY = 'growchat_pinned_section_collapsed';
  let pinnedSectionCollapsed = false;
  try {
    pinnedSectionCollapsed = localStorage.getItem(PINNED_COLLAPSED_KEY) === '1';
  } catch {
    pinnedSectionCollapsed = false;
  }

  const destroySidebar = renderSidebar(sidebar, root);

  const getChatHandlers = (chat) => ({
    onClick: (id) => {
      setState({ activeChatId: id });
      window.location.href = `/?chat=${id}`;
    },
    rename: async (id) => {
      const newTitle = window.prompt('Enter new title:', chat.title);
      if (newTitle && newTitle !== chat.title) {
        await apiFetch(`/api/chats/${id}`, {
          method: 'PUT',
          body: JSON.stringify({ title: newTitle })
        });
        const res = await apiFetch('/api/chats');
        if (res.ok) {
          const refreshed = await res.json();
          setState({ chats: refreshed.chats || [] });
        }
      }
    },
    pin: async (id) => {
      const res = await apiFetch(`/api/chats/${id}/pin`, { method: 'POST' });
      if (res.ok) {
        const refreshedRes = await apiFetch('/api/chats');
        if (refreshedRes.ok) {
          const refreshed = await refreshedRes.json();
          setState({ chats: refreshed.chats || [] });
        }
      }
    },
    archive: async (id) => {
      await toggleArchiveChat(id);
      const res = await apiFetch('/api/chats');
      if (res.ok) {
        const refreshed = await res.json();
        setState({ chats: refreshed.chats || [] });
      }
    },
    delete: async (id) => {
      if (window.confirm('Are you sure you want to delete this chat?')) {
        await apiFetch(`/api/chats/${id}`, { method: 'DELETE' });
        const res = await apiFetch('/api/chats');
        if (res.ok) {
          const refreshed = await res.json();
          setState({ chats: refreshed.chats || [] });
        }
      }
    }
  });

  createFolderSidebar(getChatHandlers).then((folderContainer) => {
    chatList.parentNode.insertBefore(folderContainer, chatList);
  });

  createUserProfileFooter().then((footer) => {
    sidebar.appendChild(footer);
  });

  function drawChats(chats, activeId) {
    const mainListChats = chats.filter((c) => !c.folder_id);
    const pinnedChats = mainListChats.filter((c) => Number(c.pinned) === 1);
    const regularChats = mainListChats.filter((c) => Number(c.pinned) !== 1);
    const groups = groupChatsByTime(regularChats);
    const groupLabels = {
      today: 'Today',
      yesterday: 'Yesterday',
      lastWeek: 'Last 7 Days',
      older: 'Older'
    };

    chatList.innerHTML = '';

    const appendChatRows = (list) => {
      const itemsContainer = document.createElement('div');
      itemsContainer.className = 'chat-group-items';

      list.forEach((chatItem) => {
        const handlers = getChatHandlers(chatItem);
        const row = createChatRow(chatItem, handlers);
        if (chatItem.id === activeId) {
          row.classList.add('active');
        }
        itemsContainer.appendChild(row);
      });

      chatList.appendChild(itemsContainer);
    };

    if (pinnedChats.length > 0) {
      const pinnedHeader = document.createElement('button');
      pinnedHeader.type = 'button';
      pinnedHeader.className = 'chat-group-header sidebar-full-only pinned flex items-center gap-1.5 cursor-pointer select-none hover:text-gray-600 transition-colors';
      pinnedHeader.innerHTML = `
        <svg class="w-3.5 h-3.5 transition-transform ${pinnedSectionCollapsed ? '-rotate-90' : ''}" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
          <path fill-rule="evenodd" d="M5.23 7.21a.75.75 0 0 1 1.06.02L10 11.17l3.71-3.94a.75.75 0 1 1 1.1 1.02l-4.25 4.5a.75.75 0 0 1-1.1 0l-4.25-4.5a.75.75 0 0 1 .02-1.04Z" clip-rule="evenodd" />
        </svg>
        <span>Pinned</span>
      `;
      pinnedHeader.addEventListener('click', () => {
        pinnedSectionCollapsed = !pinnedSectionCollapsed;
        try {
          localStorage.setItem(PINNED_COLLAPSED_KEY, pinnedSectionCollapsed ? '1' : '0');
        } catch {}
        drawChats(state.chats, state.activeChatId);
      });
      chatList.appendChild(pinnedHeader);

      if (!pinnedSectionCollapsed) {
        appendChatRows(pinnedChats);
      }
    }

    Object.entries(groups).forEach(([key, groupedChats]) => {
      if (groupedChats.length === 0) return;

      const header = document.createElement('div');
      header.className = `chat-group-header sidebar-full-only ${key}`;
      header.textContent = groupLabels[key];
      chatList.appendChild(header);
      appendChatRows(groupedChats);
    });
  }

  const destroySearchModal = renderSearchModal(searchModalContainer, () => window.location.href = '/', () => window.location.href = '/');
  const destroyFilesModal = renderFilesModal(filesModalContainer);

  const onToggleSidebar = () => {
    if (state.isMobile) {
      setState({ showSidebar: !state.showSidebar });
    } else if (!state.showSidebar) {
      setState({ showSidebar: true });
    } else {
      setState({ sidebarCollapsed: !state.sidebarCollapsed });
    }
  };
  const onOpenSearch = () => setState({ showSearch: true });
  const onNewChat = () => {
    window.location.href = '/';
  };

  toggleSidebarMobile.addEventListener('click', onToggleSidebar);
  toggleSidebarDesktop.addEventListener('click', onToggleSidebar);
  openSearchBtn.addEventListener('click', onOpenSearch);
  newChatBtn.addEventListener('click', onNewChat);

  let isChatsCollapsed = false;
  toggleChatsBtn.addEventListener('click', () => {
    isChatsCollapsed = !isChatsCollapsed;
    if (isChatsCollapsed) {
      chatListContainer.classList.add('hidden');
      toggleChatsIcon.classList.add('rotate-180');
    } else {
      chatListContainer.classList.remove('hidden');
      toggleChatsIcon.classList.remove('rotate-180');
    }
  });

  const unsubscribe = subscribe((currentState) => {
    if (currentState.showSidebar && currentState.isMobile) {
      sidebarBackdrop.classList.remove('hidden');
      document.body.style.overflow = 'hidden';
    } else {
      sidebarBackdrop.classList.add('hidden');
      document.body.style.overflow = '';
    }

    drawChats(currentState.chats, currentState.activeChatId);
  });

  sidebarBackdrop.addEventListener('click', () => setState({ showSidebar: false }));

  drawChats(state.chats, state.activeChatId);

  root.__cleanup = () => {
    unsubscribe();
    destroySearchModal?.();
    destroyFilesModal?.();
    destroySidebar?.();
  };
}

function renderLoadingState() {
  return '<div class="flex items-center justify-center h-64"><div class="animate-spin rounded-full h-6 w-6 border-b-2 border-gray-900 dark:border-white"></div></div>';
}

function renderErrorState(message) {
  return `
    <div class="flex items-center justify-center h-full p-6">
      <div class="max-w-md w-full rounded-3xl border border-red-100 bg-red-50/60 p-6 text-center">
        <div class="text-sm font-semibold text-red-700">Unable to load admin users</div>
        <div class="mt-2 text-sm text-red-600">${message}</div>
      </div>
    </div>
  `;
}

function renderSettingsState() {
  return `
    <div class="flex-1 flex flex-col overflow-y-auto p-10 max-w-3xl mx-auto w-full">
      <h2 class="text-2xl font-medium mb-8">Admin Settings</h2>
      <div class="space-y-6">
        <div class="flex items-center justify-between p-4 bg-gray-50 rounded-2xl">
          <div>
            <div class="font-medium">Public Registration</div>
            <div class="text-xs text-gray-500">Allow anyone to create an account.</div>
          </div>
          <div class="text-xs text-gray-400">Pending backend wiring</div>
        </div>
      </div>
    </div>
  `;
}

export async function renderAdminPage(container) {
  let mainTab = 'users';
  let subTab = 'overview';
  let data = {
    users: [],
    groups: [],
    loading: false,
    error: null,
    groupsError: null,
  };

  const updateRouteInfo = () => {
    const path = window.location.pathname;
    if (path.startsWith('/admin/settings')) {
      mainTab = 'settings';
      return;
    }

    mainTab = 'users';
    subTab = path.includes('/groups') ? 'groups' : 'overview';
  };

  async function loadUsers() {
    data.loading = true;
    data.error = null;
    render();
    try {
      const res = await apiFetch('/api/admin/users');
      if (res.status === 403) {
        data.error = 'You do not have permission to manage users.';
      } else if (!res.ok) {
        throw new Error(`Failed to fetch users (${res.status})`);
      } else {
        const payload = await res.json();
        data.users = payload.users || [];
      }
    } catch (err) {
      data.error = err.message || 'Failed to fetch users.';
    } finally {
      data.loading = false;
      render();
    }
  }

  function renderMainContent() {
    if (mainTab === 'settings') {
      return renderSettingsState();
    }

    return `
      <div id="users-tabs-container" class="w-52 flex-none flex flex-col p-4 gap-1 text-sm font-medium border-r border-gray-50">
        <a href="/admin/users/overview" data-subnav="overview" class="flex items-center gap-2 px-3 py-2 rounded-lg transition ${subTab === 'overview' ? 'bg-gray-100 text-gray-900' : 'text-gray-400 hover:text-gray-700'}">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" class="size-4">
            <path d="M8.5 4.5a2.5 2.5 0 1 1-5 0 2.5 2.5 0 0 1 5 0ZM10.9 12.006c.11.542-.348.994-.9.994H2c-.553 0-1.01-.452-.902-.994a5.002 5.002 0 0 1 9.803 0ZM14.002 12h-1.59a2.556 2.556 0 0 0-.04-.29 6.476 6.476 0 0 0-1.167-2.603 3.002 3.002 0 0 1 3.633 1.911c.18.522-.283.982-.836.982ZM12 8a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z"/>
          </svg>
          <span>Overview</span>
        </a>
        <a href="/admin/users/groups" data-subnav="groups" class="flex items-center gap-2 px-3 py-2 rounded-lg transition ${subTab === 'groups' ? 'bg-gray-100 text-gray-900' : 'text-gray-400 hover:text-gray-700'}">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" class="size-4">
            <path d="M8 8a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5ZM3.156 11.763c.16-.629.44-1.21.813-1.72a2.5 2.5 0 0 0-2.725 1.377c-.136.287.102.58.418.58h1.449c.01-.077.025-.156.045-.237ZM12.847 11.763c.02.08.036.16.046.237h1.446c.316 0 .554-.293.417-.579a2.5 2.5 0 0 0-2.722-1.378c.374.51.653 1.09.813 1.72ZM14 7.5a1.5 1.5 0 1 1-3 0 1.5 1.5 0 0 1 3 0ZM3.5 9a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3ZM5 13c-.552 0-1.013-.455-.876-.99a4.002 4.002 0 0 1 7.753 0c.136.535-.324.99-.877.99H5Z"/>
          </svg>
          <span>Groups</span>
        </a>
      </div>
      <div id="admin-sub-content" class="flex-1 flex flex-col overflow-hidden p-6">${data.loading ? renderLoadingState() : ''}</div>
    `;
  }

  const render = () => {
    if (typeof container.__cleanup === 'function') {
      container.__cleanup();
    }

    container.innerHTML = `
      <div class="flex h-screen w-full bg-white overflow-hidden font-primary text-gray-900">
        <div id="sidebar-backdrop" class="fixed inset-0 bg-black/20 backdrop-blur-sm z-30 transition-opacity duration-300 hidden md:hidden"></div>
        <aside id="sidebar" class="fixed md:relative h-full flex-shrink-0 bg-[#f9f9f9] border-r border-gray-100 flex flex-col transition-all duration-500 ease-in-out z-40 md:ml-0 overflow-visible group/sidebar" style="width: 260px; min-width: 260px;">
          <div class="p-3 flex-shrink-0">
            <div id="sidebar-header" class="flex items-center justify-between mb-4 px-2 mt-1 transition-all duration-300">
              <div class="flex items-center gap-3 sidebar-full-only">
                <div class="w-7 h-7 bg-white rounded-full flex items-center justify-center border border-gray-100 shadow-sm overflow-hidden">
                  <img src="/logo.png" alt="GrowChat" class="w-5 h-5 object-contain" />
                </div>
                <span class="font-bold text-lg text-gray-800 font-primary">GrowChat</span>
              </div>
              <button id="toggle-sidebar-desktop" class="sidebar-full-only md:block p-1 text-gray-500 hover:bg-gray-200 rounded-lg transition-colors ml-auto" title="Close Sidebar">
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="3" y1="12" x2="21" y2="12"></line><line x1="3" y1="6" x2="21" y2="6"></line><line x1="3" y1="18" x2="21" y2="18"></line></svg>
              </button>
            </div>
            <div class="space-y-1">
              <button id="new-chat" class="flex items-center justify-between px-3 py-2 w-full hover:bg-white rounded-xl transition text-sm font-semibold text-gray-700 font-primary group/new-chat">
                <div class="flex items-center gap-3">
                  <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="sidebar-collapsed-scale transition-transform duration-300"><path d="M12 20h9"></path><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"></path></svg>
                  <span class="sidebar-full-only">New Chat</span>
                </div>
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="sidebar-full-only"><path d="M12 5v14M5 12h14"></path></svg>
              </button>
              <button id="open-search" class="flex items-center gap-3 px-3 py-2 w-full hover:bg-white rounded-xl transition text-sm font-semibold text-gray-700 font-primary group/search">
                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="sidebar-collapsed-scale transition-transform duration-300"><circle cx="11" cy="11" r="8"></circle><path d="m21 21-4.3-4.3"></path></svg>
                <span class="sidebar-full-only">Search</span>
              </button>
            </div>
          </div>
          <div class="flex-1 min-h-0"></div>
          <div class="px-3 pb-4 mt-auto">
            <button id="toggle-chats-btn" class="flex items-center justify-between w-full text-[11px] font-semibold text-gray-400 px-3 py-2 mt-2 uppercase tracking-wider sidebar-full-only hover:text-gray-600 transition-colors group">
              <span>Chats</span>
              <svg id="toggle-chats-icon" xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="transition-transform duration-200"><polyline points="18 15 12 9 6 15"></polyline></svg>
            </button>
            <div class="hidden flex-grow overflow-y-auto no-scrollbar sidebar-full-only" id="chat-list-container">
              <ul id="chat-list" class="space-y-0.5"></ul>
            </div>
          </div>
        </aside>
        <div class="flex-1 flex flex-col min-w-0">
          <nav class="px-4 pt-2 border-b border-gray-50 bg-white/80 backdrop-blur-md sticky top-0 z-20">
            <div class="flex items-center gap-1">
              <button id="toggle-sidebar-mobile" class="p-2 mr-2 hover:bg-gray-100 rounded-lg transition text-gray-500 md:hidden" title="Open Sidebar">
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="3" y1="12" x2="21" y2="12"></line><line x1="3" y1="6" x2="21" y2="6"></line><line x1="3" y1="18" x2="21" y2="18"></line></svg>
              </button>
              <div class="flex w-full">
                <div class="flex gap-1 scrollbar-none overflow-x-auto w-fit text-center text-sm font-medium pt-1">
                  <a href="/admin/users/overview" data-nav="users" class="min-w-fit p-1.5 transition select-none ${mainTab === 'users' ? 'text-gray-900 underline underline-offset-[10px] decoration-2' : 'text-gray-300 hover:text-gray-700'}">Users</a>
                  <a href="/admin/settings" data-nav="settings" class="min-w-fit p-1.5 transition select-none ${mainTab === 'settings' ? 'text-gray-900 underline underline-offset-[10px] decoration-2' : 'text-gray-300 hover:text-gray-700'}">Settings</a>
                </div>
                <div class="ml-auto flex items-center">
                  <a href="/" class="p-1.5 text-gray-400 hover:text-gray-600 transition-colors" title="Close">
                    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                  </a>
                </div>
              </div>
            </div>
          </nav>
          <div class="flex-1 flex overflow-hidden" id="admin-main-content">${renderMainContent()}</div>
        </div>
      </div>
      <div id="search-modal-container"></div>
      <div id="files-modal-container"></div>
    `;

    wireSidebar(container);

    if (mainTab === 'users') {
      const mainContentEl = container.querySelector('#admin-sub-content');
      if (mainContentEl) {
        if (data.loading) {
          mainContentEl.innerHTML = renderLoadingState();
        } else if (data.error) {
          mainContentEl.innerHTML = renderErrorState(data.error);
        } else if (subTab === 'overview') {
          renderUserOverview(mainContentEl, data, loadUsers);
        } else {
          renderGroupsOverview(mainContentEl, data);
        }
      }
    }

    container.querySelectorAll('a[data-nav]').forEach((link) => {
      link.onclick = (e) => {
        e.preventDefault();
        const nav = link.dataset.nav;
        const newPath = nav === 'users' ? '/admin/users/overview' : '/admin/settings';
        window.history.pushState({}, '', newPath);
        updateRouteInfo();
        render();
        if (mainTab === 'users' && data.users.length === 0 && !data.loading) {
          loadUsers();
        }
      };
    });

    container.querySelectorAll('a[data-subnav]').forEach((link) => {
      link.onclick = (e) => {
        e.preventDefault();
        const nav = link.dataset.subnav;
        window.history.pushState({}, '', `/admin/users/${nav}`);
        updateRouteInfo();
        render();
      };
    });
  };

  updateRouteInfo();
  render();
  if (mainTab === 'users' && data.users.length === 0) {
    await loadUsers();
  }
}
