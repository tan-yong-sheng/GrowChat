import { STREAM_HARD_TIMEOUT_MS } from './assistant-stream-utils.js';
import { createStreamEventHandler } from './assistant-runner-stream-event.js';
import { createPublishDeltaHelpers } from './assistant-runner-step-publish.js';
import { createStreamLoopHelpers } from './assistant-runner-step-stream.js';
import { createOutcomeHelpers } from './assistant-runner-step-outcome.js';

function makeRef(initial) {
  return { value: initial };
}

function createRunStepState({ fullText, fullReasoning, reasoningStartedAt }) {
  return {
    stepTextOutput: makeRef(false),
    stepReasoningOutput: makeRef(false),
    finishReason: makeRef(null),
    fullTextRef: makeRef(fullText),
    fullReasoningRef: makeRef(fullReasoning),
    reasoningStartedAtRef: { value: reasoningStartedAt },
    stepToolCalls: [],
  };
}

function buildStreamParser(stream, state, shared) {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  const parser = new shared.deps.SseLineParser({
    onEvent: createStreamEventHandler({
      reasoningStartedAt: state.reasoningStartedAtRef,
      stepReasoningOutput: state.stepReasoningOutput,
      appendMessageBlock: shared.appendMessageBlock,
      fullReasoning: state.fullReasoningRef,
      fullText: state.fullTextRef.value,
      messageBlocks: shared.messageBlocks,
      lifecycle: shared.lifecycle,
      emitSse: shared.emitSse,
      applyToolCallDelta: shared.deps.applyToolCallDelta,
      stepToolCalls: state.stepToolCalls,
      finishReason: state.finishReason,
    }),
  });
  return { reader, decoder, parser };
}

function createStreamParserBuilder(shared) {
  return function buildStreamParserFor(stream, state) {
    return buildStreamParser(stream, state, shared);
  };
}

export function createRunStepHelpers(ctx) {
  const publish = createPublishDeltaHelpers({
    deps: ctx.deps,
    env: ctx.env,
    model: ctx.model,
    user: ctx.user,
    chatId: ctx.chatId,
    assistantMsgId: ctx.assistantMsgId,
    req: ctx.req,
    lifecycle: ctx.lifecycle,
    emitSse: ctx.emitSse,
    appendMessageBlock: ctx.appendMessageBlock,
    messageBlocks: ctx.messageBlocks,
  });
  const streamLoop = createStreamLoopHelpers({
    deps: ctx.deps,
    requestLogger: ctx.requestLogger,
    env: ctx.env,
    model: ctx.model,
    user: ctx.user,
    controller: ctx.controller,
    encoder: ctx.encoder,
    tools: ctx.tools,
    lifecycle: ctx.lifecycle,
    toolCallRecords: ctx.toolCallRecords,
    citations: ctx.citations,
    attachmentKinds: ctx.attachmentKinds,
    db: ctx.db,
    publish,
  });
  const outcome = createOutcomeHelpers(ctx);
  const buildStreamParserFor = createStreamParserBuilder(ctx);

  return {
    runStepFactory({ fullText, fullReasoning, reasoningStartedAt }) {
      return async function runStep({
        messagesForModel,
        followUps,
        maxFollowUps,
        toolsEnabled,
        toolChoice,
      }) {
        const state = createRunStepState({ fullText, fullReasoning, reasoningStartedAt });
        const streamDeadlineAt = Date.now() + STREAM_HARD_TIMEOUT_MS;
        const streamResult = await streamLoop.startLlmStream({
          messagesForModel,
          toolsEnabled,
          toolChoice,
        });
        if (!streamResult.ok) return streamResult.result;

        const { reader, decoder, parser } = buildStreamParserFor(streamResult.stream, state);

        while (true) {
          const iteration = await streamLoop.processStreamIteration({
            reader,
            parser,
            decoder,
            deadlineAt: streamDeadlineAt,
            messagesForModel,
            state,
          });
          if (iteration.done) break;
          if (iteration.cancelled) return iteration.result;
        }

        await streamLoop.flushFinalDelta({ parser, state });
        parser.finalize();
        reader.releaseLock();

        const cancelResult = await streamLoop.checkCancelledAndClose({ messagesForModel });
        if (cancelResult) return cancelResult;

        return outcome.resolveStepOutcome({
          messagesForModel,
          followUps,
          state,
          maxFollowUps,
        });
      };
    },
  };
}
