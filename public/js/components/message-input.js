import { state, setState, subscribe } from '../store.js';
import { fetchPromptByCommand, fetchPrompts } from '../api.js';

export function renderMessageInput(container, onSend, onOpenFiles = () => {}) {
  let isRendered = false;
  let unsubscribe;
  let promptsCache = [];

  function init() {
    container.innerHTML = `
      <form id="composer" class="relative bg-[#f4f4f4] rounded-[24px] p-1.5 flex items-end transition focus-within:bg-white focus-within:ring-1 focus-within:ring-gray-300 focus-within:shadow-[0_0_15px_rgba(0,0,0,0.05)] border border-transparent focus-within:border-gray-200">
         <button type="button" id="open-files-btn" class="flex-shrink-0 p-2 text-gray-500 hover:text-black hover:bg-gray-200 rounded-full transition mb-0.5 ml-1" title="Attach file" aria-label="Attach file">
           <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v14M5 12h14"/></svg>
         </button>
         
         <textarea id="message-input" rows="1" placeholder="Message GrowChat" class="flex-grow bg-transparent border-none focus:ring-0 text-[16px] px-2 py-2.5 max-h-[200px] resize-none overflow-y-auto no-scrollbar text-gray-800" style="height: 44px;" aria-label="Message text"></textarea>
         
         <div class="flex-shrink-0 flex items-center mb-1 mr-1 gap-1 relative">
           <div id="loading-spinner" class="hidden absolute inset-0 bg-[#f4f4f4] items-center justify-center rounded-full transition-all z-10" aria-live="polite">
              <div class="w-4 h-4 border-2 border-gray-400 border-t-black rounded-full animate-spin"></div>
           </div>
           
           <button type="button" id="mic-btn" class="p-2 text-gray-500 hover:text-black hover:bg-gray-200 rounded-full transition" title="Voice input" aria-label="Voice input">
             <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="22"/></svg>
           </button>
           <button id="send-btn" class="hidden p-2 bg-black text-white rounded-full hover:bg-gray-800 transition disabled:opacity-50" title="Send message" aria-label="Send message">
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m5 12 7-7 7 7"/><path d="M12 19V5"/></svg>
           </button>
         </div>
      </form>
      <div id="prompt-picker" class="hidden absolute left-4 right-4 bottom-[94px] rounded-xl border border-gray-200 bg-white shadow-xl overflow-hidden z-20"></div>
      <div class="mt-2 text-xs text-gray-400 text-center font-medium">GrowChat can make mistakes. Check important info.</div>
    `;
    
    isRendered = true;
    wire();
  }

  function wire() {
    const composer = container.querySelector('#composer');
    const input = container.querySelector('#message-input');
    const sendBtn = container.querySelector('#send-btn');
    const micBtn = container.querySelector('#mic-btn');
    const loadingSpinner = container.querySelector('#loading-spinner');
    const openFilesBtn = container.querySelector('#open-files-btn');
    const promptPicker = container.querySelector('#prompt-picker');
    let promptIndex = 0;
    let promptQuery = '';
    let promptOptions = [];
    
    let isSubmitting = false;

    function toggleSendMicBtn() {
       if (isSubmitting) {
          micBtn.classList.add('hidden');
          sendBtn.classList.add('hidden');
          loadingSpinner.classList.remove('hidden');
          loadingSpinner.style.display = 'flex';
          return;
       }
       loadingSpinner.classList.add('hidden');
       loadingSpinner.style.display = 'none';

       if (input.value.trim().length > 0) {
          micBtn.classList.add('hidden');
          sendBtn.classList.remove('hidden');
       } else {
          micBtn.classList.remove('hidden');
          sendBtn.classList.add('hidden');
       }
    }

    function extractVariables(text) {
      const matches = String(text).match(/\{\{([a-zA-Z0-9_ -]+)\}\}/g) || [];
      return [...new Set(matches.map((m) => m.slice(2, -2).trim()).filter(Boolean))];
    }

    function applyVariables(text) {
      let output = String(text || '');
      const vars = extractVariables(output);
      vars.forEach((v) => {
        const value = window.prompt(`Value for "${v}"`, '') ?? '';
        output = output.replaceAll(`{{${v}}}`, value);
      });
      return output;
    }

    async function ensurePromptsLoaded() {
      if (promptsCache.length > 0) return;
      try {
        const data = await fetchPrompts();
        promptsCache = data.prompts || [];
      } catch {
        promptsCache = [];
      }
    }

    function hidePromptPicker() {
      promptPicker.classList.add('hidden');
      promptOptions = [];
      promptQuery = '';
      promptIndex = 0;
    }

    function renderPromptPicker() {
      if (!promptOptions.length) {
        promptPicker.innerHTML = '<div class="px-3 py-2 text-xs text-gray-500">No matching prompts</div>';
        promptPicker.classList.remove('hidden');
        return;
      }
      promptPicker.innerHTML = promptOptions.slice(0, 8).map((item, idx) => `
        <button data-prompt-idx="${idx}" class="w-full text-left px-3 py-2 border-b border-gray-100 last:border-b-0 ${idx === promptIndex ? 'bg-gray-100' : 'hover:bg-gray-50'}">
          <div class="text-sm font-medium text-gray-800">/${item.command || 'prompt'}</div>
          <div class="text-xs text-gray-500 truncate">${item.title || ''}</div>
        </button>
      `).join('');
      promptPicker.classList.remove('hidden');
      promptPicker.querySelectorAll('[data-prompt-idx]').forEach((btn) => {
        btn.addEventListener('click', () => {
          const idx = Number(btn.getAttribute('data-prompt-idx'));
          const selected = promptOptions[idx];
          if (!selected) return;
          const applied = applyVariables(selected.content || '');
          input.value = applied;
          input.dispatchEvent(new Event('input'));
          hidePromptPicker();
          input.focus();
        });
      });
    }

    input.addEventListener('input', async () => {
      input.style.height = 'auto';
      input.style.height = Math.min(input.scrollHeight, 200) + 'px';
      toggleSendMicBtn();
      
      // Save draft
      if (state.activeChatId) {
        const drafts = { ...state.drafts, [state.activeChatId]: input.value };
        setState({ drafts });
      } else {
        setState({ newChatDraft: input.value });
      }

      const value = input.value.trimStart();
      if (value.startsWith('/')) {
        await ensurePromptsLoaded();
        promptQuery = value.slice(1).trim().toLowerCase();
        promptOptions = promptsCache.filter((p) => {
          const cmd = String(p.command || '').toLowerCase();
          const title = String(p.title || '').toLowerCase();
          return cmd.includes(promptQuery) || title.includes(promptQuery);
        });
        promptIndex = 0;
        renderPromptPicker();
      } else {
        hidePromptPicker();
      }
    });

    input.addEventListener('keydown', async (e) => {
      if (!promptPicker.classList.contains('hidden')) {
        if (e.key === 'ArrowDown') {
          e.preventDefault();
          promptIndex = Math.min(promptIndex + 1, Math.max(promptOptions.length - 1, 0));
          renderPromptPicker();
          return;
        }
        if (e.key === 'ArrowUp') {
          e.preventDefault();
          promptIndex = Math.max(promptIndex - 1, 0);
          renderPromptPicker();
          return;
        }
        if (e.key === 'Enter' && promptOptions[promptIndex]) {
          e.preventDefault();
          const selected = promptOptions[promptIndex];
          let selectedPrompt = selected;
          if (selected?.command) {
            try {
              const fromApi = await fetchPromptByCommand(selected.command);
              selectedPrompt = fromApi.prompt || selected;
            } catch {
              selectedPrompt = selected;
            }
          }
          const applied = applyVariables(selectedPrompt.content || '');
          input.value = applied;
          input.dispatchEvent(new Event('input'));
          hidePromptPicker();
          return;
        }
        if (e.key === 'Escape') {
          e.preventDefault();
          hidePromptPicker();
          return;
        }
      }

      if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          if (input.value.trim() && !isSubmitting) {
             composer.dispatchEvent(new Event('submit'));
          }
      }
    });

    composer.addEventListener('submit', (e) => {
      e.preventDefault();
      if (isSubmitting) return;
      
      const text = input.value.trim();
      if (!text) return;
      
      isSubmitting = true;
      toggleSendMicBtn();
      
      // Clear draft
      if (state.activeChatId) {
         const drafts = { ...state.drafts };
         delete drafts[state.activeChatId];
         setState({ drafts });
      } else {
         setState({ newChatDraft: '' });
      }
      
      input.value = '';
      input.style.height = '44px';
      input.disabled = true;
      
      // Fire callback and allow resetting state once streaming begins
      onSend(text, () => {
         isSubmitting = false;
         input.disabled = false;
         toggleSendMicBtn();
         input.focus();
      });
    });

    openFilesBtn.addEventListener('click', () => {
      onOpenFiles();
    });

    input.addEventListener('blur', () => {
      setTimeout(() => {
        if (document.activeElement && promptPicker.contains(document.activeElement)) return;
        hidePromptPicker();
      }, 100);
    });
    
    container.setValue = (text) => {
        input.value = text;
        input.dispatchEvent(new Event('input'));
        input.focus();
    };
    
    container.submit = () => {
       composer.dispatchEvent(new Event('submit'));
    };

    unsubscribe = subscribe((currentState) => {
      // Restore draft when active chat changes
      if (input !== document.activeElement && !isSubmitting) {
        const draft = currentState.activeChatId
          ? (currentState.drafts[currentState.activeChatId] || '')
          : (currentState.newChatDraft || '');
        if (input.value !== draft) {
           input.value = draft;
           input.dispatchEvent(new Event('input'));
        }
      }
    });
  }

  init();
  return {
    destroy: () => {
      if (unsubscribe) unsubscribe();
    },
    setValue: (text) => container.setValue(text),
    submit: () => container.submit()
  };
}
