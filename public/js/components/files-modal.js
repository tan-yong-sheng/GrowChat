import { createFilesModalController } from './files-modal-controller.js';

export function renderFilesModal(container) {
  container.innerHTML = `
    <div id="files-modal-root" class="fixed inset-0 z-[100] hidden" role="dialog" aria-modal="true" aria-labelledby="files-modal-title">
      <div class="absolute inset-0 bg-black/40 backdrop-blur-sm transition-opacity" id="files-modal-overlay" aria-hidden="true"></div>
      <div class="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-2xl bg-white rounded-3xl shadow-2xl overflow-hidden border border-gray-100 flex flex-col h-[600px] max-h-[90vh]">
         <div class="p-6 border-b border-gray-100 flex items-center justify-between">
            <div class="flex flex-col">
              <h2 class="text-xl font-bold text-gray-800" id="files-modal-title">Files</h2>
              <p class="text-xs text-gray-400">Manage and attach documents to your chat</p>
            </div>
            <div class="hidden md:block flex-grow max-w-xs">
              <input id="files-search-input" type="text" placeholder="Search files..." class="w-full px-3 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-1 focus:ring-gray-300" />
            </div>
            <div class="flex items-center gap-3">
              <label for="file-upload-input" class="bg-black text-white px-4 py-2 rounded-xl text-sm font-medium hover:bg-gray-800 transition cursor-pointer flex items-center gap-2">
                 <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
                 Upload
              </label>
              <input type="file" id="file-upload-input" class="hidden" multiple />
              <button id="close-files-modal" class="text-gray-400 hover:text-gray-600 transition p-2 rounded-xl hover:bg-gray-100">
                 <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18M6 6l12 12"/></svg>
              </button>
            </div>
         </div>

         <div class="flex-grow overflow-y-auto p-4 space-y-2 no-scrollbar" id="files-list">
            <div class="flex items-center justify-center h-full text-gray-400 text-sm italic">
               Loading files...
            </div>
         </div>

         <div class="p-6 border-t border-gray-100 flex items-center justify-between bg-gray-50/50">
            <div class="text-xs text-gray-400">
              <span id="selected-count">0</span> files selected
            </div>
            <button id="attach-selected-btn" class="bg-gray-200 text-gray-500 px-6 py-2 rounded-xl text-sm font-bold transition disabled:opacity-50" disabled>
               Attach to Chat
            </button>
         </div>
      </div>
    </div>
  `;

  return createFilesModalController(container);
}
