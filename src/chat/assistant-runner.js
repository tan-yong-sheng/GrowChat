import {
  MAX_TOOL_STEPS,
  MAX_FOLLOW_UPS,
  STREAM_STATUS_STALE_MS,
  createStreamHelpers,
} from './assistant-stream-utils.js';
import { createLogger } from '../utils/logger.js';
import { createRunStepHelpers } from './assistant-runner-step.js';

// Re-export for backward compatibility
export { readStreamChunkWithHeartbeat } from './assistant-stream-utils.js';

const PROVIDER_FAMILIES_SUPPORTING_TOOLS = ['openai', 'google', 'anthropic'];

function normalizeSelectedToolNames(selectedToolNames) {
  if (!Array.isArray(selectedToolNames)) return null;
  return selectedToolNames.map((name) => String(name || '').trim()).filter(Boolean);
}

function normalizeToolChoice(selectedToolNames) {
  return Array.isArray(selectedToolNames) && selectedToolNames.length === 0 ? 'none' : undefined;
}

async function resolveToolContext({ deps, db, user, selectedToolNames }) {
  const selectedToolNameList = normalizeSelectedToolNames(selectedToolNames);
  const toolChoice = normalizeToolChoice(selectedToolNames);
  const servers = await deps.loadToolServers(db, { userId: user?.sub || '' });
  const built = deps.buildMcpTools(servers, { selectedToolNames: selectedToolNameList });
  return { ...built, toolChoice };
}

function providerSupportsTools(normalizedFamily) {
  return PROVIDER_FAMILIES_SUPPORTING_TOOLS.includes(normalizedFamily);
}

function resolveCitationsJson(citations) {
  if (Array.isArray(citations)) return JSON.stringify(citations);
  return citations || null;
}

function buildStreamLifecycle({
  deps,
  db,
  env,
  req,
  user,
  chatId,
  model,
  userMsgId,
  citationsJson,
  emitSse,
}) {
  return deps.createAssistantStreamLifecycle({
    db,
    env,
    req,
    user,
    chatId,
    model,
    userMsgId,
    citationsJson,
    getMessageSnapshot: deps.getMessageSnapshot,
    getOwnedChat: deps.getOwnedChat,
    publishRealtimeNow: deps.publishRealtimeNow,
    createRealtimeEvent: deps.createRealtimeEvent,
    getOriginSessionId: deps.getOriginSessionId,
    normalizeErrorMessage: deps.normalizeErrorMessage,
    emitSse,
  });
}

function buildRequestLogger(env, req) {
  return createLogger(env, { requestId: req?.headers?.get('x-request-id') || '' });
}

function buildStreamHelpersBundle({ deps, db, assistantMsgId, encoder }) {
  return createStreamHelpers({ db, assistantMsgId, encoder, sseData: deps.sseData });
}

async function runAssistantStream(streamContext) {
  const {
    ctx,
    deps,
    controller,
    encoder,
    lifecycle,
    emitSse,
    chatId,
    userMsgId,
    toolCallRecords,
    citations,
    fullText,
    fullReasoning,
    messageBlocks,
    db,
    env,
    user,
    req,
    model,
  } = streamContext;
  await lifecycle.ensureAssistantRow();
  await scheduleStaleStatusClear({ ctx, deps, lifecycle });
  await emitStartSse({ emitSse, chatId, assistantMsgId: userMsgId, userMsgId });

  const sessionOutcome = await executeSessionLoop(streamContext);

  if (sessionOutcome?.lastResult?.terminate) return;

  await finalizeStream({
    deps,
    controller,
    encoder,
    params: {
      db,
      env,
      user,
      req,
      chatId,
      model,
      assistantMsgId: userMsgId,
      userMsgId,
      citations,
      fullText,
      fullReasoning,
      toolCallRecords,
      messageBlocks,
    },
  });
}

async function finalizeStream({ deps, controller, encoder, params }) {
  await deps.finalizeAssistantStream({
    ...params,
    getMessageSnapshot: deps.getMessageSnapshot,
    getOwnedChat: deps.getOwnedChat,
    publishRealtimeNow: deps.publishRealtimeNow,
    createRealtimeEvent: deps.createRealtimeEvent,
    getOriginSessionId: deps.getOriginSessionId,
    controller,
    encoder,
  });
}

function scheduleStaleStatusClear({ ctx, deps, lifecycle }) {
  if (!ctx?.waitUntil) return;
  ctx.waitUntil(
    (async () => {
      await deps.sleep(STREAM_STATUS_STALE_MS);
      await lifecycle.clearStreamingStatus();
    })()
  );
}

function emitStartSse({ emitSse, chatId, assistantMsgId, userMsgId }) {
  return emitSse({
    event: 'start',
    chat_id: chatId,
    message_id: assistantMsgId,
    user_message_id: userMsgId,
  });
}

