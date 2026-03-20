import { extractThinkingBlocks } from './chat-message-utils.js';

export function createChatMessageStream({
  state,
  setState = () => {},
  apiFetch,
  syncChatUrl = () => {},
  drawMessages = () => {},
  buildTempChat = () => null,
  pruneTempChats = (list) => list,
  getDraftAttachments = () => [],
  setDraftAttachments = () => {},
  updateChatTitleLocal = () => {},
  currentLeafByChatId = new Map(),
  registerPendingTempMessage = () => {},
  setBranchSelection = () => {},
  streamingOverrideByChat = new Map(),
  setGlobalStreamAbort = () => {},
  clearGlobalStreamAbort = () => {},
  setStreamingState = () => {},
  getActiveStreamAbort = () => null,
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
  getMessageById = () => null,
  loadMessages = async () => {},
  getMessageSeq = () => 0,
  extractThinkingBlocksFn = extractThinkingBlocks,
  thinkingStartByMessageId = new Map(),
  thinkingDurationByMessageId = new Map(),
  thinkingActiveByMessageId = new Map(),
  messageBlocksById = new Map(),
  toolCallsByMessageId = new Map(),
  streamSession = null,
  isTempChatId = () => false,
  replaceTempMessageId = () => {},
  resolveTempMessageId = (_, id) => id,
} = {}) {
  const stopStreamPolling = (chatId) => streamSession?.stopStreamPolling?.(chatId);
  const stopResumeStream = (chatId) => streamSession?.stopResumeStream?.(chatId);

  async function startResumeStream(chatId, messageId) {
    if (!chatId || !messageId) return;
    if (getActiveStreamAbort() && state.activeChatId === chatId) return;
    const existing = streamSession?.getResumeStream?.(chatId);
    if (existing && String(existing.messageId) === String(messageId)) return;
    if (existing) stopResumeStream(chatId);
    stopStreamPolling(chatId);

    const lastSeq = getMessageSeq(messageId);
    const controller = new AbortController();
    streamSession?.setResumeStream?.(chatId, { controller, messageId });
    setStreamingState(chatId, true);

    const existingMsg = getMessageById(chatId, messageId);
    let assistantText = '';
    if (lastSeq > 0 && existingMsg?.content) {
      assistantText = extractThinkingBlocksFn(existingMsg.content).cleaned || '';
    } else {
      messageBlocksById.delete(String(messageId));
      toolCallsByMessageId.delete(String(messageId));
    }

    let errorMessage = null;
    let errorActive = false;

    const applyAssistantText = (streaming = true) => {
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
    };

    try {
      const res = await apiFetch(`/api/chats/${chatId}/messages/${messageId}/resume?after_seq=${lastSeq}`, {
        signal: controller.signal,
      });
      if (!res.ok || !res.body) {
        stopResumeStream(chatId);
        streamSession?.startStreamPolling?.(chatId, messageId);
        return;
      }

      await consumeSseTextStream(res.body, {
        onEvent: (payload) => {
          notePayloadSeq(payload, messageId);
          if (payload?.event === 'reasoning_start') {
            if (!thinkingStartByMessageId.has(String(messageId))) {
              thinkingStartByMessageId.set(String(messageId), Date.now());
            }
            thinkingActiveByMessageId.set(String(messageId), true);
            ensureThinkingBlock(messageBlocksById, messageId);
            applyAssistantText(true);
          }
          if (payload?.event === 'reasoning_delta') {
            const delta = String(payload.delta || '');
            if (delta) {
              appendBlock(messageBlocksById, messageId, 'thinking', delta);
              thinkingActiveByMessageId.set(String(messageId), true);
              applyAssistantText(true);
            }
          }
          if (payload?.event === 'reasoning_end') {
            const duration = Number(payload.duration_ms);
            if (Number.isFinite(duration) && duration > 0) {
              thinkingDurationByMessageId.set(String(messageId), duration);
            }
            thinkingActiveByMessageId.delete(String(messageId));
          }
          if (payload?.event === 'tool_status' || payload?.event === 'tool_result') {
            updateToolCallState(toolCallsByMessageId, messageBlocksById, messageId, payload);
            applyAssistantText(true);
          }
          if (payload?.error) {
            errorMessage = payload.message || payload.error || 'LLM request failed';
            errorActive = true;
            assistantText = '';
            applyAssistantText(false);
          }
        },
        onDelta: (delta) => {
          if (!delta) return;
          assistantText += delta;
          appendBlock(messageBlocksById, messageId, 'text', delta);
          applyAssistantText(true);
        },
      });
      const startedAt = thinkingStartByMessageId.get(String(messageId));
      if (startedAt && !thinkingDurationByMessageId.has(String(messageId))) {
        thinkingDurationByMessageId.set(String(messageId), Date.now() - startedAt);
      }
      thinkingActiveByMessageId.delete(String(messageId));
      applyAssistantText(false);
      streamingOverrideByChat.delete(chatId);
      await loadMessages(chatId, {
        draw: state.activeChatId === chatId,
        updateActiveModel: state.activeChatId === chatId,
      });
    } catch (err) {
      if (err?.name !== 'AbortError') {
        console.error('Resume stream error:', err);
        streamSession?.startStreamPolling?.(chatId, messageId);
      }
    } finally {
      streamSession?.clearResumeStream?.(chatId, controller);
      if (state.activeChatId === chatId && !streamingOverrideByChat.has(chatId)) {
        setStreamingState(chatId, false);
      }
    }
  }

  async function sendSingleMessage(text, hooks = {}) {
    let chatId = state.activeChatId;
    let tempChatId = null;
    let autoTitle = null;
    const isTempChat = chatId && isTempChatId(chatId);
    const hadMessagesBefore = chatId ? (state.messagesByChat[chatId] || []).length > 0 : false;

    if (!chatId) {
      const tempChat = buildTempChat();
      tempChatId = tempChat.id;

      setState((prev) => ({
        chats: [tempChat, ...pruneTempChats(prev.chats)],
        activeChatId: tempChatId,
        activeModelId: prev.activeModelId || prev.defaultModelId || prev.globalDefaultModelId || tempChat.model,
      }));

      chatId = tempChatId;
      syncChatUrl(tempChatId);
    } else if (isTempChat) {
      tempChatId = chatId;
      const exists = state.chats.some((chat) => String(chat.id) === String(chatId));
      if (!exists) {
        const tempChat = buildTempChat(chatId);
        setState((prev) => ({
          chats: [tempChat, ...pruneTempChats(prev.chats)],
          activeChatId: chatId,
          activeModelId: prev.activeModelId || prev.defaultModelId || prev.globalDefaultModelId || tempChat.model,
        }));
      }
      syncChatUrl(chatId);
    }

    if (!state.attachmentsByChat?.[chatId] && (state.newChatAttachments || []).length > 0) {
      setState({
        attachmentsByChat: {
          ...(state.attachmentsByChat || {}),
          [chatId]: state.newChatAttachments,
        },
        newChatAttachments: [],
      });
    }

    if (tempChatId) {
      const existingChat = state.chats.find((chat) => String(chat.id) === String(chatId));
      if (!hadMessagesBefore && (!existingChat?.title || existingChat.title === 'New Chat')) {
        const snippet = String(text).trim().replace(/\s+/g, ' ').slice(0, 60);
        if (snippet) {
          autoTitle = snippet;
          updateChatTitleLocal(chatId, snippet);
        }
      }
    }

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
    setState((prev) => ({ messagesByChat: { ...prev.messagesByChat, [chatId]: localMessages } }));
    if (state.activeChatId === chatId) drawMessages(localMessages);

    if (tempChatId) {
      const modelToUse = state.activeModelId || state.defaultModelId || state.globalDefaultModelId;
      const payload = modelToUse ? { model: modelToUse } : {};
      const res = await apiFetch('/api/chats', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        setState((prev) => {
          const nextChats = prev.chats.filter((c) => String(c.id) !== String(tempChatId));
          const nextActiveChatId = prev.activeChatId === tempChatId ? (nextChats[0]?.id || null) : prev.activeChatId;
          const nextMessagesByChat = { ...prev.messagesByChat };
          delete nextMessagesByChat[tempChatId];
          return { chats: nextChats, activeChatId: nextActiveChatId, messagesByChat: nextMessagesByChat };
        });
        hooks.onFinished?.();
        return;
      }
      const data = await res.json();
      const realChatId = data.chat.id;

      setState((prev) => {
        let replaced = false;
        let nextChats = prev.chats.map((c) => {
          if (String(c.id) === String(tempChatId)) {
            replaced = true;
            const nextChat = { ...data.chat };
            if (c.title && c.title !== 'New Chat' && data.chat.title === 'New Chat') {
              nextChat.title = c.title;
            }
            return nextChat;
          }
          return c;
        });
        if (!replaced) {
          nextChats = [data.chat, ...nextChats];
        }
        const seen = new Set();
        const deduped = [];
        for (const chat of nextChats) {
          const key = String(chat.id);
          if (seen.has(key)) continue;
          seen.add(key);
          deduped.push(chat);
        }

        const nextMessagesByChat = { ...prev.messagesByChat };
        if (nextMessagesByChat[tempChatId]) {
          nextMessagesByChat[realChatId] = nextMessagesByChat[tempChatId];
          delete nextMessagesByChat[tempChatId];
        }
        const nextAttachmentsByChat = { ...(prev.attachmentsByChat || {}) };
        if (nextAttachmentsByChat[tempChatId]) {
          nextAttachmentsByChat[realChatId] = nextAttachmentsByChat[tempChatId];
          delete nextAttachmentsByChat[tempChatId];
        }
        return {
          chats: deduped,
          activeChatId: realChatId,
          activeModelId: prev.activeModelId || data.chat.model || prev.defaultModelId || prev.globalDefaultModelId,
          messagesByChat: nextMessagesByChat,
          attachmentsByChat: nextAttachmentsByChat,
        };
      });

      if (currentLeafByChatId.has(tempChatId)) {
        const leafId = currentLeafByChatId.get(tempChatId);
        currentLeafByChatId.delete(tempChatId);
        currentLeafByChatId.set(realChatId, leafId);
      }
      if (streamingOverrideByChat.has(tempChatId)) {
        const override = streamingOverrideByChat.get(tempChatId);
        streamingOverrideByChat.delete(tempChatId);
        streamingOverrideByChat.set(realChatId, override);
      }

      chatId = realChatId;
      syncChatUrl(realChatId);

      if (autoTitle) {
        apiFetch(`/api/chats/${realChatId}`, {
          method: 'PUT',
          body: JSON.stringify({ title: autoTitle }),
        }).catch(() => {});
      }
    }

    if (!autoTitle) {
      const existingChat = state.chats.find((chat) => String(chat.id) === String(chatId));
      if (!hadMessagesBefore && (!existingChat?.title || existingChat.title === 'New Chat')) {
        const snippet = String(text).trim().replace(/\s+/g, ' ').slice(0, 60);
        if (snippet) {
          autoTitle = snippet;
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
      const attachmentIds = (draftAttachments || [])
        .map((item) => item?.id)
        .filter(Boolean);
      const payload = {
        message: text,
        model: state.activeModelId || undefined,
        ...(attachmentIds.length ? { attachments: attachmentIds } : {}),
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
          setState((prev) => ({ messagesByChat: { ...prev.messagesByChat, [chatId]: localMessages } }));
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
      } catch {}
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
      streamingOverrideByChat.set(chatId, {
        targetMsgId: assistantMessageId,
        content: assistantText,
      });

      const currentMessages = [...(state.messagesByChat[chatId] || [])];
      const targetIdx = currentMessages.findIndex((m) => String(m.id) === String(assistantMessageId));
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
        updateMessageContentDom(assistantMessageId, assistantText, { isError: errorActive, isStreaming: streaming });
      }
    }

    await consumeSseTextStream(res.body, {
      onEvent: (payload) => {
        if (payload?.event === 'start' && payload?.user_message_id) {
          const nextId = String(payload.user_message_id);
          replaceTempMessageId(chatId, messageId, nextId);
          currentLeafByChatId.set(chatId, nextId);
        }
        if (payload?.event === 'start' && payload?.message_id) {
          assistantMessageId = String(payload.message_id);
          replaceTempMessageId(chatId, messageId, assistantMessageId);
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

  async function sendMessage(text, hooks = {}) {
    const prompt = String(text || '').trim();
    if (!prompt) {
      hooks.onFinished?.();
      return;
    }
    return sendSingleMessage(prompt, hooks);
  }

  return {
    sendSingleMessage,
    sendMessage,
    startResumeStream,
    stopResumeStream,
  };
}
