import { readStreamChunkWithHeartbeat } from './assistant-stream-utils.js';
import { withMemoryCheck } from '../utils/memory-monitor.js';

function makeStreamCancelledResult(messagesForModel) {
  return {
    cancelled: true,
    result: {
      action: 'final',
      terminate: true,
      nextMessagesForModel: messagesForModel,
    },
  };
}

async function checkCancelledAndClose({ lifecycle, controller, encoder, messagesForModel }) {
  if (await lifecycle.isCancelled()) {
    await lifecycle.sendCancelAndClose({ controller, encoder });
    return {
      action: 'final',
      terminate: true,
      nextMessagesForModel: messagesForModel,
    };
  }
  return null;
}

async function handleLlmStreamFailure({
  err,
  deps,
  db,
  model,
  attachmentKinds,
  lifecycle,
  controller,
  encoder,
  toolCallRecords,
  citations,
  messagesForModel,
}) {
  await deps.recordAttachmentCapabilityFailure({
    db,
    modelId: model,
    attachmentKinds,
    err,
  });
  await lifecycle.sendErrorAndClose({
    controller,
    encoder,
    errorCode: 'llm_unavailable',
    err,
    toolCallRecords,
    citations,
  });
  return {
    ok: false,
    result: {
      action: 'final',
      terminate: true,
      nextMessagesForModel: messagesForModel,
    },
  };
}

function startLlmStreamCall({
  deps,
  env,
  model,
  messagesForModel,
  tools,
  toolsEnabled,
  toolChoice,
  user,
  requestLogger,
}) {
  return withMemoryCheck(
    'streamLLM',
    () =>
      deps.streamLLM(env, model, messagesForModel, {
        tools: toolsEnabled ? tools : undefined,
        toolChoice,
        userId: user?.sub || '',
        userRole: user?.primary_role || 'member',
      }),
    {
      logger: requestLogger,
      extra: { model, messagesLen: messagesForModel.length },
    }
  );
}

export function createStreamLoopHelpers(ctx) {
  async function startLlmStream({ messagesForModel, toolsEnabled, toolChoice }) {
    try {
      const stream = await startLlmStreamCall({
        deps: ctx.deps,
        env: ctx.env,
        model: ctx.model,
        messagesForModel,
        tools: ctx.tools,
        toolsEnabled,
        toolChoice,
        user: ctx.user,
        requestLogger: ctx.requestLogger,
      });
      return { ok: true, stream };
    } catch (err) {
      return handleLlmStreamFailure({
        err,
        deps: ctx.deps,
        db: ctx.db,
        model: ctx.model,
        attachmentKinds: ctx.attachmentKinds,
        lifecycle: ctx.lifecycle,
        controller: ctx.controller,
        encoder: ctx.encoder,
        toolCallRecords: ctx.toolCallRecords,
        citations: ctx.citations,
        messagesForModel,
      });
    }
  }

  async function processStreamIteration({
    reader,
    parser,
    decoder,
    deadlineAt,
    messagesForModel,
    state,
  }) {
    const { done, value } = await readStreamChunkWithHeartbeat(reader, {
      controller: ctx.controller,
      encoder: ctx.encoder,
      deadlineAt,
    });
    if (done) return { done: true };
    const delta = parser.push(decoder.decode(value, { stream: true }));
    if (delta) await ctx.publish.publishDelta({ delta, state });
    if (await ctx.lifecycle.isCancelled()) {
      await ctx.lifecycle.sendCancelAndClose({
        controller: ctx.controller,
        encoder: ctx.encoder,
      });
      return makeStreamCancelledResult(messagesForModel);
    }
    return { done: false };
  }

  async function flushFinalDelta({ parser, state }) {
    const finalDelta = parser.flush();
    if (!finalDelta) return;
    await ctx.publish.publishDelta({ delta: finalDelta, state });
  }

  return {
    startLlmStream,
    processStreamIteration,
    flushFinalDelta,
    checkCancelledAndClose: ({ messagesForModel }) =>
      checkCancelledAndClose({
        lifecycle: ctx.lifecycle,
        controller: ctx.controller,
        encoder: ctx.encoder,
        messagesForModel,
      }),
  };
}
