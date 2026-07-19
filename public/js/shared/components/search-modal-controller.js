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

// --- Constants ---
const SEARCH_PAGE_SIZE = 20;
const SCROLL_THRESHOLD_PX = 50;
const DEBOUNCE_DELAY_MS = 300;
const FOCUS_DELAY_MS = 50;

const PREVIEW_SKELETON_HTML = `
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

// --- DOM refs ---

function getModalRefs(container) {
  const modalRoot = container.querySelector('#modal-root');
  return {
    modalRoot,
    closeBtn: modalRoot.querySelector('#close-modal'),
    overlay: modalRoot.querySelector('#modal-overlay'),
    newChatBtn: modalRoot.querySelector('#action-new-chat'),
    searchInput: modalRoot.querySelector('#modal-search-input'),
    searchList: modalRoot.querySelector('#chats-search-grouped-list'),
    resultsContainer: modalRoot.querySelector('#search-results-list'),
    previewEmpty: modalRoot.querySelector('#search-preview-empty'),
    previewContent: modalRoot.querySelector('#search-preview-content'),
    loadingIndicator: modalRoot.querySelector('#search-loading-indicator'),
  };
}

// --- Pure helpers ---

function safeScrollIntoView(el) {
  if (el && typeof el.scrollIntoView === 'function') {
    el.scrollIntoView({ block: 'nearest' });
  }
}

function closeSearch() {
  setState({ showSearch: false });
}

function selectChatAndLoad(id, loadMessagesFn) {
  closeSearch();
  setState({ activeChatId: id });
  loadMessagesFn(id);
}

function stopSearches(searchAbortController, previewAbortController) {
  if (searchAbortController) searchAbortController.abort();
  if (previewAbortController) previewAbortController.abort();
}

function resetSearchState() {
  setState({ search: { query: '', results: [], selectedIndex: -1, offset: 0, hasMore: true } });
}

// --- UI update functions ---

function updateSelectionUI(refs, ctrl) {
  const { selectedIndex, results } = state.search;
  refs.newChatBtn.classList.toggle('bg-gray-100', selectedIndex === -1);

  refs.modalRoot.querySelectorAll('.search-item').forEach((el) => {
    const idx = parseInt(el.getAttribute('data-index'));
    const isSelected = selectedIndex === idx;
    el.classList.toggle('bg-blue-50', isSelected);
    el.classList.toggle('border-l-2', isSelected);
    el.classList.toggle('border-l-blue-500', isSelected);
    el.setAttribute('aria-selected', isSelected.toString());
  });

  if (selectedIndex === -1) {
    safeScrollIntoView(refs.newChatBtn);
    showPreview(null, refs, ctrl);
  } else if (results[selectedIndex]) {
    const selectedEl = refs.modalRoot.querySelector(`[data-index="${selectedIndex}"]`);
    safeScrollIntoView(selectedEl);
    showPreview(results[selectedIndex].id, refs, ctrl);
  }
}

async function fetchAndRenderPreviewChat(chatId, refs, ctrl) {
  if (ctrl.previewAbortController) ctrl.previewAbortController.abort();
  ctrl.previewAbortController = new AbortController();

  try {
    const res = await apiFetch(`/api/chats/${chatId}`, {
      signal: ctrl.previewAbortController.signal,
    });
    if (!res.ok) throw new Error();
    const data = await res.json();

    refs.previewContent.querySelector('#preview-title').textContent = data.chat.title;
    const messagesBox = refs.previewContent.querySelector('#preview-messages');

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
    refs.previewContent.innerHTML =
      '<div class="flex items-center justify-center h-full text-xs text-red-400">Failed to load preview</div>';
  }
}

async function showPreview(chatId, refs, ctrl) {
  if (!chatId) {
    refs.previewEmpty.classList.remove('hidden');
    refs.previewContent.classList.add('hidden');
    refs.previewContent.innerHTML = '';
    return;
  }

  if (state.search.previewChatId === chatId && !refs.previewContent.classList.contains('hidden'))
    return;
  setState({ search: { previewChatId: chatId } });

  refs.previewEmpty.classList.add('hidden');
  refs.previewContent.classList.remove('hidden');
  refs.previewContent.innerHTML = PREVIEW_SKELETON_HTML;

  await fetchAndRenderPreviewChat(chatId, refs, ctrl);
}

function renderList(refs, ctrl) {
  const { results, query } = state.search;
  if (results.length === 0 && !state.search.loading) {
    // renderSearchEmptyStateMarkup escapes the query before interpolating it.
    refs.searchList.innerHTML = renderSearchEmptyStateMarkup(query);
    return;
  }

  // renderSearchResultsMarkup escapes chat titles, date labels, and the query highlight.
  refs.searchList.innerHTML = renderSearchResultsMarkup(results, query);

  refs.searchList.querySelectorAll('[data-search-chat]').forEach((btn) => {
    btn.onclick = () =>
      selectChatAndLoad(btn.getAttribute('data-search-chat'), ctrl.loadMessagesFn);
    btn.onmouseover = () => {
      const idx = parseInt(btn.getAttribute('data-index'));
      if (state.search.selectedIndex !== idx) {
        setState({ search: { selectedIndex: idx } });
      }
    };
  });
}

function selectResultByIndex(selectedIndex, refs, ctrl) {
  if (selectedIndex === -1) {
    refs.newChatBtn.click();
  } else if (state.search.results[selectedIndex]) {
    selectChatAndLoad(state.search.results[selectedIndex].id, ctrl.loadMessagesFn);
  }
}

// --- Search execution ---

async function runSearch(query, append, refs, ctrl) {
  if (ctrl.searchAbortController) ctrl.searchAbortController.abort();
  ctrl.searchAbortController = new AbortController();

  const offset = append ? state.search.offset : 0;
  setState({ search: { query, loading: true, offset } });
  refs.loadingIndicator.classList.remove('hidden');

  try {
    const backendQuery = normalizeBackendQuery(query);
    const data = await fetchChats({
      q: backendQuery,
      limit: SEARCH_PAGE_SIZE,
      offset,
      signal: ctrl.searchAbortController.signal,
    });
    const newResults = append ? [...state.search.results, ...data.chats] : data.chats;
    setState({
      search: {
        results: newResults,
        loading: false,
        hasMore: data.chats.length === SEARCH_PAGE_SIZE,
        offset: offset + data.chats.length,
      },
    });
    renderList(refs, ctrl);
    updateSelectionUI(refs, ctrl);
  } catch (e) {
    if (e.name === 'AbortError') return;
    setState({ search: { loading: false } });
  } finally {
    refs.loadingIndicator.classList.add('hidden');
  }
}

// --- Event wiring ---

function setupEventListeners(refs, ctrl) {
  refs.closeBtn.onclick = closeSearch;
  refs.overlay.onclick = closeSearch;

  refs.newChatBtn.onclick = () => {
    closeSearch();
    ctrl.createChatFn();
  };

  refs.resultsContainer.onscroll = () => {
    const { loading, hasMore, query } = state.search;
    if (loading || !hasMore) return;
    if (
      refs.resultsContainer.scrollHeight -
        refs.resultsContainer.scrollTop -
        refs.resultsContainer.clientHeight <
      SCROLL_THRESHOLD_PX
    ) {
      runSearch(query, true, refs, ctrl);
    }
  };

  refs.searchInput.oninput = (e) => {
    const q = e.target.value.trim();
    clearTimeout(ctrl.debounceTimer);
    ctrl.debounceTimer = setTimeout(() => runSearch(q, false, refs, ctrl), DEBOUNCE_DELAY_MS);
  };

  refs.searchInput.onkeydown = (e) => {
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
      selectResultByIndex(selectedIndex, refs, ctrl);
    }
  };
}

// --- Modal lifecycle ---

function openModal(refs, ctrl) {
  setModalHash('search-modal');
  if (!refs.modalRoot.classList.contains('hidden')) return;
  ctrl.previousFocus = document.activeElement;
  if (!ctrl.sidebarSuspended) {
    suspendSidebarVisibility();
    ctrl.sidebarSuspended = true;
  }
  document.body.style.overflow = 'hidden';
  refs.modalRoot.classList.remove('hidden');
  resetSearchState();
  runSearch('', false, refs, ctrl);
  setTimeout(() => refs.searchInput.focus(), FOCUS_DELAY_MS);
}

function closeModal(refs, ctrl) {
  if (!refs.modalRoot.classList.contains('hidden')) {
    document.body.style.overflow = '';
    if (ctrl.sidebarSuspended) {
      restoreSidebarVisibility();
      ctrl.sidebarSuspended = false;
    }
    if (ctrl.previousFocus) ctrl.previousFocus.focus();
    clearModalHash('search-modal');
  }
  refs.modalRoot.classList.add('hidden');
  refs.searchInput.value = '';
  stopSearches(ctrl.searchAbortController, ctrl.previewAbortController);
}

// --- Main export ---

export function createSearchModalController(container, createChatFn, loadMessagesFn) {
  const refs = getModalRefs(container);
  const ctrl = {
    searchAbortController: null,
    previewAbortController: null,
    debounceTimer: null,
    previousFocus: null,
    sidebarSuspended: false,
    cleanup: null,
    unsubscribe: null,
    createChatFn,
    loadMessagesFn,
  };
  const destroySearchInput = renderSearchInput(refs.searchInput);

  setupEventListeners(refs, ctrl);

  ctrl.unsubscribe = subscribe((currentState) => {
    if (currentState.showSearch) {
      openModal(refs, ctrl);
    } else {
      closeModal(refs, ctrl);
    }
    updateSelectionUI(refs, ctrl);
  });

  ctrl.cleanup = () => {
    if (ctrl.unsubscribe) ctrl.unsubscribe();
    destroySearchInput?.();
    document.body.style.overflow = '';
    if (ctrl.sidebarSuspended) {
      restoreSidebarVisibility();
      ctrl.sidebarSuspended = false;
    }
    stopSearches(ctrl.searchAbortController, ctrl.previewAbortController);
    if (ctrl.debounceTimer) clearTimeout(ctrl.debounceTimer);
    clearModalHash('search-modal');
  };

  return () => {
    if (ctrl.cleanup) ctrl.cleanup();
  };
}
