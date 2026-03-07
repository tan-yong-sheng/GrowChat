import { setState, state, subscribe } from '../store.js';
import { apiFetch } from '../api.js';
import { createChatRow } from './chat-row.js';

export async function createFolderSidebar(chatHandlers) {
  let folders = [];
  try {
    const res = await apiFetch('/api/folders');
    if (res.ok) {
      const data = await res.json();
      folders = data.folders || [];
    }
  } catch (err) {
    console.error('Failed to fetch folders:', err);
  }

  const container = document.createElement('div');
  container.className = 'folder-list-container mb-4';
  
  const updateUI = () => {
    if (folders.length === 0) {
        container.innerHTML = '';
        return;
    }

    container.innerHTML = `
      <div class="folder-list px-3 py-2">
        <h3 class="folder-header text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2 px-1">Folders</h3>
        <div class="folder-items space-y-1">
          ${folders.map(folder => `
            <div class="folder-item" data-folder-id="${folder.id}">
              <button class="folder-toggle w-full flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-800 transition-colors text-left text-sm font-medium text-gray-700 dark:text-gray-300">
                <span class="folder-arrow transition-transform duration-200 ${state.expandedFolders?.[folder.id] ? 'rotate-90' : ''}">
                  <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="m9 18 6-6-6-6"/></svg>
                </span>
                <span class="folder-icon text-lg">${folder.icon || '📁'}</span>
                <span class="folder-name flex-1 truncate">${folder.name}</span>
                <span class="folder-count text-xs text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-gray-700 px-1.5 py-0.5 rounded-full">${folder.chatCount || 0}</span>
              </button>
              <div class="folder-chats hidden ml-4 mt-1 border-l-2 border-gray-200 dark:border-gray-700 pl-1 space-y-0.5" 
                   style="${state.expandedFolders?.[folder.id] ? 'display: block;' : ''}">
              </div>
            </div>
          `).join('')}
        </div>
      </div>
    `;

    container.querySelectorAll('.folder-item').forEach(item => {
      const folderId = item.dataset.folderId;
      const toggle = item.querySelector('.folder-toggle');
      const chatsContainer = item.querySelector('.folder-chats');
      
      toggle.addEventListener('click', () => {
        const isExpanded = !chatsContainer.classList.contains('hidden');
        if (isExpanded) {
          chatsContainer.classList.add('hidden');
          chatsContainer.style.display = 'none';
          toggle.querySelector('.folder-arrow').classList.remove('rotate-90');
        } else {
          chatsContainer.classList.remove('hidden');
          chatsContainer.style.display = 'block';
          toggle.querySelector('.folder-arrow').classList.add('rotate-90');
          
          // Render chats in folder if expanded
          renderFolderChats(folderId, chatsContainer);
        }
        
        // Save state
        const expandedFolders = { ...(state.expandedFolders || {}) };
        expandedFolders[folderId] = !isExpanded;
        setState({ expandedFolders });
      });

      if (state.expandedFolders?.[folderId]) {
          renderFolderChats(folderId, chatsContainer);
      }
    });
  };

  function renderFolderChats(folderId, chatsContainer) {
    const folderChats = state.chats.filter(c => c.folder_id === folderId);
    chatsContainer.innerHTML = '';
    
    if (folderChats.length === 0) {
        chatsContainer.innerHTML = '<div class="px-3 py-1 text-xs text-gray-500 italic">No chats</div>';
        return;
    }

    folderChats.forEach(chat => {
      const handlers = typeof chatHandlers === 'function' ? chatHandlers(chat) : chatHandlers;
      const model = (state.models || []).find(m => m.id === chat.model);
      const chatWithModelName = { ...chat, modelName: model?.name || chat.model || 'Default' };
      const row = createChatRow(chatWithModelName, handlers);
      if (chat.id === state.activeChatId) {
        row.classList.add('active');
      }
      chatsContainer.appendChild(row);
    });
  }

  updateUI();
  return container;
}
