/**
 * Default no-op callbacks shared by chat stream/render controllers.
 */
export const STREAM_CALLBACK_DEFAULTS = {
  consumeSseTextStream: undefined,
  appendBlock: () => {},
  ensureThinkingBlock: () => {},
  updateToolCallState: () => {},
  notePayloadSeq: () => {},
  buildFallbackAssistantMessage: () => null,
  formatApiErrorMessage: (_, fallback) => fallback || 'Request failed.',
  updateMessageContentDom: () => {},
  applyAssistantErrorMessage: () => {},
};
