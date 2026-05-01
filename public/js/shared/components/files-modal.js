import { createFilesModalController } from './files-modal-controller.js';
import { buildViewportModalShellMarkup } from './viewport-modal-shell.js';

export function renderFilesModal(container) {
  container.innerHTML = buildViewportModalShellMarkup({
    rootId: 'files-modal-root',
    ariaLabelledBy: 'files-modal-title',
    closeId: 'close-files-modal',
    overlayId: 'files-modal-overlay',
    zIndex: 100,
    title: '',
    overlayClass: 'absolute inset-0 bg-black/40 backdrop-blur-sm transition-opacity',
    shellClass:
      'relative z-10 w-full max-w-2xl bg-white rounded-3xl shadow-2xl overflow-hidden border border-gray-100 flex flex-col max-h-[90vh] md:h-[600px]',
    header: `
      <div class="p-6 border-b border-gray-100 flex items-center justify-between gap-4">
        <div class="flex flex-col min-w-0">
          <h2 class="text-xl font-bold text-gray-800 truncate" id="files-modal-title">Files</h2>
          <p class="text-xs text-gray-500">Manage and attach documents to your chat</p>
        </div>
        <div class="hidden md:block flex-grow max-w-xs">
          <input id="files-search-input" type="text" placeholder="Search files..." class="w-full px-3 py-2 text-sm border border-gray-200 rounded-xl placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-gray-300 focus:ring-offset-2 focus:ring-offset-white" />
        </div>
        <div class="flex items-center gap-3">
          <label for="file-upload-input" class="inline-flex min-h-11 items-center gap-2 bg-black text-white px-4 py-2 rounded-xl text-sm font-medium hover:bg-gray-800 transition cursor-pointer">
             <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
             Upload
          </label>
          <input type="file" id="file-upload-input" class="hidden" multiple />
          <button type="button" id="close-files-modal" class="inline-flex h-11 w-11 items-center justify-center rounded-xl text-gray-500 hover:text-gray-700 hover:bg-gray-100 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-300 focus-visible:ring-offset-2 focus-visible:ring-offset-white" aria-label="Close files">
             <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18M6 6l12 12"/></svg>
          </button>
        </div>
      </div>
    `,
    body: `
      <div class="flex-grow overflow-y-auto p-4 space-y-2 no-scrollbar min-h-0" id="files-list">
        <div class="flex items-center justify-center h-full text-gray-400 text-sm italic">
           Loading files...
        </div>
      </div>
    `,
    footer: `
      <div class="p-6 border-t border-gray-100 flex items-center justify-between bg-gray-50/50">
        <div class="text-xs text-gray-500">
          <span id="selected-count">0</span> files selected
        </div>
        <button id="attach-selected-btn" type="button" class="inline-flex min-h-11 items-center justify-center bg-gray-100 text-gray-400 border border-gray-200 px-6 py-2 rounded-xl text-sm font-bold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-300 focus-visible:ring-offset-2 focus-visible:ring-offset-white disabled:opacity-100 disabled:cursor-not-allowed" disabled>
           Attach to Chat
        </button>
      </div>
    `,
  });

  return createFilesModalController(container);
}
