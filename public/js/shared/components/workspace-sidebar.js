import { state, setState, subscribe } from '../store.js';
import { renderSidebar } from './sidebar.js';

export function renderWorkspaceSidebar({
  homeHref = '/',
  homeId = 'workspace-home-link',
  homeLabel = 'GrowChat',
  showNewChat = true,
  showSearch = true,
  footerId = 'sidebar-footer',
} = {}) {
  return `
    <div id="sidebar-backdrop" class="fixed inset-0 bg-black/20 backdrop-blur-sm z-30 transition-opacity duration-300 hidden md:hidden"></div>
    <aside id="sidebar" aria-label="Workspace sidebar" class="fixed md:relative h-[100dvh] md:h-[100dvh] flex-shrink-0 bg-[#f9f9f9] border-r border-gray-100 flex flex-col transition-all duration-500 ease-in-out z-40 md:ml-0 overflow-visible group/sidebar" style="width: 260px; min-width: 260px;">
      <div class="p-3 flex-shrink-0">
        <div id="sidebar-header" class="flex items-center justify-between mb-4 px-2 mt-1 transition-all duration-300">
          <a href="${homeHref}" id="${homeId}" class="flex items-center gap-3 sidebar-full-only rounded-lg focus:outline-none focus:ring-1 focus:ring-gray-300">
            <div class="w-7 h-7 bg-white rounded-full flex items-center justify-center border border-gray-100 shadow-sm overflow-hidden">
              <img src="/logo.png" alt="GrowChat" class="w-5 h-5 object-contain" />
            </div>
            <span class="font-bold text-lg text-gray-900 font-primary">${homeLabel}</span>
          </a>
          <button id="toggle-sidebar-desktop" class="sidebar-full-only md:block p-1 text-gray-700 hover:bg-gray-200 rounded-lg transition-colors ml-auto" title="Close Sidebar" aria-label="Toggle sidebar">
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="3" y1="12" x2="21" y2="12"></line><line x1="3" y1="6" x2="21" y2="6"></line><line x1="3" y1="18" x2="21" y2="18"></line></svg>
          </button>
        </div>
        <div class="space-y-1">
          ${
            showNewChat
              ? `
            <button id="new-chat" class="flex items-center justify-between px-3 py-2 w-full hover:bg-white rounded-xl transition text-sm font-semibold text-[#0066cc] font-primary group/new-chat">
              <div class="flex items-center gap-3">
                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="sidebar-collapsed-scale transition-transform duration-300"><path d="M12 20h9"></path><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"></path></svg>
                <span class="sidebar-full-only">New Chat</span>
              </div>
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="sidebar-full-only"><path d="M12 5v14M5 12h14"></path></svg>
            </button>
          `
              : ''
          }
          ${
            showSearch
              ? `
            <button id="open-search" class="flex items-center gap-3 px-3 py-2 w-full hover:bg-white rounded-xl transition text-sm font-semibold text-gray-700 font-primary group/search">
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="sidebar-collapsed-scale transition-transform duration-300"><circle cx="11" cy="11" r="8"></circle><path d="m21 21-4.3-4.3"></path></svg>
              <span class="sidebar-full-only">Search</span>
            </button>
          `
              : ''
          }
        </div>
      </div>
      <div class="flex-1 min-h-0"></div>
      <div id="${footerId}" class="mt-auto w-full bg-[#f9f9f9]" style="padding-bottom: calc(1rem + env(safe-area-inset-bottom));"></div>
    </aside>
  `;
}

function findWorkspaceElements(root, selectors) {
  return {
    newChatBtn: root.querySelector('#new-chat'),
    homeLink: root.querySelector('#workspace-home-link'),
    toggleSidebarMobile: root.querySelector('#toggle-sidebar-mobile'),
    toggleSidebarDesktop: root.querySelector('#toggle-sidebar-desktop'),
    sidebar: root.querySelector('#sidebar'),
    sidebarBackdrop: root.querySelector('#sidebar-backdrop'),
    openSearchBtn: root.querySelector('#open-search'),
    searchModalContainer: root.querySelector(selectors.searchModalContainerSelector),
    filesModalContainer: root.querySelector(selectors.filesModalContainerSelector),
  };
}

