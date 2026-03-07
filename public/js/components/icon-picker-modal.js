import { setState, state } from '../store.js';
import { apiFetch } from '../api.js';

export async function showIconPickerModal(chatId, currentIcon) {
  const emojis = [
    '🚀', '💡', '📝', '📊', '🎯', '🔧', '⚡', '🌟',
    '💬', '📞', '📧', '💼', '📚', '🎨', '🎬', '🎵',
    '🏆', '⭐', '🎁', '🔒', '🔓', '💎', '🎭', '🚗'
  ];

  const modal = document.createElement('div');
  modal.className = 'modal-overlay fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[200]';
  modal.innerHTML = `
    <div class="modal-content bg-white dark:bg-gray-800 rounded-lg shadow-xl p-6 max-w-md w-full mx-4">
      <div class="modal-header flex items-center justify-between mb-4">
        <h3 class="text-lg font-semibold text-gray-900 dark:text-white">Choose an icon</h3>
        <button class="modal-close text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 text-xl font-bold">✕</button>
      </div>
      <div class="emoji-grid grid grid-cols-6 gap-2">
        ${emojis.map(e => `
          <button class="emoji-btn text-3xl p-2 rounded hover:bg-gray-100 dark:hover:bg-gray-700 transition-all cursor-pointer hover:scale-110" data-emoji="${e}" title="${e}">
            ${e}
          </button>
        `).join('')}
      </div>
    </div>
  `;

  return new Promise((resolve) => {
    const closeModal = (result = null) => {
      modal.remove();
      resolve(result);
    };

    modal.addEventListener('click', async (e) => {
      const emojiBtn = e.target.closest('.emoji-btn');
      if (emojiBtn) {
        const emoji = emojiBtn.dataset.emoji;
        try {
          // Note: Backend endpoint might not be ready, but we follow the plan
          await apiFetch(`/api/chats/${chatId}/icon`, {
            method: 'PATCH',
            body: JSON.stringify({ icon: emoji })
          });
          
          // Optimistic update
          const updatedChats = state.chats.map(c => 
            c.id === chatId ? { ...c, icon: emoji } : c
          );
          setState({ chats: updatedChats });
          closeModal(emoji);
        } catch (err) {
          console.error('Failed to set chat icon:', err);
          closeModal(null);
        }
      }
      
      if (e.target.classList.contains('modal-overlay') || e.target.closest('.modal-close')) {
        closeModal(null);
      }
    });

    document.body.appendChild(modal);
  });
}
