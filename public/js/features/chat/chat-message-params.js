/**
 * Shared parameter names for chat message action bindings.
 * Used by bindChatMessageActions (definition in chat-message-actions.js)
 * and the call site in chat-render-controller.js to maintain
 * a consistent set of 40+ parameters.
 *
 * Both files use these same parameter names in the same order.
 * This module serves as the single source of truth for the parameter list.
 */

export const CHAT_MESSAGE_PARAM_NAMES = [
  'messagesList',
  'messages',
  'projectedMessages',
  'roundsByMessageId',
  'state',
  'setState',
  'drawMessages',
  'chatId',
  'errorExpandedByMessageId',
  'showToast',
  'apiFetch',
  'loadMessages',
  'waitForResolvedMessageId',
  'getMessageById',
  'resolveTempMessageId',
  'replaceTempMessageId',
  'registerPendingTempMessage',
  'setBranchSelection',
  'currentLeafByChatId',
  'branchSelectionByChat',
  'streamingOverrideByChat',
  'setStreamingState',
  'getActiveStreamAbort',
  'setActiveStreamAbort',
  'clearGlobalStreamAbort',
  'setGlobalStreamAbort',
  'consumeSseTextStream',
  'appendBlock',
  'ensureThinkingBlock',
  'updateToolCallState',
  'notePayloadSeq',
  'buildFallbackAssistantMessage',
  'formatApiErrorMessage',
  'updateMessageContentDom',
  'applyAssistantErrorMessage',
  'openCitation',
  'thinkingStartByMessageId',
  'thinkingDurationByMessageId',
  'thinkingActiveByMessageId',
  'toolCallsByMessageId',
  'toolExpandedByKey',
  'thinkingCollapsedByKey',
  'messageBlocksById',
];
