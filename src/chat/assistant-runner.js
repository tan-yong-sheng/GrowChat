import {
  MAX_TOOL_STEPS,
  MAX_FOLLOW_UPS,
  FOLLOW_UP_PROMPT,
  STREAM_STATUS_STALE_MS,
  STREAM_HARD_TIMEOUT_MS,
  readStreamChunkWithHeartbeat,
  createStreamHelpers,
} from './assistant-stream-utils.js';
import { executeToolCalls } from './assistant-tool-executor.js';
import { withMemoryCheck } from '../utils/memory-monitor.js';
import { createLogger } from '../utils/logger.js';
import { createStreamEventHandler } from './assistant-runner-stream-event.js';

// Re-export for backward compatibility
export { readStreamChunkWithHeartbeat } from './assistant-stream-utils.js';

export function createAssistantRunner(deps) {
  const {
    sseData,
    sseHeaders,
    SseLineParser,
    streamLLM,
    runAsyncSessionProcessor,
    resolveTurnContinuation,
    normalizeProviderFamily,
    buildMcpTools,
    loadToolServers,
    executeMcpToolCall,
    parseToolArguments,
    stringifyToolPayload,
    applyToolCallDelta,
    buildUnknownToolPrompt,
    normalizeToolCalls,
    createAssistantStreamLifecycle,
    finalizeAssistantStream,
    recordAttachmentCapabilityFailure,
    createRealtimeEvent,
    getOriginSessionId,
    publishRealtimeNow,
    getMessageSnapshot,
    getOwnedChat,
    normalizeErrorMessage,
    sleep,
  } = deps;

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
    const servers = await loadToolServers(db, { userId: user?.sub || '' });
    const selectedToolNameList = Array.isArray(selectedToolNames)
      ? selectedToolNames.map((name) => String(name || '').trim()).filter(Boolean)
      : null;
    const toolChoice =
      Array.isArray(selectedToolNames) && selectedToolNames.length === 0 ? 'none' : undefined;
    const { tools, toolMap, serversById } = buildMcpTools(servers, {
      selectedToolNames: selectedToolNameList,
    });
    const providerSupportsTools = ['openai', 'google', 'anthropic'].includes(
      normalizeProviderFamily(providerFamily) || ''
    );
    const toolsEnabled = tools.length > 0 && providerSupportsTools;
    const requestLogger = createLogger(env, { requestId: req?.headers?.get('x-request-id') || '' });

    const encoder = new TextEncoder();
    let fullText = '';
    let fullReasoning = '';
    let reasoningStartedAt = null;
    const toolCallRecords = [];
    const {
      _persistDelta,
      emitSse,
      appendMessageBlock,
      messageBlocks,
      state: streamState,
    } = createStreamHelpers({ db, assistantMsgId, encoder, sseData });

    const citationsJson = Array.isArray(citations) ? JSON.stringify(citations) : citations || null;
    const lifecycle = createAssistantStreamLifecycle({
      db,
      env,
      req,
      user,
      chatId,
      model,
      userMsgId,
      citationsJson,
      getMessageSnapshot,
      getOwnedChat,
      publishRealtimeNow,
      createRealtimeEvent,
      getOriginSessionId,
      normalizeErrorMessage,
      emitSse,
    });

    const readable = new ReadableStream({
      async start(controller) {
        streamState.streamController = controller;
        await lifecycle.ensureAssistantRow();

        if (ctx?.waitUntil) {
          ctx.waitUntil(
            (async () => {
              await sleep(STREAM_STATUS_STALE_MS);
              await lifecycle.clearStreamingStatus();
            })()
          );
        }

        await emitSse({
          event: 'start',
          chat_id: chatId,
          message_id: assistantMsgId,
          user_message_id: userMsgId,
        });

        try {
          const sessionOutcome = await runAsyncSessionProcessor({
            initialMessages: history,
            maxToolSteps: MAX_TOOL_STEPS,
            maxFollowUps: MAX_FOLLOW_UPS,
            providerFamily,
            runStep: async ({ messagesForModel, followUps }) => {
              let stepTextOutput = false;
              let stepReasoningOutput = false;
              let stream;
              try {
                stream = await withMemoryCheck(
                  'streamLLM',
                  () =>
                    streamLLM(env, model, messagesForModel, {
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
              } catch (err) {
                await recordAttachmentCapabilityFailure({
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
                return { action: 'final', terminate: true, nextMessagesForModel: messagesForModel };
              }

              const reader = stream.getReader();
              const decoder = new TextDecoder();
              const stepToolCalls = [];
              let finishReason = null;
              const parser = new SseLineParser({
                onEvent: createStreamEventHandler({
                  reasoningStartedAt,
                  stepReasoningOutput: {
                    get value() {
                      return stepReasoningOutput;
                    },
                    set value(v) {
                      stepReasoningOutput = v;
                    },
                  },
                  appendMessageBlock,
                  fullReasoning: {
                    get value() {
                      return fullReasoning;
                    },
                    set value(v) {
                      fullReasoning = v;
                    },
                  },
                  fullText,
                  messageBlocks,
                  lifecycle,
                  emitSse,
                  applyToolCallDelta,
                  stepToolCalls,
                  finishReason: {
                    get value() {
                      return finishReason;
                    },
                    set value(v) {
                      finishReason = v;
                    },
                  },
                }),
              });

              const streamDeadlineAt = Date.now() + STREAM_HARD_TIMEOUT_MS;
              while (true) {
                const { done, value } = await readStreamChunkWithHeartbeat(reader, {
                  controller,
                  encoder,
                  deadlineAt: streamDeadlineAt,
                });
                if (done) break;
                const delta = parser.push(decoder.decode(value, { stream: true }));
                if (delta) {
                  fullText += delta;
                  stepTextOutput = true;
                  appendMessageBlock({ type: 'text', content: delta });
                  await lifecycle.persistAssistantContent({
                    fullText,
                    fullReasoning,
                    messageBlocks,
                  });
                  const persisted = await emitSse({ response: delta }, { persist: true });
                  await publishRealtimeNow(
                    env,
                    createRealtimeEvent({
                      type: 'message.delta',
                      userId: user.sub,
                      chatId,
                      messageId: assistantMsgId,
                      originSessionId: getOriginSessionId(req),
                      data: { delta, model, seq: persisted?.seq },
                    })
                  );
                }
                if (await lifecycle.isCancelled()) {
                  await lifecycle.sendCancelAndClose({ controller, encoder });
                  return {
                    action: 'final',
                    terminate: true,
                    nextMessagesForModel: messagesForModel,
                  };
                }
              }

              const finalDelta = parser.flush();
              if (finalDelta) {
                fullText += finalDelta;
                stepTextOutput = true;
                appendMessageBlock({ type: 'text', content: finalDelta });
                await lifecycle.persistAssistantContent({ fullText, fullReasoning, messageBlocks });
                const persisted = await emitSse({ response: finalDelta }, { persist: true });
                await publishRealtimeNow(
                  env,
                  createRealtimeEvent({
                    type: 'message.delta',
                    userId: user.sub,
                    chatId,
                    messageId: assistantMsgId,
                    originSessionId: getOriginSessionId(req),
                    data: { delta: finalDelta, model, seq: persisted?.seq },
                  })
                );
              }

              parser.finalize();
              reader.releaseLock();

              if (await lifecycle.isCancelled()) {
                await lifecycle.sendCancelAndClose({ controller, encoder });
                return { action: 'final', terminate: true, nextMessagesForModel: messagesForModel };
              }

              const hasToolCalls = stepToolCalls.some((call) => call && call.name);
              const turnContinuation = resolveTurnContinuation({
                providerFamily,
                hasToolCalls,
                finishReason,
                stepTextOutput,
                stepReasoningOutput,
                followUps,
                maxFollowUps: MAX_FOLLOW_UPS,
              });

              if (turnContinuation.action === 'tool_loop') {
                const { validCalls, unknownCalls } = normalizeToolCalls(stepToolCalls, toolMap);
                const result = await executeToolCalls({
                  validCalls,
                  unknownCalls,
                  serversById,
                  parseToolArguments,
                  executeMcpToolCall,
                  stringifyToolPayload,
                  lifecycle,
                  assistantMsgId,
                  toolCallRecords,
                  appendMessageBlock,
                  fullText,
                  fullReasoning,
                  messageBlocks,
                  emitSse,
                  controller,
                  encoder,
                  normalizeErrorMessage,
                });
                if (result.cancelled) {
                  return {
                    action: 'final',
                    terminate: true,
                    nextMessagesForModel: messagesForModel,
                  };
                }
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
                    { role: 'system', content: buildUnknownToolPrompt(unknownCalls, toolMap) },
                  ];
                }
                return { action: 'tool_loop', nextMessagesForModel };
              }

              if (turnContinuation.action === 'follow_up') {
                return {
                  action: 'follow_up',
                  nextMessagesForModel: [
                    ...messagesForModel,
                    { role: 'system', content: FOLLOW_UP_PROMPT },
                  ],
                };
              }

              return { action: 'final', nextMessagesForModel: messagesForModel };
            },
          });

          if (sessionOutcome?.lastResult?.terminate) {
            return;
          }

          await finalizeAssistantStream({
            db,
            env,
            user,
            req,
            chatId,
            model,
            assistantMsgId,
            userMsgId,
            citations,
            fullText,
            fullReasoning,
            toolCallRecords,
            messageBlocks,
            getMessageSnapshot,
            getOwnedChat,
            publishRealtimeNow,
            createRealtimeEvent,
            getOriginSessionId,
            controller,
            encoder,
          });
        } catch (err) {
          await lifecycle.sendErrorAndClose({
            controller,
            encoder,
            errorCode: 'stream_failed',
            err,
            toolCallRecords,
            citations,
          });
        } finally {
          await lifecycle.clearStreamingStatus();
        }
      },
      async cancel() {
        await lifecycle.clearStreamingStatus();
      },
    });

    return {
      response: new Response(readable, { headers: sseHeaders(req) }),
      assistantMsgId,
    };
  };
}
