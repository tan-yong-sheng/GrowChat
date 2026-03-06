import { apiFetch } from './api.js';
import { escapeHtml, renderMessageContent } from './utils.js';
import { state, setState, subscribe } from './store.js';
import { renderSearchModal } from './components/search-modal.js';
import { renderPlaceholder } from './components/chat-placeholder.js';
import { renderMessageInput } from './components/message-input.js';
import { renderModelSelector } from './components/model-selector.js';
import { renderSidebar } from './components/sidebar.js';
import { renderFilesModal } from './components/files-modal.js';

export function renderChat(container) {
  if (typeof container.__cleanup === 'function') {
    container.__cleanup();
  }

  container.innerHTML = `
    <div class="flex h-full w-full bg-white overflow-hidden text-[#171717] font-sans">
      <!-- Mobile Sidebar Backdrop -->
      <div id="sidebar-backdrop" class="fixed inset-0 bg-black/20 backdrop-blur-sm z-30 transition-opacity duration-300 hidden md:hidden"></div>

      <!-- Sidebar -->
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

          <!-- Search Button -->
          <button id="open-search" class="flex items-center gap-3 px-3 py-2 w-full hover:bg-gray-200 rounded-lg transition text-sm font-medium text-gray-600">
             <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
             Search
          </button>
        </div>
        
        <div class="flex-grow overflow-y-auto no-scrollbar px-3 space-y-1 pb-4">
          <div class="text-xs font-medium text-gray-500 px-3 py-2 mt-2">Today</div>
          <ul id="chat-list" class="space-y-0.5"></ul>
        </div>

        <div class="p-3 border-t border-gray-200">
          <button id="user-profile" class="flex items-center gap-3 px-3 py-2 w-full hover:bg-gray-200 rounded-lg transition text-sm">
             <div class="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center text-[11px] font-bold text-white shadow-sm">GC</div>
             <div class="flex flex-col text-left flex-grow truncate">
                <span class="truncate font-medium text-gray-800 leading-tight">GrowChat User</span>
                <span class="truncate text-xs text-gray-500 leading-tight">user@growchat.app</span>
             </div>
             <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="text-gray-400"><path d="m9 18 6-6-6-6"/></svg>
          </button>
        </div>
      </aside>

      <!-- Main Chat Area -->
      <main class="flex-grow flex flex-col relative min-w-0 bg-white h-full">
        <!-- Header -->
        <header class="h-[60px] flex items-center px-4 justify-between sticky top-0 z-10 bg-white/90 backdrop-blur-sm">
           <div class="flex items-center">
             <button id="toggle-sidebar" class="p-2 mr-2 hover:bg-gray-100 rounded-lg transition text-gray-500">
               <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="3" y1="12" x2="21" y2="12"></line><line x1="3" y1="6" x2="21" y2="6"></line><line x1="3" y1="18" x2="21" y2="18"></line></svg>
             </button>
             
             <!-- Model Selector Container -->
             <div id="model-selector-container"></div>
           </div>
           
           <div class="flex items-center gap-1 text-gray-500">
             <button class="p-2 hover:bg-gray-100 rounded-lg transition" title="Controls">
               <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20a8 8 0 1 0 0-16 8 8 0 0 0 0 16Z"/><path d="M12 14a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z"/><path d="M12 2v2"/><path d="M12 20v2"/><path d="m4.93 4.93 1.41 1.41"/><path d="m17.66 17.66 1.41 1.41"/><path d="M2 12h2"/><path d="M20 12h2"/><path d="m6.34 17.66-1.41 1.41"/><path d="m19.07 4.93-1.41 1.41"/></svg>
             </button>
           </div>
        </header>

        <!-- Messages Content -->
        <div id="messages-container" class="flex-grow overflow-y-auto no-scrollbar pb-[140px] pt-4">
          <div id="messages-inner" class="max-w-3xl mx-auto w-full px-4 flex flex-col gap-6 pb-4">
             <!-- Welcome state container -->
             <div id="welcome-screen-container"></div>
             
             <!-- Messages will be injected here -->
             <div id="messages-list" class="hidden flex flex-col gap-6"></div>
          </div>
        </div>

        <!-- Input Area -->
        <div class="absolute bottom-0 left-0 w-full pt-4 pb-6 bg-gradient-to-t from-white via-white to-transparent">
          <div id="message-input-container" class="max-w-3xl mx-auto w-full px-4 relative"></div>
        </div>
      </main>
    </div>

    <!-- Modal Container -->
    <div id="search-modal-container"></div>
    <div id="files-modal-container"></div>
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
  const sidebar = root.querySelector('#sidebar');
  const sidebarBackdrop = root.querySelector('#sidebar-backdrop');
  const messagesContainer = root.querySelector('#messages-container');
  const openSearchBtn = root.querySelector('#open-search');
  const searchModalContainer = root.querySelector('#search-modal-container');
  const filesModalContainer = root.querySelector('#files-modal-container');
  const modelSelectorContainer = root.querySelector('#model-selector-container');

  // Initialize UI Components
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

  // Initialize Search Modal
  const destroySearchModal = renderSearchModal(searchModalContainer, createChat, loadMessages);
  const destroyFilesModal = renderFilesModal(filesModalContainer);

  // Subscribe to state changes
  const unsubscribe = subscribe((currentState) => {
    // Mobile backdrop logic
    if (currentState.showSidebar && currentState.isMobile) {
        sidebarBackdrop.classList.remove('hidden');
        document.body.style.overflow = 'hidden';
    } else {
        sidebarBackdrop.classList.add('hidden');
        if (!currentState.showSearch) {
          document.body.style.overflow = '';
        }
    }

    drawChats(currentState.chats, currentState.activeChatId);
  });

  sidebarBackdrop.addEventListener('click', () => setState({ showSidebar: false }));

  function drawChats(chats, activeId) {
    chatList.innerHTML = chats.map((c) => `
      <li>
        <button data-chat="${c.id}" class="w-full text-left px-3 py-2 rounded-lg transition text-[13px] flex items-center justify-between group ${activeId === c.id ? 'bg-[#ebebeb] font-medium text-gray-900' : 'hover:bg-gray-100 text-gray-600'}">
          <span class="truncate pr-4">${escapeHtml(c.title)}</span>
          <div class="opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1 text-gray-400">
             <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="hover:text-gray-700"><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/><circle cx="5" cy="12" r="1"/></svg>
          </div>
        </button>
      </li>
    `).join('');

    chatList.querySelectorAll('[data-chat]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-chat');
        setState({ activeChatId: id });
        loadMessages(id);
        if (state.isMobile) setState({ showSidebar: false });
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
        } else {
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
                   
                   <div class="flex items-center gap-1 mt-2 -ml-2 text-gray-400 ${isStreaming ? 'opacity-0' : 'opacity-100'} transition-opacity">
                      <button class="p-1.5 hover:text-gray-700 hover:bg-gray-100 rounded-md transition" title="Copy">
                        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>
                      </button>
                      <button class="p-1.5 hover:text-gray-700 hover:bg-gray-100 rounded-md transition" title="Regenerate">
                        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/><path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16"/><path d="M16 21v-5h5"/></svg>
                      </button>
                   </div>
                </div>
              </div>
            `;
        }
    }).join('');
    
    setTimeout(() => {
       messagesContainer.scrollTop = messagesContainer.scrollHeight;
    }, 10);
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
    
    setState(prev => ({
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
        setState(prev => ({
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
      } catch {}
    };

    while (true) {
      const { done, value } = await reader.read();
      if (done) {
         current[current.length - 1].done = true;
         drawMessages(current);
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
    root.__cleanup = null;
  };
}
