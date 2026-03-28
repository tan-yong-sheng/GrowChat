export function applyStreamingAssistantText({
  state,
  setState = () => {},
  streamingOverrideByChat = new Map(),
  updateMessageContentDom = () => {},
  chatId,
  messageId,
  assistantText = '',
  errorActive = false,
  errorMessage = null,
  streaming = true,
} = {}) {
  if (!chatId || !messageId) return;

  streamingOverrideByChat.set(chatId, {
    targetMsgId: messageId,
    content: assistantText,
  });

  const currentMessages = [...(state.messagesByChat[chatId] || [])];
  const targetIdx = currentMessages.findIndex((m) => String(m.id) === String(messageId));
  if (targetIdx >= 0) {
    currentMessages[targetIdx] = {
      ...currentMessages[targetIdx],
      content: assistantText,
      status: errorActive ? 'error' : currentMessages[targetIdx].status,
      error_message: errorActive ? errorMessage : currentMessages[targetIdx].error_message,
    };
    setState((prev) => ({
      messagesByChat: { ...prev.messagesByChat, [chatId]: currentMessages },
    }));
  }

  if (state.activeChatId === chatId) {
    updateMessageContentDom(messageId, assistantText, { isError: errorActive, isStreaming: streaming });
  }
}
