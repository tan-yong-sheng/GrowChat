// Chat page HTML template and container setup.
// Extracted from chat.js to keep the main file under 400 lines.

export function renderChat(container, wireChat) {
  if (typeof container.__cleanup === 'function') {
    container.__cleanup();
  }
  container.innerHTML = `
    <div class="flex h-full w-full bg-surface overflow-hidden text-[#171717] font-primary">
      <div id="sidebar-backdrop" class="fixed inset-0 bg-black/20 backdrop-blur-sm z-30 transition-opacity duration-300 hidden md:hidden"></div>
      <aside id="sidebar" class="fixed md:relative h-[100dvh] md:h-[100dvh] flex-shrink-0 bg-neutral-bg border-r border-gray-100 flex flex-col transition-all duration-500 ease-in-out z-40 -ml-[260px] md:ml-0 overflow-visible group/sidebar">
        <div class="p-3">
          <div id="sidebar-header" class="flex items-center justify-between mb-4 px-2 mt-1 transition-all duration-300">
            <button type="button" id="sidebar-home-btn" class="flex items-center gap-3 sidebar-full-only hover:opacity-90 transition-opacity" title="Home">
              <div class="w-7 h-7 bg-surface rounded-full flex items-center justify-center border border-gray-100 shadow-sm overflow-hidden">
                <img src="/logo.png" alt="GrowChat" class="w-5 h-5 object-contain" />
              </div>
              <span class="font-bold text-lg text-gray-800 font-primary">GrowChat</span>
            </button>
            <button id="toggle-sidebar-desktop" class="sidebar-full-only hidden md:block p-1 text-gray-500 hover:bg-gray-200 rounded-lg transition-colors ml-auto" title="Close Sidebar">
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="3" y1="12" x2="21" y2="12"></line><line x1="3" y1="6" x2="21" y2="6"></line><line x1="3" y1="18" x2="21" y2="18"></line></svg>
            </button>
          </div>
          <div class="space-y-1">
            <button id="new-chat" class="flex items-center justify-between px-3 py-2 w-full hover:bg-surface rounded-xl transition text-sm font-semibold text-on-surface font-primary group/new-chat">
              <div class="flex items-center gap-3">
                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="sidebar-collapsed-scale transition-transform duration-300"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>
                <span class="sidebar-full-only">New Chat</span>
              </div>
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="sidebar-full-only"><path d="M12 5v14M5 12h14"/></svg>
            </button>
            <button id="open-search" class="flex items-center gap-3 px-3 py-2 w-full hover:bg-surface rounded-xl transition text-sm font-semibold text-gray-700 font-primary group/search">
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="sidebar-collapsed-scale transition-transform duration-300"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
              <span class="sidebar-full-only">Search</span>
            </button>
          </div>
        </div>
        <div class="flex-grow flex flex-col min-h-0 overflow-hidden px-3 pb-4 sidebar-full-only">
          <button id="toggle-chats-btn" class="flex items-center justify-between w-full text-[11px] font-semibold text-gray-400 px-3 py-2 mt-2 uppercase tracking-wider sidebar-full-only hover:text-gray-600 transition-colors group">
            <span>Chats</span>
            <svg id="toggle-chats-icon" xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="transition-transform duration-200"><polyline points="18 15 12 9 6 15"></polyline></svg>
          </button>
          <div class="flex-grow overflow-y-auto no-scrollbar sidebar-full-only" id="chat-list-container">
            <ul id="chat-list" class="space-y-0"></ul>
          </div>
        </div>
        <div id="sidebar-footer" class="mt-auto w-full bg-neutral-bg pb-[calc(1rem+env(safe-area-inset-bottom))]"></div>
      </aside>
      <main id="main" class="flex-grow flex flex-col relative min-w-0 bg-surface h-full">
        <header class="h-[58px] flex items-center px-4 justify-between sticky top-0 z-10 bg-surface/95 backdrop-blur-sm border-b border-gray-100">
          <div class="flex items-center">
            <button id="toggle-sidebar-mobile" class="p-2 mr-2 hover:bg-gray-100 rounded-lg transition text-gray-500 md:hidden" title="Open Sidebar">
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="3" y1="12" x2="21" y2="12"></line><line x1="3" y1="6" x2="21" y2="6"></line><line x1="3" y1="18" x2="21" y2="18"></line></svg>
            </button>
          </div>

        </header>
        <div id="messages-container" class="flex-grow overflow-y-auto no-scrollbar pb-[148px] pt-[58px]">
          <div id="messages-inner" class="max-w-4xl mx-auto w-full px-4 flex flex-col gap-1 pb-4">
            <div id="welcome-screen-container"></div>
            <div id="messages-list" class="hidden flex flex-col gap-1"></div>
          </div>
        </div>
        <div class="absolute bottom-0 left-0 w-full pt-4 pb-6 bg-gradient-to-t from-surface via-surface to-transparent">
          <div id="message-input-container" class="max-w-4xl mx-auto w-full px-4 relative"></div>
        </div>
      </main>
    </div>
    <div id="search-modal-container"></div>
    <div id="files-modal-container"></div>
    <div id="share-modal-container"></div>
    <div id="archived-modal-container"></div>
    <div id="citation-modal-container"></div>
  `;
  container.__cleanup = wireChat(container);
}
