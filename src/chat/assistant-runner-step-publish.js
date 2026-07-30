export function createPublishDeltaHelpers({
  deps,
  env,
  model,
  user,
  chatId,
  assistantMsgId,
  req,
  lifecycle,
  emitSse,
  appendMessageBlock,
  messageBlocks,
}) {
  async function publishDelta({ delta, state }) {
    state.fullTextRef.value += delta;
    state.stepTextOutput.value = true;
    appendMessageBlock({ type: 'text', content: delta });
    await lifecycle.persistAssistantContent({
      fullText: state.fullTextRef.value,
      fullReasoning: state.fullReasoningRef.value,
      messageBlocks,
    });
    const persisted = await emitSse({ response: delta }, { persist: true });
    await deps.publishRealtimeNow(
      env,
      deps.createRealtimeEvent({
        type: 'message.delta',
        userId: user.sub,
        chatId,
        messageId: assistantMsgId,
        originSessionId: deps.getOriginSessionId(req),
        data: { delta, model, seq: persisted?.seq },
      })
    );
  }

  return { publishDelta };
}
