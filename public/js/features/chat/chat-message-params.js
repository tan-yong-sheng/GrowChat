/**
 * Shared parameter names for chat message action bindings.
 * Used by bindChatMessageActions (definition in chat-message-actions.js)
 * and the call site in chat-render-controller.js to maintain
 * a consistent set of 40+ parameters.
 *
 * Both files use these same parameter names in the same order.
 * This module serves as the single source of truth for the parameter list.
 *
 * Note: toolExpandedByKey and thinkingCollapsedByKey are used by
 * buildChatMessageListHtml but are NOT part of the bindChatMessageActions
 * function signature. They are passed through via stateMaps in the HTML build.
 */

import { makeApplyStreamingCallback } from '../../shared/utils/sse-event-handler.js';
import { applyStreamingAssistantText } from './chat-message-stream-assistant.js';

/**
 * Build a streaming callback for use with createSseStreamHandlers.
 * Shared between chat-message-actions.js and chat-message-retry-actions.js.
 *
 * @param {Function} getStreamState - Stream state getter from createSseStreamHandlers
 * @param {Object} params - { state, setState, streamingOverrideByChat, updateMessageContentDom, chatId }
 * @returns {Function} Callback for createSseStreamHandlers' applyAssistantText
 */
export function buildStreamingCallback(
  getStreamState,
  { state, setState, streamingOverrideByChat, updateMessageContentDom, chatId } = {}
) {
  return makeApplyStreamingCallback(getStreamState, {
    state,
    setState,
    streamingOverrideByChat,
    updateMessageContentDom,
    chatId,
    applyStreamingAssistantText,
  });
}

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

  'messageBlocksById',
];
