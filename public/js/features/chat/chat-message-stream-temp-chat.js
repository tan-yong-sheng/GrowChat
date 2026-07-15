function normalizeChatTitleSnippet(text) {
  return String(text || '')
    .trim()
    .replace(/\s+/g, ' ')
    .slice(0, 60);
}

function handleNewChatCreation(state, setState, buildTempChat, pruneTempChats, syncChatUrl) {
  const tempChat = buildTempChat();
  const tempChatId = tempChat.id;
  if (state.newChatToolSelection !== null) {
    setState((prev) => {
      const nextToolSelectionsByChat = { ...(prev.toolSelectionsByChat || {}) };
      nextToolSelectionsByChat[tempChatId] = prev.newChatToolSelection;
      return {
        toolSelectionsByChat: nextToolSelectionsByChat,
        newChatToolSelection: null,
      };
    });
  }
  setState((prev) => ({
    chats: [tempChat, ...pruneTempChats(prev.chats)],
    activeChatId: tempChatId,
    activeModelId:
      prev.activeModelId || prev.defaultModelId || prev.globalDefaultModelId || tempChat.model,
  }));
  syncChatUrl(tempChatId);
  return tempChatId;
}

function handleExistingTempChat(
  chatId,
  state,
  setState,
  buildTempChat,
  pruneTempChats,
  syncChatUrl
) {
  const exists = state.chats.some((chat) => String(chat.id) === String(chatId));
  if (!exists) {
    const tempChat = buildTempChat(chatId);
    setState((prev) => ({
      chats: [tempChat, ...pruneTempChats(prev.chats)],
      activeChatId: chatId,
      activeModelId:
        prev.activeModelId || prev.defaultModelId || prev.globalDefaultModelId || tempChat.model,
    }));
  }
  syncChatUrl(chatId);
}

function handleNewChatAttachments(state, setState, chatId) {
  if (!state.attachmentsByChat?.[chatId] && (state.newChatAttachments || []).length > 0) {
    setState({
      attachmentsByChat: {
        ...(state.attachmentsByChat || {}),
        [chatId]: state.newChatAttachments,
      },
      newChatAttachments: [],
    });
  }
}

function handleAutoTitle(tempChatId, chatId, text, state, hadMessagesBefore, updateChatTitleLocal) {
  if (tempChatId) {
    const existingChat = state.chats.find((chat) => String(chat.id) === String(chatId));
    if (!hadMessagesBefore && (!existingChat?.title || existingChat.title === 'New Chat')) {
      const snippet = normalizeChatTitleSnippet(text);
      if (snippet) {
        updateChatTitleLocal(chatId, snippet);
        return snippet;
      }
    }
  }
  return null;
}

export function prepareOptimisticConversation({
  state,
  setState,
  text = '',
  buildTempChat,
  pruneTempChats = (list) => list,
  syncChatUrl = () => {},
  updateChatTitleLocal = () => {},
  isTempChatId = () => false,
} = {}) {
  let chatId = state.activeChatId;
  let tempChatId = null;
  const isTempChat = chatId && isTempChatId(chatId);
  const hadMessagesBefore = chatId ? (state.messagesByChat[chatId] || []).length > 0 : false;

  if (!chatId) {
    tempChatId = handleNewChatCreation(state, setState, buildTempChat, pruneTempChats, syncChatUrl);
    chatId = tempChatId;
  } else if (isTempChat) {
    tempChatId = chatId;
    handleExistingTempChat(chatId, state, setState, buildTempChat, pruneTempChats, syncChatUrl);
  }

  handleNewChatAttachments(state, setState, chatId);

  const autoTitle = handleAutoTitle(
    tempChatId,
    chatId,
    text,
    state,
    hadMessagesBefore,
    updateChatTitleLocal
  );

  return { chatId, tempChatId, hadMessagesBefore, autoTitle };
}

export function rollbackOptimisticConversation({
  state,
  setState,
  tempChatId,
  isTempChatId = () => false,
} = {}) {
  if (!tempChatId) return;
  setState((prev) => {
    const nextChats = prev.chats.filter((c) => String(c.id) !== String(tempChatId));
    const nextActiveChatId =
      prev.activeChatId === tempChatId ? nextChats[0]?.id || null : prev.activeChatId;
    const nextMessagesByChat = { ...prev.messagesByChat };
    delete nextMessagesByChat[tempChatId];
    const nextAttachmentsByChat = { ...(prev.attachmentsByChat || {}) };
    delete nextAttachmentsByChat[tempChatId];
    const nextToolSelectionsByChat = { ...(prev.toolSelectionsByChat || {}) };
    delete nextToolSelectionsByChat[tempChatId];
    return {
      chats: nextChats,
      activeChatId: nextActiveChatId,
      messagesByChat: nextMessagesByChat,
      attachmentsByChat: nextAttachmentsByChat,
      toolSelectionsByChat: nextToolSelectionsByChat,
    };
  });
}

export function promoteOptimisticConversation({
  state,
  setState,
  tempChatId,
  realChat,
  currentLeafByChatId = new Map(),
  streamingOverrideByChat = new Map(),
  syncChatUrl = () => {},
} = {}) {
  if (!realChat?.id) return realChat?.id || null;
  const realChatId = String(realChat.id);

  setState((prev) => {
    let replaced = false;
    let nextChats = prev.chats.map((c) => {
      if (String(c.id) === String(tempChatId)) {
        replaced = true;
        const nextChat = { ...realChat };
        if (c.title && c.title !== 'New Chat' && realChat.title === 'New Chat') {
          nextChat.title = c.title;
        }
        return nextChat;
      }
      return c;
    });
    if (!replaced) {
      nextChats = [realChat, ...nextChats];
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
    const nextToolSelectionsByChat = { ...(prev.toolSelectionsByChat || {}) };
    const toolSelectionValue = nextToolSelectionsByChat[tempChatId];
    if (toolSelectionValue != null) {
      nextToolSelectionsByChat[realChatId] = toolSelectionValue;
      delete nextToolSelectionsByChat[tempChatId];
    }
    return {
      chats: deduped,
      activeChatId: realChatId,
      activeModelId:
        prev.activeModelId || realChat.model || prev.defaultModelId || prev.globalDefaultModelId,
      messagesByChat: nextMessagesByChat,
      attachmentsByChat: nextAttachmentsByChat,
      toolSelectionsByChat: nextToolSelectionsByChat,
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

  syncChatUrl(realChatId);
  return realChatId;
}
