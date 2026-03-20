export function resolveSharedTurnContinuation({
  hasToolCalls = false,
  finishReason = null,
  stepTextOutput = false,
  stepReasoningOutput = false,
  followUps = 0,
  maxFollowUps = 5,
} = {}) {
  if (!hasToolCalls && !stepTextOutput && stepReasoningOutput && followUps < maxFollowUps) {
    return { action: 'follow_up' };
  }

  if (hasToolCalls && finishReason === 'tool_calls') {
    return { action: 'tool_loop' };
  }

  return { action: 'final' };
}
