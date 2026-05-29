import { isTempMessageId } from '../../shared/utils/chat-cache.js';
import { bindChatMessageDeleteActions } from './chat-message-delete-actions.js';
import { bindChatMessageRetryActions } from './chat-message-retry-actions.js';
import { bindChatMessageUiActions } from './chat-message-ui-actions.js';

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
  messageBlocksById,
}) {
  if (!messagesList) return;

  bindChatMessageUiActions({
    messagesList,
    projectedMessages,
    state,
    apiFetch,
    chatId,
    errorExpandedByMessageId,
    roundsByMessageId,
    branchSelectionByChat,
    resolveTempMessageId,
    setState,
    drawMessages,
    messages,
    showToast,
    waitForResolvedMessageId,
    getMessageById,
    currentLeafByChatId,
    setBranchSelection,
    loadMessages,
  });

  messagesList.querySelectorAll('.save-edit-btn').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const originalId = btn.getAttribute('data-message-id');
      const textarea = messagesList.querySelector(
        `.edit-message-textarea[data-message-id="${originalId}"]`
      );
      const newContent = textarea?.value.trim() || '';
      if (!newContent) return;

      const sourceMsg =
        getMessageById(chatId, originalId) ||
        projectedMessages.find((msg) => String(msg.id) === String(originalId));
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
      const attachmentIds = Array.from(
        new Set(sourceAttachments.map((item) => item?.id).filter(Boolean))
      );

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
          const targetIdx = currentMessages.findIndex(
            (m) => String(m.id) === String(assistantMessageId)
          );
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
            updateMessageContentDom(assistantMessageId, assistantText, {
              isError: errorActive,
              isStreaming: streaming,
            });
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
                const targetId = resolveTempMessageId(
                  chatId,
                  payload?.message_id || assistantMessageId
                );
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
            preferredLeafId: assistantMessageId,
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
              preferredLeafId: assistantMessageId,
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
  bindChatMessageDeleteActions({
    messagesList,
    chatId,
    state,
    setState,
    apiFetch,
    loadMessages,
    resolveTempMessageId,
    waitForResolvedMessageId,
    currentLeafByChatId,
    branchSelectionByChat,
    streamingOverrideByChat,
    getActiveStreamAbort,
    setActiveStreamAbort,
    clearGlobalStreamAbort,
    drawMessages,
    showToast,
  });
  bindChatMessageRetryActions({
    messagesList,
    chatId,
    state,
    setState,
    drawMessages,
    projectedMessages,
    apiFetch,
    loadMessages,
    waitForResolvedMessageId,
    showToast,
    getMessageById,
    resolveTempMessageId,
    replaceTempMessageId,
    setBranchSelection,
    currentLeafByChatId,
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
    updateMessageContentDom,
    thinkingStartByMessageId,
    thinkingDurationByMessageId,
    thinkingActiveByMessageId,
    toolCallsByMessageId,
    messageBlocksById,
  });
  messagesList.querySelectorAll('[data-citation-id]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const id = btn.getAttribute('data-citation-id');
      if (!id) return;
      openCitation(id);
    });
  });
}
