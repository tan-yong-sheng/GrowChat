import { state, setState, subscribe } from '../store.js';
import { fetchPromptByCommand, fetchPrompts } from '../api.js';

export function renderMessageInput(container, onSend, onOpenFiles = () => {}) {
  let isRendered = false;
  let unsubscribe;
  let promptsCache = [];

  function init() {
    container.innerHTML = `
      <div id="pending-queue" class="hidden mb-2 space-y-1"></div>
      <div id="attachment-list" class="hidden mb-2 flex flex-wrap gap-2"></div>
      <div id="attachment-hint" class="hidden mb-2 text-xs font-medium text-amber-700"></div>
      <form id="composer" class="relative bg-[#f4f4f4] rounded-[24px] p-1.5 flex items-end transition focus-within:bg-white focus-within:ring-1 focus-within:ring-gray-300 focus-within:shadow-[0_0_15px_rgba(0,0,0,0.05)] border border-transparent focus-within:border-gray-200">
         <div class="relative flex-shrink-0 ml-1">
           <button type="button" id="open-files-btn" class="p-2 text-gray-500 hover:text-black hover:bg-gray-200 rounded-full transition mb-0.5" title="Attach file" aria-label="Attach file" aria-expanded="false">
             <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v14M5 12h14"/></svg>
           </button>
           <div id="attach-menu" class="hidden absolute bottom-full left-0 mb-2 w-48 rounded-2xl border border-gray-100 bg-white shadow-xl p-1 z-30">
             <button type="button" id="attach-upload" class="w-full text-left px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 rounded-xl flex items-center gap-2">
               <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
               Upload files & images
             </button>
           </div>
           <input type="file" id="attachment-input" class="hidden" multiple accept="image/*,application/pdf,text/*" />
         </div>
         
         <textarea id="message-input" rows="1" placeholder="Message GrowChat" class="flex-grow bg-transparent border-none focus:ring-0 text-[16px] px-2 py-2.5 max-h-[200px] resize-none overflow-y-auto no-scrollbar text-gray-800" style="height: 44px;" aria-label="Message text"></textarea>
         
         <div class="flex-shrink-0 flex items-center mb-1 mr-1 gap-1 relative">
           <div id="loading-spinner" class="hidden absolute inset-0 bg-[#f4f4f4] items-center justify-center rounded-full transition-all z-10" aria-live="polite">
              <div class="w-4 h-4 border-2 border-gray-400 border-t-black rounded-full animate-spin"></div>
           </div>
           
           <button type="button" id="stop-btn" class="hidden p-2 text-red-500 hover:bg-red-50 rounded-full transition" title="Stop generating" aria-label="Stop generating">
             <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="14" height="14" x="5" y="5" rx="2" ry="2"/></svg>
           </button>

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
    const stopBtn = container.querySelector('#stop-btn');
    const micBtn = container.querySelector('#mic-btn');
    const loadingSpinner = container.querySelector('#loading-spinner');
    const openFilesBtn = container.querySelector('#open-files-btn');
    const attachMenu = container.querySelector('#attach-menu');
    const attachUploadBtn = container.querySelector('#attach-upload');
    const attachmentInput = container.querySelector('#attachment-input');
    const attachmentList = container.querySelector('#attachment-list');
    const attachmentHint = container.querySelector('#attachment-hint');
    const promptPicker = container.querySelector('#prompt-picker');
    const pendingQueueEl = container.querySelector('#pending-queue');
    let promptIndex = 0;
    let promptQuery = '';
    let promptOptions = [];
    
    let isSubmitting = false;
    let abortFn = null;
    let canRequestCancel = false;
    let latestRunningMessageId = null;
    const getGlobalAbort = () => {
      try {
        return window.__growchatAbortStream || null;
      } catch {
        return null;
      }
    };
    let lastActiveChatId = state.activeChatId;
    let isStreamBlocked = false;
    let queueNextId = 1;
    let pendingQueue = [];

    function findRunningMessageId(currentState = state) {
      const chatId = currentState.activeChatId;
      if (!chatId) return null;
      const messages = currentState.messagesByChat?.[chatId] || [];
      for (let i = messages.length - 1; i >= 0; i -= 1) {
        const msg = messages[i];
        const status = String(msg?.status || '');
        if (msg?.role === 'assistant' && (status === 'streaming' || status === 'tool_running')) {
          return msg.id;
        }
      }
      for (let i = messages.length - 1; i >= 0; i -= 1) {
        const msg = messages[i];
        if (msg?.role === 'assistant' && msg?.done === false) {
          return msg.id;
        }
      }
      return null;
    }

    function getCurrentAttachments(currentState = state) {
      const chatId = currentState.activeChatId;
      if (chatId) {
        return currentState.attachmentsByChat?.[chatId] || [];
      }
      return currentState.newChatAttachments || [];
    }

    function setCurrentAttachments(next) {
      const chatId = state.activeChatId;
      if (chatId) {
        setState({
          attachmentsByChat: {
            ...(state.attachmentsByChat || {}),
            [chatId]: next,
          },
        });
        return;
      }
      setState({ newChatAttachments: next });
    }

    function renderAttachments(list) {
      if (!attachmentList) return;
      if (!list?.length) {
        attachmentList.classList.add('hidden');
        attachmentList.innerHTML = '';
        return;
      }
      attachmentList.classList.remove('hidden');
      attachmentList.innerHTML = list.map((file) => {
        const label = String(file?.filename || file?.name || 'Attachment');
        const id = String(file?.id || '');
        return `
          <div class="flex items-center gap-2 px-3 py-1.5 rounded-full bg-gray-100 text-xs text-gray-700 border border-gray-200">
            <svg xmlns="http://www.w3.org/2000/svg" class="w-3.5 h-3.5 text-gray-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/>
              <polyline points="14 2 14 8 20 8"/>
            </svg>
            <span class="max-w-[160px] truncate">${label.replaceAll('<', '&lt;').replaceAll('>', '&gt;')}</span>
            <button type="button" data-attachment-remove="${id}" class="text-gray-400 hover:text-gray-700 transition">✕</button>
          </div>
        `;
      }).join('');

      attachmentList.querySelectorAll('[data-attachment-remove]').forEach((btn) => {
        btn.addEventListener('click', () => {
          const id = btn.getAttribute('data-attachment-remove');
          if (!id) return;
          const next = getCurrentAttachments().filter((item) => String(item?.id || '') !== String(id));
          setCurrentAttachments(next);
        });
      });
    }

    const TEXT_LIKE_MIME_TYPES = new Set([
      'application/csv',
      'application/x-iif',
      'application/json',
      'application/json5',
      'application/x-json5',
      'application/x-ndjson',
      'application/ndjson',
      'application/xml',
      'application/x-xml',
      'application/yaml',
      'application/x-yaml',
      'application/javascript',
      'application/x-javascript',
      'application/typescript',
    ]);

    const isTextLikeContentType = (type) => {
      const mediaType = String(type || '').toLowerCase();
      if (!mediaType) return false;
      if (mediaType.startsWith('text/')) return true;
      return TEXT_LIKE_MIME_TYPES.has(mediaType);
    };

    const TEXT_LIKE_ACCEPT_TYPES = [
      'text/*',
      'application/csv',
      'application/x-iif',
      'application/json',
      'application/json5',
      'application/x-json5',
      'application/x-ndjson',
      'application/ndjson',
      'application/xml',
      'application/x-xml',
      'application/yaml',
      'application/x-yaml',
      'application/javascript',
      'application/x-javascript',
      'application/typescript',
    ];

    const getActiveModelCaps = (currentState) => {
      const modelId = currentState.activeModelId;
      if (!modelId) return null;
      const model = (currentState.models || []).find((item) => String(item.id) === String(modelId));
      const caps = model?.attachments;
      if (!caps || typeof caps !== 'object') return { text: true };
      if (typeof caps.text !== 'boolean') return { ...caps, text: true };
      return caps;
    };

    const getAllowedKinds = (currentState) => {
      const caps = getActiveModelCaps(currentState);
      const allowed = [];
      if (caps?.image === true) allowed.push('image');
      if (caps?.pdf === true) allowed.push('pdf');
      if (caps?.text === true) allowed.push('text-local');
      return allowed;
    };

    const getAllowedNonLocalKinds = (currentState) => {
      const caps = getActiveModelCaps(currentState);
      const allowed = [];
      if (caps?.image === true) allowed.push('image');
      if (caps?.pdf === true) allowed.push('pdf');
      return allowed;
    };

    const updateAttachmentControls = (currentState) => {
      if (!openFilesBtn || !attachUploadBtn || !attachmentInput) return;
      const allowedKinds = getAllowedKinds(currentState);
      const allowedNonLocalKinds = getAllowedNonLocalKinds(currentState);
      const hasAny = allowedKinds.length > 0;
      const accepts = [];
      if (allowedKinds.includes('image')) accepts.push('image/*');
      if (allowedKinds.includes('pdf')) accepts.push('application/pdf');
      if (allowedKinds.includes('text-local')) {
        accepts.push(...TEXT_LIKE_ACCEPT_TYPES);
      }
      attachmentInput.setAttribute('accept', accepts.join(','));

      openFilesBtn.disabled = !hasAny;
      attachUploadBtn.disabled = !hasAny;
      openFilesBtn.classList.toggle('opacity-40', !hasAny);
      openFilesBtn.classList.toggle('cursor-not-allowed', !hasAny);
      attachUploadBtn.classList.toggle('opacity-40', !hasAny);
      attachUploadBtn.classList.toggle('cursor-not-allowed', !hasAny);

      if (attachmentHint) {
        if (!hasAny) {
          attachmentHint.textContent = 'Attachments are disabled for this model.';
          attachmentHint.classList.remove('hidden');
        } else {
          attachmentHint.classList.add('hidden');
        }
      }
    };

    function renderPendingQueue() {
      if (!pendingQueue.length) {
        pendingQueueEl.innerHTML = '';
        pendingQueueEl.classList.add('hidden');
        return;
      }

      pendingQueueEl.classList.remove('hidden');
      pendingQueueEl.innerHTML = pendingQueue.map((item, idx) => `
        <div class="flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm">
          <span class="text-[11px] text-gray-400 font-semibold">#${idx + 1}</span>
          <span class="flex-1 truncate text-gray-700">${item.text.replaceAll('<', '&lt;').replaceAll('>', '&gt;')}</span>
          <button type="button" data-q-send-now="${item.id}" class="p-1 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded" title="Send next">
            ↟
          </button>
          <button type="button" data-q-up="${item.id}" class="p-1 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded ${idx === 0 ? 'opacity-30 pointer-events-none' : ''}" title="Move up">
            ↑
          </button>
          <button type="button" data-q-down="${item.id}" class="p-1 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded ${idx === pendingQueue.length - 1 ? 'opacity-30 pointer-events-none' : ''}" title="Move down">
            ↓
          </button>
          <button type="button" data-q-edit="${item.id}" class="p-1 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded" title="Edit">
            ✎
          </button>
          <button type="button" data-q-delete="${item.id}" class="p-1 text-red-500 hover:text-red-600 hover:bg-red-50 rounded" title="Delete">
            ✕
          </button>
        </div>
      `).join('');

      pendingQueueEl.querySelectorAll('[data-q-send-now]').forEach((btn) => {
        btn.addEventListener('click', () => {
          const id = Number(btn.getAttribute('data-q-send-now'));
          const idx = pendingQueue.findIndex((q) => q.id === id);
          if (idx <= 0) return;
          const [item] = pendingQueue.splice(idx, 1);
          pendingQueue.unshift(item);
          renderPendingQueue();
        });
      });

      pendingQueueEl.querySelectorAll('[data-q-up]').forEach((btn) => {
        btn.addEventListener('click', () => {
          const id = Number(btn.getAttribute('data-q-up'));
          const idx = pendingQueue.findIndex((q) => q.id === id);
          if (idx <= 0) return;
          [pendingQueue[idx - 1], pendingQueue[idx]] = [pendingQueue[idx], pendingQueue[idx - 1]];
          renderPendingQueue();
        });
      });

      pendingQueueEl.querySelectorAll('[data-q-down]').forEach((btn) => {
        btn.addEventListener('click', () => {
          const id = Number(btn.getAttribute('data-q-down'));
          const idx = pendingQueue.findIndex((q) => q.id === id);
          if (idx < 0 || idx >= pendingQueue.length - 1) return;
          [pendingQueue[idx], pendingQueue[idx + 1]] = [pendingQueue[idx + 1], pendingQueue[idx]];
          renderPendingQueue();
        });
      });

      pendingQueueEl.querySelectorAll('[data-q-edit]').forEach((btn) => {
        btn.addEventListener('click', () => {
          const id = Number(btn.getAttribute('data-q-edit'));
          const idx = pendingQueue.findIndex((q) => q.id === id);
          if (idx < 0) return;
          const next = window.prompt('Edit queued message:', pendingQueue[idx].text);
          if (next === null) return;
          const trimmed = String(next).trim();
          if (!trimmed) return;
          pendingQueue[idx].text = trimmed;
          renderPendingQueue();
        });
      });

      pendingQueueEl.querySelectorAll('[data-q-delete]').forEach((btn) => {
        btn.addEventListener('click', () => {
          const id = Number(btn.getAttribute('data-q-delete'));
          pendingQueue = pendingQueue.filter((q) => q.id !== id);
          renderPendingQueue();
        });
      });
    }

    function toggleSendMicBtn() {
       // Use global streaming state as single source of truth to avoid race conditions
       // between isSubmitting (local) and isStreamBlocked (state-derived).
       // Check if streaming is actively happening (not just if we're submitting locally).
       const isActivelyStreaming = isStreamBlocked;

       if (isActivelyStreaming) {
          micBtn.classList.add('hidden');
          sendBtn.classList.add('hidden');
          stopBtn.classList.remove('hidden');
          const fallbackAbort = getGlobalAbort();
          if (abortFn || fallbackAbort || canRequestCancel) {
            stopBtn.disabled = false;
            stopBtn.classList.remove('opacity-50', 'cursor-not-allowed');
          } else {
            stopBtn.disabled = true;
            stopBtn.classList.add('opacity-50', 'cursor-not-allowed');
          }
          loadingSpinner.classList.add('hidden');
          loadingSpinner.style.display = 'none';
          return;
       }

       stopBtn.classList.add('hidden');
       stopBtn.disabled = false;
       stopBtn.classList.remove('opacity-50', 'cursor-not-allowed');
       loadingSpinner.classList.add('hidden');
       loadingSpinner.style.display = 'none';

       // Show send button if input has text, otherwise show mic button
       if (input.value.trim().length > 0) {
          micBtn.classList.add('hidden');
          sendBtn.classList.remove('hidden');
       } else {
          micBtn.classList.remove('hidden');
          sendBtn.classList.add('hidden');
       }
    }

    stopBtn.onclick = async (e) => {
      e.preventDefault();
      const fallbackAbort = getGlobalAbort();
      const handler = abortFn || fallbackAbort;
      if (handler) {
        handler();
        abortFn = null;
      }
      try {
        const cancelFn = window.__growchatRequestCancel;
        const chatId = state.activeChatId;
        const messageId = latestRunningMessageId || findRunningMessageId(state);
        if (typeof cancelFn === 'function' && chatId && messageId) {
          await cancelFn(chatId, messageId);
        }
      } catch {}
      finishSubmission();
    };

    function startQueuedSend() {
      if (isSubmitting || isStreamBlocked || pendingQueue.length === 0) return false;
      const next = pendingQueue.shift();
      renderPendingQueue();
      if (!next?.text) return false;
      isSubmitting = true;
      toggleSendMicBtn();
      onSend(next.text, {
        onAbortable: (fn) => {
          abortFn = fn;
          toggleSendMicBtn();
        },
        onFinished: () => {
          finishSubmission();
        }
      });
      return true;
    }

    function finishSubmission() {
      isSubmitting = false;
      abortFn = null;
      toggleSendMicBtn();
      if (pendingQueue.length > 0) {
        startQueuedSend();
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
          if (input.value.trim()) {
             composer.dispatchEvent(new Event('submit'));
          }
      }
    });

    composer.addEventListener('submit', (e) => {
      e.preventDefault();
      
      const text = input.value.trim();
      if (!text) return;

      if (isSubmitting || isStreamBlocked) {
        pendingQueue.push({ id: queueNextId++, text });
        renderPendingQueue();
        input.value = '';
        input.style.height = '44px';
        input.dispatchEvent(new Event('input'));
        input.focus();
        return;
      }

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
      input.dispatchEvent(new Event('input'));
      input.focus();

      isSubmitting = true;
      toggleSendMicBtn();
      
      // Fire callback with hooks
      onSend(text, {
        onAbortable: (fn) => {
          abortFn = fn;
          toggleSendMicBtn();
        },
        onFinished: () => {
          finishSubmission();
        }
      });
    });

    function closeAttachMenu() {
      if (!attachMenu || !openFilesBtn) return;
      attachMenu.classList.add('hidden');
      openFilesBtn.setAttribute('aria-expanded', 'false');
    }

    openFilesBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (openFilesBtn.disabled) return;
      if (!attachMenu) return;
      const isHidden = attachMenu.classList.contains('hidden');
      if (isHidden) {
        attachMenu.classList.remove('hidden');
        openFilesBtn.setAttribute('aria-expanded', 'true');
      } else {
        closeAttachMenu();
      }
    });

    attachUploadBtn?.addEventListener('click', () => {
      if (attachUploadBtn?.disabled) return;
      closeAttachMenu();
      attachmentInput?.click();
    });

    attachmentInput?.addEventListener('change', (e) => {
      const files = Array.from(e.target.files || []);
      if (files.length) {
        window.dispatchEvent(new CustomEvent('growchat:files-selected', { detail: { files } }));
      }
      e.target.value = '';
    });

    document.addEventListener('click', (e) => {
      if (!attachMenu || !openFilesBtn) return;
      if (attachMenu.classList.contains('hidden')) return;
      if (attachMenu.contains(e.target) || openFilesBtn.contains(e.target)) return;
      closeAttachMenu();
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
      // Update placeholder and footer based on active model
      const model = currentState.models.find(m => m.id === currentState.activeModelId);
      const modelName = model?.name || 'GrowChat';
      input.placeholder = `Message ${modelName}`;
      const footer = container.querySelector('.mt-2.text-xs.text-gray-400');
      if (footer) {
        footer.textContent = `${modelName} can make mistakes. Check important info.`;
      }

      const chatChanged = currentState.activeChatId !== lastActiveChatId;
      if (chatChanged && pendingQueue.length > 0) {
        pendingQueue = [];
        renderPendingQueue();
      }

      const nextStreamBlocked = Boolean(
        currentState.ui?.streaming &&
        currentState.ui?.streamingChatId &&
        String(currentState.ui.streamingChatId) === String(currentState.activeChatId || '')
      );
      latestRunningMessageId = findRunningMessageId(currentState);
      canRequestCancel = Boolean(latestRunningMessageId && typeof window.__growchatRequestCancel === 'function');
      if (nextStreamBlocked !== isStreamBlocked) {
        isStreamBlocked = nextStreamBlocked;

        // SAFETY GUARD: If streaming ended (nextStreamBlocked = false) but isSubmitting is still true,
        // auto-clear it to prevent the stop button from lingering in the UI after the stream completes.
        // This handles the race condition where finishSubmission() hasn't fired yet.
        if (!nextStreamBlocked && isSubmitting) {
          finishSubmission();
        } else {
          toggleSendMicBtn();
        }

        if (!isStreamBlocked && pendingQueue.length > 0 && !isSubmitting) {
          startQueuedSend();
        }
      }
      
      // Always restore on chat change; otherwise restore only when input is not focused.
      if (!isSubmitting && (chatChanged || (input !== document.activeElement && !input.value))) {
        const draft = currentState.activeChatId
          ? (currentState.drafts[currentState.activeChatId] || '')
          : (currentState.newChatDraft || '');
        if (input.value !== draft) {
           input.value = draft;
           input.dispatchEvent(new Event('input'));
        }
      }
      lastActiveChatId = currentState.activeChatId;

      const attachments = getCurrentAttachments(currentState);
      renderAttachments(attachments);

      updateAttachmentControls(currentState);
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
