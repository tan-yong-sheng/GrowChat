function clearStreamPolling(streamSession, chatId) {
  streamSession.stopStreamPolling(chatId);
  streamSession.stopResumeStream(chatId);
}

async function postCancel(apiFetch, chatId, messageId) {
  try {
    await apiFetch(`/api/chats/${chatId}/messages/${messageId}/cancel`, { method: 'POST' });
  } catch {
    // Ignore cancellation errors and proceed with local cleanup.
  }
}

function findMessageIndex(messagesByChat, chatId, messageId) {
  const messages = [...(messagesByChat[chatId] || [])];
  const idx = messages.findIndex((m) => String(m?.id || '') === String(messageId));
  return { messages, idx };
}

function buildCancelledMessage(existing) {
  return {
    ...existing,
    status: 'cancelled',
    error_code: existing.error_code || 'cancelled',
    error_message: existing.error_message || 'Cancelled by user',
    done: true,
  };
}

function clearAbortIfActive(chatId, activeChatId, abortOps) {
  const activeStreamAbort = abortOps.get();
  if (activeStreamAbort && activeChatId === chatId) {
    abortOps.clear(activeStreamAbort);
    abortOps.set(null);
  }
}

export function createChatStreamState({
  state,
  setState,
  apiFetch,
  streamSession,
  streamingOverrideByChat,
  drawMessages = () => {},
  getActiveStreamAbort = () => null,
  setActiveStreamAbort = () => {},
  clearGlobalStreamAbort = () => {},
}) {
  const setStreamingState = (chatId, streaming) => {
    if (!chatId) return;
    setState((prev) => ({
      ui: {
        ...prev.ui,
        streaming,
        streamingChatId: streaming
          ? String(chatId)
          : prev.ui.streamingChatId === String(chatId)
            ? null
            : prev.ui.streamingChatId,
      },
    }));
    if (!streaming) {
      clearStreamPolling(streamSession, chatId);
    }
  };

  const requestCancelStream = async (chatId, messageId) => {
    if (!chatId || !messageId) return false;

    await postCancel(apiFetch, chatId, messageId);
    streamingOverrideByChat.delete(chatId);
    setStreamingState(chatId, false);
    clearStreamPolling(streamSession, chatId);

    const { messages, idx } = findMessageIndex(state.messagesByChat, chatId, messageId);
    if (idx >= 0) {
      messages[idx] = buildCancelledMessage(messages[idx] || {});
      setState((prev) => ({ messagesByChat: { ...prev.messagesByChat, [chatId]: messages } }));
      if (state.activeChatId === chatId) drawMessages(messages);
    }

    clearAbortIfActive(chatId, state.activeChatId, {
      get: getActiveStreamAbort,
      clear: clearGlobalStreamAbort,
      set: setActiveStreamAbort,
    });
    return true;
  };

  return {
    setStreamingState,
    requestCancelStream,
  };
}
