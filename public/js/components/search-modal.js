import { state, setState, subscribe } from '../store.js';
import { apiFetch, fetchChats } from '../api.js';
import { escapeHtml, renderMessageContent, formatDate, formatTimestamp } from '../utils.js';
import { renderSearchInput } from './search-input.js';

function highlightText(text, query) {
  if (!query) return escapeHtml(text);
  const pureQuery = query.replace(/(tag|folder|pinned|shared|archived):\S*/gi, '').trim();
  if (!pureQuery) return escapeHtml(text);
  const regex = new RegExp(`(${pureQuery.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
  return escapeHtml(text).replace(regex, '<span class="bg-yellow-200 text-yellow-900 rounded-sm">$1</span>');
}

function groupChatsByDate(chats) {
  const groups = {};
  chats.forEach(chat => {
    const dateLabel = formatDate(chat.updated_at || chat.created_at);
    if (!groups[dateLabel]) groups[dateLabel] = [];
    groups[dateLabel].push(chat);
  });
  return groups;
}

export function renderSearchModal(container, createChatFn, loadMessagesFn) {
  let unsubscribe;
  let cleanup = null;
  let previousFocus = null;

  function init() {
    container.innerHTML = `
      <div id="modal-root" class="fixed inset-0 z-[100] hidden" role="dialog" aria-modal="true" aria-labelledby="modal-title">
        <div class="absolute inset-0 bg-black/20 backdrop-blur-sm transition-opacity" id="modal-overlay" aria-hidden="true"></div>
        <div class="absolute top-0 left-0 w-full h-full md:top-[10%] md:left-1/2 md:-translate-x-1/2 md:w-full md:max-w-3xl bg-white md:rounded-3xl shadow-2xl overflow-hidden border border-gray-100 flex flex-col md:h-[600px] max-h-screen">
           <!-- Search Input Area -->
           <div class="p-4 border-b border-gray-100 flex items-center gap-3">
              <div class="flex-shrink-0 text-gray-400">
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
              </div>
              <input type="text" id="modal-search-input" placeholder="Search chats..." class="flex-grow border-none focus:ring-0 text-lg py-1 text-gray-800 bg-transparent" aria-label="Search chats" autocomplete="off" />
              <div class="flex items-center gap-2">
                <div class="hidden md:flex items-center gap-1 px-1.5 py-0.5 rounded border border-gray-200 text-[10px] text-gray-400 font-medium">
                  <span>ESC</span>
                </div>
                <button id="close-modal" class="text-gray-400 hover:text-gray-600 transition p-2 rounded-xl hover:bg-gray-100" aria-label="Close search">
                   <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12"/></svg>
                </button>
              </div>
           </div>

           <!-- Search Content Split View -->
           <div class="flex-grow flex flex-col md:flex-row overflow-hidden relative bg-white">
              <!-- Left Side: Result List -->
              <div class="w-full md:w-[45%] border-r border-gray-100 overflow-y-auto p-2 no-scrollbar h-1/2 md:h-full flex-shrink-0" id="search-results-list">
                 <div class="px-3 py-2 text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-1" id="modal-title">Actions</div>
                 <button class="w-full text-left px-3 py-2.5 rounded-2xl hover:bg-gray-50 transition flex items-center gap-3 text-sm focus:bg-gray-100 outline-none group" id="action-new-chat" data-index="-1">
                    <div class="flex-shrink-0 w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center text-gray-500 group-hover:bg-white group-hover:shadow-sm transition-all">
                      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>
                    </div>
                    <div class="flex flex-col">
                      <span class="font-medium text-gray-800">New Chat</span>
                      <span class="text-[11px] text-gray-400">Start a fresh conversation</span>
                    </div>
                 </button>
                 
                 <div id="chats-search-grouped-list" role="listbox" class="mt-4"></div>
                 <div id="search-loading-indicator" class="hidden px-3 py-4 text-center">
                    <div class="inline-block w-5 h-5 border-2 border-gray-200 border-t-gray-800 rounded-full animate-spin"></div>
                 </div>
              </div>

              <!-- Right Side: Preview Pane -->
              <div class="w-full md:w-[55%] bg-[#fafafa] flex flex-col transition-all h-1/2 md:h-full border-t md:border-t-0 border-gray-100 flex-shrink-0 overflow-hidden" id="search-preview" aria-live="polite">
                 <div class="flex-grow flex flex-col items-center justify-center p-12 text-center" id="search-preview-empty">
                    <div class="w-16 h-16 rounded-full bg-white border border-gray-100 flex items-center justify-center mb-6 shadow-sm text-gray-200">
                       <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
                    </div>
                    <h3 class="text-sm font-semibold text-gray-800 mb-1">Preview Chat</h3>
                    <p class="text-xs text-gray-400 max-w-[200px] mx-auto">Select a result from the list to see the conversation history.</p>
                 </div>
                 <div id="search-preview-content" class="hidden h-full flex flex-col bg-white"></div>
              </div>
           </div>
        </div>
      </div>
    `;

    wire();
  }

  function wire() {
    const modalRoot = container.querySelector('#modal-root');
    const closeBtn = modalRoot.querySelector('#close-modal');
    const overlay = modalRoot.querySelector('#modal-overlay');
    const newChatBtn = modalRoot.querySelector('#action-new-chat');
    const searchInput = modalRoot.querySelector('#modal-search-input');
    const searchList = modalRoot.querySelector('#chats-search-grouped-list');
    const resultsContainer = modalRoot.querySelector('#search-results-list');
    const preview = modalRoot.querySelector('#search-preview');
    const previewEmpty = modalRoot.querySelector('#search-preview-empty');
    const previewContent = modalRoot.querySelector('#search-preview-content');
    const loadingIndicator = modalRoot.querySelector('#search-loading-indicator');

    let debounceTimer;
    let previewAbortController = null;
    let searchAbortController = null;
    const destroySearchInput = renderSearchInput(searchInput);

    const close = () => setState({ showSearch: false });
    closeBtn.onclick = close;
    overlay.onclick = close;

    newChatBtn.onclick = () => {
      close();
      createChatFn();
    };

    function updateSelectionUI() {
      const { selectedIndex, results } = state.search;
      newChatBtn.classList.toggle('bg-gray-100', selectedIndex === -1);
      
      modalRoot.querySelectorAll('.search-item').forEach(el => {
        const idx = parseInt(el.getAttribute('data-index'));
        const isSelected = selectedIndex === idx;
        el.classList.toggle('bg-gray-50', isSelected);
        el.setAttribute('aria-selected', isSelected.toString());
      });

      if (selectedIndex === -1) {
        newChatBtn.scrollIntoView({ block: 'nearest' });
        showPreview(null);
      } else if (results[selectedIndex]) {
        const selectedEl = modalRoot.querySelector(`[data-index="${selectedIndex}"]`);
        if (selectedEl) selectedEl.scrollIntoView({ block: 'nearest' });
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

      if (state.search.previewChatId === chatId && !previewContent.classList.contains('hidden')) return;
      setState({ search: { previewChatId: chatId } });

      previewEmpty.classList.add('hidden');
      previewContent.classList.remove('hidden');
      previewContent.innerHTML = `
        <div class="p-6 border-b border-gray-50 flex items-center justify-between sticky top-0 bg-white/90 backdrop-blur-md z-10">
          <div class="flex flex-col min-w-0">
            <div class="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-0.5">Preview</div>
            <div class="text-sm font-semibold text-gray-800 truncate" id="preview-title">Loading...</div>
          </div>
        </div>
        <div class="flex-grow overflow-y-auto p-6 space-y-6 no-scrollbar" id="preview-messages">
          <div class="space-y-4">
            <div class="h-4 bg-gray-100 rounded w-3/4 animate-pulse"></div>
            <div class="h-4 bg-gray-100 rounded w-1/2 animate-pulse"></div>
            <div class="h-24 bg-gray-50 rounded-2xl w-full animate-pulse"></div>
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
        
        messagesBox.innerHTML = data.messages.map(m => `
          <div class="flex flex-col gap-2 ${m.role === 'user' ? 'items-end' : 'items-start'}">
            <div class="flex items-center gap-2 mb-1 ${m.role === 'user' ? 'flex-row-reverse' : ''}">
              <div class="w-5 h-5 rounded-full ${m.role === 'user' ? 'bg-blue-100 text-blue-600' : 'bg-gray-100 text-gray-600'} flex items-center justify-center text-[8px] font-bold">
                ${m.role === 'user' ? 'U' : 'AI'}
              </div>
              <span class="text-[10px] font-bold uppercase text-gray-400">${m.role}</span>
            </div>
            <div class="max-w-[90%] ${m.role === 'user' ? 'bg-gray-100 rounded-[18px]' : 'bg-white border border-gray-100 rounded-[18px]'} px-4 py-2.5 text-xs text-gray-800 shadow-sm prose prose-p:my-1 prose-pre:my-2 prose-sm max-w-none break-words">
              ${renderMessageContent(m.content)}
            </div>
          </div>
        `).join('');
        
        messagesBox.scrollTop = messagesBox.scrollHeight;
      } catch (e) {
        if (e.name === 'AbortError') return;
        previewContent.innerHTML = '<div class="flex items-center justify-center h-full text-xs text-red-400">Failed to load preview</div>';
      }
    }

    function renderList() {
      const { results, query } = state.search;
      if (results.length === 0 && !state.search.loading) {
        searchList.innerHTML = `
          <div class="px-3 py-12 text-center">
            <div class="text-gray-300 mb-3 flex justify-center">
              <svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
            </div>
            <p class="text-xs text-gray-400 font-medium">${query ? 'No results found' : 'No recent chats'}</p>
          </div>
        `;
        return;
      }

      const groups = groupChatsByDate(results);
      searchList.innerHTML = Object.entries(groups).map(([label, groupChats]) => `
        <div class="mt-4 first:mt-0">
          <div class="px-3 py-2 text-[10px] font-bold text-gray-400 uppercase tracking-widest">${label}</div>
          <div class="space-y-0.5">
            ${groupChats.map(c => {
              const idx = results.findIndex(rc => rc.id === c.id);
              return `
                <button data-search-chat="${c.id}" data-index="${idx}" class="search-item w-full text-left px-3 py-3 rounded-2xl transition flex items-center gap-3 text-sm group outline-none focus:bg-gray-100" role="option">
                   <div class="flex-shrink-0 w-8 h-8 rounded-full bg-gray-50 border border-gray-100 flex items-center justify-center text-gray-400 group-hover:bg-white transition-colors">
                      <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
                   </div>
                   <div class="flex-grow min-w-0 flex flex-col">
                      <span class="truncate font-medium text-gray-700 group-hover:text-gray-900">${highlightText(c.title, query)}</span>
                      <span class="text-[10px] text-gray-400">${formatTimestamp(c.updated_at || c.created_at)}</span>
                   </div>
                </button>
              `;
            }).join('')}
          </div>
        </div>
      `).join('');

      searchList.querySelectorAll('[data-search-chat]').forEach(btn => {
        btn.onclick = () => {
          const id = btn.getAttribute('data-search-chat');
          close();
          setState({ activeChatId: id });
          loadMessagesFn(id);
        };
        btn.onmouseover = () => {
           const idx = parseInt(btn.getAttribute('data-index'));
           if (state.search.selectedIndex !== idx) {
             setState({ search: { selectedIndex: idx } });
           }
        };
      });
    }

    async function runSearch(query, append = false) {
      if (searchAbortController) searchAbortController.abort();
      searchAbortController = new AbortController();
      
      const offset = append ? state.search.offset : 0;
      setState({ search: { query, loading: true, offset } });
      loadingIndicator.classList.remove('hidden');

      try {
        const data = await fetchChats({ q: query, limit: 20, offset, signal: searchAbortController.signal });
        const newResults = append ? [...state.search.results, ...data.chats] : data.chats;
        setState({ 
          search: { 
            results: newResults, 
            loading: false, 
            hasMore: data.chats.length === 20,
            offset: offset + data.chats.length
          } 
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

    // Infinite scroll listener
    resultsContainer.onscroll = () => {
      const { loading, hasMore, query } = state.search;
      if (loading || !hasMore) return;
      if (resultsContainer.scrollHeight - resultsContainer.scrollTop - resultsContainer.clientHeight < 50) {
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
        if (selectedIndex === -1) {
          newChatBtn.click();
        } else if (results[selectedIndex]) {
          const id = results[selectedIndex].id;
          close();
          setState({ activeChatId: id });
          loadMessagesFn(id);
        }
      }
    };

    unsubscribe = subscribe((currentState) => {
      if (currentState.showSearch) {
        if (modalRoot.classList.contains('hidden')) {
          previousFocus = document.activeElement;
          document.body.style.overflow = 'hidden';
          setState({ search: { query: '', results: [], selectedIndex: -1, offset: 0, hasMore: true } });
          runSearch('');
        }
        modalRoot.classList.remove('hidden');
        setTimeout(() => searchInput.focus(), 50);
      } else {
        if (!modalRoot.classList.contains('hidden')) {
          document.body.style.overflow = '';
          if (previousFocus) previousFocus.focus();
        }
        modalRoot.classList.add('hidden');
        searchInput.value = '';
        if (searchAbortController) searchAbortController.abort();
        if (previewAbortController) previewAbortController.abort();
      }
      
      updateSelectionUI();
    });

    cleanup = () => {
      if (unsubscribe) unsubscribe();
      destroySearchInput?.();
      document.body.style.overflow = '';
    };
  }

  init();
  return () => {
    if (cleanup) cleanup();
  };
}
