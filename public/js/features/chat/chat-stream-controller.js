import { findStreamingMessageId } from './message-input-helpers.js';

export function createChatStreamController({
  apiFetch,
  pollIntervalMs = 1500,
  pollTimeoutMs = 120000,
} = {}) {
  const streamPollersByChat = new Map();
  const resumeStreamsByChat = new Map();

  function getRunningMessageId(messages = []) {
    return findStreamingMessageId(messages);
  }

  function stopStreamPolling(chatId) {
    if (!chatId) return;
    const key = String(chatId);
    const existing = streamPollersByChat.get(key);
    if (!existing) return;
    clearInterval(existing.timer);
    streamPollersByChat.delete(key);
  }

  function getStreamPolling(chatId) {
    if (!chatId) return null;
    return streamPollersByChat.get(String(chatId)) || null;
  }

  function startStreamPolling(chatId, messageId, { onMessage, onStop, onTimeout } = {}) {
    if (!chatId || !messageId) return;
    const key = String(chatId);
    if (resumeStreamsByChat.has(key)) return;
    const existing = streamPollersByChat.get(key);
    if (existing && String(existing.messageId) === String(messageId)) return;
    if (existing) stopStreamPolling(chatId);

    const startedAt = Date.now();
    let failures = 0;
    const handlePollTimeout = () => {
      if (Date.now() - startedAt > pollTimeoutMs) {
        if (typeof onTimeout === 'function') onTimeout();
        stopStreamPolling(chatId);
        return true;
      }
      return false;
    };

    const handlePollError = () => {
      failures += 1;
      if (failures >= 3) {
        if (typeof onStop === 'function') onStop();
        stopStreamPolling(chatId);
      }
    };

    // fallow-ignore-next-line complexity
    const handleOkResponse = async (res) => {
      failures = 0;
      const data = await res.json();
      const msg = data?.message;
      if (!msg) return;
      const status = String(msg?.status || '');
      const isRunning =
        msg?.role === 'assistant' && (status === 'streaming' || status === 'tool_running');
      if (typeof onMessage === 'function') {
        onMessage(msg, { isRunning, failures, startedAt });
      }
      if (!isRunning) {
        if (typeof onStop === 'function') onStop();
        stopStreamPolling(chatId);
      }
    };

    const handleErrorResponse = (res) => {
      failures += 1;
      if (res.status === 404 || failures >= 3) {
        if (typeof onStop === 'function') onStop();
        stopStreamPolling(chatId);
      }
      return;
    };

    const poll = async () => {
      if (handlePollTimeout()) return;

      try {
        const res = await apiFetch(`/api/chats/${chatId}/messages/${messageId}/status`);
        if (!res.ok) {
          handleErrorResponse(res);
          return;
        }
        await handleOkResponse(res);
      } catch {
        handlePollError();
      }
    };

    const timer = setInterval(poll, pollIntervalMs);
    streamPollersByChat.set(key, { timer, messageId, startedAt });
    poll();
  }

  function getResumeStream(chatId) {
    if (!chatId) return null;
    return resumeStreamsByChat.get(String(chatId)) || null;
  }

  function setResumeStream(chatId, entry) {
    if (!chatId) return;
    resumeStreamsByChat.set(String(chatId), entry);
  }

  function clearResumeStream(chatId, controller) {
    if (!chatId) return;
    const key = String(chatId);
    const existing = resumeStreamsByChat.get(key);
    if (!existing) return;
    if (controller && existing.controller !== controller) return;
    resumeStreamsByChat.delete(key);
  }

  function stopResumeStream(chatId) {
    if (!chatId) return;
    const key = String(chatId);
    const existing = resumeStreamsByChat.get(key);
    if (!existing) return;
    try {
      existing.controller.abort();
    } catch {
      // ignore abort race
    }
    resumeStreamsByChat.delete(key);
  }

  function dispose() {
    streamPollersByChat.forEach((poller) => clearInterval(poller.timer));
    streamPollersByChat.clear();
    resumeStreamsByChat.forEach((entry) => {
      try {
        entry.controller.abort();
      } catch {
        // ignore abort race
      }
    });
    resumeStreamsByChat.clear();
  }

  return {
    getRunningMessageId,
    stopStreamPolling,
    getStreamPolling,
    startStreamPolling,
    getResumeStream,
    setResumeStream,
    clearResumeStream,
    stopResumeStream,
    dispose,
  };
}
