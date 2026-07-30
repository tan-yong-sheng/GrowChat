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

  function resolveForceError(el, isError) {
    const forceError = isError || el.dataset.messageError === '1';
    if (forceError) el.dataset.messageError = '1';
    return forceError;
  }

  function hasActiveTextSelection(el) {
    const selection = document.getSelection?.();
    if (!selection || selection.isCollapsed) return false;
    const anchorNode = selection.anchorNode || null;
    const focusNode = selection.focusNode || null;
    return (anchorNode && el.contains(anchorNode)) || (focusNode && el.contains(focusNode));
  }

  function canIncrementalStream(messageId, forceError) {
    const key = String(messageId);
    const hasThinking = thinkingActiveByMessageId?.get(key) === true;
    const hasTools = (toolCallsByMessageId?.get(key) || []).some(
      (call) => String(call?.status || '').toLowerCase() === 'running'
    );
    return !hasThinking && !hasTools && !forceError;
  }

  function formatStreamingHtml(content) {
    return `<div class="whitespace-pre-wrap break-words" data-streaming-text>${escapeHtml(String(content ?? '')).replace(/\n/g, '<br/>')}</div>`;
  }

  function applyStreamingDelta(textEl, delta) {
    const escapedDelta = escapeHtml(delta).replace(/\n/g, '<br/>');
    textEl.insertAdjacentHTML('beforeend', escapedDelta);
  }

  function isStreamingTextReady(textEl, prev, content) {
    return textEl && prev.lastLength <= content.length;
  }

  function applyIncrementalText(el, content) {
    const prev = streamingState.get(el) || { lastLength: 0 };
    const textEl = el.querySelector('[data-streaming-text]');
    if (isStreamingTextReady(textEl, prev, content)) {
      const delta = content.slice(prev.lastLength);
      if (delta) {
        applyStreamingDelta(textEl, delta);
        prev.lastLength = content.length;
        streamingState.set(el, prev);
        return true;
      }
    }
    el.innerHTML = formatStreamingHtml(content);
    streamingState.set(el, { lastLength: content.length });
    return true;
  }

  function renderFullMessage(el, messageId, content, options, forceError) {
    const { errorMessage = '', isStreaming = false, chatId = state.activeChatId } = options;
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

  function updateMessageContentDom(messageId, content, options = {}) {
    if (!messageId) return false;
    const el = messagesList?.querySelector?.(`[data-message-content="${messageId}"]`);
    if (!el) return false;
    const { isError = false, isStreaming = false } = options;
    const forceError = resolveForceError(el, isError);

    if (isStreaming) {
      if (hasActiveTextSelection(el)) return true;
      if (canIncrementalStream(messageId, forceError)) {
        return applyIncrementalText(el, content);
      }
      streamingState.delete(el);
    } else {
      streamingState.delete(el);
    }

    return renderFullMessage(el, messageId, content, options, forceError);
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
