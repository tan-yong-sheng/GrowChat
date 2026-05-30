/**
 * Shared optimistic message setup for chat streaming
 *
 * Creates temporary user and assistant messages in the local state
 * for optimistic UI updates during streaming. Used by
 * chat-message-actions.js (edit+branch) and chat-message-stream-send.js
 * (new message).
 */

/**
 * Create optimistic temp messages for a streaming request
 * @param {Object} ctx
 * @param {string} ctx.chatId - Active chat ID
 * @param {string} ctx.branchParentId - Parent message ID
 * @param {string} ctx.userContent - Content for the user message
 * @param {Array} [ctx.userAttachments=[]] - Attachments for the user message
 * @param {string} ctx.activeModelId - Current model ID
 * @param {Object} ctx.state - App state
 * @param {Function} ctx.setState - State setter
 * @param {Function} ctx.registerPendingTempMessage - Register temp message
 * @param {Function} ctx.setBranchSelection - Set branch selection
 * @param {Map} ctx.currentLeafByChatId - Current leaf tracking
 * @param {Function} ctx.drawMessages - Draw messages callback
 * @returns {{ tempUserId: string, tempAssistantId: string, localMessages: Array, nowTs: number }}
 */
export function createOptimisticTempMessages({
  chatId,
  branchParentId,
  userContent,
  userAttachments = [],
  activeModelId,
  state,
  setState,
  registerPendingTempMessage,
  setBranchSelection,
  currentLeafByChatId,
  drawMessages,
}) {
  const tempUserId = `temp-user-${Date.now()}`;
  const tempAssistantId = `temp-assistant-${Date.now()}`;
  const nowTs = Math.floor(Date.now() / 1000);

  const localMessages = [...(state.messagesByChat[chatId] || [])];

  const tempUserMessage = {
    id: tempUserId,
    role: 'user',
    content: userContent,
    model: activeModelId,
    attachments: userAttachments,
    parent_id: branchParentId,
    created_at: nowTs,
    done: true,
  };
  localMessages.push(tempUserMessage);
  registerPendingTempMessage(chatId, tempUserMessage);
  setBranchSelection(chatId, branchParentId, tempUserId);

  localMessages.push({
    id: tempAssistantId,
    role: 'assistant',
    content: '',
    model: activeModelId,
    parent_id: tempUserId,
    created_at: nowTs + 1,
    done: false,
  });
  registerPendingTempMessage(chatId, {
    id: tempAssistantId,
    role: 'assistant',
    content: '',
    parent_id: tempUserId,
    created_at: nowTs + 1,
  });

  currentLeafByChatId.set(chatId, tempAssistantId);
  setState((prev) => ({
    messagesByChat: { ...prev.messagesByChat, [chatId]: localMessages },
  }));
  if (state.activeChatId === chatId) drawMessages(localMessages);

  return { tempUserId, tempAssistantId, localMessages, nowTs };
}
