import {
  apiFetch,
  fetchArchivedChats,
  fetchSharedChats,
  getFileContent,
  getFileMetadata,
  shareChat,
  toggleArchiveChat,
  unshareChat,
} from './api.js';
import { escapeHtml, renderMessageContent } from './utils.js';
import { state, setState, subscribe } from './store.js';
import { renderSearchModal } from './components/search-modal.js';
import { renderPlaceholder } from './components/chat-placeholder.js';
import { renderMessageInput } from './components/message-input.js';
import { renderModelSelector } from './components/model-selector.js';
import { renderSidebar } from './components/sidebar.js';
import { renderFilesModal } from './components/files-modal.js';

function normalizeCitations(raw) {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw.map(String).filter(Boolean);
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed.map(String).filter(Boolean);
    } catch {
      return [];
    }
  }
  return [];
}

export function renderChat(container) {
  if (typeof container.__cleanup === 'function') {
    container.__cleanup();
  }

  container.innerHTML = `
    <div class="flex h-full w-full bg-white overflow-hidden text-[#171717] font-sans">
      <div id="sidebar-backdrop" class="fixed inset-0 bg-black/20 backdrop-blur-sm z-30 transition-opacity duration-300 hidden md:hidden"></div>

      <aside id="sidebar" class="fixed md:relative h-full flex-shrink-0 bg-[#f9f9f9] border-r border-gray-200 flex flex-col transition-all duration-300 ease-in-out z-40 -ml-[260px] md:ml-0 overflow-visible">
        <div class="p-3 space-y-2">
          <button id="new-chat" class="flex items-center justify-between px-3 py-2 w-full hover:bg-gray-200 rounded-lg transition text-sm font-medium">
             <div class="flex items-center gap-3">
               <div class="w-6 h-6 bg-white rounded-full flex items-center justify-center border border-gray-200 shadow-sm overflow-hidden">
                 <img src="/logo.png" alt="GrowChat" class="w-5 h-5 object-contain" />
               </div>
               New Chat
             </div>
             <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v14M5 12h14"/></svg>
          </button>

          <button id="open-search" class="flex items-center gap-3 px-3 py-2 w-full hover:bg-gray-200 rounded-lg transition text-sm font-medium text-gray-600">
             <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
             Search
          </button>

          <button id="open-archived" class="flex items-center gap-3 px-3 py-2 w-full hover:bg-gray-200 rounded-lg transition text-sm font-medium text-gray-600">
             <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="20" height="5" x="2" y="3" rx="1"/><path d="M4 8v11a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8"/><path d="M10 12h4"/></svg>
             Archived Chats
          </button>
        </div>

        <div class="flex-grow overflow-y-auto no-scrollbar px-3 space-y-1 pb-4">
          <div class="text-xs font-medium text-gray-500 px-3 py-2 mt-2">Chats</div>
          <ul id="chat-list" class="space-y-0.5"></ul>
        </div>
      </aside>

      <main class="flex-grow flex flex-col relative min-w-0 bg-white h-full">
        <header class="h-[60px] flex items-center px-4 justify-between sticky top-0 z-10 bg-white/90 backdrop-blur-sm border-b border-gray-100">
           <div class="flex items-center">
             <button id="toggle-sidebar" class="p-2 mr-2 hover:bg-gray-100 rounded-lg transition text-gray-500">
               <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="3" y1="12" x2="21" y2="12"></line><line x1="3" y1="6" x2="21" y2="6"></line><line x1="3" y1="18" x2="21" y2="18"></line></svg>
             </button>
             <div id="model-selector-container"></div>
           </div>

           <div class="flex items-center gap-2 text-gray-500">
             <button id="archive-chat-btn" class="p-2 hover:bg-gray-100 rounded-lg transition disabled:opacity-40" title="Archive chat" aria-label="Archive chat" disabled>
               <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="20" height="5" x="2" y="3" rx="1"/><path d="M4 8v11a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8"/><path d="M10 12h4"/></svg>
             </button>
             <button id="share-chat-btn" class="p-2 hover:bg-gray-100 rounded-lg transition disabled:opacity-40" title="Share chat" aria-label="Share chat" disabled>
               <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>
             </button>
           </div>
        </header>

        <div id="messages-container" class="flex-grow overflow-y-auto no-scrollbar pb-[140px] pt-4">
          <div id="messages-inner" class="max-w-3xl mx-auto w-full px-4 flex flex-col gap-6 pb-4">
             <div id="welcome-screen-container"></div>
             <div id="messages-list" class="hidden flex flex-col gap-6"></div>
          </div>
        </div>

        <div class="absolute bottom-0 left-0 w-full pt-4 pb-6 bg-gradient-to-t from-white via-white to-transparent">
          <div id="message-input-container" class="max-w-3xl mx-auto w-full px-4 relative"></div>
        </div>
      </main>
    </div>

    <div id="search-modal-container"></div>
    <div id="files-modal-container"></div>
    <div id="share-modal-container"></div>
    <div id="archived-modal-container"></div>
    <div id="citation-modal-container"></div>
  `;

  container.__cleanup = wireChat(container);
}