function createHomeNavigator(navigateHome) {
  return async () => {
    if (typeof navigateHome === 'function') {
      await navigateHome();
    } else {
      window.history.pushState({}, '', '/');
      window.dispatchEvent(new PopStateEvent('popstate'));
    }
  };
}

function createModalEnsurer({ container, showFlag, importPath, renderFn, renderArgs = [] }) {
  let destroyFn = null;
  let initPromise = null;

  const ensure = async () => {
    if (!showFlag || !container) return;
    if (typeof destroyFn === 'function') return;
    if (initPromise) return initPromise;

    initPromise = import(importPath)
      .then((mod) => {
        destroyFn = mod[renderFn](container, ...renderArgs);
      })
      .finally(() => {
        initPromise = null;
      });

    return initPromise;
  };

  const destroy = () => {
    if (typeof destroyFn === 'function') {
      destroyFn();
      destroyFn = null;
    }
  };

  return { ensure, destroy };
}

function createEventHandlers(elements, navigateToHome, guardNavigation, modalEnsurers) {
  const onToggleSidebar = () => {
    if (state.isMobile) {
      setState({ showSidebar: !state.showSidebar });
    } else if (!state.showSidebar) {
      setState({ showSidebar: true });
    } else {
      setState({ sidebarCollapsed: !state.sidebarCollapsed });
    }
  };

  const onOpenSearch = async () => {
    await modalEnsurers.search.ensure();
    setState({ showSearch: true });
  };

  const onNewChat = async () => {
    if (typeof guardNavigation === 'function') {
      const allowed = await guardNavigation();
      if (!allowed) return;
    }
    await navigateToHome();
  };

  return { onToggleSidebar, onOpenSearch, onNewChat };
}

function bindSidebarEvents(elements, handlers) {
  elements.toggleSidebarMobile?.addEventListener('click', handlers.onToggleSidebar);
  elements.toggleSidebarDesktop?.addEventListener('click', handlers.onToggleSidebar);
  elements.openSearchBtn?.addEventListener('click', () => void handlers.onOpenSearch());
  elements.newChatBtn?.addEventListener('click', () => void handlers.onNewChat());
  elements.homeLink?.addEventListener('click', (e) => {
    e.preventDefault();
    void handlers.onNewChat();
  });
}

function syncMobileVisibility(sidebar, sidebarBackdrop, currentState) {
  if (currentState.showSidebar && currentState.isMobile) {
    sidebarBackdrop?.classList.remove('hidden');
    document.body.style.overflow = 'hidden';
  } else {
    sidebarBackdrop?.classList.add('hidden');
    document.body.style.overflow = '';
  }
}

export function wireWorkspaceSidebar(
  root,
  {
    guardNavigation = null,
    navigateHome = null,
    showSearchModal = true,
    showFilesModal = true,
    searchModalContainerSelector = '#search-modal-container',
    filesModalContainerSelector = '#files-modal-container',
  } = {}
) {
  const elements = findWorkspaceElements(root, {
    searchModalContainerSelector,
    filesModalContainerSelector,
  });

  const destroySidebar = renderSidebar(elements.sidebar);
  const navigateToHome = createHomeNavigator(navigateHome);

  const modalEnsurers = {
    search: createModalEnsurer({
      container: elements.searchModalContainer,
      showFlag: showSearchModal,
      importPath: './search-modal.js',
      renderFn: 'renderSearchModal',
      renderArgs: [navigateToHome, navigateToHome],
    }),
    files: createModalEnsurer({
      container: elements.filesModalContainer,
      showFlag: showFilesModal,
      importPath: './files-modal.js',
      renderFn: 'renderFilesModal',
    }),
  };

  const handlers = createEventHandlers(elements, navigateToHome, guardNavigation, modalEnsurers);
  bindSidebarEvents(elements, handlers);

  const unsubscribe = subscribe((currentState) => {
    syncMobileVisibility(elements.sidebar, elements.sidebarBackdrop, currentState);
    if (currentState.showSearch) void modalEnsurers.search.ensure();
    if (currentState.showFiles) void modalEnsurers.files.ensure();
  });

  elements.sidebarBackdrop?.addEventListener('click', () => setState({ showSidebar: false }));

  return () => {
    unsubscribe?.();
    modalEnsurers.search.destroy();
    modalEnsurers.files.destroy();
    destroySidebar?.();
  };
}
