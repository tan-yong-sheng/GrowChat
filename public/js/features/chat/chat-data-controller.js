import { resolveConversationLeafId } from '../../shared/utils/conversation.js';

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
    if (!chatId) {
      if (draw) drawMessages([]);
      return;
    }
    if (isTempChatId(chatId)) {
      if (draw) {
        setState({ ui: { loadingChatId: null, streaming: false, streamingChatId: null } });
        const existing = state.messagesByChat[chatId] || [];
        drawMessages(existing);
      }
      return;
    }
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
    const isMessageLive = (message) => {
      const status = String(message?.status || '');
      const isRunning =
        message?.role === 'assistant' && (status === 'streaming' || status === 'tool_running');
      if (!isRunning) return false;
      const createdAtMs = Number(message?.created_at || 0) * 1000;
      if (!createdAtMs) return false;
      return now - createdAtMs <= STREAM_STALE_MS;
    };

    let messages = (data.messages || []).map((m) => ({
      ...m,
      done: !isMessageLive(m),
    }));
    let appliedFallbackId = null;
    if (fallbackMessage?.id) {
      let resolvedFallback = fallbackMessage;
      const fallbackId = String(resolvedFallback.id);
      const hasExact = messages.some((msg) => String(msg.id) === fallbackId);
      const fallbackParent = resolvedFallback.parent_id ? String(resolvedFallback.parent_id) : '';
      const hasSibling = fallbackParent
        ? messages.some(
            (msg) => msg.role === 'assistant' && String(msg.parent_id || '') === fallbackParent
          )
        : false;
      if (!hasExact && !hasSibling) {
        const parentExists =
          fallbackParent && messages.some((msg) => String(msg.id) === fallbackParent);
        if (!parentExists) {
          const lastUser = [...messages].reverse().find((msg) => msg.role === 'user');
          resolvedFallback = { ...resolvedFallback, parent_id: lastUser ? lastUser.id : null };
        }
        messages = [...messages, { ...resolvedFallback, done: true }];
        messages.sort((a, b) => Number(a?.created_at || 0) - Number(b?.created_at || 0));
        appliedFallbackId = String(resolvedFallback.id);
      }
    }

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

    const hasRunning = messages.some((m) => isMessageLive(m));

    const nextState = {
      messagesByChat: { ...state.messagesByChat, [chatId]: messages },
    };
    if (updateActiveModel) {
      let preferredModelId = state.activeModelId;
      if (modelMode === 'default') {
        preferredModelId =
          state.defaultModelId ||
          state.globalDefaultModelId ||
          data?.chat?.model ||
          state.activeModelId;
      } else if (modelMode === 'chat') {
        preferredModelId =
          data?.chat?.model ||
          state.activeModelId ||
          state.defaultModelId ||
          state.globalDefaultModelId;
      }
      nextState.activeModelId = preferredModelId;
    }
    nextState.ui = {
      loadingChatId: null,
      streaming: hasRunning,
      streamingChatId: hasRunning ? String(chatId) : null,
    };
    setState(nextState);

    if (draw) drawMessages(messages);
    if (hasRunning && state.activeChatId === chatId) {
      const runningId = streamSession?.getRunningMessageId(messages);
      if (runningId) startResumeStream(chatId, runningId);
    }
  }

  return {
    refreshShareState,
    loadChats,
    loadMessages,
  };
}
