import { resolveConversationLeafId } from '../../shared/utils/conversation.js';

/**
 * Check if a message is still actively streaming (not yet done).
 * Used to detect running messages that need live-stream attention.
 * @param {object} message
 * @param {number} now - current Date.now() value
 * @param {number} staleMs - stream stale timeout in ms
 * @returns {boolean}
 */
function isMessageLive(message, now, staleMs) {
  const status = String(message?.status || '');
  const isRunning =
    message?.role === 'assistant' && (status === 'streaming' || status === 'tool_running');
  if (!isRunning) return false;
  const createdAtMs = Number(message?.created_at || 0) * 1000;
  if (!createdAtMs) return false;
  return now - createdAtMs <= staleMs;
}

/**
 * Resolve the preferred model ID based on modelMode ('default' vs 'chat').
 * @param {object} state
 * @param {object} data - parsed response data
 * @param {'keep'|'default'|'chat'} modelMode
 * @returns {string|null}
 */
function resolveModelIdForMode(state, data, modelMode) {
  if (modelMode === 'default') {
    return (
      state.defaultModelId || state.globalDefaultModelId || data?.chat?.model || state.activeModelId
    );
  }
  if (modelMode === 'chat') {
    return (
      data?.chat?.model || state.activeModelId || state.defaultModelId || state.globalDefaultModelId
    );
  }
  return state.activeModelId;
}

/**
 * Mark messages as (not) done based on stream live status.
 * Used by loadMessages to flag stale messages before fallback insertion.
 * @param {object[]} messages
 * @param {number} now - current Date.now() value
 * @param {number} staleMs - stream stale timeout in ms
 * @returns {object[]}
 *  Messages with `done` set according to isMessageLive check
 */
function markStreamingDone(messages, now, staleMs) {
  return (messages || []).map((m) => ({
    ...m,
    done: !isMessageLive(m, now, staleMs),
  }));
}

/**
 * Compute whether any messages are still actively streaming.
 * @param {object[]} messages
 * @param {number} now - current Date.now() value
 * @param {number} staleMs - stream stale timeout in ms
 * @returns {boolean}
 */
function hasLiveStream(messages, now, staleMs) {
  return messages.some((m) => isMessageLive(m, now, staleMs));
}

/**
 * Handle fallback message insertion when a stream fallback is needed.
 * @param {object[]} messages
 * @param {object|null} fallbackMessage
 * @returns {{ messages: object[], appliedFallbackId: string|null }}
 */
function resolveFallbackMessageInsertion(messages, fallbackMessage) {
  if (!fallbackMessage?.id) return { messages, appliedFallbackId: null };

  let resolved = fallbackMessage;
  const fallbackId = String(resolved.id);
  const hasExact = messages.some((msg) => String(msg.id) === fallbackId);
  const fallbackParent = resolved.parent_id ? String(resolved.parent_id) : '';
  const hasSibling = fallbackParent
    ? messages.some(
        (msg) => msg.role === 'assistant' && String(msg.parent_id || '') === fallbackParent
      )
    : false;

  if (hasExact || hasSibling) return { messages, appliedFallbackId: null };

  const parentExists = fallbackParent && messages.some((msg) => String(msg.id) === fallbackParent);
  if (!parentExists) {
    const lastUser = [...messages].reverse().find((msg) => msg.role === 'user');
    resolved = { ...resolved, parent_id: lastUser ? lastUser.id : null };
  }

  const updated = [...messages, { ...resolved, done: true }];
  updated.sort((a, b) => Number(a?.created_at || 0) - Number(b?.created_at || 0));
  return { messages: updated, appliedFallbackId: String(resolved.id) };
}

