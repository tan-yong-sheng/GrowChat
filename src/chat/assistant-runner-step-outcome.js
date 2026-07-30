import { executeToolCalls } from './assistant-tool-executor.js';

const FOLLOW_UP_PROMPT = 'Now write the follow-up message in the conversation. Continue naturally.';

function appendToolResults({ messagesForModel, result, unknownCalls, toolMap, deps }) {
  let nextMessagesForModel = [...messagesForModel];
  if (result.toolCallsForModel.length) {
    nextMessagesForModel = [
      ...nextMessagesForModel,
      { role: 'assistant', content: '', tool_calls: result.toolCallsForModel },
      ...result.toolResultMessages,
    ];
  }
  if (unknownCalls.length) {
    nextMessagesForModel = [
      ...nextMessagesForModel,
      { role: 'system', content: deps.buildUnknownToolPrompt(unknownCalls, toolMap) },
    ];
  }
  return nextMessagesForModel;
}

async function runToolCalls({ state, toolMap, ctx }) {
  const { validCalls, unknownCalls } = ctx.deps.normalizeToolCalls(state.stepToolCalls, toolMap);
  const result = await executeToolCalls({
    validCalls,
    unknownCalls,
    serversById: ctx.serversById,
    parseToolArguments: ctx.deps.parseToolArguments,
    executeMcpToolCall: ctx.deps.executeMcpToolCall,
    stringifyToolPayload: ctx.deps.stringifyToolPayload,
    lifecycle: ctx.lifecycle,
    assistantMsgId: ctx.assistantMsgId,
    toolCallRecords: ctx.toolCallRecords,
    appendMessageBlock: ctx.appendMessageBlock,
    fullText: state.fullTextRef.value,
    fullReasoning: state.fullReasoningRef.value,
    messageBlocks: ctx.messageBlocks,
    emitSse: ctx.emitSse,
    controller: ctx.controller,
    encoder: ctx.encoder,
    normalizeErrorMessage: ctx.deps.normalizeErrorMessage,
  });
  return { result, unknownCalls };
}

function buildFollowUpResult({ messagesForModel }) {
  return {
    action: 'follow_up',
    nextMessagesForModel: [...messagesForModel, { role: 'system', content: FOLLOW_UP_PROMPT }],
  };
}

function buildFinalResult({ messagesForModel }) {
  return { action: 'final', nextMessagesForModel: messagesForModel };
}

function buildCancellationResult(messagesForModel) {
  return {
    action: 'final',
    terminate: true,
    nextMessagesForModel: messagesForModel,
  };
}

export function createOutcomeHelpers(ctx) {
  async function buildToolLoopResult({ messagesForModel, state }) {
    const { result, unknownCalls } = await runToolCalls({ state, toolMap: ctx.toolMap, ctx });
    if (result.cancelled) return buildCancellationResult(messagesForModel);
    return {
      action: 'tool_loop',
      nextMessagesForModel: appendToolResults({
        messagesForModel,
        result,
        unknownCalls,
        toolMap: ctx.toolMap,
        deps: ctx.deps,
      }),
    };
  }

  async function resolveStepOutcome({ messagesForModel, followUps, state, maxFollowUps }) {
    const turnContinuation = ctx.deps.resolveTurnContinuation({
      providerFamily: ctx.providerFamily,
      hasToolCalls: state.stepToolCalls.some((call) => call && call.name),
      finishReason: state.finishReason.value,
      stepTextOutput: state.stepTextOutput.value,
      stepReasoningOutput: state.stepReasoningOutput.value,
      followUps,
      maxFollowUps,
    });
    if (turnContinuation.action === 'tool_loop') {
      return buildToolLoopResult({ messagesForModel, state });
    }
    if (turnContinuation.action === 'follow_up') {
      return buildFollowUpResult({ messagesForModel });
    }
    return buildFinalResult({ messagesForModel });
  }

  return { resolveStepOutcome };
}
