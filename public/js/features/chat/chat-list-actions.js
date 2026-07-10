import { handleClickChat } from './chat-click-handler.js';

export function createChatListHandlers({
  state,
  apiFetch,
  loadChats = async () => {},
  loadMessages = async () => {},
  syncChatUrl = () => {},
  setState = () => {},
  isTempChatId = () => false,
  refreshShareState = async () => {},
  renderShareModal = () => {},
  sharedByChatId = new Map(),
  toggleArchiveChat = async () => {},
  drawMessages = () => {},
  currentLeafByChatId = new Map(),
  streamingOverrideByChatId = new Map(),
  promptFn = (message, defaultValue = '') =>
    typeof globalThis.prompt === 'function'
      ? globalThis.prompt(message, defaultValue)
      : defaultValue,
  confirmFn = (message) =>
    typeof globalThis.confirm === 'function' ? globalThis.confirm(message) : true,
  alertFn = (message) => {
    if (typeof globalThis.alert === 'function') {
      globalThis.alert(message);
    }
  },
} = {}) {
  const handleFetchError = async (res, action) => {
    const payload = await res.json().catch(() => ({}));
    alertFn(payload.error || `Failed to ${action} (${res.status})`);
  };
  return (chat = {}) => ({
    onClick: (id) => {
      handleClickChat(
        { isTempChatId, setState, syncChatUrl, drawMessages, state, loadMessages },
        id
      );
    },
    rename: async (id) => {
      if (isTempChatId(id)) return;
      const newTitle = promptFn('Enter new title:', chat.title);
      if (newTitle && newTitle !== chat.title) {
        await apiFetch(`/api/chats/${id}`, {
          method: 'PUT',
          body: JSON.stringify({ title: newTitle }),
        });
        await loadChats();
      }
    },
    pin: async (id) => {
      if (isTempChatId(id)) return;
      const res = await apiFetch(`/api/chats/${id}/pin`, { method: 'POST' });
      if (!res.ok) {
        await handleFetchError(res, 'pin');
        return;
      }

      await loadChats();
    },
    duplicate: async (id) => {
      if (isTempChatId(id)) return;
      const res = await apiFetch(`/api/chats/${id}/clone`, { method: 'POST' });
      if (!res.ok) {
        await handleFetchError(res, 'duplicate');
        return;
      }

      const data = await res.json().catch(() => ({}));
      const clonedChatId = data?.chat?.id || null;
      await loadChats();
      const nextId = clonedChatId || state.activeChatId;
      syncChatUrl(nextId);
      setState({ activeChatId: nextId });
      if (nextId) {
        await loadMessages(nextId, { modelMode: 'default' });
      }
    },
    share: async (id) => {
      if (isTempChatId(id)) return;
      syncChatUrl(id);
      setState({ activeChatId: id });
      await loadMessages(id, { modelMode: 'default' });
      await refreshShareState();
      const existing = sharedByChatId.get(id) || null;
      renderShareModal(existing);
    },
    archive: async (id) => {
      if (isTempChatId(id)) return;
      await toggleArchiveChat(id);
      await loadChats();
      const nextId = id === state.activeChatId ? state.chats?.[0]?.id || null : state.activeChatId;
      syncChatUrl(nextId, { replace: true });
      setState({ activeChatId: nextId });
      if (nextId) {
        await loadMessages(nextId, { modelMode: 'default' });
      } else {
        drawMessages([]);
      }
    },
    delete: async (id) => {
      if (!confirmFn('Are you sure you want to delete this chat?')) return;
      const wasActive = id === state.activeChatId;
      const prevChats = Array.isArray(state.chats) ? state.chats.slice() : [];
      const removedChat = isTempChatId(id)
        ? null
        : prevChats.find((chatItem) => String(chatItem.id) === String(id)) || null;
      setState((prev) => {
        const nextChats = (Array.isArray(prev.chats) ? prev.chats : []).filter(
          (chatItem) => String(chatItem.id) !== String(id)
        );
        const nextActiveChatId = wasActive ? nextChats[0]?.id || null : prev.activeChatId;
        const nextMessagesByChat = { ...(prev.messagesByChat || {}) };
        delete nextMessagesByChat[id];
        return {
          chats: nextChats,
          activeChatId: nextActiveChatId,
          messagesByChat: nextMessagesByChat,
        };
      });
      const nextChatsSnapshot = prevChats.filter((chatItem) => String(chatItem.id) !== String(id));
      const nextId = wasActive ? nextChatsSnapshot[0]?.id || null : state.activeChatId;
      currentLeafByChatId.delete(id);
      streamingOverrideByChatId.delete(id);
      syncChatUrl(nextId, { replace: true });
      if (nextId) {
        await loadMessages(nextId, { modelMode: 'default' });
      } else {
        drawMessages([]);
      }
      if (!isTempChatId(id)) {
        const res = await apiFetch(`/api/chats/${id}`, { method: 'DELETE' });
        if (!res.ok) {
          if (removedChat) {
            setState((prev) => ({ chats: [removedChat, ...prev.chats] }));
          }
          await loadChats();
        }
      }
    },
  });
}
