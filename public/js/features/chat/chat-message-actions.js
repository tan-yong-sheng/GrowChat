import { isTempMessageId } from '../../shared/utils/chat-cache.js';
import { applyStreamingAssistantText } from './chat-message-stream-assistant.js';
import { createOptimisticTempMessages } from '../../shared/utils/optimistic-messages.js';
import {
  finalizeStreamAndLoadMessages,
  handleStreamCatchError,
} from '../../shared/utils/sse-event-handler.js';
import {
  buildStreamingCallback,
  buildSseStreamHandlersContext,
  CHAT_MESSAGE_PARAM_NAMES,
} from './chat-message-params.js';
import { bindChatMessageDeleteActions } from './chat-message-delete-actions.js';
import { bindChatMessageRetryActions } from './chat-message-retry-actions.js';
import { bindChatMessageUiActions } from './chat-message-ui-actions.js';
// fallow-ignore-next-line code-duplication — shared param names
// See CHAT_MESSAGE_PARAM_NAMES in chat-message-params.js for the canonical list
export function bindChatMessageActions({
  messagesList,
  messages,
  projectedMessages,
  roundsByMessageId,
  state,
  setState,
  drawMessages,
  chatId,
  errorExpandedByMessageId,
  showToast,
  apiFetch,
  loadMessages,
  waitForResolvedMessageId,
  getMessageById,
  resolveTempMessageId,
  replaceTempMessageId,
  registerPendingTempMessage,
  setBranchSelection,
  currentLeafByChatId,
  branchSelectionByChat,
  streamingOverrideByChat,
  setStreamingState,
  getActiveStreamAbort,
  setActiveStreamAbort,
  clearGlobalStreamAbort,
  setGlobalStreamAbort,
  consumeSseTextStream,
  appendBlock,
  ensureThinkingBlock,
  updateToolCallState,
  notePayloadSeq,
  buildFallbackAssistantMessage,
  formatApiErrorMessage,
  updateMessageContentDom,
  applyAssistantErrorMessage,
  openCitation,
  thinkingStartByMessageId,
  thinkingDurationByMessageId,
  thinkingActiveByMessageId,
  toolCallsByMessageId,
  messageBlocksById,
}) {
  if (!messagesList) return;
  bindChatMessageUiActions({
    messagesList,
    projectedMessages,
    state,
    apiFetch,
    chatId,
    errorExpandedByMessageId,
    roundsByMessageId,
    branchSelectionByChat,
    resolveTempMessageId,
    setState,
    drawMessages,
    messages,
    showToast,
    waitForResolvedMessageId,
    getMessageById,
    currentLeafByChatId,
    setBranchSelection,
    loadMessages,
  });
  messagesList.querySelectorAll('.save-edit-btn').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const originalId = btn.getAttribute('data-message-id');
      const textarea = messagesList.querySelector(
        `.edit-message-textarea[data-message-id="${originalId}"]`
      );
      const newContent = textarea?.value.trim() || '';
      if (!newContent) return;
      const sourceMsg =
        getMessageById(chatId, originalId) ||
        projectedMessages.find((msg) => String(msg.id) === String(originalId));
      if (!sourceMsg) return;
      if (sourceMsg?.role === 'assistant') {
        let id = originalId;
        if (isTempMessageId(id)) {
          const resolved = await waitForResolvedMessageId(state.activeChatId, id);
          if (!resolved) {
            showToast('Message still saving. Please wait.');
            return;
          }
          id = resolved;
        }
        try {
          const res = await apiFetch(`/api/chats/${chatId}/messages/${id}`, {
            method: 'PUT',
            body: JSON.stringify({ content: newContent }),
          });
          if (res.ok) {
            const newEditing = { ...state.ui.editingMessages };
            delete newEditing[originalId];
            delete newEditing[id];
            setState({ ui: { ...state.ui, editingMessages: newEditing } });
            await loadMessages(chatId, {
              draw: state.activeChatId === chatId,
              updateActiveModel: state.activeChatId === chatId,
            });
          } else {
            const err = await res.json().catch(() => ({}));
            alert(err.error || err.message || 'Failed to update message');
          }
        } catch (e) {
          console.error('Update failed', e);
          alert('An error occurred while updating the message.');
        }
        return;
      }
      const branchParentId = sourceMsg?.parent_id || null;
      const sourceAttachments = Array.isArray(sourceMsg?.attachments) ? sourceMsg.attachments : [];
      const attachmentIds = Array.from(
        new Set(sourceAttachments.map((item) => item?.id).filter(Boolean))
      );
      const newEditing = { ...state.ui.editingMessages };
      delete newEditing[originalId];
      setState({ ui: { ...state.ui, editingMessages: newEditing } });
      const tempUserId = `temp-user-${Date.now()}`;
      const tempAssistantId = `temp-assistant-${Date.now()}`;
      const nowTs = Math.floor(Date.now() / 1000);
      let localMessages = [...(state.messagesByChat[chatId] || [])];
      const tempUserMessage = {
        id: tempUserId,
        role: 'user',
        content: newContent,
        model: state.activeModelId,
        attachments: sourceAttachments,
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
        model: state.activeModelId,
        parent_id: tempUserId,
        created_at: nowTs + 1,
        done: false,
      });
      currentLeafByChatId.set(chatId, tempAssistantId);
      setState((prev) => ({
        messagesByChat: { ...prev.messagesByChat, [chatId]: localMessages },
      }));
      if (state.activeChatId === chatId) drawMessages(localMessages);

      const controller = new AbortController();
      setActiveStreamAbort(() => controller.abort());
      setGlobalStreamAbort(getActiveStreamAbort());
      const runBranchRequest = async (sourceId) => {
        const { onEvent, onDelta, getStreamState } = buildSseStreamHandlersContext({
          chatId,
          tempAssistantId,
          tempUserId,
          replaceTempMessageId,
          ensureThinkingBlock,
          appendBlock,
          updateToolCallState,
          notePayloadSeq,
          thinkingStartByMessageId,
          thinkingDurationByMessageId,
          thinkingActiveByMessageId,
          toolCallsByMessageId,
          messageBlocksById,
          resolveTempMessageId,
          errorStrategy: 'reset',
        });

        try {
          setStreamingState(chatId, true);
          const res = await apiFetch(`/api/chats/${chatId}/messages/${sourceId}/branch`, {
            method: 'POST',
            body: JSON.stringify({
              content: newContent,
              model: state.activeModelId || undefined,
              ...(attachmentIds.length ? { attachments: attachmentIds } : {}),
            }),
            signal: controller.signal,
          });
          if (!res.ok || !res.body) {
            const err = await res.json().catch(() => ({}));
            const message = formatApiErrorMessage(err, 'Failed to connect to the server.');
            applyAssistantErrorMessage(chatId, tempAssistantId, message);
            return;
          }
          await consumeSseTextStream(res.body, { onEvent, onDelta });
          await finalizeStreamAndLoadMessages({
            getStreamState,
            thinkingStartByMessageId,
            thinkingDurationByMessageId,
            thinkingActiveByMessageId,
            applyStreamingAssistantText,
            state,
            setState,
            streamingOverrideByChat,
            updateMessageContentDom,
            chatId,
            buildFallbackAssistantMessage,
            resolveTempMessageId,
            tempUserId,
            loadMessages,
            activeModelId: state.activeModelId,
            activeChatId: state.activeChatId,
          });
        } catch (e) {
          if (e?.name !== 'AbortError') {
            console.error('Branching failed', e);
            await handleStreamCatchError({
              error: e,
              getStreamState,
              applyStreamingAssistantText,
              state,
              setState,
              streamingOverrideByChat,
              updateMessageContentDom,
              chatId,
              buildFallbackAssistantMessage,
              resolveTempMessageId,
              tempUserId,
              loadMessages,
              activeModelId: state.activeModelId,
              activeChatId: state.activeChatId,
            });
          }
        } finally {
          streamingOverrideByChat.delete(chatId);
          clearGlobalStreamAbort(getActiveStreamAbort());
          setActiveStreamAbort(null);
          setStreamingState(chatId, false);
        }
      };
      const sourceId = originalId;
      if (isTempMessageId(sourceId)) {
        waitForResolvedMessageId(chatId, sourceId).then((resolved) => {
          if (!resolved) {
            showToast('Message still saving. Please wait.');
            return;
          }
          runBranchRequest(resolved);
        });
      } else {
        runBranchRequest(sourceId);
      }
    });
  });
  bindChatMessageDeleteActions({
    messagesList,
    chatId,
    state,
    setState,
    apiFetch,
    loadMessages,
    resolveTempMessageId,
    waitForResolvedMessageId,
    currentLeafByChatId,
    branchSelectionByChat,
    streamingOverrideByChat,
    getActiveStreamAbort,
    setActiveStreamAbort,
    clearGlobalStreamAbort,
    drawMessages,
    showToast,
  });
  bindChatMessageRetryActions({
    messagesList,
    chatId,
    state,
    setState,
    drawMessages,
    projectedMessages,
    apiFetch,
    loadMessages,
    waitForResolvedMessageId,
    showToast,
    getMessageById,
    resolveTempMessageId,
    replaceTempMessageId,
    setBranchSelection,
    currentLeafByChatId,
    streamingOverrideByChat,
    setStreamingState,
    getActiveStreamAbort,
    setActiveStreamAbort,
    clearGlobalStreamAbort,
    setGlobalStreamAbort,
    consumeSseTextStream,
    appendBlock,
    ensureThinkingBlock,
    updateToolCallState,
    notePayloadSeq,
    buildFallbackAssistantMessage,
    updateMessageContentDom,
    thinkingStartByMessageId,
    thinkingDurationByMessageId,
    thinkingActiveByMessageId,
    toolCallsByMessageId,
    messageBlocksById,
  });
  messagesList.querySelectorAll('[data-citation-id]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const id = btn.getAttribute('data-citation-id');
      if (!id) return;
      openCitation(id);
    });
  });
}
