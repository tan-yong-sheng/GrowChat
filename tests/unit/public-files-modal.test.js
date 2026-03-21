// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../public/js/shared/api.js', () => ({
  fetchFiles: vi.fn(async () => ({ documents: [] })),
  searchFiles: vi.fn(async () => ({ documents: [] })),
  uploadFile: vi.fn(async () => ({})),
  deleteFile: vi.fn(async () => ({})),
}));

async function loadModules() {
  vi.resetModules();
  const store = await import('../../public/js/shared/store.js');
  const { renderFilesModal } = await import('../../public/js/shared/components/files-modal.js');
  return { store, renderFilesModal };
}

describe('files modal', () => {
  beforeEach(() => {
    document.body.innerHTML = '<div id="root"></div>';
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it('opens and emits attached files from the current selection', async () => {
    const { store, renderFilesModal } = await loadModules();
    const container = document.getElementById('root');
    const onAttach = vi.fn();
    window.addEventListener('attach-files', onAttach);

    store.setState({
      showFiles: true,
      files: {
        items: [{ id: 'f1', filename: 'Doc.pdf' }],
        selectedIds: ['f1'],
        loading: false,
        hasMore: false,
        offset: 1,
      },
    });

    const destroy = renderFilesModal(container);

    expect(container.querySelector('#files-modal-root')?.classList.contains('hidden')).toBe(false);
    container.querySelector('#attach-selected-btn')?.click();

    expect(onAttach).toHaveBeenCalled();
    expect(onAttach.mock.calls[0][0].detail.files).toEqual([{ id: 'f1', filename: 'Doc.pdf' }]);

    destroy();
    window.removeEventListener('attach-files', onAttach);
  });
});


