import { state, setState, subscribe } from '../store.js';
import { fetchFiles, uploadFile, deleteFile } from '../api.js';
import { formatBytes, formatDate } from '../utils.js';

export function renderFilesModal(container) {
  let unsubscribe;
  let cleanup = null;

  function init() {
    container.innerHTML = `
      <div id="files-modal-root" class="fixed inset-0 z-[100] hidden" role="dialog" aria-modal="true" aria-labelledby="files-modal-title">
        <div class="absolute inset-0 bg-black/40 backdrop-blur-sm transition-opacity" id="files-modal-overlay" aria-hidden="true"></div>
        <div class="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-2xl bg-white rounded-3xl shadow-2xl overflow-hidden border border-gray-100 flex flex-col h-[600px] max-h-[90vh]">
           <div class="p-6 border-b border-gray-100 flex items-center justify-between">
              <div class="flex flex-col">
                <h2 class="text-xl font-bold text-gray-800" id="files-modal-title">Files</h2>
                <p class="text-xs text-gray-400">Manage and attach documents to your chat</p>
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

    wire();
  }

  function wire() {
    const modalRoot = container.querySelector('#files-modal-root');
    const overlay = container.querySelector('#files-modal-overlay');
    const closeBtn = container.querySelector('#close-files-modal');
    const fileList = container.querySelector('#files-list');
    const uploadInput = container.querySelector('#file-upload-input');
    const attachBtn = container.querySelector('#attach-selected-btn');
    const selectedCount = container.querySelector('#selected-count');

    const close = () => setState({ showFiles: false });
    closeBtn.onclick = close;
    overlay.onclick = close;

    uploadInput.onchange = async (e) => {
      const files = e.target.files;
      if (!files.length) return;

      setState({ files: { ...state.files, loading: true } });
      try {
        for (const file of files) {
          await uploadFile(file, state.activeChatId);
        }
        await refreshFiles();
      } catch (err) {
        console.error('Upload failed:', err);
      } finally {
        setState({ files: { ...state.files, loading: false } });
        uploadInput.value = '';
      }
    };

    attachBtn.onclick = () => {
      const selectedFiles = state.files.items.filter((f) => state.files.selectedIds.includes(f.id));
      window.dispatchEvent(new CustomEvent('attach-files', { detail: { files: selectedFiles } }));
      close();
    };

    async function refreshFiles() {
      setState({ files: { ...state.files, loading: true } });
      try {
        const data = await fetchFiles();
        setState({
          files: {
            ...state.files,
            items: data.documents || [],
            loading: false,
            hasMore: (data.documents || []).length === 20,
            offset: (data.documents || []).length
          }
        });
      } catch (err) {
        console.error('Fetch files failed:', err);
      }
    }

    function renderList() {
      const { items, loading, selectedIds } = state.files;
      if (items.length === 0 && !loading) {
        fileList.innerHTML = `
          <div class="flex flex-col items-center justify-center h-full py-12 text-center">
            <div class="w-16 h-16 rounded-full bg-gray-50 flex items-center justify-center mb-4 text-gray-200">
               <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><polyline points="14 2 14 8 20 8"/></svg>
            </div>
            <h3 class="text-sm font-semibold text-gray-800 mb-1">No files yet</h3>
            <p class="text-xs text-gray-400 max-w-[200px] mx-auto">Upload documents to use them in your conversations.</p>
          </div>
        `;
        return;
      }

      fileList.innerHTML = items.map((file) => {
        const isSelected = selectedIds.includes(file.id);
        const status = file.extraction_status === 1 ? 'ready' : (file.extraction_status === -1 ? 'failed' : 'processing');
        const statusColors = {
          ready: 'bg-green-100 text-green-700',
          failed: 'bg-red-100 text-red-700',
          processing: 'bg-blue-100 text-blue-700 animate-pulse'
        };

        return `
          <div class="group flex items-center gap-4 p-3 rounded-2xl border ${isSelected ? 'border-black bg-gray-50' : 'border-gray-100 hover:bg-gray-50'} transition-all cursor-pointer" data-file-id="${file.id}">
             <div class="flex-shrink-0 w-10 h-10 rounded-xl bg-gray-100 flex items-center justify-center text-gray-400 group-hover:bg-white transition-colors">
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><polyline points="14 2 14 8 20 8"/></svg>
             </div>
             <div class="flex-grow min-w-0 flex flex-col">
                <div class="flex items-center gap-2">
                   <span class="truncate font-medium text-gray-800 text-sm">${file.filename}</span>
                   <span class="px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${statusColors[status]}">${status}</span>
                </div>
                <div class="flex items-center gap-2 text-[11px] text-gray-400">
                   <span>${formatBytes(file.file_size)}</span>
                   <span>&middot;</span>
                   <span>${formatDate(file.created_at)}</span>
                </div>
             </div>
             <div class="flex-shrink-0 flex items-center gap-1">
                <button class="delete-file-btn p-2 text-gray-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition opacity-0 group-hover:opacity-100" data-file-id="${file.id}" title="Delete file">
                   <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>
                </button>
                <div class="w-6 h-6 rounded-full border-2 ${isSelected ? 'bg-black border-black' : 'border-gray-200'} flex items-center justify-center transition-colors">
                   ${isSelected ? '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" class="text-white"><polyline points="20 6 9 17 4 12"/></svg>' : ''}
                </div>
             </div>
          </div>
        `;
      }).join('');

      fileList.querySelectorAll('[data-file-id]').forEach((el) => {
        el.onclick = (e) => {
          if (e.target.closest('.delete-file-btn')) return;
          const id = el.getAttribute('data-file-id');
          setState((prev) => {
            const selectedIds = prev.files.selectedIds.includes(id)
              ? prev.files.selectedIds.filter((sid) => sid !== id)
              : [...prev.files.selectedIds, id];
            return { files: { ...prev.files, selectedIds } };
          });
        };
      });

      fileList.querySelectorAll('.delete-file-btn').forEach((btn) => {
        btn.onclick = async (e) => {
          e.stopPropagation();
          const id = btn.getAttribute('data-file-id');
          try {
            await deleteFile(id);
            await refreshFiles();
          } catch (err) {
            console.error('Delete file failed:', err);
          }
        };
      });
    }

    unsubscribe = subscribe((currentState) => {
      if (currentState.showFiles) {
        if (modalRoot.classList.contains('hidden')) {
          document.body.style.overflow = 'hidden';
          refreshFiles();
        }
        modalRoot.classList.remove('hidden');
      } else {
        if (!modalRoot.classList.contains('hidden')) {
          document.body.style.overflow = '';
        }
        modalRoot.classList.add('hidden');
      }

      renderList();
      const count = currentState.files.selectedIds.length;
      selectedCount.textContent = count;
      attachBtn.disabled = count === 0;
      attachBtn.classList.toggle('bg-black', count > 0);
      attachBtn.classList.toggle('text-white', count > 0);
      attachBtn.classList.toggle('bg-gray-200', count === 0);
      attachBtn.classList.toggle('text-gray-500', count === 0);
    });

    cleanup = () => {
      if (unsubscribe) unsubscribe();
      document.body.style.overflow = '';
    };
  }

  init();
  return () => {
    if (cleanup) cleanup();
  };
}
