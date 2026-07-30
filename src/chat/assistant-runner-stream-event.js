/**
 * Creates an SSE event handler function that processes stream events from the LLM.
 * The handler is used by the SseLineParser to process reasoning and tool call events.
 */
export function createStreamEventHandler(ctx) {
  const handlers = {
    reasoning_start: () => handleReasoningStart(ctx),
    reasoning_delta: (event) => handleReasoningDelta(event, ctx),
    reasoning_end: () => handleReasoningEnd(ctx),
    tool_call_delta: (event) => ctx.applyToolCallDelta(ctx.stepToolCalls, event.tool_calls),
    finish_reason: (event) => {
      ctx.finishReason = event.reason;
    },
  };
  return (event) => {
    if (!event) return;
    const handler = handlers[event.type];
    if (handler) handler(event);
  };
}

function handleReasoningStart(ctx) {
  if (!ctx.reasoningStartedAt) ctx.reasoningStartedAt = Date.now();
  void ctx.emitSse({ event: 'reasoning_start' }, { persist: true });
}

function handleReasoningDelta(event, ctx) {
  const delta = String(event.delta || '');
  if (!delta) return;
  ctx.stepReasoningOutput = true;
  ctx.appendMessageBlock({ type: 'thinking', content: delta });
  ctx.fullReasoning += delta;
  ctx.lifecycle.persistAssistantContent({
    fullText: ctx.fullText,
    fullReasoning: ctx.fullReasoning,
    messageBlocks: ctx.messageBlocks,
  });
  ctx.emitSse({ event: 'reasoning_delta', delta }, { persist: true });
}

function handleReasoningEnd(ctx) {
  const duration = ctx.reasoningStartedAt ? Date.now() - ctx.reasoningStartedAt : 0;
  ctx.emitSse({ event: 'reasoning_end', duration_ms: duration }, { persist: true });
  ctx.lifecycle.persistAssistantContent({
    fullText: ctx.fullText,
    fullReasoning: ctx.fullReasoning,
    messageBlocks: ctx.messageBlocks,
    force: true,
  });
}
