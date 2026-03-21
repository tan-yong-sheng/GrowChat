import { isTempMessageId } from '../../shared/utils/chat-cache.js';

export function bindChatMessageActions({
  messagesList,
  messages,
  projectedMessages,
  roundsByMessageId,
  state,
  setState,
  drawMessages,
  chatId,
  errorExpandedByMessageId,
  showToast,
  apiFetch,
  loadMessages,
  waitForResolvedMessageId,
  getMessageById,
  resolveTempMessageId,
  replaceTempMessageId,
  registerPendingTempMessage,
  setBranchSelection,
  currentLeafByChatId,
  branchSelectionByChat,
  streamingOverrideByChat,
  setStreamingState,
  getActiveStreamAbort,
  setActiveStreamAbort,
  clearGlobalStreamAbort,
  setGlobalStreamAbort,
  consumeSseTextStream,
  appendBlock,
  ensureThinkingBlock,
  updateToolCallState,
  notePayloadSeq,
  buildFallbackAssistantMessage,
  formatApiErrorMessage,
  updateMessageContentDom,
  applyAssistantErrorMessage,
  openCitation,
  thinkingStartByMessageId,
  thinkingDurationByMessageId,
  thinkingActiveByMessageId,
  toolCallsByMessageId,
  toolExpandedByKey,
  thinkingCollapsedByKey,
  messageBlocksById,
}) {
  if (!messagesList) return;

  messagesList.querySelectorAll('[data-error-toggle]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const id = btn.getAttribute('data-error-toggle');
      if (!id) return;
      const isExpanded = errorExpandedByMessageId.get(String(id)) ?? false;
      const next = !isExpanded;
      errorExpandedByMessageId.set(String(id), next);

      const body = messagesList.querySelector(`[data-error-body="${id}"]`);
      const overlay = messagesList.querySelector(`[data-error-overlay="${id}"]`);
      if (body) {
        body.classList.toggle('max-h-24', !next);
        body.classList.toggle('overflow-hidden', !next);
      }
      if (overlay) {
        overlay.classList.toggle('hidden', next);
      }
      btn.textContent = next ? 'Less' : 'More';
    });
  });

  messagesList.querySelectorAll('[data-copy-message]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const idx = Number(btn.getAttribute('data-copy-message'));
      const text = projectedMessages[idx]?.content || '';
      try {
        await navigator.clipboard.writeText(text);
        showToast('Message copied');
      } catch {
        window.prompt('Copy message', text);
      }
    });
  });

  messagesList.querySelectorAll('[data-edit-message]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const id = btn.getAttribute('data-edit-message');
      const m = projectedMessages.find((msg) => String(msg.id) === String(id));
      const content = m?.content || '';
      const newEditing = { ...state.ui.editingMessages, [id]: content };
      setState({ ui: { ...state.ui, editingMessages: newEditing } });
      drawMessages(messages);
    });
  });

  const onRoundSwitch = (targetMsgId, direction) => {
    const resolvedId = resolveTempMessageId(chatId, targetMsgId);
    const rounds = roundsByMessageId.get(String(resolvedId));
    if (!rounds) return;
    const nextId = direction === 'next' ? rounds.nextId : rounds.prevId;
    if (!nextId) return;

    const chatMap = branchSelectionByChat.get(chatId) || new Map();
    chatMap.set(String(rounds.parentKey), String(nextId));
    branchSelectionByChat.set(chatId, chatMap);

    currentLeafByChatId.set(chatId, String(nextId));
    drawMessages(messages);
  };

  messagesList.querySelectorAll('[data-round-prev]').forEach((btn) => {
    btn.addEventListener('click', () => onRoundSwitch(btn.dataset.roundPrev, 'prev'));
  });
  messagesList.querySelectorAll('[data-round-next]').forEach((btn) => {
    btn.addEventListener('click', () => onRoundSwitch(btn.dataset.roundNext, 'next'));
  });

  messagesList.querySelectorAll('.cancel-edit-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const id = btn.getAttribute('data-message-id');
      const newEditing = { ...state.ui.editingMessages };
      delete newEditing[id];
      setState({ ui: { ...state.ui, editingMessages: newEditing } });
      drawMessages(messages);
    });
  });

  messagesList.querySelectorAll('.save-copy-btn').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const originalId = btn.getAttribute('data-message-id');
      let id = originalId;
      const textarea = messagesList.querySelector(`.edit-message-textarea[data-message-id="${originalId}"]`);
      const newContent = textarea?.value.trim() || '';
      if (isTempMessageId(id)) {
        const resolved = await waitForResolvedMessageId(state.activeChatId, id);
        if (!resolved) {
          showToast('Message still saving. Please wait.');
          return;
        }
        id = resolved;
      }
      if (!newContent) return;

      const sourceMsg = getMessageById(chatId, originalId) || projectedMessages.find((msg) => String(msg.id) === String(originalId));

      try {
        const res = await apiFetch(`/api/chats/${chatId}/messages/${id}/branch`, {
          method: 'POST',
          body: JSON.stringify({
            content: newContent,
            role: 'assistant',
            no_reply: true,
          }),
        });

        if (res.ok) {
          const data = await res.json().catch(() => ({}));
          const newEditing = { ...state.ui.editingMessages };
          delete newEditing[originalId];
          delete newEditing[id];
          setState({ ui: { ...state.ui, editingMessages: newEditing } });
          if (data?.message?.id) {
            currentLeafByChatId.set(chatId, String(data.message.id));
            setBranchSelection(chatId, sourceMsg?.parent_id || null, data.message.id);
          }
          await loadMessages(chatId);
        } else {
          const err = await res.json().catch(() => ({}));
          const message = err?.details?.message || err.error || err.message || 'Failed to copy message';
          alert(message);
        }
      } catch (e) {
        console.error('Copy failed', e);
        alert('An error occurred while copying the message.');
      }
    });
  });

  messagesList.querySelectorAll('.save-edit-btn').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const originalId = btn.getAttribute('data-message-id');
      const textarea = messagesList.querySelector(`.edit-message-textarea[data-message-id="${originalId}"]`);
      const newContent = textarea?.value.trim() || '';
      if (!newContent) return;

      const sourceMsg = getMessageById(chatId, originalId) || projectedMessages.find((msg) => String(msg.id) === String(originalId));
      if (!sourceMsg) return;

      if (sourceMsg?.role === 'assistant') {
        let id = originalId;
        if (isTempMessageId(id)) {
          const resolved = await waitForResolvedMessageId(state.activeChatId, id);
          if (!resolved) {
            showToast('Message still saving. Please wait.');
            return;
          }
          id = resolved;
        }
        try {
          const res = await apiFetch(`/api/chats/${chatId}/messages/${id}`, {
            method: 'PUT',
            body: JSON.stringify({ content: newContent }),
          });

          if (res.ok) {
            const newEditing = { ...state.ui.editingMessages };
            delete newEditing[originalId];
            delete newEditing[id];
            setState({ ui: { ...state.ui, editingMessages: newEditing } });
            await loadMessages(chatId, {
              draw: state.activeChatId === chatId,
              updateActiveModel: state.activeChatId === chatId,
            });
          } else {
            const err = await res.json().catch(() => ({}));
            alert(err.error || err.message || 'Failed to update message');
          }
        } catch (e) {
          console.error('Update failed', e);
          alert('An error occurred while updating the message.');
        }
        return;
      }

      const branchParentId = sourceMsg?.parent_id || null;
      const sourceAttachments = Array.isArray(sourceMsg?.attachments) ? sourceMsg.attachments : [];
      const attachmentIds = Array.from(new Set(sourceAttachments.map((item) => item?.id).filter(Boolean)));

      const newEditing = { ...state.ui.editingMessages };
      delete newEditing[originalId];
      setState({ ui: { ...state.ui, editingMessages: newEditing } });

      const tempUserId = `temp-user-${Date.now()}`;
      const tempAssistantId = `temp-assistant-${Date.now()}`;
      const nowTs = Math.floor(Date.now() / 1000);

      let localMessages = [...(state.messagesByChat[chatId] || [])];
      const tempUserMessage = {
        id: tempUserId,
        role: 'user',
        content: newContent,
        model: state.activeModelId,
        attachments: sourceAttachments,
        parent_id: branchParentId,
        created_at: nowTs,
        done: true,
      };
      localMessages.push(tempUserMessage);
      registerPendingTempMessage(chatId, tempUserMessage);
      setBranchSelection(chatId, branchParentId, tempUserId);
      localMessages.push({
        id: tempAssistantId,
        role: 'assistant',
        content: '',
        model: state.activeModelId,
        parent_id: tempUserId,
        created_at: nowTs + 1,
        done: false,
      });
      registerPendingTempMessage(chatId, {
        id: tempAssistantId,
        role: 'assistant',
        content: '',
        parent_id: tempUserId,
        created_at: nowTs + 1,
      });

      currentLeafByChatId.set(chatId, tempAssistantId);
      setState((prev) => ({ messagesByChat: { ...prev.messagesByChat, [chatId]: localMessages } }));
      if (state.activeChatId === chatId) drawMessages(localMessages);

      const controller = new AbortController();
      setActiveStreamAbort(() => controller.abort());
      setGlobalStreamAbort(getActiveStreamAbort());

      const runBranchRequest = async (sourceId) => {
        let assistantMessageId = tempAssistantId;
        let errorMessage = null;
        let errorActive = false;
        let assistantText = '';

        function applyAssistantText(streaming = true) {
          streamingOverrideByChat.set(chatId, {
            targetMsgId: assistantMessageId,
            content: assistantText,
          });

          const currentMessages = [...(state.messagesByChat[chatId] || [])];
          const targetIdx = currentMessages.findIndex((m) => String(m.id) === String(assistantMessageId));
          if (targetIdx >= 0) {
            currentMessages[targetIdx] = {
              ...currentMessages[targetIdx],
              content: assistantText,
              status: errorActive ? 'error' : currentMessages[targetIdx].status,
              error_message: errorActive ? errorMessage : currentMessages[targetIdx].error_message,
            };
            setState((prev) => ({
              messagesByChat: { ...prev.messagesByChat, [chatId]: currentMessages },
            }));
          }
          if (state.activeChatId === chatId) {
            updateMessageContentDom(assistantMessageId, assistantText, { isError: errorActive, isStreaming: streaming });
          }
        }

        try {
          setStreamingState(chatId, true);
          const res = await apiFetch(`/api/chats/${chatId}/messages/${sourceId}/branch`, {
            method: 'POST',
            body: JSON.stringify({
              content: newContent,
              model: state.activeModelId || undefined,
              ...(attachmentIds.length ? { attachments: attachmentIds } : {}),
            }),
            signal: controller.signal,
          });

          if (!res.ok || !res.body) {
            const err = await res.json().catch(() => ({}));
            const message = formatApiErrorMessage(err, 'Failed to connect to the server.');
            applyAssistantErrorMessage(chatId, assistantMessageId, message);
            return;
          }

          await consumeSseTextStream(res.body, {
            onEvent: (payload) => {
              if (payload?.event === 'start' && payload?.user_message_id) {
                replaceTempMessageId(chatId, tempUserId, String(payload.user_message_id));
              }
              if (payload?.event === 'start' && payload?.message_id) {
                assistantMessageId = String(payload.message_id);
                replaceTempMessageId(chatId, tempAssistantId, assistantMessageId);
                if (!thinkingActiveByMessageId.has(String(assistantMessageId))) {
                  thinkingActiveByMessageId.set(String(assistantMessageId), true);
                }
                if (!thinkingStartByMessageId.has(String(assistantMessageId))) {
                  thinkingStartByMessageId.set(String(assistantMessageId), Date.now());
                }
                applyAssistantText(true);
              }
              if (payload?.event === 'reasoning_start') {
                if (!thinkingStartByMessageId.has(String(assistantMessageId))) {
                  thinkingStartByMessageId.set(String(assistantMessageId), Date.now());
                }
                thinkingActiveByMessageId.set(String(assistantMessageId), true);
                ensureThinkingBlock(messageBlocksById, assistantMessageId);
                applyAssistantText();
              }
              if (payload?.event === 'reasoning_delta') {
                const delta = String(payload.delta || '');
                if (delta) {
                  appendBlock(messageBlocksById, assistantMessageId, 'thinking', delta);
                  thinkingActiveByMessageId.set(String(assistantMessageId), true);
                  applyAssistantText();
                }
              }
              if (payload?.event === 'reasoning_end') {
                const duration = Number(payload.duration_ms);
                if (Number.isFinite(duration) && duration > 0) {
                  thinkingDurationByMessageId.set(String(assistantMessageId), duration);
                }
                thinkingActiveByMessageId.delete(String(assistantMessageId));
              }
              if (payload?.event === 'tool_status' || payload?.event === 'tool_result') {
                const targetId = resolveTempMessageId(chatId, payload?.message_id || assistantMessageId);
                updateToolCallState(toolCallsByMessageId, messageBlocksById, targetId, payload);
                applyAssistantText();
              }
              if (payload?.error) {
                errorMessage = payload.message || payload.error || 'LLM request failed';
                errorActive = true;
                assistantText = '';
                applyAssistantText();
              }
              notePayloadSeq(payload, assistantMessageId);
            },
            onDelta: (delta) => {
              if (!delta) return;
              assistantText += delta;
              appendBlock(messageBlocksById, assistantMessageId, 'text', delta);
              applyAssistantText();
            },
          });

          const startedAt = thinkingStartByMessageId.get(String(assistantMessageId));
          if (startedAt && !thinkingDurationByMessageId.has(String(assistantMessageId))) {
            thinkingDurationByMessageId.set(String(assistantMessageId), Date.now() - startedAt);
          }
          thinkingActiveByMessageId.delete(String(assistantMessageId));
          applyAssistantText(false);
          streamingOverrideByChat.delete(chatId);
          const fallback = buildFallbackAssistantMessage(chatId, assistantMessageId, {
            content: assistantText,
            errorActive,
            errorMessage,
            model: state.activeModelId,
            parentId: resolveTempMessageId(chatId, tempUserId),
          });
          await loadMessages(chatId, {
            draw: state.activeChatId === chatId,
            updateActiveModel: state.activeChatId === chatId,
            fallbackMessage: fallback,
          });
        } catch (e) {
          if (e?.name !== 'AbortError') {
            console.error('Branching failed', e);
            if (!errorActive) {
              errorMessage = String(e?.message || 'LLM request failed');
              errorActive = true;
              assistantText = '';
              applyAssistantText(false);
            }
            const fallback = buildFallbackAssistantMessage(chatId, assistantMessageId, {
              content: assistantText,
              errorActive,
              errorMessage,
              model: state.activeModelId,
              parentId: resolveTempMessageId(chatId, tempUserId),
            });
            await loadMessages(chatId, {
              draw: state.activeChatId === chatId,
              updateActiveModel: state.activeChatId === chatId,
              fallbackMessage: fallback,
            });
          }
        } finally {
          streamingOverrideByChat.delete(chatId);
          clearGlobalStreamAbort(getActiveStreamAbort());
          setActiveStreamAbort(null);
          setStreamingState(chatId, false);
        }
      };

      const sourceId = originalId;
      if (isTempMessageId(sourceId)) {
        waitForResolvedMessageId(chatId, sourceId).then((resolved) => {
          if (!resolved) {
            showToast('Message still saving. Please wait.');
            return;
          }
          runBranchRequest(resolved);
        });
      } else {
        runBranchRequest(sourceId);
      }
    });
  });

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

  messagesList.querySelectorAll('[data-retry-message]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      let id = btn.getAttribute('data-retry-message');
      if (isTempMessageId(id)) {
        const resolved = await waitForResolvedMessageId(state.activeChatId, id);
        if (!resolved) {
          showToast('Message still saving. Please wait.');
          return;
        }
        id = resolved;
      }
      const sourceMsg = getMessageById(chatId, id) || projectedMessages.find((msg) => String(msg.id) === String(id));
      if (!sourceMsg) return;
      const branchParentId = sourceMsg.parent_id || null;

      const tempAssistantId = `temp-assistant-${Date.now()}`;
      const nowTs = Math.floor(Date.now() / 1000);

      let localMessages = [...(state.messagesByChat[chatId] || [])];
      localMessages.push({
        id: tempAssistantId,
        role: 'assistant',
        content: '',
        model: state.activeModelId,
        parent_id: branchParentId,
        created_at: nowTs,
        done: false,
      });

      currentLeafByChatId.set(chatId, tempAssistantId);
      setBranchSelection(chatId, branchParentId, tempAssistantId);
      setState((prev) => ({ messagesByChat: { ...prev.messagesByChat, [chatId]: localMessages } }));
      if (state.activeChatId === chatId) drawMessages(localMessages);

      const controller = new AbortController();
      setActiveStreamAbort(() => controller.abort());
      setGlobalStreamAbort(getActiveStreamAbort());

      try {
        setStreamingState(chatId, true);
        const res = await apiFetch(`/api/chats/${chatId}/messages/${id}/regenerate`, {
          method: 'POST',
          signal: controller.signal,
        });

        if (!res.ok || !res.body) {
          setStreamingState(chatId, false);
          const err = await res.json().catch(() => ({}));
          alert(err.error || 'backend api not found');
          return;
        }

        let assistantMessageId = tempAssistantId;
        let errorMessage = null;
        let errorActive = false;
        let assistantText = '';
        await consumeSseTextStream(res.body, {
          onEvent: (payload) => {
            if (payload?.event === 'start' && payload?.message_id) {
              assistantMessageId = String(payload.message_id);
              replaceTempMessageId(chatId, tempAssistantId, assistantMessageId);
              if (!thinkingActiveByMessageId.has(String(assistantMessageId))) {
                thinkingActiveByMessageId.set(String(assistantMessageId), true);
              }
              if (!thinkingStartByMessageId.has(String(assistantMessageId))) {
                thinkingStartByMessageId.set(String(assistantMessageId), Date.now());
              }
              applyAssistantText(true);
            }
            if (payload?.event === 'reasoning_start') {
              if (!thinkingStartByMessageId.has(String(assistantMessageId))) {
                thinkingStartByMessageId.set(String(assistantMessageId), Date.now());
              }
              thinkingActiveByMessageId.set(String(assistantMessageId), true);
              ensureThinkingBlock(messageBlocksById, assistantMessageId);
              applyAssistantText();
            }
            if (payload?.event === 'reasoning_delta') {
              const delta = String(payload.delta || '');
              if (delta) {
                appendBlock(messageBlocksById, assistantMessageId, 'thinking', delta);
                thinkingActiveByMessageId.set(String(assistantMessageId), true);
                applyAssistantText();
              }
            }
            if (payload?.event === 'reasoning_end') {
              const duration = Number(payload.duration_ms);
              if (Number.isFinite(duration) && duration > 0) {
                thinkingDurationByMessageId.set(String(assistantMessageId), duration);
              }
              thinkingActiveByMessageId.delete(String(assistantMessageId));
            }
            if (payload?.event === 'tool_status' || payload?.event === 'tool_result') {
              const targetId = resolveTempMessageId(chatId, payload?.message_id || assistantMessageId);
              updateToolCallState(toolCallsByMessageId, messageBlocksById, targetId, payload);
              applyAssistantText();
            }
            if (payload?.error) {
              errorMessage = payload.message || payload.error || 'LLM request failed';
              errorActive = true;
              assistantText = '';
              applyAssistantText();
            }
            notePayloadSeq(payload, assistantMessageId);
          },
          onDelta: (delta) => {
            if (!delta) return;
            assistantText += delta;
            appendBlock(messageBlocksById, assistantMessageId, 'text', delta);
            applyAssistantText();
          },
        });

        function applyAssistantText(streaming = true) {
          streamingOverrideByChat.set(chatId, {
            targetMsgId: assistantMessageId,
            content: assistantText,
          });

          const currentMessages = [...(state.messagesByChat[chatId] || [])];
          const targetIdx = currentMessages.findIndex((m) => String(m.id) === String(assistantMessageId));
          if (targetIdx >= 0) {
            currentMessages[targetIdx] = {
              ...currentMessages[targetIdx],
              content: assistantText,
              status: errorActive ? 'error' : currentMessages[targetIdx].status,
              error_message: errorActive ? errorMessage : currentMessages[targetIdx].error_message,
            };
            setState((prev) => ({
              messagesByChat: { ...prev.messagesByChat, [chatId]: currentMessages },
            }));
          }
          if (state.activeChatId === chatId) {
            updateMessageContentDom(assistantMessageId, assistantText, { isError: errorActive, isStreaming: streaming });
          }
        }

        const startedAt = thinkingStartByMessageId.get(String(assistantMessageId));
        if (startedAt && !thinkingDurationByMessageId.has(String(assistantMessageId))) {
          thinkingDurationByMessageId.set(String(assistantMessageId), Date.now() - startedAt);
        }
        thinkingActiveByMessageId.delete(String(assistantMessageId));
        applyAssistantText(false);
        streamingOverrideByChat.delete(chatId);
        const fallback = buildFallbackAssistantMessage(chatId, assistantMessageId, {
          content: assistantText,
          errorActive,
          errorMessage,
          model: state.activeModelId,
          parentId: branchParentId,
        });
        await loadMessages(chatId, {
          draw: state.activeChatId === chatId,
          updateActiveModel: state.activeChatId === chatId,
          fallbackMessage: fallback,
        });
      } catch (e) {
        if (e?.name !== 'AbortError') {
          console.error('Regeneration failed', e);
          if (!errorActive) {
            errorMessage = String(e?.message || 'LLM request failed');
            errorActive = true;
            assistantText = '';
            applyAssistantText(false);
          }
          const fallback = buildFallbackAssistantMessage(chatId, assistantMessageId, {
            content: assistantText,
            errorActive,
            errorMessage,
            model: state.activeModelId,
            parentId: branchParentId,
          });
          await loadMessages(chatId, {
            draw: state.activeChatId === chatId,
            updateActiveModel: state.activeChatId === chatId,
            fallbackMessage: fallback,
          });
        }
      } finally {
        streamingOverrideByChat.delete(chatId);
        clearGlobalStreamAbort(getActiveStreamAbort());
        setActiveStreamAbort(null);
        setStreamingState(chatId, false);
      }
    });
  });

  messagesList.querySelectorAll('[data-citation-id]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const id = btn.getAttribute('data-citation-id');
      if (!id) return;
      openCitation(id);
    });
  });
}

