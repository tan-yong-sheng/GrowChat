const EVENT_DEDUP_WINDOW_MS = 120000;
const EVENT_DEDUP_MAX_SIZE = 1000;

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
    const nextChats = mergeChatEntry([...state.chats], chat);
    nextChats.sort(sortChatsByRecency);
    setState({ chats: nextChats });
  }

  function mergeChatEntry(nextChats, chat) {
    const index = nextChats.findIndex((item) => String(item?.id) === String(chat.id));
    if (index < 0) {
      nextChats.unshift(chat);
      return nextChats;
    }
    const existing = nextChats[index];
    const merged = { ...existing, ...chat };
    if (existing?.title && existing.title !== 'New Chat' && chat.title === 'New Chat') {
      merged.title = existing.title;
    }
    nextChats[index] = merged;
    return nextChats;
  }

  function sortChatsByRecency(a, b) {
    const updatedDelta = timestampOf(b, 'updated_at') - timestampOf(a, 'updated_at');
    if (updatedDelta !== 0) return updatedDelta;
    return timestampOf(b, 'created_at') - timestampOf(a, 'created_at');
  }

  function timestampOf(chat, field) {
    return Number(chat?.[field] || 0);
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

  function findExistingMessageIndex(workingMessages, realId) {
    return workingMessages.findIndex((item) => String(item?.id) === realId);
  }

  function resolveMessageMatchFields(message) {
    return {
      msgRole: String(message.role || ''),
      msgContent: String(message.content || ''),
      msgParent: message.parent_id ? String(message.parent_id) : null,
    };
  }

  function matchesTempMessage(item, { msgRole, msgContent, msgParent }) {
    if (!item) return false;
    if (!String(item.id).startsWith('temp-')) return false;
    if (String(item.role) !== msgRole) return false;
    if (String(item.parent_id) !== String(msgParent)) return false;
    if (msgRole !== 'assistant' && String(item.content) !== msgContent) return false;
    return true;
  }

  function findTempMessageReplacementIndex(chatId, workingMessages, matchFields, realId) {
    const tempIdx = workingMessages.findIndex((item) => matchesTempMessage(item, matchFields));
    if (tempIdx < 0) return { workingMessages, index: -1 };
    replaceTempMessageId(chatId, workingMessages[tempIdx].id, realId);
    const refreshedMessages = [...(state.messagesByChat[chatId] || [])];
    return {
      workingMessages: refreshedMessages,
      index: findExistingMessageIndex(refreshedMessages, realId),
    };
  }

  function mergeEventMessage(workingMessages, message, index) {
    const normalized = { ...message, done: true };
    if (index >= 0) {
      workingMessages[index] = { ...workingMessages[index], ...normalized };
      return workingMessages;
    }
    workingMessages.push(normalized);
    workingMessages.sort((a, b) => Number(a?.created_at || 0) - Number(b?.created_at || 0));
    return workingMessages;
  }

  function commitMessagesForChat(chatId, workingMessages, realId) {
    currentLeafByChatId.set(chatId, realId);
    setState({ messagesByChat: { ...state.messagesByChat, [chatId]: workingMessages } });
  }

  function upsertMessageFromEvent(chatId, message, { draw = true } = {}) {
    if (!chatId || !message?.id) return;
    let workingMessages = [...(state.messagesByChat[chatId] || [])];
    const realId = String(message.id);
    let index = findExistingMessageIndex(workingMessages, realId);

    if (index < 0) {
      const matchFields = resolveMessageMatchFields(message);
      const replacement = findTempMessageReplacementIndex(
        chatId,
        workingMessages,
        matchFields,
        realId
      );
      workingMessages = replacement.workingMessages;
      index = replacement.index;
    }

    workingMessages = mergeEventMessage(workingMessages, message, index);
    commitMessagesForChat(chatId, workingMessages, realId);
    if (draw && state.activeChatId === chatId) drawMessages(workingMessages);
  }

  function buildEventKey(event) {
    const fields = EVENT_KEY_FIELDS.map((field) => String((event && event[field]) || ''));
    fields.push(String((event && event.data && event.data.seq) || ''));
    return fields.join('|');
  }

  const EVENT_KEY_FIELDS = ['type', 'chat_id', 'message_id', 'user_id', 'ts'];

  function isDuplicateEvent(eventKey) {
    const now = Date.now();
    const seenAt = processedRealtimeEvents.get(eventKey);
    if (seenAt && now - seenAt < EVENT_DEDUP_WINDOW_MS) return true;
    processedRealtimeEvents.set(eventKey, now);
    if (processedRealtimeEvents.size > EVENT_DEDUP_MAX_SIZE) {
      for (const [key, ts] of processedRealtimeEvents.entries()) {
        if (now - ts >= EVENT_DEDUP_WINDOW_MS) processedRealtimeEvents.delete(key);
      }
    }
    return false;
  }

  function isSameSession(event) {
    return !!event.origin_session_id && event.origin_session_id === clientSessionId;
  }

  async function handleChatEvent(event) {
    const type = String(event.type || '');
    if (type === 'chat.deleted') {
      handleChatDeletedEvent(event);
      return;
    }

    const eventChat = event?.data?.chat || null;
    if (eventChat) {
      upsertChatFromEvent(eventChat);
      return;
    }

    await refreshActiveChatForEvent(event);
  }

  function handleChatDeletedEvent(event) {
    const nextChats = state.chats.filter(
      (chat) => String(chat?.id) !== String(event.chat_id || '')
    );
    const nextActiveChatId =
      state.activeChatId === event.chat_id ? nextChats[0]?.id || null : state.activeChatId;
    setState({ chats: nextChats, activeChatId: nextActiveChatId });
    if (!nextActiveChatId) drawMessages([]);
  }

  async function refreshActiveChatForEvent(event) {
    const previousActiveChatId = state.activeChatId;
    await loadChats();
    if (shouldSkipRefresh(event, previousActiveChatId)) return;
    await reloadActiveChatIfChanged(event, previousActiveChatId);
    if (!state.activeChatId) drawMessages([]);
  }

  function shouldSkipRefresh(event, previousActiveChatId) {
    return (
      isSameSession(event) &&
      Boolean(getActiveStreamAbort()) &&
      event.chat_id === previousActiveChatId
    );
  }

  async function reloadActiveChatIfChanged(event, previousActiveChatId) {
    if (
      !state.activeChatId ||
      (event.chat_id !== state.activeChatId && state.activeChatId === previousActiveChatId)
    ) {
      return;
    }
    await loadMessages(state.activeChatId);
  }

  function handleToolEvent(event) {
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
  }

  function stopActiveStreamForChat(chatId) {
    streamingOverrideByChat.delete(chatId);
    setStreamingState(chatId, false);
    const activeAbort = getActiveStreamAbort();
    if (activeAbort) {
      clearGlobalStreamAbort(activeAbort);
      setActiveStreamAbort(null);
    }
  }

  async function refreshChatFromEvent(eventChat) {
    if (eventChat) {
      upsertChatFromEvent(eventChat);
    } else {
      await loadChats();
    }
  }

  async function refreshMessageFromEvent(event) {
    const eventMessage = event?.data?.message || null;
    if (eventMessage) {
      upsertMessageFromEvent(event.chat_id, eventMessage, {
        draw: event.chat_id === state.activeChatId,
      });
    } else if (event.chat_id && event.chat_id === state.activeChatId) {
      await loadMessages(event.chat_id);
    }
  }

  function stopStreamIfActive(chatId) {
    if (chatId && chatId === state.activeChatId) {
      stopActiveStreamForChat(chatId);
    }
  }

  async function handleMessageCancelled(event) {
    await refreshChatFromEvent(event?.data?.chat || null);
    await refreshMessageFromEvent(event);
    stopStreamIfActive(event.chat_id);
  }

  function applyMessageDelta(chatId, messageId, delta, model) {
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
  }

  function isDeltaFromSelfSession(event) {
    return !event.origin_session_id || event.origin_session_id === clientSessionId;
  }

  function shouldSkipDelta(event) {
    const chatId = event.chat_id;
    if (!chatId || chatId !== state.activeChatId) return true;
    return getActiveStreamAbort() && isDeltaFromSelfSession(event);
  }

  function handleMessageDelta(event) {
    if (shouldSkipDelta(event)) return;
    const eventData = event.data || {};
    const delta = String(eventData.delta || '');
    if (!delta) return;

    applyMessageDelta(
      event.chat_id,
      String(event.message_id || ''),
      delta,
      eventData.model || state.activeModelId
    );
  }

  async function handleMessageCreatedOrCompleted(event) {
    const eventChat = event?.data?.chat || null;
    const eventMessage = event?.data?.message || null;

    if (eventChat) {
      upsertChatFromEvent(eventChat);
    } else {
      await loadChats();
    }

    if (eventMessage) {
      if (isSameSession(event) && eventMessage?.role === 'user') {
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

  function shouldIgnoreStreamedLifecycleEvent(event) {
    const type = String(event.type || '');
    return (
      (type === 'message.created' || type === 'message.delta' || type === 'message.completed') &&
      isSameSession(event) &&
      getActiveStreamAbort()
    );
  }

  function handleRealtimeChatEvent(event) {
    return handleChatEvent(event);
  }

  const REALTIME_EVENT_DISPATCH = {
    'chat.': handleRealtimeChatEvent,
    'tool.status': handleToolEvent,
    'tool.result': handleToolEvent,
    'message.cancelled': handleMessageCancelled,
    'message.delta': handleMessageDelta,
    'message.created': handleMessageCreatedOrCompleted,
    'message.completed': handleMessageCreatedOrCompleted,
  };

  function findRealtimeEventDispatcher(type) {
    const exactMatch = REALTIME_EVENT_DISPATCH[type];
    if (exactMatch) return exactMatch;
    const prefixKey = Object.keys(REALTIME_EVENT_DISPATCH).find((key) => type.startsWith(key));
    return prefixKey ? REALTIME_EVENT_DISPATCH[prefixKey] : null;
  }

  const onRealtimeEvent = async (evt) => {
    const event = evt?.detail || {};
    const type = String(event.type || '');
    if (!type) return;

    if (isDuplicateEvent(buildEventKey(event))) return;
    if (shouldIgnoreStreamedLifecycleEvent(event)) return;

    const handler = findRealtimeEventDispatcher(type);
    if (handler) {
      await handler(event);
    }
    return;
  };

  return {
    onRealtimeEvent,
    updateChatTitleLocal,
    upsertChatFromEvent,
    upsertMessageFromEvent,
  };
}