function wireChat(root) {
  const chatList = root.querySelector('#chat-list');
  const messagesList = root.querySelector('#messages-list');
  const welcomeScreenContainer = root.querySelector('#welcome-screen-container');
  const messageInputContainer = root.querySelector('#message-input-container');
  const newChatBtn = root.querySelector('#new-chat');
  const toggleSidebar = root.querySelector('#toggle-sidebar');
  const openArchivedBtn = root.querySelector('#open-archived');
  const archiveChatBtn = root.querySelector('#archive-chat-btn');
  const shareChatBtn = root.querySelector('#share-chat-btn');
  const sidebar = root.querySelector('#sidebar');
  const sidebarBackdrop = root.querySelector('#sidebar-backdrop');
  const messagesContainer = root.querySelector('#messages-container');
  const openSearchBtn = root.querySelector('#open-search');
  const searchModalContainer = root.querySelector('#search-modal-container');
  const filesModalContainer = root.querySelector('#files-modal-container');
  const shareModalContainer = root.querySelector('#share-modal-container');
  const archivedModalContainer = root.querySelector('#archived-modal-container');
  const citationModalContainer = root.querySelector('#citation-modal-container');
  const modelSelectorContainer = root.querySelector('#model-selector-container');

  const sharedByChatId = new Map();

  const destroyModelSelector = renderModelSelector(modelSelectorContainer);
  const destroySidebar = renderSidebar(sidebar, root);
  const inputComponent = renderMessageInput(messageInputContainer, sendMessage, () => {
    setState({ showFiles: true });
  });

  function getActiveModel() {
    return state.models.find((m) => m.id === state.activeModelId) || null;
  }

  let destroyPlaceholder;
  function drawPlaceholder() {
    destroyPlaceholder = renderPlaceholder(welcomeScreenContainer, {
      model: getActiveModel(),
      onSuggestionClick: (text) => {
        inputComponent.setValue(text);
        inputComponent.submit();
      },
    });
  }

  drawPlaceholder();

  const destroySearchModal = renderSearchModal(searchModalContainer, createChat, loadMessages);
  const destroyFilesModal = renderFilesModal(filesModalContainer);

  function renderShareModal(shareData = null) {
    const hasShare = Boolean(shareData?.share_id);
    const shareUrl = hasShare ? `${window.location.origin}${shareData.share_url}` : '';

    shareModalContainer.innerHTML = `
      <div id="share-modal-root" class="fixed inset-0 z-[120]" role="dialog" aria-modal="true">
        <div id="share-overlay" class="absolute inset-0 bg-black/30"></div>
        <div class="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[92%] max-w-lg rounded-2xl bg-white border border-gray-200 shadow-xl p-5">
          <h3 class="text-lg font-semibold text-gray-900">Share Chat</h3>
          <p class="text-xs text-gray-500 mt-1">Create a read-only public link for this chat.</p>
          <div class="mt-4 rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-700 break-all">${hasShare ? escapeHtml(shareUrl) : 'No active share link'}</div>
          <div class="mt-4 flex items-center justify-end gap-2">
            <button id="close-share-modal" class="px-3 py-2 text-sm rounded-lg border border-gray-200 hover:bg-gray-50">Close</button>
            <button id="copy-share-link" class="px-3 py-2 text-sm rounded-lg border border-gray-200 hover:bg-gray-50 ${hasShare ? '' : 'hidden'}">Copy Link</button>
            <button id="generate-share-link" class="px-3 py-2 text-sm rounded-lg bg-black text-white hover:bg-gray-800">${hasShare ? 'Refresh Link' : 'Generate Link'}</button>
            <button id="revoke-share-link" class="px-3 py-2 text-sm rounded-lg bg-red-600 text-white hover:bg-red-700 ${hasShare ? '' : 'hidden'}">Revoke</button>
          </div>
        </div>
      </div>
    `;

    const close = () => {
      shareModalContainer.innerHTML = '';
    };

    shareModalContainer.querySelector('#share-overlay')?.addEventListener('click', close);
    shareModalContainer.querySelector('#close-share-modal')?.addEventListener('click', close);

    shareModalContainer.querySelector('#copy-share-link')?.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(shareUrl);
      } catch {
        window.prompt('Copy link', shareUrl);
      }
    });

    shareModalContainer.querySelector('#generate-share-link')?.addEventListener('click', async () => {
      if (!state.activeChatId) return;
      const data = await shareChat(state.activeChatId);
      sharedByChatId.set(state.activeChatId, data);
      drawChats(state.chats, state.activeChatId);
      renderShareModal(data);
    });

    shareModalContainer.querySelector('#revoke-share-link')?.addEventListener('click', async () => {
      if (!state.activeChatId) return;
      await unshareChat(state.activeChatId);
      sharedByChatId.delete(state.activeChatId);
      drawChats(state.chats, state.activeChatId);
      renderShareModal(null);
    });
  }

  function renderCitationModal(citationId, detailText) {
    citationModalContainer.innerHTML = `
      <div class="fixed inset-0 z-[130]" role="dialog" aria-modal="true">
        <div id="citation-overlay" class="absolute inset-0 bg-black/30"></div>
        <div class="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[94%] max-w-2xl h-[70vh] rounded-2xl bg-white border border-gray-200 shadow-xl flex flex-col">
          <div class="px-5 py-3 border-b border-gray-100 flex items-center justify-between">
            <div>
              <h3 class="text-sm font-semibold text-gray-900">Citation</h3>
              <p class="text-xs text-gray-500">${escapeHtml(citationId)}</p>
            </div>
            <button id="close-citation" class="p-2 hover:bg-gray-100 rounded-lg">✕</button>
          </div>
          <div class="p-4 overflow-auto text-sm text-gray-800 whitespace-pre-wrap">${escapeHtml(detailText || 'No preview available')}</div>
        </div>
      </div>
    `;

    const close = () => {
      citationModalContainer.innerHTML = '';
    };
    citationModalContainer.querySelector('#citation-overlay')?.addEventListener('click', close);
    citationModalContainer.querySelector('#close-citation')?.addEventListener('click', close);
  }

  async function openCitation(citationId) {
    let detailText = `Source ID: ${citationId}`;
    try {
      const meta = await getFileMetadata(citationId);
      detailText = `${meta.filename || citationId}\n\nType: ${meta.content_type || 'unknown'}\n\n`;
      try {
        const content = await getFileContent(citationId);
        detailText += typeof content.content === 'string'
          ? content.content
          : JSON.stringify(content.content, null, 2);
      } catch {
        detailText += (meta.text_excerpt || 'No content preview available');
      }
    } catch {
      detailText = `Source ID: ${citationId}\n\nNo detailed preview found for this source.`;
    }

    renderCitationModal(citationId, detailText);
  }

  async function openArchivedModal() {
    const data = await fetchArchivedChats();
    archivedModalContainer.innerHTML = `
      <div class="fixed inset-0 z-[125]" role="dialog" aria-modal="true">
        <div id="archived-overlay" class="absolute inset-0 bg-black/30"></div>
        <div class="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[94%] max-w-xl rounded-2xl bg-white border border-gray-200 shadow-xl p-5">
          <div class="flex items-center justify-between mb-4">
            <h3 class="text-lg font-semibold text-gray-900">Archived Chats</h3>
            <button id="close-archived-modal" class="p-2 hover:bg-gray-100 rounded-lg">✕</button>
          </div>
          <div class="space-y-2 max-h-[60vh] overflow-auto">
            ${(data.chats || []).map((chat) => `
              <div class="border border-gray-200 rounded-xl px-3 py-2 flex items-center justify-between gap-3">
                <div class="min-w-0">
                  <p class="text-sm font-medium text-gray-800 truncate">${escapeHtml(chat.title || 'Untitled')}</p>
                </div>
                <button data-restore-chat="${chat.id}" class="px-3 py-1.5 text-xs font-medium rounded-lg bg-black text-white hover:bg-gray-800">Restore</button>
              </div>
            `).join('') || '<p class="text-sm text-gray-500">No archived chats.</p>'}
          </div>
        </div>
      </div>
    `;

    const close = () => { archivedModalContainer.innerHTML = ''; };
    archivedModalContainer.querySelector('#archived-overlay')?.addEventListener('click', close);
    archivedModalContainer.querySelector('#close-archived-modal')?.addEventListener('click', close);
    archivedModalContainer.querySelectorAll('[data-restore-chat]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const id = btn.getAttribute('data-restore-chat');
        await toggleArchiveChat(id);
        const res = await apiFetch('/api/chats');
        if (res.ok) {
          const refreshed = await res.json();
          setState({ chats: refreshed.chats || [] });
        }
        close();
      });
    });
  }

  function drawChats(chats, activeId) {
    chatList.innerHTML = chats.map((c) => {
      const isShared = sharedByChatId.has(c.id);
      return `
        <li>
          <div class="w-full px-2 py-1 rounded-lg transition group ${activeId === c.id ? 'bg-[#ebebeb]' : 'hover:bg-gray-100'} flex items-center gap-1">
            <button data-chat="${c.id}" class="flex-grow text-left px-1 py-1 text-[13px] ${activeId === c.id ? 'font-medium text-gray-900' : 'text-gray-600'}">
              <span class="truncate block">${escapeHtml(c.title)}</span>
            </button>
            <button data-chat-share="${c.id}" class="p-1.5 rounded-md ${isShared ? 'text-blue-600' : 'text-gray-400'} hover:bg-white hover:text-blue-700" title="Share chat">
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>
            </button>
            <button data-chat-archive="${c.id}" class="p-1.5 rounded-md text-gray-400 hover:bg-white hover:text-gray-700" title="Archive chat">
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="20" height="5" x="2" y="3" rx="1"/><path d="M4 8v11a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8"/><path d="M10 12h4"/></svg>
            </button>
          </div>
        </li>
      `;
    }).join('');

    chatList.querySelectorAll('[data-chat]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-chat');
        setState({ activeChatId: id });
        loadMessages(id);
        if (state.isMobile) setState({ showSidebar: false });
      });
    });

    chatList.querySelectorAll('[data-chat-share]').forEach((btn) => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const id = btn.getAttribute('data-chat-share');
        setState({ activeChatId: id });
        await loadMessages(id);
        const existing = sharedByChatId.get(id) || null;
        renderShareModal(existing);
      });
    });

    chatList.querySelectorAll('[data-chat-archive]').forEach((btn) => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const id = btn.getAttribute('data-chat-archive');
        await toggleArchiveChat(id);
        const res = await apiFetch('/api/chats');
        if (!res.ok) return;
        const refreshed = await res.json();
        const nextId = id === state.activeChatId ? refreshed.chats?.[0]?.id || null : state.activeChatId;
        setState({ chats: refreshed.chats || [], activeChatId: nextId });
        if (nextId) {
          await loadMessages(nextId);
        } else {
          drawMessages([]);
        }
      });
    });
  }

  function drawMessages(messages) {
    const welcomeScreen = welcomeScreenContainer.firstElementChild;
    if (messages.length === 0) {
      if (welcomeScreen) welcomeScreen.classList.remove('hidden');
      messagesList.classList.add('hidden');
      return;
    }

    if (welcomeScreen) welcomeScreen.classList.add('hidden');
    messagesList.classList.remove('hidden');

    messagesList.innerHTML = messages.map((m, i) => {
      const isStreaming = m.role === 'assistant' && i === messages.length - 1 && !m.done;

      if (m.role === 'user') {
        return `
          <div class="flex justify-end w-full group">
            <div class="max-w-[80%] bg-[#f4f4f4] rounded-[20px] px-5 py-3 text-[15px] text-gray-900 shadow-sm border border-transparent hover:bg-[#ebebeb] transition-colors relative">
              ${escapeHtml(m.content).replace(/\n/g, '<br/>')}
            </div>
          </div>
        `;
      }

      const citations = normalizeCitations(m.citations);
      const citationHtml = citations.length
        ? `<div class="mt-3 flex flex-wrap gap-2">${citations.map((id) => `<button data-citation-id="${escapeHtml(id)}" class="text-xs px-2 py-1 rounded-full bg-gray-100 hover:bg-gray-200 text-gray-700 border border-gray-200">Source: ${escapeHtml(id.slice(0, 8))}</button>`).join('')}</div>`
        : '';

      return `
        <div class="flex gap-4 w-full group py-2">
          <div class="flex-shrink-0 w-8 h-8 rounded-full bg-white border border-gray-200 flex items-center justify-center shadow-sm mt-1 overflow-hidden">
             <img src="/logo.png" alt="GrowChat" class="w-6 h-6 object-contain" />
          </div>
          <div class="flex-grow min-w-0 flex flex-col">
             <div class="font-semibold text-[15px] mb-1 text-gray-800">GrowChat</div>
             <div class="text-[16px] leading-relaxed text-gray-800 prose prose-p:my-2 prose-pre:my-3 prose-headings:font-semibold max-w-none break-words">
                ${renderMessageContent(m.content)}
             </div>
             ${citationHtml}
             <div class="flex items-center gap-1 mt-2 -ml-2 text-gray-400 ${isStreaming ? 'opacity-0' : 'opacity-100'} transition-opacity">
                <button data-copy-message="${i}" class="p-1.5 hover:text-gray-700 hover:bg-gray-100 rounded-md transition" title="Copy">Copy</button>
             </div>
          </div>
        </div>
      `;
    }).join('');

    messagesList.querySelectorAll('[data-copy-message]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const idx = Number(btn.getAttribute('data-copy-message'));
        const text = messages[idx]?.content || '';
        try {
          await navigator.clipboard.writeText(text);
        } catch {
          window.prompt('Copy message', text);
        }
      });
    });

    messagesList.querySelectorAll('[data-citation-id]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-citation-id');
        openCitation(id);
      });
    });

    setTimeout(() => {
      messagesContainer.scrollTop = messagesContainer.scrollHeight;
    }, 10);
  }

  async function refreshShareState() {
    try {
      const data = await fetchSharedChats();
      sharedByChatId.clear();
      (data.chats || []).forEach((chat) => {
        if (chat?.id && chat?.share_id) {
          sharedByChatId.set(chat.id, {
            share_id: chat.share_id,
            share_url: `/s/${chat.share_id}`,
            chat_id: chat.id,
          });
        }
      });
    } catch {
      sharedByChatId.clear();
    }
  }

  async function loadMessages(chatId) {
    if (!chatId) {
      drawMessages([]);
      return;
    }

    const res = await apiFetch(`/api/chats/${chatId}`);
    if (!res.ok) return;
    const data = await res.json();

    const newMessages = { ...state.messagesByChat, [chatId]: data.messages };
    setState({
      messagesByChat: newMessages,
      activeModelId: data?.chat?.model || state.activeModelId,
    });

    drawMessages(data.messages);
  }

  async function createChat() {
    const payload = state.activeModelId ? { model: state.activeModelId } : {};
    const res = await apiFetch('/api/chats', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    if (!res.ok) return;
    const data = await res.json();

    setState((prev) => ({
      chats: [data.chat, ...prev.chats],
      activeChatId: data.chat.id,
      activeModelId: data.chat.model || prev.activeModelId,
    }));

    await loadMessages(data.chat.id);
  }

  async function sendMessage(text, onComplete) {
    if (!state.activeChatId) {
      const payload = state.activeModelId ? { model: state.activeModelId } : {};
      const res = await apiFetch('/api/chats', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        onComplete?.();
        return;
      }
      const data = await res.json();
      setState((prev) => ({
        chats: [data.chat, ...prev.chats],
        activeChatId: data.chat.id,
        activeModelId: data.chat.model || prev.activeModelId,
      }));
    }

    const chatId = state.activeChatId;
    const current = state.messagesByChat[chatId] || [];
    current.push({ role: 'user', content: text });
    current.push({ role: 'assistant', content: '', done: false });

    setState({ messagesByChat: { ...state.messagesByChat, [chatId]: current } });
    drawMessages(current);

    const res = await apiFetch(`/api/chats/${chatId}/messages`, {
      method: 'POST',
      body: JSON.stringify({ message: text, model: state.activeModelId || undefined }),
    });

    if (!res.ok || !res.body) {
      current[current.length - 1].done = true;
      current[current.length - 1].content = 'Failed to connect to the server.';
      drawMessages(current);
      onComplete?.();
      return;
    }

    onComplete?.();

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let sseBuffer = '';
    let assistantText = '';

    const applyAssistantText = () => {
      current[current.length - 1] = { role: 'assistant', content: assistantText, done: false };
      drawMessages(current);
    };

    const applySseLine = (line) => {
      if (!line.startsWith('data: ')) return;
      const payload = line.slice(6).trim();
      if (!payload || payload === '[DONE]') return;
      try {
        const parsed = JSON.parse(payload);
        if (parsed.response) {
          assistantText += parsed.response;
          applyAssistantText();
        }
      } catch {
        // Ignore malformed chunks and continue stream parsing.
      }
    };

    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        current[current.length - 1].done = true;
        drawMessages(current);
        await loadMessages(chatId);
        break;
      }
      sseBuffer += decoder.decode(value, { stream: true });
      let newlineIdx;
      while ((newlineIdx = sseBuffer.indexOf('\n')) !== -1) {
        const line = sseBuffer.slice(0, newlineIdx);
        sseBuffer = sseBuffer.slice(newlineIdx + 1);
        applySseLine(line);
      }
    }
  }

  const onToggleSidebar = () => setState({ showSidebar: !state.showSidebar });
  const onOpenSearch = () => setState({ showSearch: true });
  const onNewChat = () => createChat();

  toggleSidebar.addEventListener('click', onToggleSidebar);
  openSearchBtn.addEventListener('click', onOpenSearch);
  newChatBtn.addEventListener('click', onNewChat);
  openArchivedBtn.addEventListener('click', openArchivedModal);

  archiveChatBtn.addEventListener('click', async () => {
    if (!state.activeChatId) return;
    await toggleArchiveChat(state.activeChatId);
    const res = await apiFetch('/api/chats');
    if (!res.ok) return;
    const data = await res.json();
    const nextId = data.chats?.[0]?.id || null;
    setState({ chats: data.chats || [], activeChatId: nextId });
    if (nextId) {
      await loadMessages(nextId);
    } else {
      drawMessages([]);
    }
  });

  shareChatBtn.addEventListener('click', () => {
    if (!state.activeChatId) return;
    renderShareModal(sharedByChatId.get(state.activeChatId) || null);
  });

  const unsubscribe = subscribe((currentState) => {
    if (currentState.showSidebar && currentState.isMobile) {
      sidebarBackdrop.classList.remove('hidden');
      document.body.style.overflow = 'hidden';
    } else {
      sidebarBackdrop.classList.add('hidden');
      if (!currentState.showSearch && !shareModalContainer.innerHTML && !archivedModalContainer.innerHTML) {
        document.body.style.overflow = '';
      }
    }

    archiveChatBtn.disabled = !currentState.activeChatId;
    shareChatBtn.disabled = !currentState.activeChatId;
    drawChats(currentState.chats, currentState.activeChatId);
  });

  sidebarBackdrop.addEventListener('click', () => setState({ showSidebar: false }));

  refreshShareState().then(() => drawChats(state.chats, state.activeChatId));

  if (state.activeChatId) loadMessages(state.activeChatId);

  return () => {
    unsubscribe();
    destroySearchModal?.();
    destroyFilesModal?.();
    destroyModelSelector?.();
    destroySidebar?.();
    inputComponent?.destroy?.();
    destroyPlaceholder?.();
    toggleSidebar.removeEventListener('click', onToggleSidebar);
    openSearchBtn.removeEventListener('click', onOpenSearch);
    newChatBtn.removeEventListener('click', onNewChat);
    openArchivedBtn.removeEventListener('click', openArchivedModal);
    root.__cleanup = null;
  };
}
