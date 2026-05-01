import { applyStreamingAssistantText } from './chat-message-stream-assistant.js';
import {
  prepareOptimisticConversation,
  promoteOptimisticConversation,
  rollbackOptimisticConversation,
} from './chat-message-stream-temp-chat.js';

export async function startChatSendMessage({
  text,
  hooks = {},
  options = {},
  state,
  setState = () => {},
  apiFetch,
  syncChatUrl = () => {},
  drawMessages = () => {},
  buildTempChat = () => null,
  pruneTempChats = (list) => list,
  getDraftAttachments = () => [],
  getDraftToolNames = () => null,
  setDraftAttachments = () => {},
  updateChatTitleLocal = () => {},
  currentLeafByChatId = new Map(),
  registerPendingTempMessage = () => {},
  setBranchSelection = () => {},
  streamingOverrideByChat = new Map(),
  setGlobalStreamAbort = () => {},
  clearGlobalStreamAbort = () => {},
  setStreamingState = () => {},
  setActiveStreamAbort = () => {},
  consumeSseTextStream,
  appendBlock = () => {},
  ensureThinkingBlock = () => {},
  updateToolCallState = () => {},
  notePayloadSeq = () => {},
  buildFallbackAssistantMessage = () => null,
  formatApiErrorMessage = (_, fallback) => fallback || 'Request failed.',
  updateMessageContentDom = () => {},
  applyAssistantErrorMessage = () => {},
  loadMessages = async () => {},
  thinkingStartByMessageId = new Map(),
  thinkingDurationByMessageId = new Map(),
  thinkingActiveByMessageId = new Map(),
  messageBlocksById = new Map(),
  toolCallsByMessageId = new Map(),
  isTempChatId = () => false,
  replaceTempMessageId = () => {},
  resolveTempMessageId = (_, id) => id,
} = {}) {
  const optimistic = prepareOptimisticConversation({
    state,
    setState,
    text,
    buildTempChat,
    pruneTempChats,
    syncChatUrl,
    updateChatTitleLocal,
    isTempChatId,
  });
  let chatId = optimistic.chatId;
  let tempChatId = optimistic.tempChatId;
  const hadMessagesBefore = optimistic.hadMessagesBefore;
  const optimisticAutoTitle = optimistic.autoTitle || null;

  const branchParentId = currentLeafByChatId.get(chatId) || null;
  const tempUserId = `temp-user-${Date.now()}`;
  const tempAssistantId = `temp-assistant-${Date.now()}`;
  const nowTs = Math.floor(Date.now() / 1000);
  let localMessages = [...(state.messagesByChat[chatId] || [])];
  const draftAttachments = getDraftAttachments(chatId);
  const tempUserMessage = {
    id: tempUserId,
    role: 'user',
    content: text,
    model: state.activeModelId,
    attachments: draftAttachments,
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

  if (tempChatId) {
    const modelToUse = state.activeModelId || state.defaultModelId || state.globalDefaultModelId;
    const payload = modelToUse ? { model: modelToUse } : {};
    const res = await apiFetch('/api/chats', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      rollbackOptimisticConversation({
        state,
        setState,
        tempChatId,
        isTempChatId,
      });
      hooks.onFinished?.();
      return;
    }
    const data = await res.json();
    const realChatId = promoteOptimisticConversation({
      state,
      setState,
      tempChatId,
      realChat: data.chat,
      currentLeafByChatId,
      streamingOverrideByChat,
      syncChatUrl,
    });
    chatId = realChatId;

    if (optimisticAutoTitle) {
      apiFetch(`/api/chats/${realChatId}`, {
        method: 'PUT',
        body: JSON.stringify({ title: optimisticAutoTitle }),
      }).catch(() => {});
    }
  }

  if (!optimisticAutoTitle) {
    const existingChat = state.chats.find((chat) => String(chat.id) === String(chatId));
    if (!hadMessagesBefore && (!existingChat?.title || existingChat.title === 'New Chat')) {
      const snippet = String(text).trim().replace(/\s+/g, ' ').slice(0, 60);
      if (snippet) {
        updateChatTitleLocal(chatId, snippet);
        if (!String(chatId).startsWith('temp-')) {
          apiFetch(`/api/chats/${chatId}`, {
            method: 'PUT',
            body: JSON.stringify({ title: snippet }),
          }).catch(() => {});
        }
      }
    }
  }

  const controller = new AbortController();
  const abortHandler = () => controller.abort();
  setActiveStreamAbort(abortHandler);
  setGlobalStreamAbort(abortHandler);
  hooks.onAbortable?.(abortHandler);

  let res;
  setStreamingState(chatId, true);
  try {
    const attachmentIds = (draftAttachments || []).map((item) => item?.id).filter(Boolean);
    const selectedToolNames = Array.isArray(options.selectedToolNames)
      ? options.selectedToolNames.filter(Boolean)
      : Array.isArray(getDraftToolNames(chatId))
        ? getDraftToolNames(chatId).filter(Boolean)
        : null;
    const payload = {
      message: text,
      model: state.activeModelId || undefined,
      ...(attachmentIds.length ? { attachments: attachmentIds } : {}),
      ...(selectedToolNames !== null ? { selected_tool_names: selectedToolNames } : {}),
    };
    res = await apiFetch(`/api/chats/${chatId}/messages`, {
      method: 'POST',
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
  } catch (err) {
    setStreamingState(chatId, false);
    const isAbort = err?.name === 'AbortError';
    if (isAbort) {
      if (localMessages.length > 0) {
        localMessages[localMessages.length - 1].done = true;
        localMessages[localMessages.length - 1].content = 'Stopped.';
        setState((prev) => ({
          messagesByChat: { ...prev.messagesByChat, [chatId]: localMessages },
        }));
        if (state.activeChatId === chatId) drawMessages(localMessages);
      }
    } else {
      applyAssistantErrorMessage(chatId, tempAssistantId, 'Failed to connect to the server.');
    }
    return;
  }

  if (!res.ok || !res.body) {
    setStreamingState(chatId, false);
    let errorText = 'Failed to connect to the server.';
    try {
      const errPayload = await res.json();
      errorText = formatApiErrorMessage(errPayload, errorText);
    } catch {
      // ignore response parse failure
    }
    applyAssistantErrorMessage(chatId, tempAssistantId, errorText);
    return;
  }

  if (draftAttachments.length > 0) {
    setDraftAttachments(chatId, []);
  }

  let assistantMessageId = tempAssistantId;
  let errorMessage = null;
  let errorActive = false;
  let assistantText = '';

  function applyAssistantText(streaming = true) {
    applyStreamingAssistantText({
      state,
      setState,
      streamingOverrideByChat,
      updateMessageContentDom,
      chatId,
      messageId: assistantMessageId,
      assistantText,
      errorActive,
      errorMessage,
      streaming,
    });
  }

  await consumeSseTextStream(res.body, {
    onEvent: (payload) => {
      if (payload?.event === 'start' && payload?.user_message_id) {
        const nextId = String(payload.user_message_id);
        replaceTempMessageId(chatId, tempUserId, nextId);
        currentLeafByChatId.set(chatId, nextId);
      }
      if (payload?.event === 'start' && payload?.message_id) {
        assistantMessageId = String(payload.message_id);
        replaceTempMessageId(chatId, tempAssistantId, assistantMessageId);
        currentLeafByChatId.set(chatId, assistantMessageId);
        if (!thinkingActiveByMessageId.has(String(assistantMessageId))) {
          thinkingActiveByMessageId.set(String(assistantMessageId), true);
        }
        if (!thinkingStartByMessageId.has(String(assistantMessageId))) {
          thinkingStartByMessageId.set(String(assistantMessageId), Date.now());
        }
        applyAssistantText(true);
      }
      if (payload?.event === 'reasoning_start') {
        if (!thinkingStartByMessageId.has(String(assistantMessageId))) {
          thinkingStartByMessageId.set(String(assistantMessageId), Date.now());
        }
        thinkingActiveByMessageId.set(String(assistantMessageId), true);
        ensureThinkingBlock(messageBlocksById, assistantMessageId);
        applyAssistantText(true);
      }
      if (payload?.event === 'reasoning_delta') {
        const delta = String(payload.delta || '');
        if (delta) {
          appendBlock(messageBlocksById, assistantMessageId, 'thinking', delta);
          thinkingActiveByMessageId.set(String(assistantMessageId), true);
          applyAssistantText(true);
        }
      }
      if (payload?.event === 'reasoning_end') {
        const duration = Number(payload.duration_ms);
        if (Number.isFinite(duration) && duration > 0) {
          thinkingDurationByMessageId.set(String(assistantMessageId), duration);
        }
        thinkingActiveByMessageId.delete(String(assistantMessageId));
      }
      if (payload?.event === 'tool_status' || payload?.event === 'tool_result') {
        const targetId = String(payload?.message_id || assistantMessageId);
        updateToolCallState(toolCallsByMessageId, messageBlocksById, targetId, payload);
        applyAssistantText();
      }
      if (payload?.error) {
        errorMessage = payload.message || payload.error || 'LLM request failed';
        errorActive = true;
        const label = `Error: ${errorMessage}`;
        assistantText = assistantText ? `${assistantText}\n\n${label}` : label;
        applyAssistantText();
      }
      notePayloadSeq(payload, assistantMessageId);
    },
    onDelta: (delta) => {
      if (!delta) return;
      assistantText += delta;
      appendBlock(messageBlocksById, assistantMessageId, 'text', delta);
      applyAssistantText();
    },
  });

  try {
    const startedAt = thinkingStartByMessageId.get(String(assistantMessageId));
    if (startedAt && !thinkingDurationByMessageId.has(String(assistantMessageId))) {
      thinkingDurationByMessageId.set(String(assistantMessageId), Date.now() - startedAt);
    }
    thinkingActiveByMessageId.delete(String(assistantMessageId));
    applyAssistantText(false);
    streamingOverrideByChat.delete(chatId);
    const fallback = buildFallbackAssistantMessage(chatId, assistantMessageId, {
      content: assistantText,
      errorActive,
      errorMessage,
      model: state.activeModelId,
      parentId: resolveTempMessageId(chatId, tempUserId),
    });
    await loadMessages(chatId, {
      draw: state.activeChatId === chatId,
      updateActiveModel: state.activeChatId === chatId,
      fallbackMessage: fallback,
    });
  } catch (err) {
    if (err?.name !== 'AbortError') {
      console.error('Stream error:', err);
      if (!errorActive) {
        errorMessage = String(err?.message || 'LLM request failed');
        errorActive = true;
        assistantText = '';
        applyAssistantText(false);
      }
      const fallback = buildFallbackAssistantMessage(chatId, assistantMessageId, {
        content: assistantText,
        errorActive,
        errorMessage,
        model: state.activeModelId,
        parentId: resolveTempMessageId(chatId, tempUserId),
      });
      await loadMessages(chatId, {
        draw: state.activeChatId === chatId,
        updateActiveModel: state.activeChatId === chatId,
        fallbackMessage: fallback,
      });
    }
  } finally {
    streamingOverrideByChat.delete(chatId);
    clearGlobalStreamAbort(abortHandler);
    setActiveStreamAbort(null);
    setStreamingState(chatId, false);
    hooks.onFinished?.();
  }
}
