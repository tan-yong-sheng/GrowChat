export function createChatStreamController({
  apiFetch,
  pollIntervalMs = 1500,
  pollTimeoutMs = 120000,
} = {}) {
  const streamPollersByChat = new Map();
  const resumeStreamsByChat = new Map();

  function getRunningMessageId(messages = []) {
    for (let i = messages.length - 1; i >= 0; i -= 1) {
      const msg = messages[i];
      const status = String(msg?.status || '');
      if (msg?.role === 'assistant' && (status === 'streaming' || status === 'tool_running')) {
        return msg.id;
      }
    }
    return null;
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
    const poll = async () => {
      if (Date.now() - startedAt > pollTimeoutMs) {
        if (typeof onTimeout === 'function') onTimeout();
        stopStreamPolling(chatId);
        return;
      }
      try {
        const res = await apiFetch(`/api/chats/${chatId}/messages/${messageId}/status`);
        if (!res.ok) {
          failures += 1;
          if (res.status === 404 || failures >= 3) {
            if (typeof onStop === 'function') onStop();
            stopStreamPolling(chatId);
          }
          return;
        }
        failures = 0;
        const data = await res.json();
        const msg = data?.message;
        if (!msg) return;
        const status = String(msg?.status || '');
        const isRunning = msg?.role === 'assistant' && (status === 'streaming' || status === 'tool_running');
        if (typeof onMessage === 'function') {
          onMessage(msg, { isRunning, failures, startedAt });
        }
        if (!isRunning) {
          if (typeof onStop === 'function') onStop();
          stopStreamPolling(chatId);
        }
      } catch {
        failures += 1;
        if (failures >= 3) {
          if (typeof onStop === 'function') onStop();
          stopStreamPolling(chatId);
        }
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
    } catch { }
    resumeStreamsByChat.delete(key);
  }

  function dispose() {
    streamPollersByChat.forEach((poller) => clearInterval(poller.timer));
    streamPollersByChat.clear();
    resumeStreamsByChat.forEach((entry) => {
      try {
        entry.controller.abort();
      } catch { }
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