async function executeSessionLoop({
  deps,
  requestLogger,
  env,
  model,
  user,
  chatId,
  userMsgId,
  req,
  controller,
  encoder,
  tools,
  toolMap,
  serversById,
  lifecycle,
  emitSse,
  appendMessageBlock,
  messageBlocks,
  toolCallRecords,
  citations,
  attachmentKinds,
  providerFamily,
  db,
  history,
  toolsEnabled,
  toolChoice,
  fullText,
  fullReasoning,
  reasoningStartedAt,
}) {
  const stepHelpers = createRunStepHelpers({
    deps,
    requestLogger,
    env,
    model,
    user,
    chatId,
    assistantMsgId: userMsgId,
    req,
    controller,
    encoder,
    tools,
    toolMap,
    serversById,
    lifecycle,
    emitSse,
    appendMessageBlock,
    messageBlocks,
    toolCallRecords,
    citations,
    attachmentKinds,
    providerFamily,
    db,
  });
  const runStep = stepHelpers.runStepFactory({
    fullText,
    fullReasoning,
    reasoningStartedAt,
  });
  return deps.runAsyncSessionProcessor({
    initialMessages: history,
    maxToolSteps: MAX_TOOL_STEPS,
    maxFollowUps: MAX_FOLLOW_UPS,
    providerFamily,
    runStep: async ({ messagesForModel, followUps }) =>
      runStep({
        messagesForModel,
        followUps,
        maxFollowUps: MAX_FOLLOW_UPS,
        toolsEnabled,
        toolChoice,
      }),
  });
}

export function createAssistantRunner(deps) {
  return async function streamAssistantWithTools({
    req,
    env,
    ctx,
    db,
    user,
    chatId,
    userMsgId,
    model,
    history,
    citations,
    attachmentKinds = [],
    providerFamily = 'openai',
    selectedToolNames = null,
  }) {
    const assistantMsgId = crypto.randomUUID();
    const { tools, toolMap, serversById, toolChoice } = await resolveToolContext({
      deps,
      db,
      user,
      selectedToolNames,
    });
    const normalizedFamily = deps.normalizeProviderFamily(providerFamily) || '';
    const toolsEnabled = tools.length > 0 && providerSupportsTools(normalizedFamily);
    const requestLogger = buildRequestLogger(env, req);

    const encoder = new TextEncoder();
    const streamBundle = buildStreamHelpersBundle({
      deps,
      db,
      assistantMsgId,
      encoder,
    });
    const { emitSse, appendMessageBlock, messageBlocks, state: streamState } = streamBundle;

    const lifecycle = buildStreamLifecycle({
      deps,
      db,
      env,
      req,
      user,
      chatId,
      model,
      userMsgId,
      citationsJson: resolveCitationsJson(citations),
      emitSse,
    });

    const streamContext = buildStreamContext({
      ctx,
      deps,
      requestLogger,
      env,
      model,
      user,
      chatId,
      userMsgId,
      req,
      tools,
      toolMap,
      serversById,
      lifecycle,
      emitSse,
      appendMessageBlock,
      messageBlocks,
      toolCallRecords: [],
      citations,
      attachmentKinds,
      providerFamily,
      db,
      history,
      toolsEnabled,
      toolChoice,
      fullText: '',
      fullReasoning: '',
      reasoningStartedAt: null,
    });

    const readable = createReadableStream({
      streamState,
      streamContext,
      controller: null,
      encoder,
    });

    return {
      response: new Response(readable, { headers: deps.sseHeaders(req) }),
      assistantMsgId,
    };
  };
}

function buildStreamContext({
  ctx,
  deps,
  requestLogger,
  env,
  model,
  user,
  chatId,
  userMsgId,
  req,
  tools,
  toolMap,
  serversById,
  lifecycle,
  emitSse,
  appendMessageBlock,
  messageBlocks,
  toolCallRecords,
  citations,
  attachmentKinds,
  providerFamily,
  db,
  history,
  toolsEnabled,
  toolChoice,
  fullText,
  fullReasoning,
  reasoningStartedAt,
}) {
  return {
    ctx,
    deps,
    requestLogger,
    env,
    model,
    user,
    chatId,
    userMsgId,
    req,
    tools,
    toolMap,
    serversById,
    lifecycle,
    emitSse,
    appendMessageBlock,
    messageBlocks,
    toolCallRecords,
    citations,
    attachmentKinds,
    providerFamily,
    db,
    history,
    toolsEnabled,
    toolChoice,
    fullText,
    fullReasoning,
    reasoningStartedAt,
  };
}

function createReadableStream({ streamState, streamContext, encoder }) {
  return new ReadableStream({
    async start(controller) {
      streamState.streamController = controller;
      try {
        await runAssistantStream({ ...streamContext, controller, encoder });
      } catch (err) {
        await streamContext.lifecycle.sendErrorAndClose({
          controller,
          encoder,
          errorCode: 'stream_failed',
          err: err,
          toolCallRecords: streamContext.toolCallRecords,
          citations: streamContext.citations,
        });
      } finally {
        await streamContext.lifecycle.clearStreamingStatus();
      }
    },
    async cancel() {
      await streamContext.lifecycle.clearStreamingStatus();
    },
  });
}
