import { isTempMessageId } from '../../shared/utils/chat-cache.js';
import { applyStreamingAssistantText } from './chat-message-stream-assistant.js';

export function bindChatMessageRetryActions({
  messagesList,
  chatId,
  state,
  setState = () => {},
  drawMessages = () => {},
  projectedMessages = [],
  apiFetch,
  loadMessages = async () => {},
  waitForResolvedMessageId = async () => null,
  showToast = () => {},
  getMessageById = () => null,
  resolveTempMessageId = (_, id) => id,
  replaceTempMessageId = () => {},
  setBranchSelection = () => {},
  currentLeafByChatId = new Map(),
  streamingOverrideByChat = new Map(),
  setStreamingState = () => {},
  getActiveStreamAbort = () => null,
  setActiveStreamAbort = () => {},
  clearGlobalStreamAbort = () => {},
  setGlobalStreamAbort = () => {},
  consumeSseTextStream,
  appendBlock = () => {},
  ensureThinkingBlock = () => {},
  updateToolCallState = () => {},
  notePayloadSeq = () => {},
  buildFallbackAssistantMessage = () => null,
  updateMessageContentDom = () => {},
  thinkingStartByMessageId = new Map(),
  thinkingDurationByMessageId = new Map(),
  thinkingActiveByMessageId = new Map(),
  toolCallsByMessageId = new Map(),
  messageBlocksById = new Map(),
} = {}) {
  if (!messagesList) return;

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

      const sourceMsg =
        getMessageById(chatId, id) ||
        projectedMessages.find((msg) => String(msg.id) === String(id));
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

      setState((prev) => ({
        messagesByChat: { ...prev.messagesByChat, [chatId]: localMessages },
      }));

      if (state.activeChatId === chatId) drawMessages(localMessages);

      const controller = new AbortController();
      setActiveStreamAbort(() => controller.abort());
      setGlobalStreamAbort(getActiveStreamAbort());

      let assistantMessageId = tempAssistantId;
      let errorMessage = null;
      let errorActive = false;
      let assistantText = '';

      function applyText(streaming = true) {
        applyStreamingAssistantText({
          state,
          setState,
          streamingOverrideByChat,
          updateMessageContentDom,
          chatId,
          messageId: assistantMessageId,
          assistantText,
          errorActive,
          errorMessage,
          streaming,
        });
      }

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
              applyText(true);
            }
            if (payload?.event === 'reasoning_start') {
              if (!thinkingStartByMessageId.has(String(assistantMessageId))) {
                thinkingStartByMessageId.set(String(assistantMessageId), Date.now());
              }
              thinkingActiveByMessageId.set(String(assistantMessageId), true);
              ensureThinkingBlock(messageBlocksById, assistantMessageId);
              applyText();
            }
            if (payload?.event === 'reasoning_delta') {
              const delta = String(payload.delta || '');
              if (delta) {
                appendBlock(messageBlocksById, assistantMessageId, 'thinking', delta);
                thinkingActiveByMessageId.set(String(assistantMessageId), true);
                applyText();
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
              applyText();
            }
            if (payload?.error) {
              errorMessage = payload.message || payload.error || 'LLM request failed';
              errorActive = true;
              assistantText = '';
              applyText();
            }
            notePayloadSeq(payload, assistantMessageId);
          },
          onDelta: (delta) => {
            if (!delta) return;
            assistantText += delta;
            appendBlock(messageBlocksById, assistantMessageId, 'text', delta);
            applyText();
          },
        });

        const startedAt = thinkingStartByMessageId.get(String(assistantMessageId));
        if (startedAt && !thinkingDurationByMessageId.has(String(assistantMessageId))) {
          thinkingDurationByMessageId.set(String(assistantMessageId), Date.now() - startedAt);
        }
        thinkingActiveByMessageId.delete(String(assistantMessageId));

        applyText(false);
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
          preferredLeafId: assistantMessageId,
          fallbackMessage: fallback,
        });
      } catch (e) {
        if (e?.name !== 'AbortError') {
          console.error('Regeneration failed', e);
          if (!errorActive) {
            errorMessage = String(e?.message || 'LLM request failed');
            errorActive = true;
            assistantText = '';
            applyText(false);
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
    });
  });
}
