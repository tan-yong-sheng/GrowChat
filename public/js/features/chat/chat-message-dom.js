export function createChatMessageDom({
  messagesList,
  state,
  setState,
  renderAssistantMessageBody,
  errorExpandedByMessageId,
  thinkingActiveByMessageId,
  thinkingDurationByMessageId,
  toolCallsByMessageId,
  thinkingCollapsedByKey,
  toolExpandedByKey,
  messageBlocksById,
}) {
  const stateMaps = {
    errorExpandedByMessageId,
    thinkingActiveByMessageId,
    thinkingDurationByMessageId,
    toolCallsByMessageId,
    thinkingCollapsedByKey,
    toolExpandedByKey,
    messageBlocksById,
  };

  function updateMessageContentDom(messageId, content, options = {}) {
    if (!messageId) return false;
    const el = messagesList?.querySelector?.(`[data-message-content="${messageId}"]`);
    if (!el) return false;
    const { isError = false, isStreaming = false, errorMessage = '', chatId = state.activeChatId } = options;
    const forceError = isError || el.dataset.messageError === '1';
    if (forceError) {
      el.dataset.messageError = '1';
    }
    el.innerHTML = renderAssistantMessageBody({
      messageId,
      content,
      errorMessage,
      isError: forceError,
      isStreaming,
      chatId,
      stateMaps,
    });
    return true;
  }

  function applyAssistantErrorMessage(chatId, messageId, errorText) {
    if (!chatId || !messageId) return;
    const safeText = String(errorText || 'Request failed.');
    setState((prev) => {
      const currentMessages = [...(prev.messagesByChat[chatId] || [])];
      const targetIdx = currentMessages.findIndex((m) => String(m.id) === String(messageId));
      if (targetIdx < 0) return prev;
      currentMessages[targetIdx] = {
        ...currentMessages[targetIdx],
        content: safeText,
        done: true,
        status: 'error',
        error_message: safeText,
      };
      return { ...prev, messagesByChat: { ...prev.messagesByChat, [chatId]: currentMessages } };
    });
    if (state.activeChatId === chatId) {
      updateMessageContentDom(messageId, safeText, { isError: true, isStreaming: false });
    }
  }

  return {
    updateMessageContentDom,
    applyAssistantErrorMessage,
  };
}

