function shouldFollowUp(options) {
  return (
    !options.hasToolCalls &&
    !options.stepTextOutput &&
    options.stepReasoningOutput &&
    options.followUps < options.maxFollowUps
  );
}

function shouldToolLoop(options) {
  return options.hasToolCalls && options.finishReason === 'tool_calls';
}

const MAX_FOLLOW_UPS = 5;

export function resolveSharedTurnContinuation(options = {}) {
  const hasToolCalls = options.hasToolCalls ?? false;
  const finishReason = options.finishReason ?? null;
  const stepTextOutput = options.stepTextOutput ?? false;
  const stepReasoningOutput = options.stepReasoningOutput ?? false;
  const followUps = options.followUps ?? 0;
  const maxFollowUps = options.maxFollowUps ?? MAX_FOLLOW_UPS;

  if (
    shouldFollowUp({ hasToolCalls, stepTextOutput, stepReasoningOutput, followUps, maxFollowUps })
  ) {
    return { action: 'follow_up' };
  }
  if (shouldToolLoop({ hasToolCalls, finishReason })) {
    return { action: 'tool_loop' };
  }
  return { action: 'final' };
}
