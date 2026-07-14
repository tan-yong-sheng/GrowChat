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

  function remapCurrentLeaf(chatKey, tempId, realId) {
    if (currentLeafByChatId.get(chatKey) === String(tempId)) {
      currentLeafByChatId.set(chatKey, String(realId));
    }
  }

  function remapStreamingOverride(chatKey, tempId, realId) {
    if (!streamingOverrideByChat.has(chatKey)) return;
    const override = streamingOverrideByChat.get(chatKey);
    if (override?.targetMsgId && String(override.targetMsgId) === String(tempId)) {
      streamingOverrideByChat.set(chatKey, { ...override, targetMsgId: realId });
    }
  }

  function remapBranchSelection(chatKey, tempId, realId) {
    const branchMap = branchSelectionByChat.get(chatKey);
    if (!branchMap || !branchMap.size) return;
    const nextMap = new Map();
    for (const [k, v] of branchMap.entries()) {
      const nextKey = String(k) === String(tempId) ? String(realId) : k;
      const nextVal = String(v) === String(tempId) ? String(realId) : v;
      nextMap.set(nextKey, nextVal);
    }
    branchSelectionByChat.set(chatKey, nextMap);
  }

  const remapSelectionMaps = (chatId, tempId, realId) => {
    const chatKey = String(chatId);
    remapCurrentLeaf(chatKey, tempId, realId);
    remapStreamingOverride(chatKey, tempId, realId);
    remapBranchSelection(chatKey, tempId, realId);
  };

  function replaceMessageIdInMsg(msg, tempId, realId) {
    const next = { ...msg };
    const matchesId = String(next.id) === String(tempId);
    const matchesParent = String(next.parent_id || '') === String(tempId);
    if (matchesId) next.id = realId;
    if (matchesParent) next.parent_id = realId;
    return { next, changed: matchesId || matchesParent };
  }

  function buildReplacementMessages(existing, tempId, realId) {
    let replaced = false;
    const nextMessages = existing.map((msg) => {
      const { next, changed } = replaceMessageIdInMsg(msg, tempId, realId);
      if (changed) replaced = true;
      return next;
    });
    return { nextMessages, replaced };
  }

  function updateEditingMap(editing, tempId, realId) {
    const nextEditing = { ...editing };
    if (nextEditing[tempId]) {
      nextEditing[realId] = nextEditing[tempId];
      delete nextEditing[tempId];
    }
    return nextEditing;
  }

  function updateMessageAttributes(tempId, realId) {
    if (!messagesList) return;
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

  function runTempResolvers(chatKey, tempId, realId) {
    const resolverMap = pendingTempResolversByChat.get(chatKey);
    if (!resolverMap || !resolverMap.has(String(tempId))) return;
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

  const replaceTempMessageId = (chatId, tempId, realId) => {
    if (!chatId || !tempId || !realId || tempId === realId) return;
    mapTempMessageId(chatId, tempId, realId);
    const chatKey = String(chatId);
    setState((prev) => {
      const existing = prev.messagesByChat[chatKey] || [];
      if (!existing.length) return {};

      const { nextMessages, replaced } = buildReplacementMessages(existing, tempId, realId);
      const nextEditing = updateEditingMap(prev.ui?.editingMessages || {}, tempId, realId);

      remapSelectionMaps(chatId, tempId, realId);

      return replaced
        ? {
            messagesByChat: { ...prev.messagesByChat, [chatKey]: nextMessages },
            ui: { ...prev.ui, editingMessages: nextEditing },
          }
        : {};
    });

    if (activeChatIdGetter() === chatId) {
      updateMessageAttributes(tempId, realId);
    }

    runTempResolvers(chatKey, tempId, realId);
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

  function buildMessageFingerprint(message) {
    return {
      content: String(message.content || ''),
      role: String(message.role || ''),
      parent: message.parent_id ? String(message.parent_id) : null,
      created: Number(message.created_at || 0),
    };
  }

  function roleAllowsEmptyMatch(role) {
    return role === 'assistant';
  }

  function contentMatches(fingerprint, candidateContent) {
    if (candidateContent === fingerprint.content) return true;
    return roleAllowsEmptyMatch(fingerprint.role) && !candidateContent;
  }

  function candidateMatches(fingerprint, candidate) {
    if (candidate.role !== fingerprint.role) return false;
    if (String(candidate.parent_id || '') !== String(fingerprint.parent || '')) return false;
    return contentMatches(fingerprint, String(candidate.content || ''));
  }

  function findBestCandidateIndex(list, fingerprint) {
    let bestIdx = -1;
    let bestScore = Infinity;
    list.forEach((candidate, idx) => {
      if (!candidateMatches(fingerprint, candidate)) return;
      const delta = Math.abs((candidate.created_at || 0) - fingerprint.created);
      if (delta < bestScore) {
        bestScore = delta;
        bestIdx = idx;
      }
    });
    return bestIdx;
  }

  function applyMatchedTempMessage(chatId, key, list, bestIdx, realId) {
    const [candidate] = list.splice(bestIdx, 1);
    pendingTempMessagesByChat.set(key, list);
    replaceTempMessageId(chatId, candidate.id, realId);
  }

  const matchPendingTempMessage = (chatId, message) => {
    if (!chatId || !message?.id) return;
    const key = String(chatId);
    const list = pendingTempMessagesByChat.get(key) || [];
    if (!list.length) return;

    const fingerprint = buildMessageFingerprint(message);
    const bestIdx = findBestCandidateIndex(list, fingerprint);
    if (bestIdx >= 0) {
      applyMatchedTempMessage(chatId, key, list, bestIdx, message.id);
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
