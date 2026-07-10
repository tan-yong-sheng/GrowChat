import { state } from '../../shared/store.js';
import { findStreamingMessageId } from './message-input-helpers.js';
import { createToolSelectionController } from './message-input-tool-selection.js';
import { createMessageInputUi } from './message-input-ui.js';

export function createMessageInputController({
  container,
  setState,
  subscribe,
  onSend,
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
  const openToolsBtn = container.querySelector('#open-tools-btn');
  const attachMenu = container.querySelector('#attach-menu');
  const toolsMenu = container.querySelector('#tools-menu');
  const toolsMenuAllOnBtn = container.querySelector('#tools-menu-all-on');
  const toolsMenuAllOffBtn = container.querySelector('#tools-menu-all-off');
  const toolsMenuList = container.querySelector('#tools-menu-list');
  const attachUploadBtn = container.querySelector('#attach-upload');
  const attachCaptureBtn = container.querySelector('#attach-capture');
  const attachmentInput = container.querySelector('#attachment-input');
  const cameraInput = container.querySelector('#camera-input');
  const attachmentList = container.querySelector('#attachment-list');
  const attachmentHint = container.querySelector('#attachment-hint');
  const pendingQueueEl = container.querySelector('#pending-queue');

  const closeAttachMenu = () => {
    if (!attachMenu || !openFilesBtn) return;
    attachMenu.classList.add('hidden');
    openFilesBtn.setAttribute('aria-expanded', 'false');
  };

  const toolCtrl = createToolSelectionController({
    toolsMenu,
    toolsMenuAllOnBtn,
    toolsMenuAllOffBtn,
    toolsMenuList,
    openToolsBtn,
    setState,
  });

  function getCurrentAttachments(currentState = state) {
    const chatId = currentState.activeChatId;
    if (chatId) return currentState.attachmentsByChat?.[chatId] || [];
    return currentState.newChatAttachments || [];
  }

  function setCurrentAttachments(next) {
    const chatId = state.activeChatId;
    if (chatId) {
      setState({ attachmentsByChat: { ...(state.attachmentsByChat || {}), [chatId]: next } });
      return;
    }
    setState({ newChatAttachments: next });
  }

  const uiCtrl = createMessageInputUi({
    container,
    attachmentList,
    attachmentInput,
    cameraInput,
    openFilesBtn,
    attachUploadBtn,
    attachCaptureBtn,
    attachmentHint,
    pendingQueueEl,
    getAttachmentAcceptTypes,
    moveQueueItem,
    promoteQueueItem,
    removeQueueItem,
    renderAttachmentListMarkup,
    renderPendingQueueMarkup,
    hasSelectableModels: toolCtrl.hasSelectableModels,
    getCurrentAttachments,
    setCurrentAttachments,
    closeAttachMenu,
    closeToolsMenu: toolCtrl.closeToolsMenu,
  });

  let isSubmitting = false;
  let abortFn = null;
  let canRequestCancel = false;
  let latestRunningMessageId = null;
  let lastActiveChatId = state.activeChatId;
  let isStreamBlocked = false;

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
    const first = findStreamingMessageId(messages);
    if (first) return first;
    for (let i = messages.length - 1; i >= 0; i -= 1) {
      const msg = messages[i];
      if (msg?.role === 'assistant' && msg?.done === false) {
        return msg.id;
      }
    }
    return null;
  }

  function toggleSendMicBtn() {
    if (composer?.getAttribute('aria-disabled') === 'true') {
      micBtn.classList.add('hidden');
      sendBtn.classList.add('hidden');
      stopBtn.classList.add('hidden');
      loadingSpinner.classList.add('hidden');
      loadingSpinner.style.display = 'none';
      return;
    }
    if (isStreamBlocked) {
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
    if (uiCtrl.getPendingQueue().length > 0) startQueuedSend();
  }

  function sendWithCallbacks(text) {
    isSubmitting = true;
    toggleSendMicBtn();
    onSend(
      text,
      {
        onAbortable: (fn) => {
          abortFn = fn;
          toggleSendMicBtn();
        },
        onFinished: () => finishSubmission(),
      },
      toolCtrl.getCurrentToolSelection() === null
        ? {}
        : { selectedToolNames: toolCtrl.getCurrentToolSelection() }
    );
  }

  function clearInput() {
    input.value = '';
    input.style.height = '44px';
    input.dispatchEvent(new Event('input'));
    input.focus();
  }

  function startQueuedSend() {
    if (isSubmitting || isStreamBlocked || uiCtrl.getPendingQueue().length === 0) return false;
    const pendingQueue = uiCtrl.getPendingQueue();
    const next = pendingQueue.shift();
    uiCtrl.setPendingQueue(pendingQueue);
    uiCtrl.renderPendingQueue();
    if (!next?.text) return false;
    sendWithCallbacks(next.text);
    return true;
  }

  function submitCurrentText() {
    const text = input.value.trim();
    if (!text) return;
    if (isSubmitting || isStreamBlocked) {
      const pendingQueue = uiCtrl.getPendingQueue();
      pendingQueue.push({ id: uiCtrl.getQueueNextId(), text });
      uiCtrl.incrementQueueNextId();
      uiCtrl.setPendingQueue(pendingQueue);
      uiCtrl.renderPendingQueue();
      clearInput();
      return;
    }
    if (state.activeChatId) {
      const drafts = { ...state.drafts };
      delete drafts[state.activeChatId];
      setState({ drafts });
    } else {
      setState({ newChatDraft: '' });
    }
    clearInput();
    sendWithCallbacks(text);
  }

  stopBtn.onclick = async (e) => {
    e.preventDefault();
    const handler = abortFn || getGlobalAbort();
    if (handler) handler();
    abortFn = null;
    try {
      const chatId = state.activeChatId;
      const msgId = latestRunningMessageId || findRunningMessageId(state);
      if (typeof window.__growchatRequestCancel === 'function' && chatId && msgId) {
        await window.__growchatRequestCancel(chatId, msgId);
      }
    } catch {
      /* cancel race */
    }
    finishSubmission();
  };

  input.addEventListener('input', () => {
    input.style.height = 'auto';
    input.style.height = `${Math.min(input.scrollHeight, 200)}px`;
    toggleSendMicBtn();
    const draftUpdate = state.activeChatId
      ? { drafts: { ...state.drafts, [state.activeChatId]: input.value } }
      : { newChatDraft: input.value };
    setState(draftUpdate);
  });

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (input.value.trim()) composer.dispatchEvent(new Event('submit'));
    }
  });

  composer.addEventListener('submit', (e) => {
    e.preventDefault();
    submitCurrentText();
  });

  openFilesBtn?.addEventListener('click', (e) => {
    e.stopPropagation();
    if (openFilesBtn.disabled || !attachMenu) return;
    toolCtrl.closeToolsMenu();
    const isHidden = attachMenu.classList.contains('hidden');
    if (isHidden) {
      attachMenu.classList.remove('hidden');
      openFilesBtn.setAttribute('aria-expanded', 'true');
    } else {
      closeAttachMenu();
    }
  });

  openToolsBtn?.addEventListener('click', (e) => {
    e.stopPropagation();
    if (openToolsBtn.disabled || !toolsMenu) return;
    closeAttachMenu();
    const isHidden = toolsMenu.classList.contains('hidden');
    if (isHidden) {
      toolCtrl.openToolsMenu();
    } else {
      toolCtrl.closeToolsMenu();
    }
  });

  attachUploadBtn?.addEventListener('click', () => {
    if (attachUploadBtn.disabled) return;
    closeAttachMenu();
    attachmentInput?.click();
  });

  attachCaptureBtn?.addEventListener('click', async () => {
    if (attachCaptureBtn.disabled) return;
    closeAttachMenu();
    if (!uiCtrl.isMobileDevice() && navigator.mediaDevices?.getDisplayMedia) {
      await uiCtrl.captureScreen();
      return;
    }
    cameraInput?.click();
  });

  toolCtrl.bindToolsMenuEvents();

  attachmentInput?.addEventListener('change', (e) => {
    const files = Array.from(e.target.files || []);
    uiCtrl.dispatchSelectedFiles(files);
    e.target.value = '';
  });

  cameraInput?.addEventListener('change', (e) => {
    const files = Array.from(e.target.files || []);
    uiCtrl.dispatchSelectedFiles(files);
    e.target.value = '';
  });

  document.addEventListener('click', (e) => {
    if (!attachMenu || !openFilesBtn) return;
    if (
      !attachMenu.classList.contains('hidden') &&
      !attachMenu.contains(e.target) &&
      !openFilesBtn.contains(e.target)
    )
      closeAttachMenu();
    if (
      toolsMenu &&
      !toolsMenu.classList.contains('hidden') &&
      !toolsMenu.contains(e.target) &&
      !openToolsBtn?.contains(e.target)
    )
      toolCtrl.closeToolsMenu();
  });
  const unsubscribe = subscribe((s) => {
    const model = s.models.find((m) => m.id === s.activeModelId);
    const name = model?.name || 'GrowChat';
    const noModels = !s.modelsLoading && !toolCtrl.hasSelectableModels(s);
    input.placeholder = noModels ? 'No selectable models are available' : `Message ${name}`;
    const disc = container.querySelector('#disclaimer-text');
    if (disc)
      disc.textContent = noModels
        ? 'No selectable models are available. Ask an admin to restore access or hide fewer models.'
        : `${name} can make mistakes. Check important info.`;
    const chatChanged = s.activeChatId !== lastActiveChatId;
    if (chatChanged && uiCtrl.getPendingQueue().length > 0) {
      uiCtrl.setPendingQueue([]);
      uiCtrl.renderPendingQueue();
    }
    const nextBlocked = Boolean(
      s.ui?.streaming &&
      s.ui?.streamingChatId &&
      String(s.ui.streamingChatId) === String(s.activeChatId || '')
    );
    latestRunningMessageId = findRunningMessageId(s);
    canRequestCancel = Boolean(
      latestRunningMessageId && typeof window.__growchatRequestCancel === 'function'
    );
    if (nextBlocked !== isStreamBlocked) {
      isStreamBlocked = nextBlocked;
      if (!nextBlocked && isSubmitting) finishSubmission();
      else toggleSendMicBtn();
      if (!isStreamBlocked && uiCtrl.getPendingQueue().length > 0 && !isSubmitting)
        startQueuedSend();
    }
    uiCtrl.updateComposerAvailability(s);
    if (!isSubmitting && (chatChanged || (input !== document.activeElement && !input.value))) {
      const draft = s.activeChatId ? s.drafts[s.activeChatId] || '' : s.newChatDraft || '';
      if (input.value !== draft) {
        input.value = draft;
        input.dispatchEvent(new Event('input'));
      }
    }
    lastActiveChatId = s.activeChatId;
    uiCtrl.renderAttachments(getCurrentAttachments(s));
    uiCtrl.updateAttachmentControls(s);
    toolCtrl.updateToolControls(s);
    toggleSendMicBtn();
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
