import { state, setState, subscribe } from '../store.js';
import { fetchFiles, searchFiles, uploadFile, deleteFile } from '../api.js';
import { clearModalHash, setModalHash } from '../utils/modal-hash.js';
import { suspendSidebarVisibility, restoreSidebarVisibility } from '../utils/sidebar-visibility.js';
import { renderFilesEmptyStateMarkup, renderFilesListMarkup } from './files-modal-helpers.js';

export function createFilesModalController(container) {
  let unsubscribe;
  let cleanup = null;

  const modalRoot = container.querySelector('#files-modal-root');
  const overlay = container.querySelector('#files-modal-overlay');
  const closeBtn = container.querySelector('#close-files-modal');
  const fileList = container.querySelector('#files-list');
  const uploadInput = container.querySelector('#file-upload-input');
  const attachBtn = container.querySelector('#attach-selected-btn');
  const selectedCount = container.querySelector('#selected-count');
  const searchInput = container.querySelector('#files-search-input');
  let searchTimer = null;
  let sidebarSuspended = false;

  const close = () => setState({ showFiles: false });

  const refreshFiles = async (query = '') => {
    setState({ files: { ...state.files, loading: true } });
    try {
      const data = query.trim()
        ? await searchFiles({ q: query.trim(), limit: 20, offset: 0 })
        : await fetchFiles();
      setState({
        files: {
          ...state.files,
          items: data.documents || [],
          loading: false,
          hasMore: (data.documents || []).length === 20,
          offset: (data.documents || []).length,
        },
      });
    } catch (err) {
      console.error('Fetch files failed:', err);
    }
  };

  function renderList(currentState = state) {
    const { items, loading } = currentState.files;
    if (items.length === 0 && !loading) {
      fileList.innerHTML = renderFilesEmptyStateMarkup();
      return;
    }

    fileList.innerHTML = renderFilesListMarkup(items, currentState);

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

  closeBtn.onclick = close;
  overlay.onclick = close;

  if (uploadInput) {
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
  }

  attachBtn.onclick = () => {
    const selectedFiles = state.files.items.filter((f) => state.files.selectedIds.includes(f.id));
    window.dispatchEvent(new CustomEvent('attach-files', { detail: { files: selectedFiles } }));
    close();
  };

  searchInput?.addEventListener('input', (e) => {
    clearTimeout(searchTimer);
    const q = e.target.value || '';
    searchTimer = setTimeout(() => {
      refreshFiles(q);
    }, 250);
  });

  unsubscribe = subscribe((currentState) => {
    if (currentState.showFiles) {
      setModalHash('files-modal');
      if (modalRoot.classList.contains('hidden')) {
        if (!sidebarSuspended) {
          suspendSidebarVisibility();
          sidebarSuspended = true;
        }
        document.body.style.overflow = 'hidden';
        refreshFiles();
      }
      modalRoot.classList.remove('hidden');
    } else {
      if (!modalRoot.classList.contains('hidden')) {
        document.body.style.overflow = '';
        if (sidebarSuspended) {
          restoreSidebarVisibility();
          sidebarSuspended = false;
        }
        clearModalHash('files-modal');
      }
      modalRoot.classList.add('hidden');
    }

    renderList(currentState);
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
    if (sidebarSuspended) {
      restoreSidebarVisibility();
      sidebarSuspended = false;
    }
    if (searchTimer) clearTimeout(searchTimer);
    clearModalHash('files-modal');
  };

  return () => {
    if (cleanup) cleanup();
  };
}