export function createChatDataController({
  state,
  setState = () => {},
  apiFetch,
  fetchChats = async () => ({ chats: [] }),
  fetchSharedChats = async () => ({ chats: [] }),
  sharedByChatId = new Map(),
  recentChatIds = [],
  currentLeafByChatId = new Map(),
  streamSession = null,
  drawMessages = () => {},
  startResumeStream = async () => {},
  touchRecentChat = () => {},
  schedulePrune = () => {},
  isTempChatId = () => false,
} = {}) {
  async function refreshShareState() {
    try {
      const data = await fetchSharedChats();
      sharedByChatId.clear();
      (data.chats || []).forEach((chat) => {
        if (chat?.id && chat?.share_id) {
          sharedByChatId.set(chat.id, {
            share_id: chat.share_id,
            share_url: `/s/${chat.share_id}`,
            chat_id: chat.id,
          });
        }
      });
    } catch {
      sharedByChatId.clear();
    }
  }

  async function loadChats() {
    const limit = state.chatsPagination?.offset || state.chatsPagination?.limit || 30;
    const data = await fetchChats({ limit, offset: 0 });
    const serverChats = data.chats || [];
    const tempChats = state.chats.filter((chat) => isTempChatId(chat?.id));
    const tempIds = new Set(tempChats.map((chat) => String(chat.id)));
    const chats = [...tempChats, ...serverChats.filter((chat) => !tempIds.has(String(chat.id)))];

    let nextActiveChatId = state.activeChatId;
    if (nextActiveChatId && !chats.some((chat) => chat.id === nextActiveChatId)) {
      nextActiveChatId = chats[0]?.id || null;
    }

    setState({
      chats,
      chatsPagination: {
        limit: data.limit || limit,
        offset: (data.offset || 0) + chats.length,
        hasMore: data.has_more === true,
        loading: false,
      },
      activeChatId: nextActiveChatId,
    });
  }

  const STREAM_STALE_MS = 5 * 60 * 1000;

  async function loadMessages(chatId, options = {}) {
    const {
      draw = true,
      updateActiveModel = draw,
      modelMode = 'keep',
      preferredLeafId = null,
      fallbackMessage = null,
    } = options;
    if (handleLoadMessagesEarlyReturn(chatId, draw)) return;
    touchRecentChat(recentChatIds, chatId);
    schedulePrune();

    if (draw) {
      setState({ ui: { loadingChatId: chatId } });
      const existing = state.messagesByChat[chatId] || [];
      drawMessages(existing);
    }

    const res = await apiFetch(`/api/chats/${chatId}`, { cache: 'no-store' });
    if (!res.ok) {
      setState({ ui: { loadingChatId: null } });
      return;
    }
    const data = await res.json();

    const now = Date.now();

    const { messages: initialMessages, appliedFallbackId: savedFallbackId } =
      resolveFallbackMessageInsertion(
        markStreamingDone(data.messages, now, STREAM_STALE_MS),
        fallbackMessage
      );

    const messages = initialMessages;
    let appliedFallbackId = savedFallbackId;

    const priorLeafId = currentLeafByChatId.get(chatId) || null;
    const resolvedLeafId = resolveConversationLeafId(messages, {
      preferredLeafId,
      currentMessageId: data.chat?.current_message_id || null,
      fallbackMessageId: appliedFallbackId,
      previousLeafId: priorLeafId,
    });
    if (resolvedLeafId) {
      currentLeafByChatId.set(chatId, String(resolvedLeafId));
    }

    const streamingNow = hasLiveStream(messages, now, STREAM_STALE_MS);

    const nextState = {
      messagesByChat: { ...state.messagesByChat, [chatId]: messages },
    };
    if (updateActiveModel) {
      const preferredModelId = resolveModelIdForMode(state, data, modelMode);
      if (preferredModelId) {
        nextState.activeModelId = preferredModelId;
      }
    }
    nextState.ui = {
      loadingChatId: null,
      streaming: streamingNow,
      streamingChatId: streamingNow ? String(chatId) : null,
    };
    setState(nextState);

    if (draw) drawMessages(messages);
    maybeResumeStream(chatId, messages, streamingNow);
  }

  function handleLoadMessagesEarlyReturn(chatId, draw) {
    if (!chatId) {
      if (draw) drawMessages([]);
      return true;
    }
    if (isTempChatId(chatId)) {
      if (draw) {
        setState({ ui: { loadingChatId: null, streaming: false, streamingChatId: null } });
        const existing = state.messagesByChat[chatId] || [];
        drawMessages(existing);
      }
      return true;
    }
    return false;
  }

  function maybeResumeStream(chatId, messages, streamingNow) {
    if (!streamingNow || state.activeChatId !== chatId) return;
    const runningId = streamSession?.getRunningMessageId(messages);
    if (runningId) startResumeStream(chatId, runningId);
  }

  return {
    refreshShareState,
    loadChats,
    loadMessages,
  };
}
