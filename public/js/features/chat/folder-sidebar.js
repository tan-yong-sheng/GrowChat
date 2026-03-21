import { setState, state } from '../../shared/store.js';
import { createChatRow } from '../../shared/components/chat-row.js';
import { renderFolderListMarkup } from './folder-sidebar-helpers.js';

export async function createFolderSidebar(chatHandlers) {
  const folders = [];

  const container = document.createElement('div');
  container.className = 'folder-list-container mb-4';
  
  const updateUI = () => {
    if (folders.length === 0) {
        container.innerHTML = '';
        return;
    }

    container.innerHTML = renderFolderListMarkup(folders, state.expandedFolders || {});

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

