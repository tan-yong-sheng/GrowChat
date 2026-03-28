import { isTempMessageId } from '../../shared/utils/chat-cache.js';

export function bindChatMessageDeleteActions({
  messagesList,
  chatId,
  state,
  setState = () => {},
  apiFetch,
  loadMessages = async () => {},
  resolveTempMessageId = (_, id) => id,
  waitForResolvedMessageId = async () => null,
  currentLeafByChatId = new Map(),
  branchSelectionByChat = new Map(),
  streamingOverrideByChat = new Map(),
  getActiveStreamAbort = () => null,
  setActiveStreamAbort = () => {},
  clearGlobalStreamAbort = () => {},
  drawMessages = () => {},
  showToast = () => {},
} = {}) {
  if (!messagesList) return;

  messagesList.querySelectorAll('[data-delete-message]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const originalId = btn.getAttribute('data-delete-message');
      const getDeleteKey = (messageId) => `${chatId}:${String(messageId)}`;
      const isDeletePending = (messageId) => Boolean((state.ui?.pendingDeleteMessageKeys || {})[getDeleteKey(messageId)]);
      const setDeletePending = (messageIds, pending) => {
        const ids = Array.isArray(messageIds) ? messageIds : [messageIds];
        setState((prev) => {
          const next = { ...(prev.ui?.pendingDeleteMessageKeys || {}) };
          ids.forEach((messageId) => {
            if (!messageId) return;
            const key = getDeleteKey(messageId);
            if (pending) next[key] = true;
            else delete next[key];
          });
          return { ui: { ...prev.ui, pendingDeleteMessageKeys: next } };
        });
      };
      const syncDeleteButtonState = (locked) => {
        btn.disabled = locked;
        btn.setAttribute('aria-disabled', locked ? 'true' : 'false');
        btn.classList.toggle('opacity-50', locked);
        btn.classList.toggle('cursor-not-allowed', locked);
        btn.classList.toggle('pointer-events-none', locked);
      };

      if (!confirm('Are you sure you want to delete this message and all subsequent messages?')) return;
      if (isDeletePending(originalId) || isDeletePending(resolveTempMessageId(chatId, originalId))) return;

      let id = originalId;
      const pendingIds = new Set([String(originalId)]);
      setDeletePending(originalId, true);
      syncDeleteButtonState(true);

      const prevMessages = state.messagesByChat[chatId] || [];
      const prevLeaf = currentLeafByChatId.get(chatId) || null;
      const prevBranchMap = branchSelectionByChat.get(chatId)
        ? new Map(branchSelectionByChat.get(chatId))
        : null;

      const byParent = new Map();
      prevMessages.forEach((msg) => {
        const parentKey = msg.parent_id ? String(msg.parent_id) : '__root__';
        if (!byParent.has(parentKey)) byParent.set(parentKey, []);
        byParent.get(parentKey).push(String(msg.id));
      });
      const idsToDelete = new Set();
      const stack = [String(id)];
      while (stack.length) {
        const current = stack.pop();
        if (!current || idsToDelete.has(current)) continue;
        idsToDelete.add(current);
        const children = byParent.get(String(current)) || [];
        children.forEach((child) => stack.push(String(child)));
      }

      const rollbackDelete = () => {
        if (!prevMessages.length) return;
        setState((prev) => ({ messagesByChat: { ...prev.messagesByChat, [chatId]: prevMessages } }));
        if (prevLeaf) currentLeafByChatId.set(chatId, String(prevLeaf));
        else currentLeafByChatId.delete(chatId);
        if (prevBranchMap) branchSelectionByChat.set(chatId, prevBranchMap);
        if (state.activeChatId === chatId) drawMessages(prevMessages);
      };

      const applyOptimisticDelete = () => {
        if (idsToDelete.size > 0) {
          const streamingTarget = streamingOverrideByChat.get(chatId)?.targetMsgId;
          const streamingId = streamingTarget ? resolveTempMessageId(chatId, streamingTarget) : null;
          if (streamingId && idsToDelete.has(String(streamingId))) {
            const activeAbort = getActiveStreamAbort();
            activeAbort?.();
            clearGlobalStreamAbort(activeAbort);
            setActiveStreamAbort(null);
            streamingOverrideByChat.delete(chatId);
          }

          const remaining = prevMessages.filter((msg) => !idsToDelete.has(String(msg.id)));
          const nextLeaf = remaining.length ? remaining[remaining.length - 1].id : null;
          if (nextLeaf) currentLeafByChatId.set(chatId, String(nextLeaf));
          else currentLeafByChatId.delete(chatId);

          if (prevBranchMap) {
            const nextMap = new Map();
            for (const [k, v] of prevBranchMap.entries()) {
              if (idsToDelete.has(String(k)) || idsToDelete.has(String(v))) continue;
              nextMap.set(k, v);
            }
            branchSelectionByChat.set(chatId, nextMap);
          }

          setState((prev) => ({
            messagesByChat: { ...prev.messagesByChat, [chatId]: remaining },
          }));
          if (state.activeChatId === chatId) {
            requestAnimationFrame(() => {
              drawMessages(remaining);
            });
          }
        }
      };
      applyOptimisticDelete();

      const runDelete = async (resolvedId) => {
        pendingIds.add(String(resolvedId));
        setDeletePending(resolvedId, true);
        try {
          const res = await apiFetch(`/api/chats/${chatId}/messages/${resolvedId}`, {
            method: 'DELETE',
          });

          if (res.status === 404) {
            await loadMessages(chatId);
            return;
          }

          if (res.ok) {
            await loadMessages(chatId);
          } else {
            const err = await res.json().catch(() => ({}));
            alert(err.error || 'Failed to delete message');
            rollbackDelete();
          }
        } catch (e) {
          console.error('Delete failed', e);
          alert('An error occurred while deleting the message.');
          rollbackDelete();
        } finally {
          setDeletePending([...pendingIds], false);
          syncDeleteButtonState(false);
        }
      };

      if (isTempMessageId(id)) {
        waitForResolvedMessageId(chatId, id).then((resolved) => {
          if (!resolved) {
            setDeletePending(id, false);
            syncDeleteButtonState(false);
            showToast('Delete queued while message saves.');
            return;
          }
          runDelete(resolved);
        });
        return;
      }

      runDelete(id);
    });
  });
}
