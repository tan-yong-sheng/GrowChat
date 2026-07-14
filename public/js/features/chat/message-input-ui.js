/**
 * Message input UI helpers: screen capture, attachment rendering,
 * pending queue rendering, and composer availability controls.
 */

import { state } from '../../shared/store.js';
import { showToast } from '../../shared/utils.js';

async function createScreenCaptureVideo(stream) {
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
  return video;
}

function stopMediaStream(stream) {
  if (stream) stream.getTracks().forEach((track) => track.stop());
}

async function createImageFileFromVideo(video, stream) {
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
  return new File([blob], `screen-capture-${Date.now()}.png`, { type: 'image/png' });
}

export function createMessageInputUi({
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
  hasSelectableModels,
  getCurrentAttachments,
  setCurrentAttachments,
  closeAttachMenu,
  closeToolsMenu,
}) {
  const composer = container.querySelector('#composer');
  const input = container.querySelector('#message-input');
  const sendBtn = container.querySelector('#send-btn');
  const micBtn = container.querySelector('#mic-btn');

  const isMobileDevice = () => {
    const userAgent = navigator.userAgent || navigator.vendor || window.opera;
    return /android|iphone|ipad|ipod|windows phone/i.test(userAgent);
  };

  const dispatchSelectedFiles = (files) => {
    const selected = Array.isArray(files) ? files.filter(Boolean) : [];
    if (!selected.length) return;
    window.dispatchEvent(
      new CustomEvent('growchat:files-selected', {
        detail: { files: selected },
      })
    );
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
      const video = await createScreenCaptureVideo(stream);
      const file = await createImageFileFromVideo(video, stream);
      dispatchSelectedFiles([file]);
    } catch (error) {
      const name = String(error?.name || '');
      if (name !== 'AbortError' && name !== 'NotAllowedError') {
        showToast('Screen capture failed.');
      }
    } finally {
      stopMediaStream(stream);
    }
  };

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
        const next = getCurrentAttachments().filter(
          (item) => String(item?.id || '') !== String(id)
        );
        setCurrentAttachments(next);
      });
    });
  }

  const updateAttachmentControls = (currentState) => {
    if (!openFilesBtn || !attachUploadBtn || !attachCaptureBtn || !attachmentInput) return;
    const { allowedKinds, accepts } = getAttachmentAcceptTypes(currentState);
    const hasAny = allowedKinds.length > 0 && hasSelectableModels(currentState);
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

  const updateComposerAvailability = (currentState) => {
    const noSelectableModels = !currentState.modelsLoading && !hasSelectableModels(currentState);
    composer?.setAttribute('aria-disabled', noSelectableModels ? 'true' : 'false');
    input.disabled = noSelectableModels;
    if (micBtn) micBtn.disabled = noSelectableModels;
    if (sendBtn) sendBtn.disabled = noSelectableModels;
    composer?.classList.toggle('opacity-70', noSelectableModels);
    composer?.classList.toggle('pointer-events-none', noSelectableModels);
  };

  let pendingQueue = [];
  let queueNextId = 1;

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

  return {
    isMobileDevice,
    dispatchSelectedFiles,
    captureScreen,
    renderAttachments,
    updateAttachmentControls,
    updateComposerAvailability,
    renderPendingQueue,
    getPendingQueue: () => pendingQueue,
    setPendingQueue: (q) => {
      pendingQueue = q;
    },
    getQueueNextId: () => queueNextId,
    incrementQueueNextId: () => {
      queueNextId += 1;
    },
  };
}
