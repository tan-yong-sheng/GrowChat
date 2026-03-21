import { state } from '../../shared/store.js';
import { createPromptPickerController } from './message-input-prompts.js';

export function createMessageInputController({
  container,
  setState,
  subscribe,
  onSend,
  fetchPrompts,
  fetchPromptByCommand,
  applyPromptVariables,
  filterPromptsByQuery,
  renderPromptPickerMarkup,
  getAttachmentAcceptTypes,
  moveQueueItem,
  promoteQueueItem,
  removeQueueItem,
  renderAttachmentListMarkup,
  renderPendingQueueMarkup,
} = {}) {
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

  const promptController = createPromptPickerController({
    input,
    promptPicker,
    fetchPrompts,
    fetchPromptByCommand,
    applyPromptVariables,
    filterPromptsByQuery,
    renderPromptPickerMarkup,
  });

  let isSubmitting = false;
  let abortFn = null;
  let canRequestCancel = false;
  let latestRunningMessageId = null;
  let lastActiveChatId = state.activeChatId;
  let isStreamBlocked = false;
  let queueNextId = 1;
  let pendingQueue = [];

  const getGlobalAbort = () => {
    try {
      return window.__growchatAbortStream || null;
    } catch {
      return null;
    }
  };

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
    if (chatId) return currentState.attachmentsByChat?.[chatId] || [];
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
    attachmentList.innerHTML = renderAttachmentListMarkup(list);
    attachmentList.querySelectorAll('[data-attachment-remove]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-attachment-remove');
        if (!id) return;
        const next = getCurrentAttachments().filter((item) => String(item?.id || '') !== String(id));
        setCurrentAttachments(next);
      });
    });
  }

  const updateAttachmentControls = (currentState) => {
    if (!openFilesBtn || !attachUploadBtn || !attachmentInput) return;
    const { allowedKinds, accepts } = getAttachmentAcceptTypes(currentState);
    const hasAny = allowedKinds.length > 0;
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
    if (!pendingQueueEl) return;
    if (!pendingQueue.length) {
      pendingQueueEl.innerHTML = '';
      pendingQueueEl.classList.add('hidden');
      return;
    }
    pendingQueueEl.classList.remove('hidden');
    pendingQueueEl.innerHTML = renderPendingQueueMarkup(pendingQueue);
    pendingQueueEl.querySelectorAll('[data-q-send-now]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = Number(btn.getAttribute('data-q-send-now'));
        pendingQueue = promoteQueueItem(pendingQueue, id);
        renderPendingQueue();
      });
    });
    pendingQueueEl.querySelectorAll('[data-q-up]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = Number(btn.getAttribute('data-q-up'));
        const next = moveQueueItem(pendingQueue, id, 'up');
        if (next === pendingQueue) return;
        pendingQueue = next;
        renderPendingQueue();
      });
    });
    pendingQueueEl.querySelectorAll('[data-q-down]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = Number(btn.getAttribute('data-q-down'));
        const next = moveQueueItem(pendingQueue, id, 'down');
        if (next === pendingQueue) return;
        pendingQueue = next;
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
        pendingQueue = removeQueueItem(pendingQueue, id);
        renderPendingQueue();
      });
    });
  }

  function toggleSendMicBtn() {
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
    if (input.value.trim().length > 0) {
      micBtn.classList.add('hidden');
      sendBtn.classList.remove('hidden');
    } else {
      micBtn.classList.remove('hidden');
      sendBtn.classList.add('hidden');
    }
  }

  function finishSubmission() {
    isSubmitting = false;
    abortFn = null;
    toggleSendMicBtn();
    if (pendingQueue.length > 0) startQueuedSend();
  }

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
      onFinished: () => finishSubmission(),
    });
    return true;
  }

  function submitCurrentText() {
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
    onSend(text, {
      onAbortable: (fn) => {
        abortFn = fn;
        toggleSendMicBtn();
      },
      onFinished: () => finishSubmission(),
    });
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

  input.addEventListener('input', async () => {
    input.style.height = 'auto';
    input.style.height = Math.min(input.scrollHeight, 200) + 'px';
    toggleSendMicBtn();
    if (state.activeChatId) {
      const drafts = { ...state.drafts, [state.activeChatId]: input.value };
      setState({ drafts });
    } else {
      setState({ newChatDraft: input.value });
    }
    await promptController.handleInput(input.value);
  });

  input.addEventListener('keydown', async (e) => {
    const handled = await promptController.handleKeydown(e);
    if (handled) return;
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (input.value.trim()) composer.dispatchEvent(new Event('submit'));
    }
  });

  composer.addEventListener('submit', (e) => {
    e.preventDefault();
    submitCurrentText();
  });

  const closeAttachMenu = () => {
    if (!attachMenu || !openFilesBtn) return;
    attachMenu.classList.add('hidden');
    openFilesBtn.setAttribute('aria-expanded', 'false');
  };

  openFilesBtn?.addEventListener('click', (e) => {
    e.stopPropagation();
    if (openFilesBtn.disabled || !attachMenu) return;
    const isHidden = attachMenu.classList.contains('hidden');
    if (isHidden) {
      attachMenu.classList.remove('hidden');
      openFilesBtn.setAttribute('aria-expanded', 'true');
    } else {
      closeAttachMenu();
    }
  });
  attachUploadBtn?.addEventListener('click', () => {
    if (attachUploadBtn.disabled) return;
    closeAttachMenu();
    attachmentInput?.click();
  });
  attachmentInput?.addEventListener('change', (e) => {
    const files = Array.from(e.target.files || []);
    if (files.length) window.dispatchEvent(new CustomEvent('growchat:files-selected', { detail: { files } }));
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
      promptController.hidePromptPicker();
    }, 100);
  });

  const unsubscribe = subscribe((currentState) => {
    const model = currentState.models.find((m) => m.id === currentState.activeModelId);
    const modelName = model?.name || 'GrowChat';
    input.placeholder = `Message ${modelName}`;
    const footer = container.querySelector('.mt-2.text-xs.text-gray-400');
    if (footer) footer.textContent = `${modelName} can make mistakes. Check important info.`;

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
      if (!nextStreamBlocked && isSubmitting) {
        finishSubmission();
      } else {
        toggleSendMicBtn();
      }
      if (!isStreamBlocked && pendingQueue.length > 0 && !isSubmitting) startQueuedSend();
    }

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
    renderAttachments(getCurrentAttachments(currentState));
    updateAttachmentControls(currentState);
  });

  return {
    destroy: () => {
      unsubscribe?.();
    },
    setValue: (text) => {
      input.value = text;
      input.dispatchEvent(new Event('input'));
      input.focus();
    },
    submit: () => {
      composer.dispatchEvent(new Event('submit'));
    },
  };
}

