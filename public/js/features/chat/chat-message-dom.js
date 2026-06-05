import { escapeHtml } from '../../shared/utils/dom-escape.js';

export function createChatMessageDom({
  messagesList,
  state,
  setState,
  renderAssistantMessageBody,
  errorExpandedByMessageId,
  thinkingActiveByMessageId,
  thinkingDurationByMessageId,
  toolCallsByMessageId,
  thinkingCollapsedByKey,
  toolExpandedByKey,
  messageBlocksById,
}) {
  const stateMaps = {
    errorExpandedByMessageId,
    thinkingActiveByMessageId,
    thinkingDurationByMessageId,
    toolCallsByMessageId,
    thinkingCollapsedByKey,
    toolExpandedByKey,
    messageBlocksById,
  };

  // Track incremental streaming state per message
  const streamingState = new WeakMap();

  function updateMessageContentDom(messageId, content, options = {}) {
    if (!messageId) return false;
    const el = messagesList?.querySelector?.(`[data-message-content="${messageId}"]`);
    if (!el) return false;
    const {
      isError = false,
      isStreaming = false,
      errorMessage = '',
      chatId = state.activeChatId,
    } = options;
    const forceError = isError || el.dataset.messageError === '1';
    if (forceError) {
      el.dataset.messageError = '1';
    }

    if (isStreaming) {
      const selection = document.getSelection?.();
      const anchorNode = selection?.anchorNode || null;
      const focusNode = selection?.focusNode || null;
      const hasActiveSelection =
        Boolean(selection && !selection.isCollapsed) &&
        ((anchorNode && el.contains(anchorNode)) || (focusNode && el.contains(focusNode)));
      if (hasActiveSelection) {
        return true;
      }

      // Check if we can do incremental text update (no thinking, no tools)
      const key = String(messageId);
      const hasThinking = thinkingActiveByMessageId?.get(key) === true;
      const hasTools = (toolCallsByMessageId?.get(key) || []).some(
        (call) => String(call?.status || '').toLowerCase() === 'running'
      );
      const canIncremental = !hasThinking && !hasTools && !forceError;

      if (canIncremental) {
        // Incremental text append for streaming text content
        const prev = streamingState.get(el) || { lastLength: 0 };
        const textEl = el.querySelector('[data-streaming-text]');
        if (textEl && prev.lastLength <= content.length) {
          // Append only the new delta
          const delta = content.slice(prev.lastLength);
          if (delta) {
            const escapedDelta = escapeHtml(delta).replace(/\n/g, '<br/>');
            textEl.insertAdjacentHTML('beforeend', escapedDelta);
            prev.lastLength = content.length;
            streamingState.set(el, prev);
            return true;
          }
        }
        // First time or fallback: render with streaming marker
        const html = `<div class="whitespace-pre-wrap break-words" data-streaming-text>${escapeHtml(String(content ?? '')).replace(/\n/g, '<br/>')}</div>`;
        el.innerHTML = html;
        streamingState.set(el, { lastLength: content.length });
        return true;
      }
      // Fall through to full render for thinking/tools/error
      streamingState.delete(el);
    } else {
      // Streaming ended - clear tracking and do full render
      streamingState.delete(el);
    }

    el.innerHTML = renderAssistantMessageBody({
      messageId,
      content,
      errorMessage,
      isError: forceError,
      isStreaming,
      chatId,
      stateMaps,
    });
    return true;
  }

  function applyAssistantErrorMessage(chatId, messageId, errorText) {
    if (!chatId || !messageId) return;
    const safeText = String(errorText || 'Request failed.');
    setState((prev) => {
      const currentMessages = [...(prev.messagesByChat[chatId] || [])];
      const targetIdx = currentMessages.findIndex((m) => String(m.id) === String(messageId));
      if (targetIdx < 0) return prev;
      currentMessages[targetIdx] = {
        ...currentMessages[targetIdx],
        content: safeText,
        done: true,
        status: 'error',
        error_message: safeText,
      };
      return { ...prev, messagesByChat: { ...prev.messagesByChat, [chatId]: currentMessages } };
    });
    if (state.activeChatId === chatId) {
      updateMessageContentDom(messageId, safeText, { isError: true, isStreaming: false });
    }
  }

  return {
    updateMessageContentDom,
    applyAssistantErrorMessage,
  };
}
