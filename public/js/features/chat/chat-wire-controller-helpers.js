// WireChat controller helpers: extracted small pure helpers used by setupWireChatControllers.
// @ts-nocheck

const FALLBACK_ERROR_MESSAGE = 'LLM request failed';
const MILLIS_PER_SECOND = 1000;
const RANDOM_RADIX = 36;
const RANDOM_SUFFIX_LENGTH = 8;

export function resolveExistingMessage(state, chatId, messageId) {
  const messages = state.messagesByChat[chatId] || [];
  return messages.find((msg) => String(msg.id) === String(messageId));
}

export function resolveFallbackContent(content, existing, errorActive, errorMessage) {
  const safeError = String(errorMessage || FALLBACK_ERROR_MESSAGE);
  let nextContent = content ?? existing?.content ?? '';
  if (errorActive && !nextContent) {
    nextContent = `Error: ${safeError}`;
  }
  return { nextContent, safeError };
}

export function buildExistingFallback(existing, nextContent, errorActive, safeError) {
  return {
    ...existing,
    content: nextContent,
    status: errorActive ? 'error' : existing.status,
    error_message: errorActive ? safeError : existing.error_message,
    done: true,
  };
}

export function buildNewFallback(messageId, options) {
  const { content, model, parentId, errorActive, safeError } = options;
  return {
    id: messageId,
    role: 'assistant',
    content,
    model: model || undefined,
    parent_id: parentId ?? null,
    status: errorActive ? 'error' : undefined,
    error_message: errorActive ? safeError : undefined,
    created_at: Math.floor(Date.now() / MILLIS_PER_SECOND),
    done: true,
  };
}

export function buildFallbackAssistantMessage(state, chatId, messageId, options = {}) {
  if (!chatId || !messageId) return null;
  const { content, errorActive, errorMessage, model, parentId } = options;
  const existing = resolveExistingMessage(state, chatId, messageId);
  const { nextContent, safeError } = resolveFallbackContent(
    content,
    existing,
    errorActive,
    errorMessage
  );
  if (existing) {
    return buildExistingFallback(existing, nextContent, errorActive, safeError);
  }
  return buildNewFallback(messageId, {
    content: nextContent,
    model: model || state.activeModelId,
    parentId,
    errorActive: errorActive || false,
    safeError,
  });
}

export function resolveMessageList(state, chatId) {
  return state.messagesByChat[chatId] || [];
}

export function findMessageInList(list, messageId) {
  return list.find((msg) => String(msg.id) === String(messageId)) || null;
}

export function getMessageById(state, chatId, messageId) {
  if (!chatId || !messageId) return null;
  return findMessageInList(resolveMessageList(state, chatId), messageId);
}

export function hydrateAttachmentImages(uiResources, containerEl) {
  return uiResources.hydrateAttachmentImages(containerEl);
}

export function makeAbortBridge(ctx) {
  return {
    getActiveStreamAbort: () => ctx.activeStreamAbort,
    setActiveStreamAbort: (value) => {
      ctx.activeStreamAbort = value;
    },
  };
}

export function buildTempChatImpls(state, isTempChatId) {
  const pruneTempChatsImpl = (list) =>
    Array.isArray(list) ? list.filter((c) => !isTempChatId(c?.id)) : [];
  const buildTempChatImpl = (id = null) => {
    const nowTs = Math.floor(Date.now() / MILLIS_PER_SECOND);
    const modelToUse = state.activeModelId || state.defaultModelId || state.globalDefaultModelId;
    const tempChatId =
      id || `temp-${nowTs}-${Math.random().toString(RANDOM_RADIX).slice(2, RANDOM_SUFFIX_LENGTH)}`;
    return {
      id: tempChatId,
      title: 'New Chat',
      model: modelToUse || null,
      pinned: 0,
      created_at: nowTs,
      updated_at: nowTs,
    };
  };
  return { pruneTempChatsImpl, buildTempChatImpl };
}
