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
      streamSession.stopStreamPolling(chatId);
      streamSession.stopResumeStream(chatId);
    }
  };

  const requestCancelStream = async (chatId, messageId) => {
    if (!chatId || !messageId) return false;
    try {
      await apiFetch(`/api/chats/${chatId}/messages/${messageId}/cancel`, { method: 'POST' });
    } catch {
      // Ignore cancellation errors and proceed with local cleanup.
    }

    streamingOverrideByChat.delete(chatId);
    setStreamingState(chatId, false);
    streamSession.stopStreamPolling(chatId);
    streamSession.stopResumeStream(chatId);

    const messages = [...(state.messagesByChat[chatId] || [])];
    const idx = messages.findIndex((m) => String(m?.id || '') === String(messageId));
    if (idx >= 0) {
      const existing = messages[idx] || {};
      messages[idx] = {
        ...existing,
        status: 'cancelled',
        error_code: existing.error_code || 'cancelled',
        error_message: existing.error_message || 'Cancelled by user',
        done: true,
      };
      setState((prev) => ({ messagesByChat: { ...prev.messagesByChat, [chatId]: messages } }));
      if (state.activeChatId === chatId) drawMessages(messages);
    }

    const activeStreamAbort = getActiveStreamAbort();
    if (activeStreamAbort && state.activeChatId === chatId) {
      clearGlobalStreamAbort(activeStreamAbort);
      setActiveStreamAbort(null);
    }
    return true;
  };

  return {
    setStreamingState,
    requestCancelStream,
  };
}
