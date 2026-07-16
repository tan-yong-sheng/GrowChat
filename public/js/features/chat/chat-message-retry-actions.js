import { isTempMessageId } from '../../shared/utils/chat-cache.js';
import { applyStreamingAssistantText } from './chat-message-stream-assistant.js';
import {
  createSseStreamHandlers,
  finalizeStreamThinking,
} from '../../shared/utils/sse-event-handler.js';
import { buildStreamingCallback, buildSseStreamHandlersContext } from './chat-message-params.js';

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

      const loadBranchFallback = async ({
        assistantMessageId,
        assistantText,
        errorActive,
        errorMessage,
      }) => {
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
      };

      const controller = new AbortController();
      setActiveStreamAbort(() => controller.abort());
      setGlobalStreamAbort(getActiveStreamAbort());

      const { onEvent, onDelta, getStreamState, setStreamState } = buildSseStreamHandlersContext({
        chatId,
        tempAssistantId,
        tempUserId: null,
        replaceTempMessageId,
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

        await consumeSseTextStream(res.body, { onEvent, onDelta });

        const { assistantMessageId, assistantText, errorActive, errorMessage } = getStreamState();

        finalizeStreamThinking({
          assistantMessageId,
          thinkingStartByMessageId,
          thinkingDurationByMessageId,
          thinkingActiveByMessageId,
        });

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
          streaming: false,
        });
        streamingOverrideByChat.delete(chatId);

        await loadBranchFallback({
          assistantMessageId,
          assistantText,
          errorActive,
          errorMessage,
        });
      } catch (e) {
        if (e?.name !== 'AbortError') {
          console.error('Regeneration failed', e);
          const streamState = getStreamState();
          if (!streamState.errorActive) {
            setStreamState({
              errorMessage: String(e?.message || 'LLM request failed'),
              errorActive: true,
              assistantText: '',
            });
            const { assistantMessageId, assistantText, errorActive, errorMessage } =
              getStreamState();
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
              streaming: false,
            });
          }
          const { assistantMessageId, assistantText, errorActive, errorMessage } = getStreamState();
          await loadBranchFallback({
            assistantMessageId,
            assistantText,
            errorActive,
            errorMessage,
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
