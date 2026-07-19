const CHAT_TITLE_SNIPPET_LENGTH = 60;

function normalizeChatTitleSnippet(text) {
  return String(text || '')
    .trim()
    .replace(/\s+/g, ' ')
    .slice(0, CHAT_TITLE_SNIPPET_LENGTH);
}

function handleNewChatCreation({ state, setState, buildTempChat, pruneTempChats, syncChatUrl }) {
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

function handleExistingTempChat({
  chatId,
  state,
  setState,
  buildTempChat,
  pruneTempChats,
  syncChatUrl,
}) {
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

function handleAutoTitle({
  tempChatId,
  chatId,
  text,
  state,
  hadMessagesBefore,
  updateChatTitleLocal,
}) {
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

function resolveChatCreation({ chatId, isTempChat, opts }) {
  if (!chatId) {
    const tempChatId = handleNewChatCreation(opts);
    return { chatId: tempChatId, tempChatId };
  }
  if (isTempChat) {
    handleExistingTempChat({ ...opts, chatId });
    return { chatId, tempChatId: chatId };
  }
  return { chatId, tempChatId: null };
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
  const chatId = state.activeChatId;
  const isTempChat = chatId ? isTempChatId(chatId) : false;
  const hadMessagesBefore = chatId ? (state.messagesByChat[chatId] || []).length > 0 : false;

  const helperOpts = { state, setState, buildTempChat, pruneTempChats, syncChatUrl };
  const { chatId: resolvedChatId, tempChatId } = resolveChatCreation({
    chatId,
    isTempChat,
    opts: helperOpts,
  });

  handleNewChatAttachments(state, setState, resolvedChatId);

  const autoTitle = handleAutoTitle({
    tempChatId,
    chatId: resolvedChatId,
    text,
    state,
    hadMessagesBefore,
    updateChatTitleLocal,
  });

  return { chatId: resolvedChatId, tempChatId, hadMessagesBefore, autoTitle };
}

export function rollbackOptimisticConversation({
  state: _state,
  setState,
  tempChatId,
  isTempChatId: _isTempChatId = () => false,
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

function buildReplacedChatList(chats, tempChatId, realChat) {
  let replaced = false;
  const nextChats = chats.map((c) => {
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
  return replaced ? nextChats : [realChat, ...nextChats];
}

function dedupeChats(chats) {
  const seen = new Set();
  const deduped = [];
  for (const chat of chats) {
    const key = String(chat.id);
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(chat);
  }
  return deduped;
}

function migrateEntry(map, tempChatId, realChatId) {
  const value = map[tempChatId];
  if (value == null) return map;
  const next = { ...map };
  next[realChatId] = value;
  delete next[tempChatId];
  return next;
}

function resolveActiveModelId(prev, realChat) {
  return prev.activeModelId || realChat.model || prev.defaultModelId || prev.globalDefaultModelId;
}

function buildPromotedState({ prev, tempChatId, realChat, realChatId }) {
  return {
    chats: dedupeChats(buildReplacedChatList(prev.chats, tempChatId, realChat)),
    activeChatId: realChatId,
    activeModelId: resolveActiveModelId(prev, realChat),
    messagesByChat: migrateEntry(prev.messagesByChat, tempChatId, realChatId),
    attachmentsByChat: migrateEntry(prev.attachmentsByChat || {}, tempChatId, realChatId),
    toolSelectionsByChat: migrateEntry(prev.toolSelectionsByChat || {}, tempChatId, realChatId),
  };
}

function remapChatKey(source, tempChatId, realChatId) {
  if (!source.has(tempChatId)) return;
  const value = source.get(tempChatId);
  source.delete(tempChatId);
  source.set(realChatId, value);
}

export function promoteOptimisticConversation({
  state: _state,
  setState,
  tempChatId,
  realChat,
  currentLeafByChatId = new Map(),
  streamingOverrideByChat = new Map(),
  syncChatUrl = () => {},
} = {}) {
  if (!realChat?.id) return realChat?.id || null;
  const realChatId = String(realChat.id);

  setState((prev) => buildPromotedState({ prev, tempChatId, realChat, realChatId }));

  remapChatKey(currentLeafByChatId, tempChatId, realChatId);
  remapChatKey(streamingOverrideByChat, tempChatId, realChatId);

  syncChatUrl(realChatId);
  return realChatId;
}
