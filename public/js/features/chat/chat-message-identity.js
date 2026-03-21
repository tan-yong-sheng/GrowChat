import { isTempMessageId } from '../../shared/utils/chat-cache.js';

export function createChatMessageIdentityTracker({ setState, messagesList, activeChatIdGetter }) {
  const tempMessageIdMapByChat = new Map();
  const pendingTempMessagesByChat = new Map();
  const pendingTempResolversByChat = new Map();
  const currentLeafByChatId = new Map();
  const branchSelectionByChat = new Map();
  const streamingOverrideByChat = new Map();

  const mapTempMessageId = (chatId, tempId, realId) => {
    if (!chatId || !tempId || !realId || tempId === realId) return;
    const key = String(chatId);
    const map = tempMessageIdMapByChat.get(key) || new Map();
    map.set(String(tempId), String(realId));
    tempMessageIdMapByChat.set(key, map);
  };

  const resolveTempMessageId = (chatId, id) => {
    if (!chatId || !id) return id;
    const map = tempMessageIdMapByChat.get(String(chatId));
    if (!map) return id;
    return map.get(String(id)) || id;
  };

  const remapSelectionMaps = (chatId, tempId, realId) => {
    const chatKey = String(chatId);
    if (currentLeafByChatId.get(chatKey) === String(tempId)) {
      currentLeafByChatId.set(chatKey, String(realId));
    }
    if (streamingOverrideByChat.has(chatKey)) {
      const override = streamingOverrideByChat.get(chatKey);
      if (override?.targetMsgId && String(override.targetMsgId) === String(tempId)) {
        streamingOverrideByChat.set(chatKey, { ...override, targetMsgId: realId });
      }
    }
    const branchMap = branchSelectionByChat.get(chatKey);
    if (branchMap && branchMap.size) {
      const nextMap = new Map();
      for (const [k, v] of branchMap.entries()) {
        const nextKey = String(k) === String(tempId) ? String(realId) : k;
        const nextVal = String(v) === String(tempId) ? String(realId) : v;
        nextMap.set(nextKey, nextVal);
      }
      branchSelectionByChat.set(chatKey, nextMap);
    }
  };

  const replaceTempMessageId = (chatId, tempId, realId) => {
    if (!chatId || !tempId || !realId || tempId === realId) return;
    mapTempMessageId(chatId, tempId, realId);
    const chatKey = String(chatId);
    setState((prev) => {
      const existing = prev.messagesByChat[chatKey] || [];
      if (!existing.length) return {};

      let replaced = false;
      const nextMessages = existing.map((msg) => {
        const next = { ...msg };
        if (String(next.id) === String(tempId)) {
          next.id = realId;
          replaced = true;
        }
        if (String(next.parent_id || '') === String(tempId)) {
          next.parent_id = realId;
          replaced = true;
        }
        return next;
      });

      const nextEditing = { ...(prev.ui?.editingMessages || {}) };
      if (nextEditing[tempId]) {
        nextEditing[realId] = nextEditing[tempId];
        delete nextEditing[tempId];
      }

      remapSelectionMaps(chatId, tempId, realId);

      return replaced
        ? { messagesByChat: { ...prev.messagesByChat, [chatKey]: nextMessages }, ui: { ...prev.ui, editingMessages: nextEditing } }
        : {};
    });

    if (activeChatIdGetter() === chatId && messagesList) {
      const updateAttr = (selector, attr) => {
        messagesList.querySelectorAll(selector).forEach((el) => {
          if (el.getAttribute(attr) === String(tempId)) {
            el.setAttribute(attr, String(realId));
          }
        });
      };
      updateAttr(`[data-message-id="${tempId}"]`, 'data-message-id');
      updateAttr(`[data-message-content="${tempId}"]`, 'data-message-content');
      updateAttr(`[data-edit-message="${tempId}"]`, 'data-edit-message');
      updateAttr(`[data-delete-message="${tempId}"]`, 'data-delete-message');
      updateAttr(`[data-retry-message="${tempId}"]`, 'data-retry-message');
      updateAttr(`[data-round-prev="${tempId}"]`, 'data-round-prev');
      updateAttr(`[data-round-next="${tempId}"]`, 'data-round-next');
      updateAttr(`.edit-message-textarea[data-message-id="${tempId}"]`, 'data-message-id');
    }

    const resolverMap = pendingTempResolversByChat.get(chatKey);
    if (resolverMap && resolverMap.has(String(tempId))) {
      const resolvers = resolverMap.get(String(tempId)) || [];
      resolverMap.delete(String(tempId));
      if (resolverMap.size === 0) pendingTempResolversByChat.delete(chatKey);
      resolvers.forEach((fn) => {
        try {
          fn(String(realId));
        } catch {
          // ignore resolver errors
        }
      });
    }
  };

  const registerPendingTempMessage = (chatId, message) => {
    if (!chatId || !message?.id) return;
    const key = String(chatId);
    const list = pendingTempMessagesByChat.get(key) || [];
    list.push({
      id: String(message.id),
      role: String(message.role || ''),
      content: String(message.content || ''),
      parent_id: message.parent_id ? String(message.parent_id) : null,
      created_at: Number(message.created_at || 0),
    });
    pendingTempMessagesByChat.set(key, list);
  };

  const matchPendingTempMessage = (chatId, message) => {
    if (!chatId || !message?.id) return;
    const key = String(chatId);
    const list = pendingTempMessagesByChat.get(key) || [];
    if (!list.length) return;
    const msgContent = String(message.content || '');
    const msgRole = String(message.role || '');
    const msgParent = message.parent_id ? String(message.parent_id) : null;
    const msgCreated = Number(message.created_at || 0);

    let bestIdx = -1;
    let bestScore = Infinity;
    list.forEach((candidate, idx) => {
      if (candidate.role !== msgRole) return;
      if (String(candidate.parent_id || '') !== String(msgParent || '')) return;
      const candidateContent = String(candidate.content || '');
      if (msgRole !== 'assistant' && candidateContent !== msgContent) return;
      if (msgRole === 'assistant' && candidateContent && candidateContent !== msgContent) return;
      const delta = Math.abs((candidate.created_at || 0) - msgCreated);
      if (delta < bestScore) {
        bestScore = delta;
        bestIdx = idx;
      }
    });

    if (bestIdx >= 0) {
      const [candidate] = list.splice(bestIdx, 1);
      pendingTempMessagesByChat.set(key, list);
      replaceTempMessageId(chatId, candidate.id, message.id);
    }
  };

  const waitForResolvedMessageId = (chatId, id, timeoutMs = 5000) => {
    const resolved = resolveTempMessageId(chatId, id);
    if (!isTempMessageId(resolved)) return Promise.resolve(resolved);
    const chatKey = String(chatId);
    const tempKey = String(resolved);
    return new Promise((resolve) => {
      const resolverMap = pendingTempResolversByChat.get(chatKey) || new Map();
      const list = resolverMap.get(tempKey) || [];
      list.push(resolve);
      resolverMap.set(tempKey, list);
      pendingTempResolversByChat.set(chatKey, resolverMap);

      const timer = setTimeout(() => {
        const current = resolverMap.get(tempKey) || [];
        const idx = current.indexOf(resolve);
        if (idx >= 0) current.splice(idx, 1);
        if (current.length === 0) resolverMap.delete(tempKey);
        if (resolverMap.size === 0) pendingTempResolversByChat.delete(chatKey);
        resolve(null);
      }, timeoutMs);

      const wrappedResolve = (value) => {
        clearTimeout(timer);
        resolve(value);
      };
      list[list.length - 1] = wrappedResolve;
      resolverMap.set(tempKey, list);
    });
  };

  const setBranchSelection = (chatId, parentId, messageId) => {
    if (!chatId || !messageId) return;
    const key = String(chatId);
    const parentKey = parentId ? String(parentId) : '__root__';
    const map = branchSelectionByChat.get(key) || new Map();
    map.set(parentKey, String(messageId));
    branchSelectionByChat.set(key, map);
  };

  return {
    currentLeafByChatId,
    branchSelectionByChat,
    streamingOverrideByChat,
    mapTempMessageId,
    resolveTempMessageId,
    replaceTempMessageId,
    registerPendingTempMessage,
    matchPendingTempMessage,
    waitForResolvedMessageId,
    setBranchSelection,
  };
}

