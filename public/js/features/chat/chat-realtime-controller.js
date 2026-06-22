export function createChatRealtimeController({
  state,
  setState = () => {},
  drawMessages = () => {},
  loadChats = async () => {},
  loadMessages = async () => {},
  currentLeafByChatId = new Map(),
  streamingOverrideByChat = new Map(),
  setStreamingState = () => {},
  updateToolCallState = () => {},
  updateMessageContentDom = () => {},
  matchPendingTempMessage = () => {},
  replaceTempMessageId = () => {},
  getActiveStreamAbort = () => null,
  setActiveStreamAbort = () => {},
  clearGlobalStreamAbort = () => {},
  clientSessionId = '',
  processedRealtimeEvents = new Map(),
  toolCallsByMessageId = new Map(),
  messageBlocksById = new Map(),
} = {}) {
  function upsertChatFromEvent(chat) {
    if (!chat?.id) return;
    const nextChats = [...state.chats];
    const index = nextChats.findIndex((item) => String(item?.id) === String(chat.id));
    if (index >= 0) {
      const existing = nextChats[index];
      const merged = { ...existing, ...chat };
      if (existing?.title && existing.title !== 'New Chat' && chat.title === 'New Chat') {
        merged.title = existing.title;
      }
      nextChats[index] = merged;
    } else {
      nextChats.unshift(chat);
    }
    nextChats.sort((a, b) => {
      const updatedDelta = Number(b?.updated_at || 0) - Number(a?.updated_at || 0);
      if (updatedDelta !== 0) return updatedDelta;
      return Number(b?.created_at || 0) - Number(a?.created_at || 0);
    });
    setState({ chats: nextChats });
  }

  function updateChatTitleLocal(chatId, title) {
    setState((prev) => ({
      chats: prev.chats.map((chat) =>
        String(chat.id) === String(chatId)
          ? { ...chat, title, updated_at: Math.floor(Date.now() / 1000) }
          : chat
      ),
    }));
  }

  function upsertMessageFromEvent(chatId, message, { draw = true } = {}) {
    if (!chatId || !message?.id) return;
    let workingMessages = [...(state.messagesByChat[chatId] || [])];
    const realId = String(message.id);
    let index = workingMessages.findIndex((item) => String(item?.id) === realId);

    // If the real ID isn't found, check whether a temp message with matching
    // role + content + parent_id exists. This handles the race where the
    // realtime message.created arrives before the SSE start event has had a
    // chance to call replaceTempMessageId. Without this, both the temp and
    // real message coexist briefly, causing a spurious "2 / 2" branch indicator.
    if (index < 0) {
      const msgRole = String(message.role || '');
      const msgContent = String(message.content || '');
      const msgParent = message.parent_id ? String(message.parent_id) : null;
      const tempIdx = workingMessages.findIndex((item) => {
        if (!String(item?.id || '').startsWith('temp-')) return false;
        if (String(item.role || '') !== msgRole) return false;
        if (String(item.parent_id || '') !== String(msgParent || '')) return false;
        if (msgRole !== 'assistant' && String(item.content || '') !== msgContent) return false;
        return true;
      });
      if (tempIdx >= 0) {
        // replaceTempMessageId updates state synchronously (swaps temp→real ID
        // and fixes all parent_id references). Re-read the fresh state afterward
        // so subsequent mutations build on the correct data.
        replaceTempMessageId(chatId, workingMessages[tempIdx].id, realId);
        workingMessages = [...(state.messagesByChat[chatId] || [])];
        index = workingMessages.findIndex((item) => String(item?.id) === realId);
      }
    }

    const normalized = { ...message, done: true };
    if (index >= 0) {
      workingMessages[index] = { ...workingMessages[index], ...normalized };
    } else {
      workingMessages.push(normalized);
      workingMessages.sort((a, b) => Number(a?.created_at || 0) - Number(b?.created_at || 0));
    }
    currentLeafByChatId.set(chatId, realId);
    setState({ messagesByChat: { ...state.messagesByChat, [chatId]: workingMessages } });
    if (draw && state.activeChatId === chatId) drawMessages(workingMessages);
  }

  const onRealtimeEvent = async (evt) => {
    const event = evt?.detail || {};
    const type = String(event.type || '');
    if (!type) return;
    const eventKey = [
      type,
      String(event.chat_id || ''),
      String(event.message_id || ''),
      String(event.user_id || ''),
      String(event.ts || ''),
      String(event?.data?.seq || ''),
    ].join('|');
    const now = Date.now();
    const seenAt = processedRealtimeEvents.get(eventKey);
    if (seenAt && now - seenAt < 120000) return;
    processedRealtimeEvents.set(eventKey, now);
    if (processedRealtimeEvents.size > 1000) {
      for (const [key, ts] of processedRealtimeEvents.entries()) {
        if (now - ts >= 120000) processedRealtimeEvents.delete(key);
      }
    }

    const isSameSession = !!event.origin_session_id && event.origin_session_id === clientSessionId;
    const eventChat = event?.data?.chat || null;
    const eventMessage = event?.data?.message || null;

    if (type.startsWith('chat.')) {
      if (type === 'chat.deleted') {
        const nextChats = state.chats.filter(
          (chat) => String(chat?.id) !== String(event.chat_id || '')
        );
        const nextActiveChatId =
          state.activeChatId === event.chat_id ? nextChats[0]?.id || null : state.activeChatId;
        setState({ chats: nextChats, activeChatId: nextActiveChatId });
        if (!nextActiveChatId) drawMessages([]);
        return;
      }

      if (eventChat) {
        upsertChatFromEvent(eventChat);
        return;
      }

      const previousActiveChatId = state.activeChatId;
      await loadChats();
      if (isSameSession && getActiveStreamAbort() && event.chat_id === previousActiveChatId) {
        return;
      }
      if (
        state.activeChatId &&
        (event.chat_id === state.activeChatId || state.activeChatId !== previousActiveChatId)
      ) {
        await loadMessages(state.activeChatId);
      }
      if (!state.activeChatId) {
        drawMessages([]);
      }
      return;
    }

    if (type === 'tool.status' || type === 'tool.result') {
      const chatId = event.chat_id;
      if (!chatId) return;
      const messageId = String(event.message_id || '');
      if (!messageId) return;
      const payload = event?.data || {};
      updateToolCallState(toolCallsByMessageId, messageBlocksById, messageId, payload);
      if (state.activeChatId === chatId) {
        updateMessageContentDom(
          messageId,
          state.messagesByChat[chatId]?.find((m) => String(m.id) === messageId)?.content || '',
          {
            isError: false,
            isStreaming: true,
          }
        );
      }
      return;
    }

    if (type === 'message.cancelled') {
      if (eventChat) {
        upsertChatFromEvent(eventChat);
      } else {
        await loadChats();
      }

      if (eventMessage) {
        upsertMessageFromEvent(event.chat_id, eventMessage, {
          draw: event.chat_id === state.activeChatId,
        });
      } else if (event.chat_id && event.chat_id === state.activeChatId) {
        await loadMessages(event.chat_id);
      }

      if (event.chat_id && event.chat_id === state.activeChatId) {
        streamingOverrideByChat.delete(event.chat_id);
        setStreamingState(event.chat_id, false);
        const activeAbort = getActiveStreamAbort();
        if (activeAbort) {
          clearGlobalStreamAbort(activeAbort);
          setActiveStreamAbort(null);
        }
      }
      return;
    }

    if (
      (type === 'message.created' || type === 'message.delta' || type === 'message.completed') &&
      isSameSession &&
      getActiveStreamAbort()
    ) {
      return;
    }

    if (type === 'message.delta') {
      if (!event.chat_id || event.chat_id !== state.activeChatId) return;
      if (
        getActiveStreamAbort() &&
        (!event.origin_session_id || event.origin_session_id === clientSessionId)
      )
        return;
      const delta = String(event?.data?.delta || '');
      if (!delta) return;

      const chatId = event.chat_id;
      const messageId = String(event.message_id || '');
      const model = event?.data?.model || state.activeModelId;
      const messages = [...(state.messagesByChat[chatId] || [])];
      const existingIdx = messageId
        ? messages.findIndex((m) => String(m?.id || '') === messageId)
        : -1;

      if (existingIdx >= 0) {
        const existing = messages[existingIdx] || {};
        messages[existingIdx] = {
          ...existing,
          id: messageId,
          role: 'assistant',
          model: existing.model || model,
          content: `${existing.content || ''}${delta}`,
          done: false,
        };
      } else {
        messages.push({
          id: messageId || `remote-${Date.now()}`,
          role: 'assistant',
          model,
          content: delta,
          done: false,
        });
      }

      setState({ messagesByChat: { ...state.messagesByChat, [chatId]: messages } });
      drawMessages(messages);
      return;
    }

    if (type === 'message.created' || type === 'message.completed') {
      if (eventChat) {
        upsertChatFromEvent(eventChat);
      } else {
        await loadChats();
      }

      if (eventMessage) {
        if (isSameSession && eventMessage?.role === 'user') {
          matchPendingTempMessage(event.chat_id, eventMessage);
        }
        upsertMessageFromEvent(event.chat_id, eventMessage, {
          draw: event.chat_id === state.activeChatId,
        });
        return;
      }

      if (event.chat_id && event.chat_id === state.activeChatId) {
        await loadMessages(event.chat_id);
      }
    }
  };

  return {
    onRealtimeEvent,
    updateChatTitleLocal,
    upsertChatFromEvent,
    upsertMessageFromEvent,
  };
}
