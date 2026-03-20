// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../public/js/api.js', () => ({
  apiFetch: vi.fn(async () => ({ ok: true, json: async () => ({ chat: { title: 'Preview' }, messages: [] }) })),
  fetchChats: vi.fn(async () => ({ chats: [], limit: 20, offset: 0 })),
}));

async function loadModules() {
  vi.resetModules();
  const store = await import('../../public/js/store.js');
  const { renderSearchModal } = await import('../../public/js/components/search-modal.js');
  return { store, renderSearchModal };
}

describe('search modal', () => {
  beforeEach(() => {
    document.body.innerHTML = '<div id="root"></div>';
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it('opens and forwards the new chat action', async () => {
    const { store, renderSearchModal } = await loadModules();
    const container = document.getElementById('root');
    const createChatFn = vi.fn();
    const loadMessagesFn = vi.fn();

    store.setState({
      showSearch: true,
      search: { query: '', results: [], selectedIndex: -1, offset: 0, hasMore: true, loading: false },
    });

    const destroy = renderSearchModal(container, createChatFn, loadMessagesFn);

    expect(container.querySelector('#modal-root')?.classList.contains('hidden')).toBe(false);
    container.querySelector('#action-new-chat')?.click();
    expect(createChatFn).toHaveBeenCalledTimes(1);

    destroy();
  });
});
