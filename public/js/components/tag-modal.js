import { setState, state } from '../store.js';
import { apiFetch } from '../api.js';
import { escapeHtml } from '../utils.js';

export async function showTagModal(chatId, currentTags) {
  let allTags = [];
  try {
    const res = await apiFetch('/api/tags');
    if (res.ok) {
      const data = await res.json();
      allTags = data.tags || [];
    }
  } catch (err) {
    console.error('Failed to fetch user tags:', err);
  }

  const tagSet = new Set(currentTags || []);

  const modal = document.createElement('div');
  modal.className = 'modal-overlay fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[200]';
  modal.innerHTML = `
    <div class="modal-content bg-white dark:bg-gray-800 rounded-lg shadow-xl p-6 max-w-md w-full mx-4">
      <div class="modal-header flex items-center justify-between mb-4">
        <h3 class="text-lg font-semibold text-gray-900 dark:text-white">Manage tags</h3>
        <button class="modal-close text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 text-xl font-bold">✕</button>
      </div>

      <div class="tag-list space-y-2 max-h-64 overflow-y-auto mb-4 p-1">
        ${allTags.map(tag => `
          <label class="tag-checkbox flex items-center gap-2 p-2 rounded hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer transition-colors">
            <input type="checkbox" data-tag="${escapeHtml(tag.name)}"
              ${tagSet.has(tag.name) ? 'checked' : ''} class="rounded border-gray-300 dark:border-gray-600">
            <span class="text-gray-700 dark:text-gray-300">${escapeHtml(tag.name)}</span>
            <span class="tag-count text-xs text-gray-500 dark:text-gray-400 ml-auto">(${tag.count || 0})</span>
          </label>
        `).join('') || '<p class="text-sm text-gray-500 italic">No existing tags.</p>'}
      </div>

      <div class="tag-create flex gap-2 border-t dark:border-gray-700 pt-4">
        <input type="text" class="new-tag-input flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded dark:bg-gray-700 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm" placeholder="Create new tag...">
        <button class="new-tag-btn px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 transition-colors text-sm font-medium">Add</button>
      </div>
    </div>
  `;

  return new Promise((resolve) => {
    const closeModal = () => {
      modal.remove();
      resolve(Array.from(tagSet));
    };

    // Handle existing tags
    modal.addEventListener('change', async (e) => {
      if (e.target.type === 'checkbox') {
        const tag = e.target.dataset.tag;
        try {
          if (e.target.checked) {
            await apiFetch(`/api/chats/${chatId}/tags`, {
              method: 'POST',
              body: JSON.stringify({ tag })
            });
            tagSet.add(tag);
          } else {
            await apiFetch(`/api/chats/${chatId}/tags/${encodeURIComponent(tag)}`, {
              method: 'DELETE'
            });
            tagSet.delete(tag);
          }
          
          // Optimistic update of state.chats for the specific chat
          const updatedChats = state.chats.map(c => 
            c.id === chatId ? { ...c, tags: Array.from(tagSet) } : c
          );
          setState({ chats: updatedChats });
        } catch (err) {
          console.error('Failed to update tags:', err);
          // Revert checkbox if failed
          e.target.checked = !e.target.checked;
        }
      }
    });

    // Handle new tag creation
    const input = modal.querySelector('.new-tag-input');
    const btn = modal.querySelector('.new-tag-btn');
    
    const handleAddTag = async () => {
      const newTag = input.value.trim();
      if (newTag && !tagSet.has(newTag)) {
        try {
          await apiFetch(`/api/chats/${chatId}/tags`, {
            method: 'POST',
            body: JSON.stringify({ tag: newTag })
          });
          tagSet.add(newTag);
          
          // Optimistic update
          const updatedChats = state.chats.map(c => 
            c.id === chatId ? { ...c, tags: Array.from(tagSet) } : c
          );
          setState({ chats: updatedChats });
          
          input.value = '';
          // Update UI: Check if the tag already exists in the list
          const existingCheckbox = modal.querySelector(`input[data-tag="${escapeHtml(newTag)}"]`);
          if (existingCheckbox) {
            existingCheckbox.checked = true;
          } else {
            const tagList = modal.querySelector('.tag-list');
            if (tagList.querySelector('p.italic')) {
                tagList.innerHTML = '';
            }
            const newLabel = document.createElement('label');
            newLabel.className = 'tag-checkbox flex items-center gap-2 p-2 rounded hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer transition-colors';
            newLabel.innerHTML = `
                <input type="checkbox" data-tag="${escapeHtml(newTag)}" checked class="rounded border-gray-300 dark:border-gray-600">
                <span class="text-gray-700 dark:text-gray-300">${escapeHtml(newTag)}</span>
                <span class="tag-count text-xs text-gray-500 dark:text-gray-400 ml-auto">(1)</span>
            `;
            tagList.appendChild(newLabel);
          }
        } catch (err) {
          console.error('Failed to create new tag:', err);
        }
      }
    };

    btn.addEventListener('click', handleAddTag);
    input.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') handleAddTag();
    });

    // Close button
    modal.addEventListener('click', (e) => {
        if (e.target.classList.contains('modal-overlay') || e.target.closest('.modal-close')) {
            closeModal();
        }
    });

    document.body.appendChild(modal);
  });
}
