import { createSearchModalController } from './search-modal-controller.js';
import { buildViewportModalShellMarkup } from './viewport-modal-shell.js';

export function renderSearchModal(container, createChatFn, loadMessagesFn) {
  container.innerHTML = buildViewportModalShellMarkup({
    rootId: 'modal-root',
    ariaLabelledBy: 'modal-title',
    closeId: 'close-modal',
    overlayId: 'modal-overlay',
    zIndex: 100,
    title: '',
    shellClass: 'relative z-10 w-full max-w-3xl bg-white md:rounded-3xl shadow-2xl overflow-hidden border border-gray-100 flex flex-col max-h-[90vh] md:h-[600px]',
    header: `
      <div class="p-4 border-b border-gray-100 flex items-center gap-3">
        <div class="flex-shrink-0 text-gray-500">
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
        </div>
        <input type="text" id="modal-search-input" placeholder="Search chats..." class="flex-grow border-none placeholder:text-gray-600 focus-visible:ring-2 focus-visible:ring-gray-300 focus-visible:ring-offset-2 focus-visible:ring-offset-white text-lg py-1 text-gray-800 bg-transparent" aria-label="Search chats" autocomplete="off" />
        <div class="flex items-center gap-2">
          <div class="hidden md:flex items-center gap-1 px-1.5 py-0.5 rounded border border-gray-200 text-[10px] text-gray-400 font-medium">
            <span>ESC</span>
          </div>
          <button type="button" id="close-modal" class="inline-flex h-11 w-11 items-center justify-center rounded-xl text-gray-500 hover:text-gray-700 hover:bg-gray-100 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-300 focus-visible:ring-offset-2 focus-visible:ring-offset-white" aria-label="Close search">
             <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12"/></svg>
          </button>
        </div>
      </div>
    `,
    body: `
      <div class="flex-grow flex flex-col md:flex-row overflow-hidden relative bg-white min-h-0">
        <div class="w-full md:w-[45%] border-r border-gray-100 overflow-y-auto p-2 no-scrollbar h-1/2 md:h-full flex-shrink-0" id="search-results-list">
           <div class="px-3 py-2 text-[11px] font-bold text-gray-500 uppercase tracking-wider mb-1" id="modal-title">Actions</div>
           <button type="button" class="w-full min-h-11 text-left px-3 py-2.5 rounded-2xl hover:bg-gray-50 transition flex items-center gap-3 text-sm focus:bg-gray-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-300 focus-visible:ring-offset-2 focus-visible:ring-offset-white group" id="action-new-chat" data-index="-1">
              <div class="flex-shrink-0 w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center text-gray-500 group-hover:bg-white group-hover:shadow-sm transition-all">
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>
              </div>
              <div class="flex flex-col">
                <span class="font-medium text-gray-800">New Chat</span>
                <span class="text-[11px] text-gray-500">Start a fresh conversation</span>
              </div>
           </button>
           <div id="chats-search-grouped-list" role="listbox" class="mt-4"></div>
           <div id="search-loading-indicator" class="hidden px-3 py-4 text-center">
              <div class="inline-block w-5 h-5 border-2 border-gray-200 border-t-gray-800 rounded-full animate-spin"></div>
           </div>
        </div>

        <div class="w-full md:w-[55%] bg-[#fafafa] flex flex-col transition-all h-1/2 md:h-full border-t md:border-t-0 border-gray-100 flex-shrink-0 overflow-hidden min-h-0" id="search-preview" aria-live="polite">
           <div class="flex-grow flex flex-col items-center justify-center p-12 text-center" id="search-preview-empty">
              <div class="w-16 h-16 rounded-full bg-white border border-gray-100 flex items-center justify-center mb-6 shadow-sm text-gray-200">
                 <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
              </div>
              <h3 class="text-sm font-semibold text-gray-800 mb-1">Preview Chat</h3>
              <p class="text-xs text-gray-500 max-w-[200px] mx-auto">Select a result from the list to see the conversation history.</p>
           </div>
           <div id="search-preview-content" class="hidden h-full flex flex-col bg-white min-h-0"></div>
        </div>
      </div>
    `,
  });

  return createSearchModalController(container, createChatFn, loadMessagesFn);
}


