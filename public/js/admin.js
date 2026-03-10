import { state, setState, subscribe } from './store.js';
import { apiFetch } from './api.js';
import { renderSidebar } from './components/sidebar.js';
import { createUserProfileFooter } from './components/user-profile-footer.js';
import { renderSearchModal } from './components/search-modal.js';
import { renderFilesModal } from './components/files-modal.js';
import { renderUserOverview } from './components/admin/users/overview.js';
import { renderGroupsOverview } from './components/admin/users/groups.js';

function wireSidebar(root) {
  const newChatBtn = root.querySelector('#new-chat');
  const toggleSidebarMobile = root.querySelector('#toggle-sidebar-mobile');
  const toggleSidebarDesktop = root.querySelector('#toggle-sidebar-desktop');
  const sidebar = root.querySelector('#sidebar');
  const sidebarBackdrop = root.querySelector('#sidebar-backdrop');
  const openSearchBtn = root.querySelector('#open-search');
  const searchModalContainer = root.querySelector('#search-modal-container');
  const filesModalContainer = root.querySelector('#files-modal-container');

  const destroySidebar = renderSidebar(sidebar, root);

  createUserProfileFooter().then((footer) => {
    const footerMount = root.querySelector('#sidebar-footer');
    if (footerMount) {
      footerMount.replaceChildren(footer);
    } else {
      sidebar.appendChild(footer);
    }
  });

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

  const unsubscribe = subscribe((currentState) => {
    if (currentState.showSidebar && currentState.isMobile) {
      sidebarBackdrop.classList.remove('hidden');
      document.body.style.overflow = 'hidden';
    } else {
      sidebarBackdrop.classList.add('hidden');
      document.body.style.overflow = '';
    }

  });

  sidebarBackdrop.addEventListener('click', () => setState({ showSidebar: false }));

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
    total: 0,
    groups: [],
    loading: false,
    error: null,
    groupsError: null,
    pagination: {
      page: 1,
      pageSize: 20,
    },
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
      const offset = (data.pagination.page - 1) * data.pagination.pageSize;
      const res = await apiFetch(`/api/admin/users?limit=${data.pagination.pageSize}&offset=${offset}`);
      if (res.status === 403) {
        data.error = 'You do not have permission to manage users.';
      } else if (!res.ok) {
        throw new Error(`Failed to fetch users (${res.status})`);
      } else {
        const payload = await res.json();
        data.users = payload.users || [];
        data.total = payload.total || 0;
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
      <div id="admin-sub-content" class="flex-1 min-h-0 flex flex-col overflow-hidden p-6">${data.loading ? renderLoadingState() : ''}</div>
    `;
  }

  const render = () => {
    if (typeof container.__cleanup === 'function') {
      container.__cleanup();
    }

    container.innerHTML = `
      <div class="flex h-screen w-full bg-white overflow-hidden font-primary text-gray-900">
        <div id="sidebar-backdrop" class="fixed inset-0 bg-black/20 backdrop-blur-sm z-30 transition-opacity duration-300 hidden md:hidden"></div>
        <aside id="sidebar" class="fixed md:relative h-screen md:h-[100dvh] flex-shrink-0 bg-[#f9f9f9] border-r border-gray-100 flex flex-col transition-all duration-500 ease-in-out z-40 md:ml-0 overflow-visible group/sidebar" style="width: 260px; min-width: 260px;">
          <div class="p-3 flex-shrink-0">
            <div id="sidebar-header" class="flex items-center justify-between mb-4 px-2 mt-1 transition-all duration-300">
              <a href="/" class="flex items-center gap-3 sidebar-full-only rounded-lg focus:outline-none focus:ring-1 focus:ring-gray-300">
                <div class="w-7 h-7 bg-white rounded-full flex items-center justify-center border border-gray-100 shadow-sm overflow-hidden">
                  <img src="/logo.png" alt="GrowChat" class="w-5 h-5 object-contain" />
                </div>
                <span class="font-bold text-lg text-gray-800 font-primary">GrowChat</span>
              </a>
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
          <div id="sidebar-footer" class="mt-auto w-full bg-[#f9f9f9]"></div>
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
