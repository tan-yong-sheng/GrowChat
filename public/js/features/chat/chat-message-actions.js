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
  const getEditTextarea = (messagesList, originalId) =>
    messagesList.querySelector(`.edit-message-textarea[data-message-id="${originalId}"]`);

  const getEditNewContent = (textarea) => (textarea && textarea.value ? textarea.value.trim() : '');

  const findSourceMessage = (originalId) =>
    getMessageById(chatId, originalId) ||
    projectedMessages.find((msg) => String(msg.id) === String(originalId));

  const resolveAssistantEditId = async (originalId) => {
    if (!isTempMessageId(originalId)) return originalId;
    const resolved = await waitForResolvedMessageId(state.activeChatId, originalId);
    if (!resolved) {
      showToast('Message still saving. Please wait.');
      return null;
    }
    return resolved;
  };

  const handleEditApiResponse = async (res, originalId, id) => {
    if (res.ok) {
      const newEditing = { ...state.ui.editingMessages };
      delete newEditing[originalId];
      delete newEditing[id];
      setState({ ui: { ...state.ui, editingMessages: newEditing } });
      await loadMessages(chatId, {
        draw: state.activeChatId === chatId,
        updateActiveModel: state.activeChatId === chatId,
      });
      return;
    }
    const err = await res.json().catch(() => ({}));
    alert(err.error || err.message || 'Failed to update message');
  };

  const withEditErrorHandling = async (fn) => {
    try {
      return await fn();
    } catch (e) {
      console.error('Update failed', e);
      alert('An error occurred while updating the message.');
    }
  };

  const runAssistantSaveEdit = async (originalId, newContent) => {
    const id = await resolveAssistantEditId(originalId);
    if (!id) return;
    await withEditErrorHandling(async () => {
      const res = await apiFetch(`/api/chats/${chatId}/messages/${id}`, {
        method: 'PUT',
        body: JSON.stringify({ content: newContent }),
      });
      await handleEditApiResponse(res, originalId, id);
    });
  };

  const getBranchMetadata = (sourceMsg) => ({
    branchParentId: sourceMsg.parent_id || null,
    sourceAttachments: Array.isArray(sourceMsg.attachments) ? sourceMsg.attachments : [],
    attachmentIds: Array.from(
      new Set(sourceMsg.attachments.map((item) => item && item.id).filter(Boolean))
    ),
  });

  const buildTempUserMessage = (
    tempUserId,
    newContent,
    state,
    sourceAttachments,
    branchParentId,
    nowTs
  ) => ({
    id: tempUserId,
    role: 'user',
    content: newContent,
    model: state.activeModelId,
    attachments: sourceAttachments,
    parent_id: branchParentId,
    created_at: nowTs,
    done: true,
  });

  const buildTempAssistantMessage = (tempAssistantId, state, tempUserId, nowTs) => ({
    id: tempAssistantId,
    role: 'assistant',
    content: '',
    model: state.activeModelId,
    parent_id: tempUserId,
    created_at: nowTs + 1,
    done: false,
  });

  const prepareBranchEditState = (originalId, newContent, meta) => {
    const { branchParentId, sourceAttachments } = meta;
    const newEditing = { ...state.ui.editingMessages };
    delete newEditing[originalId];
    setState({ ui: { ...state.ui, editingMessages: newEditing } });
    const tempUserId = `temp-user-${Date.now()}`;
    const tempAssistantId = `temp-assistant-${Date.now()}`;
    const nowTs = Math.floor(Date.now() / 1000);
    const localMessages = [...(state.messagesByChat[chatId] || [])];
    const tempUserMessage = buildTempUserMessage(
      tempUserId,
      newContent,
      state,
      sourceAttachments,
      branchParentId,
      nowTs
    );
    localMessages.push(tempUserMessage);
    registerPendingTempMessage(chatId, tempUserMessage);
    setBranchSelection(chatId, branchParentId, tempUserId);
    localMessages.push(buildTempAssistantMessage(tempAssistantId, state, tempUserId, nowTs));
    currentLeafByChatId.set(chatId, tempAssistantId);
    setState((prev) => ({
      messagesByChat: { ...prev.messagesByChat, [chatId]: localMessages },
    }));
    if (state.activeChatId === chatId) drawMessages(localMessages);
    return { tempUserId, tempAssistantId, nowTs };
  };

  const callBranchApi = (sourceId, prepared, newContent, controller) =>
    apiFetch(`/api/chats/${chatId}/messages/${sourceId}/branch`, {
      method: 'POST',
      body: JSON.stringify({
        content: newContent,
        model: state.activeModelId || undefined,
        ...(prepared.attachmentIds.length ? { attachments: prepared.attachmentIds } : {}),
      }),
      signal: controller.signal,
    });

  const handleBranchApiError = async (res, prepared) => {
    const err = await res.json().catch(() => ({}));
    const message = formatApiErrorMessage(err, 'Failed to connect to the server.');
    applyAssistantErrorMessage(chatId, prepared.tempAssistantId, message);
  };

  const finalizeBranchStream = () => {
    streamingOverrideByChat.delete(chatId);
    clearGlobalStreamAbort(getActiveStreamAbort());
    setActiveStreamAbort(null);
    setStreamingState(chatId, false);
  };

  const handleBranchStreamError = async (e, prepared, getStreamState) => {
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
      tempUserId: prepared.tempUserId,
      loadMessages,
      activeModelId: state.activeModelId,
      activeChatId: state.activeChatId,
    });
  };

  const isNotAbortError = (e) => e && e.name !== 'AbortError';

  const withStreamLifecycle = async (fn, prepared, getStreamState) => {
    try {
      return await fn();
    } catch (e) {
      if (isNotAbortError(e)) {
        await handleBranchStreamError(e, prepared, getStreamState);
      }
    } finally {
      finalizeBranchStream();
    }
  };

  const runBranchStreamRequest = async (sourceId, prepared, newContent, controller) => {
    const { onEvent, onDelta, getStreamState } = buildSseStreamHandlersContext({
      chatId,
      tempAssistantId: prepared.tempAssistantId,
      tempUserId: prepared.tempUserId,
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

    await withStreamLifecycle(
      async () => {
        setStreamingState(chatId, true);
        const res = await callBranchApi(sourceId, prepared, newContent, controller);
        if (!res.ok || !res.body) {
          await handleBranchApiError(res, prepared);
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
          tempUserId: prepared.tempUserId,
          loadMessages,
          activeModelId: state.activeModelId,
          activeChatId: state.activeChatId,
        });
      },
      prepared,
      getStreamState
    );
  };

  const dispatchBranchStream = (sourceId, prepared, newContent, controller) => {
    if (isTempMessageId(sourceId)) {
      waitForResolvedMessageId(chatId, sourceId).then((resolved) => {
        if (!resolved) {
          showToast('Message still saving. Please wait.');
          return;
        }
        runBranchStreamRequest(resolved, prepared, newContent, controller);
      });
    } else {
      runBranchStreamRequest(sourceId, prepared, newContent, controller);
    }
  };

  const runUserBranchSaveEdit = (originalId, newContent, sourceMsg) => {
    const meta = getBranchMetadata(sourceMsg);
    const prepared = { ...meta, ...prepareBranchEditState(originalId, newContent, meta) };
    const controller = new AbortController();
    setActiveStreamAbort(() => controller.abort());
    setGlobalStreamAbort(getActiveStreamAbort());
    dispatchBranchStream(originalId, prepared, newContent, controller);
  };

  messagesList.querySelectorAll('.save-edit-btn').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const originalId = btn.getAttribute('data-message-id');
      const textarea = getEditTextarea(messagesList, originalId);
      const newContent = getEditNewContent(textarea);
      if (!newContent) return;
      const sourceMsg = findSourceMessage(originalId);
      if (!sourceMsg) return;
      if (sourceMsg.role === 'assistant') {
        await runAssistantSaveEdit(originalId, newContent);
        return;
      }
      runUserBranchSaveEdit(originalId, newContent, sourceMsg);
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
