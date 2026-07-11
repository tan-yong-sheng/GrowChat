/**
 * Creates an SSE event handler function that processes stream events from the LLM.
 * The handler is used by the SseLineParser to process reasoning and tool call events.
 */
export function createStreamEventHandler(ctx) {
  return (event) => {
    if (!event) return;
    if (event.type === 'reasoning_start') {
      if (!ctx.reasoningStartedAt) ctx.reasoningStartedAt = Date.now();
      void ctx.emitSse({ event: 'reasoning_start' }, { persist: true });
      return;
    }
    if (event.type === 'reasoning_delta') {
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
      return;
    }
    if (event.type === 'reasoning_end') {
      const duration = ctx.reasoningStartedAt ? Date.now() - ctx.reasoningStartedAt : 0;
      ctx.emitSse({ event: 'reasoning_end', duration_ms: duration }, { persist: true });
      ctx.lifecycle.persistAssistantContent({
        fullText: ctx.fullText,
        fullReasoning: ctx.fullReasoning,
        messageBlocks: ctx.messageBlocks,
        force: true,
      });
      return;
    }
    if (event.type === 'tool_call_delta') {
      ctx.applyToolCallDelta(ctx.stepToolCalls, event.tool_calls);
      return;
    }
    if (event.type === 'finish_reason') {
      ctx.finishReason = event.reason;
    }
  };
}
