import { state, setState, subscribe } from './store.js';
import { apiFetch } from './api.js';
import { renderSidebar } from './components/sidebar.js';
import { createUserProfileFooter } from './components/user-profile-footer.js';
import { renderSearchModal } from './components/search-modal.js';
import { renderFilesModal } from './components/files-modal.js';
import { renderUserOverview } from './components/admin/users/overview.js';
import { renderGroupsOverview } from './components/admin/users/groups.js';
import { renderGeneralSettings } from './components/admin/settings/general.js';
import { renderConnectionsSettings } from './components/admin/settings/connections.js';
import { renderModelsSettings } from './components/admin/settings/models.js';
import { renderIntegrationsSettings } from './components/admin/settings/integrations.js';
import { renderCurrentRoute } from './app.js';

function wireSidebar(root) {
  const newChatBtn = root.querySelector('#new-chat');
  const homeLink = root.querySelector('#admin-home-link');
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

  const navigateHome = () => {
    window.history.pushState({}, '', '/');
    renderCurrentRoute();
  };

  const destroySearchModal = renderSearchModal(searchModalContainer, navigateHome, navigateHome);
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
  const onNewChat = () => navigateHome();

  toggleSidebarMobile.addEventListener('click', onToggleSidebar);
  toggleSidebarDesktop.addEventListener('click', onToggleSidebar);
  openSearchBtn.addEventListener('click', onOpenSearch);
  newChatBtn.addEventListener('click', onNewChat);
  homeLink?.addEventListener('click', (e) => {
    e.preventDefault();
    navigateHome();
  });

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

function renderSettingsSkeleton() {
  return `
    <div class="flex flex-col h-full min-h-0 animate-in fade-in duration-150 w-full">
      <div class="pt-0.5 pb-6 sticky top-0 z-10 bg-white">
        <div class="max-w-2xl mx-auto w-full flex justify-between items-center">
          <div class="h-6 w-32 bg-gray-100 rounded animate-pulse"></div>
        </div>
      </div>
      <div class="flex-1 min-h-0 overflow-y-auto scrollbar-hidden">
        <div class="max-w-2xl mx-auto w-full space-y-6 pb-6">
          <div class="space-y-3">
            <div class="h-4 w-24 bg-gray-100 rounded animate-pulse"></div>
            <div class="h-10 w-full bg-gray-100 rounded-xl animate-pulse"></div>
            <div class="h-10 w-full bg-gray-100 rounded-xl animate-pulse"></div>
          </div>
          <div class="space-y-3">
            <div class="h-4 w-28 bg-gray-100 rounded animate-pulse"></div>
            <div class="h-10 w-full bg-gray-100 rounded-xl animate-pulse"></div>
          </div>
        </div>
      </div>
      <div class="shrink-0 flex justify-end pt-4 pb-3 px-0.5 border-t border-gray-100 bg-white">
        <div class="h-9 w-24 bg-gray-100 rounded-full animate-pulse"></div>
      </div>
    </div>
  `;
}

function renderErrorState(message) {
  return `
    <div class="flex items-center justify-center h-full p-6">
      <div class="max-w-md w-full rounded-3xl border border-red-100 bg-red-50/60 p-6 text-center">
        <div class="text-sm font-semibold text-red-700">Unable to load admin content</div>
        <div class="mt-2 text-sm text-red-600">${message}</div>
      </div>
    </div>
  `;
}

function renderSettingsLayout(subTab) {
  return `
    <div class="flex flex-col md:flex-row h-full w-full">
      <div id="settings-tabs-container" class="w-full md:w-52 flex-none flex flex-row md:flex-col p-2 md:p-4 gap-1 text-sm font-medium border-b md:border-b-0 md:border-r border-gray-50 overflow-x-auto">
      <a href="/admin/settings/general" data-subnav="general" class="flex items-center gap-2 px-3 py-2 rounded-lg transition ${subTab === 'general' ? 'bg-gray-100 text-gray-900' : 'text-gray-400 hover:text-gray-700'}">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" class="size-4">
          <path d="M8 8a2 2 0 1 0 0-4 2 2 0 0 0 0 4ZM3 12a3 3 0 0 1 3-3h4a3 3 0 0 1 3 3v1H3v-1Z"/>
        </svg>
        <span class="whitespace-nowrap">General</span>
      </a>
      <a href="/admin/settings/connections" data-subnav="connections" class="flex items-center gap-2 px-3 py-2 rounded-lg transition ${subTab === 'connections' ? 'bg-gray-100 text-gray-900' : 'text-gray-400 hover:text-gray-700'}">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" class="size-4">
          <path d="M4 3a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2H4Zm0 1.5h8a.5.5 0 0 1 .5.5v2.5h-9V5a.5.5 0 0 1 .5-.5Zm8 7H4a.5.5 0 0 1-.5-.5v-2h9v2a.5.5 0 0 1-.5.5Z"/>
        </svg>
        <span class="whitespace-nowrap">Connections</span>
      </a>
      <a href="/admin/settings/models" data-subnav="models" class="flex items-center gap-2 px-3 py-2 rounded-lg transition ${subTab === 'models' ? 'bg-gray-100 text-gray-900' : 'text-gray-400 hover:text-gray-700'}">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" class="size-4">
          <path fill-rule="evenodd" d="M2 4.25A2.25 2.25 0 0 1 4.25 2h7.5A2.25 2.25 0 0 1 14 4.25v7.5A2.25 2.25 0 0 1 11.75 14h-7.5A2.25 2.25 0 0 1 2 11.75v-7.5Zm2.25-.75a.75.75 0 0 0-.75.75v7.5c0 .414.336.75.75.75h7.5a.75.75 0 0 0 .75-.75v-7.5a.75.75 0 0 0-.75-.75h-7.5Z" clip-rule="evenodd" />
          <path d="M4.75 5.5a.75.75 0 0 1 .75-.75h5a.75.75 0 0 1 0 1.5h-5a.75.75 0 0 1-.75-.75ZM4.75 8a.75.75 0 0 1 .75-.75h5a.75.75 0 0 1 0 1.5h-5A.75.75 0 0 1 4.75 8ZM5.5 9.75a.75.75 0 0 0 0 1.5h3a.75.75 0 0 0 0-1.5h-3Z" />
        </svg>
        <span class="whitespace-nowrap">Models</span>
      </a>
      <a href="/admin/settings/integrations" data-subnav="integrations" class="flex items-center gap-2 px-3 py-2 rounded-lg transition ${subTab === 'integrations' ? 'bg-gray-100 text-gray-900' : 'text-gray-400 hover:text-gray-700'}">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" class="size-4">
          <path fill-rule="evenodd" d="M3.75 3A1.75 1.75 0 0 0 2 4.75v6.5c0 .966.784 1.75 1.75 1.75h8.5A1.75 1.75 0 0 0 14 11.25v-6.5A1.75 1.75 0 0 0 12.25 3h-8.5ZM12.5 4.75a.25.25 0 0 0-.25-.25h-8.5a.25.25 0 0 0-.25.25v6.5c0 .138.112.25.25.25h8.5a.25.25 0 0 0 .25-.25v-6.5Z" clip-rule="evenodd" />
          <path fill-rule="evenodd" d="M6 7a1 1 0 1 1 2 0 1 1 0 0 1-2 0ZM10 7a1 1 0 1 1 2 0 1 1 0 0 1-2 0ZM6 9a1 1 0 1 1 2 0 1 1 0 0 1-2 0ZM10 9a1 1 0 1 1 2 0 1 1 0 0 1-2 0Z" clip-rule="evenodd" />
        </svg>
        <span class="whitespace-nowrap">Integrations</span>
      </a>
      </div>
      <div id="admin-sub-content" class="flex-1 min-h-0 flex flex-col overflow-hidden p-4 md:p-6"></div>
    </div>
  `;
}

function renderUsersLayout(subTab) {
  return `
    <div class="flex flex-col md:flex-row h-full w-full">
      <div id="users-tabs-container" class="w-full md:w-52 flex-none flex flex-row md:flex-col p-2 md:p-4 gap-1 text-sm font-medium border-b md:border-b-0 md:border-r border-gray-50 overflow-x-auto">
      <a href="/admin/users/overview" data-subnav="overview" class="flex items-center gap-2 px-3 py-2 rounded-lg transition ${subTab === 'overview' ? 'bg-gray-100 text-gray-900' : 'text-gray-400 hover:text-gray-700'}">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" class="size-4">
          <path d="M8.5 4.5a2.5 2.5 0 1 1-5 0 2.5 2.5 0 0 1 5 0ZM10.9 12.006c.11.542-.348.994-.9.994H2c-.553 0-1.01-.452-.902-.994a5.002 5.002 0 0 1 9.803 0ZM14.002 12h-1.59a2.556 2.556 0 0 0-.04-.29 6.476 6.476 0 0 0-1.167-2.603 3.002 3.002 0 0 1 3.633 1.911c.18.522-.283.982-.836.982ZM12 8a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z"/>
        </svg>
        <span class="whitespace-nowrap">Overview</span>
      </a>
      <a href="/admin/users/groups" data-subnav="groups" class="flex items-center gap-2 px-3 py-2 rounded-lg transition ${subTab === 'groups' ? 'bg-gray-100 text-gray-900' : 'text-gray-400 hover:text-gray-700'}">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" class="size-4">
          <path d="M8 8a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5ZM3.156 11.763c.16-.629.44-1.21.813-1.72a2.5 2.5 0 0 0-2.725 1.377c-.136.287.102.58.418.58h1.449c.01-.077.025-.156.045-.237ZM12.847 11.763c.02.08.036.16.046.237h1.446c.316 0 .554-.293.417-.579a2.5 2.5 0 0 0-2.722-1.378c.374.51.653 1.09.813 1.72ZM14 7.5a1.5 1.5 0 1 1-3 0 1.5 1.5 0 0 1 3 0ZM3.5 9a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3ZM5 13c-.552 0-1.013-.455-.876-.99a4.002 4.002 0 0 1 7.753 0c.136.535-.324.99-.877.99H5Z"/>
        </svg>
        <span class="whitespace-nowrap">Groups</span>
      </a>
      </div>
      <div id="admin-sub-content" class="flex-1 min-h-0 flex flex-col overflow-hidden p-4 md:p-6"></div>
    </div>
  `;
}

export async function renderAdminPage(container) {
  let mainTab = 'users';
  let subTab = 'overview';
  let shellMounted = false;
  let data = {
    users: [],
    total: 0,
    groups: [],
    loading: false,
    loadingMode: 'initial',
    error: null,
    groupsError: null,
    usersCache: {},
    pagination: {
      page: 1,
      pageSize: 20,
    },
    settingsDirtyCheckers: {},
    settingsSaveHandlers: {},
    settingsDiscardHandlers: {},
  };

  const updateRouteInfo = () => {
    const path = window.location.pathname;
    
    if (path === '/admin/users' || path === '/admin/users/') {
      window.history.replaceState({}, '', '/admin/users/overview');
      mainTab = 'users';
      subTab = 'overview';
      return;
    }

    if (path === '/admin/settings' || path === '/admin/settings/') {
      window.history.replaceState({}, '', '/admin/settings/general');
      mainTab = 'settings';
      subTab = 'general';
      return;
    }

    if (path.startsWith('/admin/settings')) {
      mainTab = 'settings';
      if (path.includes('/connections')) subTab = 'connections';
      else if (path.includes('/integrations')) subTab = 'integrations';
      else if (path.includes('/models')) subTab = 'models';
      else subTab = 'general';
      return;
    }

    mainTab = 'users';
    subTab = path.includes('/groups') ? 'groups' : 'overview';
  };

  const promptUnsavedChanges = () => new Promise((resolve) => {
    const existing = document.querySelector('#admin-unsaved-modal');
    if (existing) existing.remove();
    const overlay = document.createElement('div');
    overlay.id = 'admin-unsaved-modal';
    overlay.className = 'fixed inset-0 z-[200] flex items-center justify-center p-4';
    overlay.innerHTML = `
      <div class="absolute inset-0 bg-black/30 backdrop-blur-sm"></div>
      <div class="relative w-full max-w-md rounded-3xl bg-white shadow-xl border border-gray-100">
        <div class="px-6 pt-6 pb-3">
          <div class="text-lg font-semibold text-gray-900">Unsaved changes</div>
          <p class="text-sm text-gray-500 mt-2">You have unsaved changes. Save them before leaving this page?</p>
        </div>
        <div class="px-6 pb-6 flex items-center justify-end gap-2">
          <button id="unsaved-cancel" class="px-4 py-2 rounded-full text-sm text-gray-500 hover:bg-gray-50">Cancel</button>
          <button id="unsaved-discard" class="px-4 py-2 rounded-full text-sm text-gray-600 hover:bg-gray-100">Discard</button>
          <button id="unsaved-save" class="px-4 py-2 rounded-full text-sm text-white bg-black hover:bg-gray-900">Save</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);

    const cleanup = () => overlay.remove();
    overlay.querySelector('#unsaved-cancel')?.addEventListener('click', () => {
      cleanup();
      resolve('cancel');
    });
    overlay.querySelector('#unsaved-discard')?.addEventListener('click', () => {
      cleanup();
      resolve('discard');
    });
    overlay.querySelector('#unsaved-save')?.addEventListener('click', () => {
      cleanup();
      resolve('save');
    });
  });

  const guardSettingsNavigation = async () => {
    if (mainTab !== 'settings') return true;
    const dirtyFn = data.settingsDirtyCheckers?.[subTab];
    const isDirty = typeof dirtyFn === 'function' ? dirtyFn() : false;
    if (!isDirty) return true;
    const action = await promptUnsavedChanges();
    if (action === 'cancel') return false;
    if (action === 'discard') {
      const discard = data.settingsDiscardHandlers?.[subTab];
      if (typeof discard === 'function') discard();
      return true;
    }
    if (action === 'save') {
      const save = data.settingsSaveHandlers?.[subTab];
      if (typeof save === 'function') {
        try {
          await save();
        } catch {
          return false;
        }
        const stillDirty = typeof dirtyFn === 'function' ? dirtyFn() : false;
        return !stillDirty;
      }
      return true;
    }
    return true;
  };

  const sortUsers = (users) => users
    .slice()
    .sort((a, b) => {
      const roleOrder = { admin: 0, user: 1, inactive: 2 };
      const roleDiff = (roleOrder[a.role] ?? 3) - (roleOrder[b.role] ?? 3);
      if (roleDiff !== 0) return roleDiff;
      const nameDiff = String(a.name || '').localeCompare(String(b.name || ''), undefined, { sensitivity: 'base' });
      if (nameDiff !== 0) return nameDiff;
      return String(a.email || '').localeCompare(String(b.email || ''), undefined, { sensitivity: 'base' });
    });

  const clearUsersCache = () => {
    data.usersCache = {};
  };

  const updateCachedUser = (updatedUser) => {
    Object.keys(data.usersCache).forEach((key) => {
      const cached = data.usersCache[key];
      const hasUser = cached.users.some((user) => user.id === updatedUser.id);
      if (!hasUser) return;
      cached.users = sortUsers(cached.users.map((user) => user.id === updatedUser.id ? { ...user, ...updatedUser } : user));
    });
  };

  const removeCachedUser = (userId) => {
    clearUsersCache();
    data.users = data.users.filter((user) => user.id !== userId);
    data.total = Math.max(0, data.total - 1);
  };

  const prependCachedUser = (user) => {
    clearUsersCache();
    data.users = sortUsers([user, ...data.users]).slice(0, data.pagination.pageSize);
    data.total += 1;
  };

  const renderSubContent = () => {
    const mainContentEl = container.querySelector('#admin-main-content');
    if (!mainContentEl) return;

    const tabsContainer = container.querySelector('#users-tabs-container') || container.querySelector('#settings-tabs-container');
    
    if (!tabsContainer) {
      if (mainTab === 'users') {
        mainContentEl.innerHTML = renderUsersLayout(subTab);
      } else {
        mainContentEl.innerHTML = renderSettingsLayout(subTab);
      }
      bindSubnav();
    } else {
      if (mainTab === 'users') {
        tabsContainer.id = 'users-tabs-container';
        tabsContainer.innerHTML = `
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
        `;
      } else {
        tabsContainer.id = 'settings-tabs-container';
        tabsContainer.innerHTML = `
          <a href="/admin/settings/general" data-subnav="general" class="flex items-center gap-2 px-3 py-2 rounded-lg transition ${subTab === 'general' ? 'bg-gray-100 text-gray-900' : 'text-gray-400 hover:text-gray-700'}">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" class="size-4">
              <path d="M8 8a2 2 0 1 0 0-4 2 2 0 0 0 0 4ZM3 12a3 3 0 0 1 3-3h4a3 3 0 0 1 3 3v1H3v-1Z"/>
            </svg>
            <span>General</span>
          </a>
          <a href="/admin/settings/connections" data-subnav="connections" class="flex items-center gap-2 px-3 py-2 rounded-lg transition ${subTab === 'connections' ? 'bg-gray-100 text-gray-900' : 'text-gray-400 hover:text-gray-700'}">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" class="size-4">
              <path d="M4 3a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2H4Zm0 1.5h8a.5.5 0 0 1 .5.5v2.5h-9V5a.5.5 0 0 1 .5-.5Zm8 7H4a.5.5 0 0 1-.5-.5v-2h9v2a.5.5 0 0 1-.5.5Z"/>
            </svg>
            <span>Connections</span>
          </a>
          <a href="/admin/settings/models" data-subnav="models" class="flex items-center gap-2 px-3 py-2 rounded-lg transition ${subTab === 'models' ? 'bg-gray-100 text-gray-900' : 'text-gray-400 hover:text-gray-700'}">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" class="size-4">
              <path fill-rule="evenodd" d="M2 4.25A2.25 2.25 0 0 1 4.25 2h7.5A2.25 2.25 0 0 1 14 4.25v7.5A2.25 2.25 0 0 1 11.75 14h-7.5A2.25 2.25 0 0 1 2 11.75v-7.5Zm2.25-.75a.75.75 0 0 0-.75.75v7.5c0 .414.336.75.75.75h7.5a.75.75 0 0 0 .75-.75v-7.5a.75.75 0 0 0-.75-.75h-7.5Z" clip-rule="evenodd" />
              <path d="M4.75 5.5a.75.75 0 0 1 .75-.75h5a.75.75 0 0 1 0 1.5h-5a.75.75 0 0 1-.75-.75ZM4.75 8a.75.75 0 0 1 .75-.75h5a.75.75 0 0 1 0 1.5h-5A.75.75 0 0 1 4.75 8ZM5.5 9.75a.75.75 0 0 0 0 1.5h3a.75.75 0 0 0 0-1.5h-3Z" />
            </svg>
            <span>Models</span>
          </a>
          <a href="/admin/settings/integrations" data-subnav="integrations" class="flex items-center gap-2 px-3 py-2 rounded-lg transition ${subTab === 'integrations' ? 'bg-gray-100 text-gray-900' : 'text-gray-400 hover:text-gray-700'}">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" class="size-4">
              <path fill-rule="evenodd" d="M3.75 3A1.75 1.75 0 0 0 2 4.75v6.5c0 .966.784 1.75 1.75 1.75h8.5A1.75 1.75 0 0 0 14 11.25v-6.5A1.75 1.75 0 0 0 12.25 3h-8.5ZM12.5 4.75a.25.25 0 0 0-.25-.25h-8.5a.25.25 0 0 0-.25.25v6.5c0 .138.112.25.25.25h8.5a.25.25 0 0 0 .25-.25v-6.5Z" clip-rule="evenodd" />
              <path fill-rule="evenodd" d="M6 7a1 1 0 1 1 2 0 1 1 0 0 1-2 0ZM10 7a1 1 0 1 1 2 0 1 1 0 0 1-2 0ZM6 9a1 1 0 1 1 2 0 1 1 0 0 1-2 0ZM10 9a1 1 0 1 1 2 0 1 1 0 0 1-2 0Z" clip-rule="evenodd" />
            </svg>
            <span>Integrations</span>
          </a>
        `;
      }
      bindSubnav();
    }

    const subContentEl = container.querySelector('#admin-sub-content');
    if (!subContentEl) return;

    if (mainTab === 'settings') {
      subContentEl.dataset.settingsTab = subTab;
      if (subTab === 'general') {
        renderGeneralSettings(subContentEl, data);
      } else if (subTab === 'connections') {
        renderConnectionsSettings(subContentEl, data);
      } else if (subTab === 'models') {
        renderModelsSettings(subContentEl, data);
      } else if (subTab === 'integrations') {
        renderIntegrationsSettings(subContentEl, data);
      } else {
        subContentEl.innerHTML = `
          <div class="flex flex-col items-center justify-center h-full text-center p-10">
            <div class="w-16 h-16 bg-gray-50 rounded-2xl flex items-center justify-center mb-4 text-gray-300">
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="size-8">
                <path stroke-linecap="round" stroke-linejoin="round" d="M11.42 15.17L17.25 21A2.652 2.652 0 0021 17.25l-5.83-5.83m0 0a2.978 2.978 0 01-3.34-3.34L15 2.25 10.5 2.25l-4.5 4.5v1.5a1.5 1.5 0 001.5 1.5h1.5l3.93 3.93m2.856 2.856l1.5 1.5a1.5 1.5 0 001.5-1.5V10.5l-4.5-4.5H6" />
              </svg>
            </div>
            <h3 class="text-lg font-medium text-gray-900 mb-1">${subTab.charAt(0).toUpperCase() + subTab.slice(1)} Settings</h3>
            <p class="text-sm text-gray-500 max-w-xs">This section is currently under development.</p>
          </div>
        `;
      }
      return;
    }

    if (data.error) {
      subContentEl.innerHTML = renderErrorState(data.error);
    } else if (subTab === 'overview') {
      renderUserOverview(subContentEl, data, {
        reload: loadUsers,
        setUsers(nextUsers, total = nextUsers.length) {
          data.users = nextUsers;
          data.total = total;
          clearUsersCache();
          renderSubContent();
        },
        updateUser(updatedUser) {
          updateCachedUser(updatedUser);
          data.users = sortUsers(data.users.map((user) => user.id === updatedUser.id ? { ...user, ...updatedUser } : user));
          renderSubContent();
        },
        removeUser(userId) {
          removeCachedUser(userId);
          renderSubContent();
        },
        prependUser(user) {
          prependCachedUser(user);
          renderSubContent();
        },
        invalidateCache() {
          clearUsersCache();
          renderSubContent();
        },
      });
    } else if (data.loading && data.loadingMode === 'initial') {
      subContentEl.innerHTML = renderLoadingState();
    } else {
      renderGroupsOverview(subContentEl, data);
    }
  };

  async function loadUsers({ preserveContent = true } = {}) {
    const cacheKey = `${data.pagination.page}:${data.pagination.pageSize}`;
    const cached = data.usersCache[cacheKey];

    if (cached) {
      data.users = cached.users;
      data.total = cached.total;
      data.error = null;
      data.loading = false;
      data.loadingMode = 'idle';
      renderSubContent();
      return;
    }

    data.loading = true;
    data.loadingMode = preserveContent ? 'table' : 'initial';
    data.error = null;
    renderSubContent();

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
        data.usersCache[cacheKey] = {
          users: data.users,
          total: data.total,
        };
      }
    } catch (err) {
      data.error = err.message || 'Failed to fetch users.';
    } finally {
      data.loading = false;
      data.loadingMode = 'idle';
      renderSubContent();
    }
  }

  function bindTopNav() {
    container.querySelectorAll('a[data-nav]').forEach((link) => {
      link.onclick = async (e) => {
        e.preventDefault();
        const allowed = await guardSettingsNavigation();
        if (!allowed) return;
        const nav = link.dataset.nav;
        const newPath = nav === 'users' ? '/admin/users/overview' : '/admin/settings/general';
        window.history.pushState({}, '', newPath);
        updateRouteInfo();

        container.querySelectorAll('a[data-nav]').forEach((navLink) => {
          const active = navLink.dataset.nav === mainTab;
          navLink.className = `min-w-fit p-1.5 transition select-none ${active ? 'text-gray-900 underline underline-offset-[10px] decoration-2' : 'text-gray-300 hover:text-gray-700'}`;
        });

        mountShell();
        renderSubContent();
        if (mainTab === 'users' && data.users.length === 0 && !data.loading) {
          await loadUsers({ preserveContent: false });
        }
      };
    });
  }

  function bindSubnav() {
    container.querySelectorAll('a[data-subnav]').forEach((link) => {
      link.onclick = async (e) => {
        e.preventDefault();
        const allowed = await guardSettingsNavigation();
        if (!allowed) return;
        const nav = link.dataset.subnav;
        const basePath = mainTab === 'users' ? '/admin/users' : '/admin/settings';
        window.history.pushState({}, '', `${basePath}/${nav}`);
        updateRouteInfo();
        const subContentEl = container.querySelector('#admin-sub-content');
        if (subContentEl && mainTab === 'settings') {
          subContentEl.innerHTML = renderSettingsSkeleton();
          requestAnimationFrame(() => renderSubContent());
          return;
        }
        renderSubContent();
      };
    });
  }

  function mountShell() {
    if (typeof container.__cleanup === 'function') {
      container.__cleanup();
    }

    container.innerHTML = `
      <div class="flex h-screen w-full bg-white overflow-hidden font-primary text-gray-900">
        <div id="sidebar-backdrop" class="fixed inset-0 bg-black/20 backdrop-blur-sm z-30 transition-opacity duration-300 hidden md:hidden"></div>
        <aside id="sidebar" class="fixed md:relative h-screen md:h-[100dvh] flex-shrink-0 bg-[#f9f9f9] border-r border-gray-100 flex flex-col transition-all duration-500 ease-in-out z-40 md:ml-0 overflow-visible group/sidebar" style="width: 260px; min-width: 260px;">
          <div class="p-3 flex-shrink-0">
            <div id="sidebar-header" class="flex items-center justify-between mb-4 px-2 mt-1 transition-all duration-300">
              <a href="/" id="admin-home-link" class="flex items-center gap-3 sidebar-full-only rounded-lg focus:outline-none focus:ring-1 focus:ring-gray-300">
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
                  <a href="/admin/users" data-nav="users" class="min-w-fit p-1.5 transition select-none ${mainTab === 'users' ? 'text-gray-900 underline underline-offset-[10px] decoration-2' : 'text-gray-300 hover:text-gray-700'}">Users</a>
                  <a href="/admin/settings" data-nav="settings" class="min-w-fit p-1.5 transition select-none ${mainTab === 'settings' ? 'text-gray-900 underline underline-offset-[10px] decoration-2' : 'text-gray-300 hover:text-gray-700'}">Settings</a>
                </div>
              </div>
            </div>
          </nav>
          <div class="flex-1 flex overflow-hidden" id="admin-main-content"></div>
        </div>
      </div>
      <div id="search-modal-container"></div>
      <div id="files-modal-container"></div>
    `;

    wireSidebar(container);
    bindTopNav();
    shellMounted = true;
  }

  updateRouteInfo();
  if (!shellMounted) {
    mountShell();
  }
  renderSubContent();
  if (mainTab === 'users' && data.users.length === 0) {
    await loadUsers({ preserveContent: false });
  }
}
