import { isTempMessageId } from '../../shared/utils/chat-cache.js';
import { applyStreamingAssistantText } from './chat-message-stream-assistant.js';
import { createOptimisticTempMessages } from '../../shared/utils/optimistic-messages.js';
import {
  createSseStreamHandlers,
  finalizeStreamAndLoadMessages,
  handleStreamCatchError,
} from '../../shared/utils/sse-event-handler.js';
import { bindChatMessageDeleteActions } from './chat-message-delete-actions.js';
import { bindChatMessageRetryActions } from './chat-message-retry-actions.js';

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

  messagesList.querySelectorAll('[data-markdown-code-copy]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const shell = btn.closest('[data-markdown-code-block]');
      const code = shell?.querySelector('[data-markdown-code-body] code');
      const text = code?.textContent || '';
      try {
        await navigator.clipboard.writeText(text);
        showToast('Code copied');
      } catch {
        window.prompt('Copy code', text);
      }
    });
  });

  messagesList.querySelectorAll('[data-markdown-code-toggle]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const shell = btn.closest('[data-markdown-code-block]');
      const body = shell?.querySelector('[data-markdown-code-body]');
      if (!body) return;
      const collapsed = !body.classList.contains('hidden');
      body.classList.toggle('hidden', collapsed);
      btn.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
      const label = btn.querySelector('span');
      if (label) label.textContent = collapsed ? 'Expand' : 'Collapse';
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
      const textarea = messagesList.querySelector(
        `.edit-message-textarea[data-message-id="${originalId}"]`
      );
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

      const sourceMsg =
        getMessageById(chatId, originalId) ||
        projectedMessages.find((msg) => String(msg.id) === String(originalId));

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
          const message =
            err?.details?.message || err.error || err.message || 'Failed to copy message';
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

      const { tempUserId, tempAssistantId } = createOptimisticTempMessages({
        chatId,
        branchParentId,
        userContent: newContent,
        userAttachments: sourceAttachments,
        activeModelId: state.activeModelId,
        state,
        setState,
        registerPendingTempMessage,
        setBranchSelection,
        currentLeafByChatId,
        drawMessages,
      });

      const controller = new AbortController();
      setActiveStreamAbort(() => controller.abort());
      setGlobalStreamAbort(getActiveStreamAbort());

      const runBranchRequest = async (sourceId) => {
        const { onEvent, onDelta, getStreamState } = createSseStreamHandlers({
          chatId,
          tempAssistantId,
          tempUserId,
          replaceTempMessageId,
          applyAssistantText: (streaming = true) => {
            const s = getStreamState();
            applyStreamingAssistantText({
              state,
              setState,
              streamingOverrideByChat,
              updateMessageContentDom,
              chatId,
              messageId: s.assistantMessageId,
              assistantText: s.assistantText,
              errorActive: s.errorActive,
              errorMessage: s.errorMessage,
              streaming,
            });
          },
          ensureThinkingBlock,
          appendBlock,
          updateToolCallState,
          notePayloadSeq,
          thinkingStartByMessageId,
          thinkingDurationByMessageId,
          thinkingActiveByMessageId,
          toolCallsByMessageId,
          messageBlocksById,
          resolveTempMessageId,
          errorStrategy: 'reset',
        });

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
            applyAssistantErrorMessage(chatId, getStreamState().assistantMessageId, message);
            return;
          }
          await consumeSseTextStream(res.body, { onEvent, onDelta });
          await finalizeStreamAndLoadMessages({
            getStreamState,
            thinkingStartByMessageId,
            thinkingDurationByMessageId,
            thinkingActiveByMessageId,
            applyStreamingAssistantText,
            state,
            setState,
            streamingOverrideByChat,
            updateMessageContentDom,
            chatId,
            buildFallbackAssistantMessage,
            resolveTempMessageId,
            tempUserId,
            loadMessages,
            activeModelId: state.activeModelId,
            activeChatId: state.activeChatId,
            preferredLeafId: getStreamState().assistantMessageId,
          });
        } catch (e) {
          if (e?.name !== 'AbortError') {
            console.error('Branching failed', e);
            await handleStreamCatchError({
              error: e,
              getStreamState,
              applyStreamingAssistantText,
              state,
              setState,
              streamingOverrideByChat,
              updateMessageContentDom,
              chatId,
              buildFallbackAssistantMessage,
              resolveTempMessageId,
              tempUserId,
              loadMessages,
              activeModelId: state.activeModelId,
              activeChatId: state.activeChatId,
              preferredLeafId: getStreamState().assistantMessageId,
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
