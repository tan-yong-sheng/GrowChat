import { state, setState, subscribe } from '../store.js';
import { apiFetch, fetchChats } from '../api.js';
import { escapeHtml, renderMessageContent } from '../utils.js';
import { clearModalHash, setModalHash } from '../utils/modal-hash.js';
import { suspendSidebarVisibility, restoreSidebarVisibility } from '../utils/sidebar-visibility.js';
import { renderSearchInput } from './search-input.js';
import {
  normalizeBackendQuery,
  renderSearchEmptyStateMarkup,
  renderSearchResultsMarkup,
} from './search-modal-helpers.js';

export function createSearchModalController(container, createChatFn, loadMessagesFn) {
  let unsubscribe;
  let cleanup = null;
  let previousFocus = null;
  let sidebarSuspended = false;

  const modalRoot = container.querySelector('#modal-root');
  const closeBtn = modalRoot.querySelector('#close-modal');
  const overlay = modalRoot.querySelector('#modal-overlay');
  const newChatBtn = modalRoot.querySelector('#action-new-chat');
  const searchInput = modalRoot.querySelector('#modal-search-input');
  const searchList = modalRoot.querySelector('#chats-search-grouped-list');
  const resultsContainer = modalRoot.querySelector('#search-results-list');
  const previewEmpty = modalRoot.querySelector('#search-preview-empty');
  const previewContent = modalRoot.querySelector('#search-preview-content');
  const loadingIndicator = modalRoot.querySelector('#search-loading-indicator');

  let debounceTimer;
  let previewAbortController = null;
  let searchAbortController = null;
  const destroySearchInput = renderSearchInput(searchInput);

  const safeScrollIntoView = (el) => {
    if (el && typeof el.scrollIntoView === 'function') {
      el.scrollIntoView({ block: 'nearest' });
    }
  };

  const close = () => setState({ showSearch: false });
  const selectChat = (id) => {
    close();
    setState({ activeChatId: id });
    loadMessagesFn(id);
  };
  const stopSearches = () => {
    if (searchAbortController) searchAbortController.abort();
    if (previewAbortController) previewAbortController.abort();
  };
  const resetSearchState = () =>
    setState({ search: { query: '', results: [], selectedIndex: -1, offset: 0, hasMore: true } });

  function updateSelectionUI() {
    const { selectedIndex, results } = state.search;
    newChatBtn.classList.toggle('bg-gray-100', selectedIndex === -1);

    modalRoot.querySelectorAll('.search-item').forEach((el) => {
      const idx = parseInt(el.getAttribute('data-index'));
      const isSelected = selectedIndex === idx;
      el.classList.toggle('bg-blue-50', isSelected);
      el.classList.toggle('border-l-2', isSelected);
      el.classList.toggle('border-l-blue-500', isSelected);
      el.setAttribute('aria-selected', isSelected.toString());
    });

    if (selectedIndex === -1) {
      safeScrollIntoView(newChatBtn);
      showPreview(null);
    } else if (results[selectedIndex]) {
      const selectedEl = modalRoot.querySelector(`[data-index="${selectedIndex}"]`);
      safeScrollIntoView(selectedEl);
      showPreview(results[selectedIndex].id);
    }
  }

  async function showPreview(chatId) {
    if (!chatId) {
      previewEmpty.classList.remove('hidden');
      previewContent.classList.add('hidden');
      previewContent.innerHTML = '';
      return;
    }

    if (state.search.previewChatId === chatId && !previewContent.classList.contains('hidden'))
      return;
    setState({ search: { previewChatId: chatId } });

    previewEmpty.classList.add('hidden');
    previewContent.classList.remove('hidden');
    previewContent.innerHTML = `
      <div class="p-6 border-b border-gray-50 flex items-center justify-between sticky top-0 bg-white/90 backdrop-blur-md z-10">
        <div class="flex flex-col min-w-0">
          <div class="text-label-sm font-bold uppercase tracking-widest text-gray-400 mb-0.5">Preview</div>
          <div class="text-sm font-semibold text-gray-800 truncate" id="preview-title">Loading...</div>
        </div>
      </div>
      <div class="flex-grow overflow-y-auto p-6 space-y-6 no-scrollbar" id="preview-messages">
        <div class="space-y-4">
          <div class="h-4 bg-gray-100 rounded w-3/4 animate-pulse"></div>
          <div class="h-4 bg-gray-100 rounded w-1/2 animate-pulse"></div>
          <div class="h-24 bg-gray-50 rounded-lg w-full animate-pulse"></div>
        </div>
      </div>
    `;

    if (previewAbortController) previewAbortController.abort();
    previewAbortController = new AbortController();

    try {
      const res = await apiFetch(`/api/chats/${chatId}`, { signal: previewAbortController.signal });
      if (!res.ok) throw new Error();
      const data = await res.json();

      previewContent.querySelector('#preview-title').textContent = data.chat.title;
      const messagesBox = previewContent.querySelector('#preview-messages');

      // Preview renders chat messages fetched from the authenticated API; role is escaped
      // and message content is passed through the existing markdown renderer.
      messagesBox.innerHTML = data.messages
        .map(
          (m) => `
        <div class="flex flex-col gap-2 ${m.role === 'user' ? 'items-end' : 'items-start'}">
          <div class="flex items-center gap-2 mb-1 ${m.role === 'user' ? 'flex-row-reverse' : ''}">
            <div class="w-5 h-5 rounded-full ${m.role === 'user' ? 'bg-surface-container text-blue-600' : 'bg-gray-100 text-gray-600'} flex items-center justify-center text-label-xs font-bold">
              ${m.role === 'user' ? 'U' : 'AI'}
            </div>
            <span class="text-label-sm font-bold uppercase text-gray-400">${escapeHtml(m.role)}</span>
          </div>
          <div class="max-w-[90%] ${m.role === 'user' ? 'bg-gray-100 rounded-lg' : 'bg-white border border-gray-100 rounded-lg'} px-4 py-2.5 text-xs text-gray-800 shadow-sm prose prose-p:my-1 prose-pre:my-2 prose-sm max-w-none break-words">
            ${renderMessageContent(m.content, { interactive: false })}
          </div>
        </div>
      `
        )
        .join('');

      messagesBox.scrollTop = messagesBox.scrollHeight;
    } catch (e) {
      if (e.name === 'AbortError') return;
      previewContent.innerHTML =
        '<div class="flex items-center justify-center h-full text-xs text-red-400">Failed to load preview</div>';
    }
  }

  function renderList() {
    const { results, query } = state.search;
    if (results.length === 0 && !state.search.loading) {
      // renderSearchEmptyStateMarkup escapes the query before interpolating it.
      searchList.innerHTML = renderSearchEmptyStateMarkup(query);
      return;
    }

    // renderSearchResultsMarkup escapes chat titles, date labels, and the query highlight.
    searchList.innerHTML = renderSearchResultsMarkup(results, query);

    searchList.querySelectorAll('[data-search-chat]').forEach((btn) => {
      btn.onclick = () => selectChat(btn.getAttribute('data-search-chat'));
      btn.onmouseover = () => {
        const idx = parseInt(btn.getAttribute('data-index'));
        if (state.search.selectedIndex !== idx) {
          setState({ search: { selectedIndex: idx } });
        }
      };
    });
  }

  function selectResultByIndex(selectedIndex) {
    if (selectedIndex === -1) {
      newChatBtn.click();
    } else if (state.search.results[selectedIndex]) {
      selectChat(state.search.results[selectedIndex].id);
    }
  }

  async function runSearch(query, append = false) {
    if (searchAbortController) searchAbortController.abort();
    searchAbortController = new AbortController();

    const offset = append ? state.search.offset : 0;
    setState({ search: { query, loading: true, offset } });
    loadingIndicator.classList.remove('hidden');

    try {
      const backendQuery = normalizeBackendQuery(query);
      const data = await fetchChats({
        q: backendQuery,
        limit: 20,
        offset,
        signal: searchAbortController.signal,
      });
      const newResults = append ? [...state.search.results, ...data.chats] : data.chats;
      setState({
        search: {
          results: newResults,
          loading: false,
          hasMore: data.chats.length === 20,
          offset: offset + data.chats.length,
        },
      });
      renderList();
      updateSelectionUI();
    } catch (e) {
      if (e.name === 'AbortError') return;
      setState({ search: { loading: false } });
    } finally {
      loadingIndicator.classList.add('hidden');
    }
  }

  function bindDomEvents() {
    closeBtn.onclick = close;
    overlay.onclick = close;

    newChatBtn.onclick = () => {
      close();
      createChatFn();
    };

    resultsContainer.onscroll = () => {
      const { loading, hasMore, query } = state.search;
      if (loading || !hasMore) return;
      if (
        resultsContainer.scrollHeight - resultsContainer.scrollTop - resultsContainer.clientHeight <
        50
      ) {
        runSearch(query, true);
      }
    };

    searchInput.oninput = (e) => {
      const q = e.target.value.trim();
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => runSearch(q), 300);
    };

    searchInput.onkeydown = (e) => {
      const { selectedIndex, results } = state.search;
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        if (selectedIndex < results.length - 1) {
          setState({ search: { selectedIndex: selectedIndex + 1 } });
        }
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        if (selectedIndex > -1) {
          setState({ search: { selectedIndex: selectedIndex - 1 } });
        }
      } else if (e.key === 'Enter') {
        e.preventDefault();
        selectResultByIndex(selectedIndex);
      }
    };
  }

  bindDomEvents();

  function openModal() {
    setModalHash('search-modal');
    if (!modalRoot.classList.contains('hidden')) return;
    previousFocus = document.activeElement;
    if (!sidebarSuspended) {
      suspendSidebarVisibility();
      sidebarSuspended = true;
    }
    document.body.style.overflow = 'hidden';
    modalRoot.classList.remove('hidden');
    resetSearchState();
    runSearch('');
    setTimeout(() => searchInput.focus(), 50);
  }

  function closeModal() {
    if (!modalRoot.classList.contains('hidden')) {
      document.body.style.overflow = '';
      if (sidebarSuspended) {
        restoreSidebarVisibility();
        sidebarSuspended = false;
      }
      if (previousFocus) previousFocus.focus();
      clearModalHash('search-modal');
    }
    modalRoot.classList.add('hidden');
    searchInput.value = '';
    stopSearches();
  }

  unsubscribe = subscribe((currentState) => {
    if (currentState.showSearch) {
      openModal();
    } else {
      closeModal();
    }
    updateSelectionUI();
  });

  cleanup = () => {
    if (unsubscribe) unsubscribe();
    destroySearchInput?.();
    document.body.style.overflow = '';
    if (sidebarSuspended) {
      restoreSidebarVisibility();
      sidebarSuspended = false;
    }
    stopSearches();
    if (debounceTimer) clearTimeout(debounceTimer);
    clearModalHash('search-modal');
  };

  return () => {
    if (cleanup) cleanup();
  };
}
