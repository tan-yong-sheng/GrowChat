import { state } from '../../shared/store.js';
import { escapeHtml, showToast } from '../../shared/utils.js';

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

  let isSubmitting = false;
  let abortFn = null;
  let canRequestCancel = false;
  let latestRunningMessageId = null;
  let lastActiveChatId = state.activeChatId;
  let isStreamBlocked = false;
  let expandedToolServerIds = new Set();
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

  function getCurrentToolSelection(currentState = state) {
    const chatId = currentState.activeChatId;
    if (chatId) {
      const stored = currentState.toolSelectionsByChat?.[chatId];
      return stored === undefined ? null : stored;
    }
    return currentState.newChatToolSelection;
  }

  function buildToolKey(serverId, toolName) {
    const safeName = String(toolName || '').replace(/[^a-zA-Z0-9_-]/g, '_');
    return `mcp__${serverId}__${safeName}`;
  }

  function getToolServerScopeLabel(server) {
    const source = String(server?.source || '').trim().toLowerCase();
    const accessVariant = String(server?.access_variant || '').trim().toLowerCase();
    const accessLabel = String(server?.access_label || '').trim().toLowerCase();
    if (source === 'user' || accessVariant === 'personal' || accessLabel === 'personal') {
      return 'Personal';
    }
    return 'Shared';
  }

  function getToolServerScopeBadgeClass(server) {
    const label = getToolServerScopeLabel(server);
    return label === 'Personal'
      ? 'border-emerald-100 bg-emerald-50 text-emerald-700'
      : 'border-gray-200 bg-gray-50 text-gray-500';
  }

  function getAllowedToolServers(currentState = state) {
    return (Array.isArray(currentState.toolServers) ? currentState.toolServers : [])
      .filter((server) => server?.enabled !== false && String(server?.id || '').trim() && String(server?.name || '').trim())
      .map((server) => ({
        ...server,
        tools: (Array.isArray(server.tools) ? server.tools : [])
          .filter((tool) => tool?.enabled !== false && tool?.visible_for_user !== false && String(tool?.name || '').trim())
          .map((tool) => ({
            ...tool,
            name: String(tool.name || '').trim(),
            title: String(tool.title || '').trim(),
            description: String(tool.description || '').trim(),
          })),
      }))
      .filter((server) => server.tools.length > 0);
  }

  function getAllowedToolKeys(currentState = state) {
    return getAllowedToolServers(currentState).flatMap((server) => (
      server.tools.map((tool) => buildToolKey(server.id, tool.name))
    ));
  }

  function getServerToolKeys(server) {
    return (Array.isArray(server?.tools) ? server.tools : [])
      .map((tool) => buildToolKey(server.id, tool.name))
      .filter(Boolean);
  }

  function getServerSelectionState(server, selection = getCurrentToolSelection()) {
    const keys = getServerToolKeys(server);
    if (!keys.length) return { enabled: false, partial: false };
    if (selection === null) return { enabled: true, partial: false };
    const selected = new Set(Array.isArray(selection) ? selection : []);
    let selectedCount = 0;
    for (const key of keys) {
      if (selected.has(key)) selectedCount += 1;
    }
    return {
      enabled: selectedCount === keys.length,
      partial: selectedCount > 0 && selectedCount < keys.length,
    };
  }

  function setCurrentToolSelection(nextSelection, currentState = state) {
    const chatId = currentState.activeChatId;
    const normalized = Array.isArray(nextSelection) ? nextSelection.filter(Boolean) : null;
    if (chatId) {
      setState((prev) => {
        const nextMap = { ...(prev.toolSelectionsByChat || {}) };
        if (normalized === null) {
          delete nextMap[chatId];
        } else {
          nextMap[chatId] = normalized;
        }
        return { toolSelectionsByChat: nextMap };
      });
      return;
    }
    setState({ newChatToolSelection: normalized });
  }

  function setCurrentToolSelectionForChat(chatId, nextSelection) {
    if (!chatId) {
      setCurrentToolSelection(nextSelection);
      return;
    }
    const normalized = Array.isArray(nextSelection) ? nextSelection.filter(Boolean) : null;
    setState((prev) => {
      const nextMap = { ...(prev.toolSelectionsByChat || {}) };
      if (normalized === null) {
        delete nextMap[chatId];
      } else {
        nextMap[chatId] = normalized;
      }
      return { toolSelectionsByChat: nextMap };
    });
  }

  function getSelectedToolState(serverId, toolName, currentState = state) {
    const selection = getCurrentToolSelection(currentState);
    if (selection === null) return true;
    const key = buildToolKey(serverId, toolName);
    return selection.includes(key);
  }

  function setToolSelectionForCurrentChat(serverId, toolName) {
    const currentState = state;
    const allowedKeys = getAllowedToolKeys(currentState);
    const key = buildToolKey(serverId, toolName);
    const selection = getCurrentToolSelection(currentState);
    let nextSelection;

    if (selection === null) {
      nextSelection = allowedKeys.filter((item) => item !== key);
    } else {
      const nextSet = new Set(selection);
      if (nextSet.has(key)) {
        nextSet.delete(key);
      } else {
        nextSet.add(key);
      }
      const deduped = [...nextSet];
      nextSelection = allowedKeys.length > 0 && allowedKeys.every((allowed) => nextSet.has(allowed))
        ? null
        : deduped;
    }

    if (Array.isArray(nextSelection) && nextSelection.length === 0) {
      nextSelection = [];
    }
    setCurrentToolSelection(nextSelection, currentState);
    renderToolsMenu();
  }

  function setServerSelectionForCurrentChat(serverId, enabled) {
    const currentState = state;
    const servers = getAllowedToolServers(currentState);
    const server = servers.find((entry) => String(entry.id) === String(serverId));
    if (!server) return;
    const serverKeys = getServerToolKeys(server);
    if (!serverKeys.length) return;
    const allowedKeys = getAllowedToolKeys(currentState);
    const selection = getCurrentToolSelection(currentState);
    let nextSelection;

    if (enabled) {
      if (selection === null) {
        nextSelection = null;
      } else {
        const nextSet = new Set(Array.isArray(selection) ? selection : []);
        for (const key of serverKeys) nextSet.add(key);
        nextSelection = allowedKeys.length > 0 && allowedKeys.every((allowed) => nextSet.has(allowed))
          ? null
          : [...nextSet];
      }
    } else if (selection === null) {
      nextSelection = allowedKeys.filter((key) => !serverKeys.includes(key));
    } else {
      nextSelection = (Array.isArray(selection) ? selection : []).filter((key) => !serverKeys.includes(key));
    }

    if (Array.isArray(nextSelection) && nextSelection.length === 0) {
      nextSelection = [];
    }

    setCurrentToolSelection(nextSelection, currentState);
    renderToolsMenu();
  }

  function setAllToolSelectionsForCurrentChat(enabled) {
    const currentState = state;
    const servers = getAllowedToolServers(currentState);
    if (!servers.length) return;
    setCurrentToolSelection(enabled ? null : [], currentState);
    renderToolsMenu();
  }

  function toggleToolServerExpansion(serverId) {
    const id = String(serverId || '').trim();
    if (!id) return;
    const next = new Set(expandedToolServerIds);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    expandedToolServerIds = next;
    renderToolsMenu();
  }

  const isMobileDevice = () => {
    const userAgent = navigator.userAgent || navigator.vendor || window.opera;
    return /android|iphone|ipad|ipod|windows phone/i.test(userAgent);
  };

  const dispatchSelectedFiles = (files) => {
    const selected = Array.isArray(files) ? files.filter(Boolean) : [];
    if (!selected.length) return;
    window.dispatchEvent(new CustomEvent('growchat:files-selected', { detail: { files: selected } }));
  };

  const captureScreen = async () => {
    if (!navigator.mediaDevices?.getDisplayMedia) {
      showToast('Screen capture is not supported in this browser.');
      return;
    }

    let stream = null;
    try {
      stream = await navigator.mediaDevices.getDisplayMedia({
        video: { cursor: 'never' },
        audio: false,
      });

      const video = document.createElement('video');
      video.muted = true;
      video.playsInline = true;
      video.srcObject = stream;

      await new Promise((resolve, reject) => {
        const cleanup = () => {
          video.removeEventListener('loadedmetadata', onReady);
          video.removeEventListener('error', onError);
        };
        const onReady = () => {
          cleanup();
          resolve();
        };
        const onError = () => {
          cleanup();
          reject(new Error('Unable to load capture stream'));
        };
        video.addEventListener('loadedmetadata', onReady, { once: true });
        video.addEventListener('error', onError, { once: true });
      });

      await video.play().catch(() => {});

      const track = stream.getVideoTracks()[0];
      const settings = typeof track?.getSettings === 'function' ? track.getSettings() : {};
      const width = video.videoWidth || settings.width || 0;
      const height = video.videoHeight || settings.height || 0;
      if (!width || !height) {
        throw new Error('Unable to capture screen');
      }

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;

      const context = canvas.getContext('2d');
      if (!context) throw new Error('Unable to capture screen');
      context.drawImage(video, 0, 0, width, height);

      const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
      if (!blob) throw new Error('Unable to capture screen');

      const file = new File([blob], `screen-capture-${Date.now()}.png`, { type: 'image/png' });
      dispatchSelectedFiles([file]);
    } catch (error) {
      const name = String(error?.name || '');
      if (name !== 'AbortError' && name !== 'NotAllowedError') {
        showToast('Screen capture failed.');
      }
    } finally {
      if (stream) {
        stream.getTracks().forEach((track) => track.stop());
      }
    }
  };

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
    if (!openFilesBtn || !attachUploadBtn || !attachCaptureBtn || !attachmentInput) return;
    const { allowedKinds, accepts } = getAttachmentAcceptTypes(currentState);
    const hasAny = allowedKinds.length > 0;
    attachmentInput.setAttribute('accept', accepts.join(','));
    if (cameraInput) cameraInput.setAttribute('accept', 'image/*');
    openFilesBtn.disabled = !hasAny;
    attachUploadBtn.disabled = !hasAny;
    attachCaptureBtn.disabled = !hasAny;
    openFilesBtn.classList.toggle('opacity-40', !hasAny);
    openFilesBtn.classList.toggle('cursor-not-allowed', !hasAny);
    attachUploadBtn.classList.toggle('opacity-40', !hasAny);
    attachUploadBtn.classList.toggle('cursor-not-allowed', !hasAny);
    attachCaptureBtn.classList.toggle('opacity-40', !hasAny);
    attachCaptureBtn.classList.toggle('cursor-not-allowed', !hasAny);
    if (attachmentHint) {
      attachmentHint.textContent = '';
      attachmentHint.classList.add('hidden');
    }
  };

  const updateToolControls = (currentState) => {
    if (!openToolsBtn) return;
    const servers = getAllowedToolServers(currentState);
    const hasAny = servers.length > 0;
    const loading = currentState.toolServersLoading === true;
    const selection = getCurrentToolSelection(currentState);
    const allowedKeys = servers.flatMap((server) => server.tools.map((tool) => buildToolKey(server.id, tool.name)));
    const allEnabled = selection === null || (
      Array.isArray(selection) &&
      allowedKeys.length > 0 &&
      allowedKeys.every((key) => selection.includes(key))
    );
    const allDisabled = Array.isArray(selection) && selection.length === 0;
    openToolsBtn.disabled = loading || !hasAny;
    openToolsBtn.classList.toggle('opacity-40', loading || !hasAny);
    openToolsBtn.classList.toggle('cursor-not-allowed', loading || !hasAny);
    if (toolsMenuAllOnBtn) {
      toolsMenuAllOnBtn.disabled = loading || !hasAny;
      toolsMenuAllOnBtn.classList.toggle('hidden', !hasAny || allEnabled);
      toolsMenuAllOnBtn.classList.toggle('opacity-40', loading || !hasAny);
      toolsMenuAllOnBtn.classList.toggle('cursor-not-allowed', loading || !hasAny);
    }
    if (toolsMenuAllOffBtn) {
      toolsMenuAllOffBtn.disabled = loading || !hasAny;
      toolsMenuAllOffBtn.classList.toggle('hidden', !hasAny || allDisabled);
      toolsMenuAllOffBtn.classList.toggle('opacity-40', loading || !hasAny);
      toolsMenuAllOffBtn.classList.toggle('cursor-not-allowed', loading || !hasAny);
    }
    if (!hasAny && !toolsMenu?.classList.contains('hidden')) {
      closeToolsMenu();
    }
    if (toolsMenu && !toolsMenu.classList.contains('hidden')) {
      renderToolsMenu(currentState);
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

  function renderToolsMenu(currentState = state) {
    if (!toolsMenu || !toolsMenuList) return;
    const servers = getAllowedToolServers(currentState);
    const selection = getCurrentToolSelection(currentState);
    const allowedKeys = servers.flatMap((server) => server.tools.map((tool) => buildToolKey(server.id, tool.name)));

    if (!servers.length) {
      toolsMenuList.innerHTML = '<div class="px-3 py-4 text-sm text-gray-400">No tools are enabled for this workspace.</div>';
      return;
    }
    toolsMenuList.innerHTML = servers.map((server) => {
      const serverId = String(server.id || '');
      const serverExpanded = expandedToolServerIds.has(serverId);
      const selectionState = getServerSelectionState(server, selection);
      const anyEnabled = selectionState.enabled || selectionState.partial;
      const selectedSet = selection === null ? new Set(allowedKeys) : new Set(Array.isArray(selection) ? selection : []);
      const enabledToolCount = server.tools.length;
      const scopeLabel = getToolServerScopeLabel(server);
      const scopeBadgeClass = getToolServerScopeBadgeClass(server);
      const toolRows = server.tools.map((tool) => {
        const key = buildToolKey(server.id, tool.name);
        const enabled = selectedSet.has(key);
        return `
          <button type="button" data-tool-toggle data-tool-server-id="${escapeHtml(server.id)}" data-tool-name="${escapeHtml(tool.name)}" aria-pressed="${enabled ? 'true' : 'false'}" class="w-full flex items-center justify-between gap-3 rounded-xl px-3 py-2 text-left text-sm text-gray-700 transition hover:bg-gray-50">
            <span class="min-w-0 flex-1 truncate">${escapeHtml(tool.title || tool.name)}</span>
            <span class="ml-3 inline-flex h-5 w-9 items-center rounded-full px-0.5 transition ${enabled ? 'bg-emerald-500' : 'bg-gray-200'}" aria-hidden="true">
              <span class="h-4 w-4 rounded-full bg-white shadow-sm transition ${enabled ? 'translate-x-4' : 'translate-x-0'}"></span>
            </span>
          </button>
        `;
      }).join('');
      return `
        <section class="rounded-2xl border border-gray-100 bg-white overflow-hidden" data-tool-server-card data-tool-server-id="${escapeHtml(server.id)}">
          <div class="flex items-center gap-2 px-2 py-1.5">
            <button type="button" data-tool-server-toggle data-tool-server-id="${escapeHtml(server.id)}" aria-pressed="${anyEnabled ? 'true' : 'false'}" aria-label="${anyEnabled ? 'Disable' : 'Enable'} ${escapeHtml(server.name)}" title="${anyEnabled ? 'Disable' : 'Enable'} ${escapeHtml(server.name)}" class="relative inline-flex h-5 w-9 flex-shrink-0 items-center rounded-full p-0.5 transition ${anyEnabled ? 'bg-emerald-500' : 'bg-gray-200'}">
              <span class="h-4 w-4 rounded-full bg-white shadow-sm transition ${anyEnabled ? 'translate-x-4' : 'translate-x-0'}" aria-hidden="true"></span>
            </button>
            <button type="button" data-tool-server-expand data-tool-server-id="${escapeHtml(server.id)}" class="flex min-w-0 flex-1 items-center justify-between gap-2 rounded-xl px-2 py-2 text-left hover:bg-gray-50 transition">
              <div class="min-w-0">
                <div class="flex items-center gap-2">
                  <div class="min-w-0 text-sm font-medium text-gray-900 truncate">${escapeHtml(server.name)}</div>
                  <span class="inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${scopeBadgeClass}">${escapeHtml(scopeLabel)}</span>
                </div>
                <div class="text-xs text-gray-400">${enabledToolCount} tool${enabledToolCount === 1 ? '' : 's'}</div>
              </div>
              <i class="bi ${serverExpanded ? 'bi-chevron-down' : 'bi-chevron-right'} text-gray-400 text-sm leading-none flex-shrink-0" aria-hidden="true"></i>
            </button>
          </div>
          <div class="${serverExpanded ? '' : 'hidden'} px-2 pb-2">
            <div class="space-y-1">
              ${toolRows}
            </div>
          </div>
        </section>
      `;
    }).join('');
  }

  const closeToolsMenu = () => {
    if (!toolsMenu || !openToolsBtn) return;
    toolsMenu.classList.add('hidden');
    openToolsBtn.setAttribute('aria-expanded', 'false');
    expandedToolServerIds = new Set();
  };

  const openToolsMenu = () => {
    if (!toolsMenu || !openToolsBtn || openToolsBtn.disabled) return;
    toolsMenu.classList.remove('hidden');
    openToolsBtn.setAttribute('aria-expanded', 'true');
    renderToolsMenu();
  };

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
    }, getCurrentToolSelection() === null ? {} : { selectedToolNames: getCurrentToolSelection() });
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
    }, getCurrentToolSelection() === null ? {} : { selectedToolNames: getCurrentToolSelection() });
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
  });

  input.addEventListener('keydown', async (e) => {
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
    closeToolsMenu();
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
      openToolsMenu();
    } else {
      closeToolsMenu();
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
    if (!isMobileDevice() && navigator.mediaDevices?.getDisplayMedia) {
      await captureScreen();
      return;
    }
    cameraInput?.click();
  });
  toolsMenu?.addEventListener('click', (e) => {
    e.stopPropagation();
    const allOnBtn = e.target.closest?.('#tools-menu-all-on');
    if (allOnBtn) {
      setAllToolSelectionsForCurrentChat(true);
      return;
    }

    const allOffBtn = e.target.closest?.('#tools-menu-all-off');
    if (allOffBtn) {
      setAllToolSelectionsForCurrentChat(false);
      return;
    }

    const serverToggleBtn = e.target.closest?.('[data-tool-server-toggle]');
    if (serverToggleBtn) {
      const serverId = serverToggleBtn.getAttribute('data-tool-server-id');
      const server = getAllowedToolServers(state).find((entry) => String(entry.id) === String(serverId));
      if (serverId && server) {
        const selectionState = getServerSelectionState(server);
        const anyEnabled = selectionState.enabled || selectionState.partial;
        setServerSelectionForCurrentChat(serverId, !anyEnabled);
      }
      return;
    }

    const serverExpandBtn = e.target.closest?.('[data-tool-server-expand]');
    if (serverExpandBtn) {
      const serverId = serverExpandBtn.getAttribute('data-tool-server-id');
      if (serverId) {
        toggleToolServerExpansion(serverId);
      }
      return;
    }

    const toggleBtn = e.target.closest?.('[data-tool-toggle]');
    if (toggleBtn) {
      const serverId = toggleBtn.getAttribute('data-tool-server-id');
      const toolName = toggleBtn.getAttribute('data-tool-name');
      if (serverId && toolName) {
        setToolSelectionForCurrentChat(serverId, toolName);
      }
    }
  });
  attachmentInput?.addEventListener('change', (e) => {
    const files = Array.from(e.target.files || []);
    dispatchSelectedFiles(files);
    e.target.value = '';
  });
  cameraInput?.addEventListener('change', (e) => {
    const files = Array.from(e.target.files || []);
    dispatchSelectedFiles(files);
    e.target.value = '';
  });
  document.addEventListener('click', (e) => {
    if (!attachMenu || !openFilesBtn) return;
    const clickInsideAttach = attachMenu.contains(e.target) || openFilesBtn.contains(e.target);
    const clickInsideTools = toolsMenu?.contains(e.target) || openToolsBtn?.contains(e.target);
    if (!attachMenu.classList.contains('hidden') && !clickInsideAttach) {
      closeAttachMenu();
    }
    if (toolsMenu && !toolsMenu.classList.contains('hidden') && !clickInsideTools) {
      closeToolsMenu();
    }
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
    updateToolControls(currentState);
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

