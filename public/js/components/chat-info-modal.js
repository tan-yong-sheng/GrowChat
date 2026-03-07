import { state } from '../store.js';
import { apiFetch } from '../api.js';
import { escapeHtml } from '../utils.js';

export async function showChatInfoModal(chatId) {
  let chatInfo = {};
  let stats = { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 };
  
  try {
    const [chatRes, statsRes] = await Promise.all([
      apiFetch(`/api/chats/${chatId}`),
      apiFetch(`/api/chats/${chatId}/tokens`)
    ]);
    
    if (chatRes.ok) {
      const data = await chatRes.json();
      chatInfo = data.chat || {};
    }
    
    if (statsRes.ok) {
      stats = await statsRes.json();
    }
  } catch (err) {
    console.error('Failed to fetch chat info/stats:', err);
  }

  const modal = document.createElement('div');
  modal.className = 'modal-overlay fixed inset-0 bg-black/50 flex items-center justify-center z-[200] p-4';
  modal.innerHTML = `
    <div class="modal-content bg-white dark:bg-gray-800 rounded-2xl shadow-2xl p-6 max-w-2xl w-full animate-in fade-in zoom-in duration-200">
      <div class="modal-header flex items-center justify-between mb-6">
        <h3 class="text-xl font-bold text-gray-900 dark:text-white">Chat Information</h3>
        <button class="modal-close p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-full transition-colors text-gray-500">✕</button>
      </div>

      <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div class="space-y-6">
          <section>
            <h4 class="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3">System Prompt</h4>
            <div class="p-3 bg-gray-50 dark:bg-gray-900 rounded-xl border border-gray-100 dark:border-gray-700 max-h-48 overflow-auto">
                <p class="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap">${escapeHtml(chatInfo.system_prompt || 'No system prompt set.')}</p>
            </div>
            <button class="edit-system-prompt mt-2 text-xs font-medium text-blue-600 hover:text-blue-700 dark:text-blue-400">Edit Prompt</button>
          </section>

          <section>
            <h4 class="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3">Settings</h4>
            <div class="space-y-2">
                <div class="flex justify-between text-sm">
                    <span class="text-gray-500">Model</span>
                    <span class="font-medium text-gray-900 dark:text-gray-100">${chatInfo.model || 'Default'}</span>
                </div>
                <div class="flex justify-between text-sm">
                    <span class="text-gray-500">Temperature</span>
                    <span class="font-medium text-gray-900 dark:text-gray-100">${chatInfo.temperature || 0.7}</span>
                </div>
                <div class="flex justify-between text-sm">
                    <span class="text-gray-500">Created</span>
                    <span class="font-medium text-gray-900 dark:text-gray-100">${new Date((Number(chatInfo.created_at) || Date.now()) * 1000).toLocaleDateString()}</span>
                </div>
            </div>
          </section>
        </div>

        <div class="space-y-6">
          <section>
            <h4 class="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3">Token Usage</h4>
            <div class="p-4 bg-blue-50 dark:bg-blue-900/30 rounded-2xl space-y-4">
                <div class="flex items-end justify-between">
                    <div>
                        <span class="block text-2xl font-bold text-blue-700 dark:text-blue-300">${stats.total_tokens.toLocaleString()}</span>
                        <span class="text-[10px] text-blue-600 dark:text-blue-400 font-semibold">TOTAL TOKENS</span>
                    </div>
                    <div class="text-right">
                        <span class="block text-xs font-mono text-blue-600 dark:text-blue-400">~$${((stats.total_tokens / 1000) * 0.03).toFixed(4)}</span>
                        <span class="text-[10px] text-blue-500 dark:text-blue-400">EST. COST</span>
                    </div>
                </div>
                <div class="w-full h-2 bg-blue-200 dark:bg-blue-800 rounded-full overflow-hidden flex">
                    <div class="h-full bg-blue-500" style="width: ${(stats.prompt_tokens / stats.total_tokens * 100) || 0}%"></div>
                    <div class="h-full bg-purple-500" style="width: ${(stats.completion_tokens / stats.total_tokens * 100) || 0}%"></div>
                </div>
                <div class="flex gap-4 text-[10px] font-bold">
                    <div class="flex items-center gap-1 text-blue-600 dark:text-blue-400">
                        <span class="w-2 h-2 rounded-full bg-blue-500"></span> PROMPT: ${stats.prompt_tokens.toLocaleString()}
                    </div>
                    <div class="flex items-center gap-1 text-purple-600 dark:text-purple-400">
                        <span class="w-2 h-2 rounded-full bg-purple-500"></span> COMPLETION: ${stats.completion_tokens.toLocaleString()}
                    </div>
                </div>
            </div>
          </section>

          <section>
            <h4 class="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3">Export</h4>
            <div class="grid grid-cols-2 gap-2">
                <button class="export-btn flex flex-col items-center justify-center p-3 rounded-xl border border-gray-100 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors" data-format="markdown">
                    <span class="text-lg">📄</span>
                    <span class="text-[10px] font-bold mt-1">MARKDOWN</span>
                </button>
                <button class="export-btn flex flex-col items-center justify-center p-3 rounded-xl border border-gray-100 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors" data-format="json">
                    <span class="text-lg">📦</span>
                    <span class="text-[10px] font-bold mt-1">JSON</span>
                </button>
            </div>
          </section>
        </div>
      </div>
    </div>
  `;

  return new Promise((resolve) => {
    const close = () => {
        modal.remove();
        resolve();
    };

    modal.addEventListener('click', (e) => {
        if (e.target.classList.contains('modal-overlay') || e.target.closest('.modal-close')) {
            close();
        }
        
        const exportBtn = e.target.closest('.export-btn');
        if (exportBtn) {
            const format = exportBtn.dataset.format;
            console.log(`Exporting chat ${chatId} as ${format}`);
            // Implement export logic
        }
    });
    
    modal.querySelector('.edit-system-prompt').addEventListener('click', async () => {
        const newPrompt = window.prompt('Enter system prompt:', chatInfo.system_prompt || '');
        if (newPrompt !== null) {
            try {
                await apiFetch(`/api/chats/${chatId}/system-prompt`, {
                    method: 'PUT',
                    body: JSON.stringify({ system_prompt: newPrompt })
                });
                close();
                showChatInfoModal(chatId); // Refresh
            } catch (err) {
                console.error('Failed to update system prompt:', err);
            }
        }
    });

    document.body.appendChild(modal);
  });
}
