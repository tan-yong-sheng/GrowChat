const MAX_TOOL_STEPS = 100;
const MAX_FOLLOW_UPS = 20;
const FOLLOW_UP_PROMPT = 'Provide a complete final answer to the user. Do not return tool calls or reasoning-only output.';
const STREAM_KEEPALIVE_INTERVAL_MS = 15000;
const STREAM_HARD_TIMEOUT_MS = 10 * 60 * 1000;
const STREAM_KEEPALIVE_PAYLOAD = ':\n\n';

export async function readStreamChunkWithHeartbeat(reader, {
  controller = null,
  encoder = new TextEncoder(),
  keepAliveIntervalMs = STREAM_KEEPALIVE_INTERVAL_MS,
  hardTimeoutMs = STREAM_HARD_TIMEOUT_MS,
  heartbeatPayload = STREAM_KEEPALIVE_PAYLOAD,
} = {}) {
  let heartbeatTimer = null;
  let timeoutId = null;
  let timedOut = false;

  if (controller && typeof controller.enqueue === 'function' && keepAliveIntervalMs > 0) {
    heartbeatTimer = setInterval(() => {
      try {
        controller.enqueue(encoder.encode(heartbeatPayload));
      } catch {
      }
    }, keepAliveIntervalMs);
  }

  const pendingReads = [reader.read()];
  if (hardTimeoutMs > 0) {
    pendingReads.push(new Promise((_, reject) => {
      timeoutId = setTimeout(() => {
        timedOut = true;
        reject(new Error('LLM stream timed out'));
      }, hardTimeoutMs);
    }));
  }

  try {
    return await Promise.race(pendingReads);
  } catch (err) {
    if (timedOut && typeof reader.cancel === 'function') {
      void reader.cancel().catch(() => {});
    }
    throw err;
  } finally {
    if (heartbeatTimer) clearInterval(heartbeatTimer);
    if (timeoutId) clearTimeout(timeoutId);
  }
}

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
    parentId,
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
    const toolChoice = Array.isArray(selectedToolNames) && selectedToolNames.length === 0
      ? 'none'
      : undefined;
    const { tools, toolMap, serversById } = buildMcpTools(servers, { selectedToolNames: selectedToolNameList });
    const providerSupportsTools = ['openai', 'google', 'anthropic'].includes(
      normalizeProviderFamily(providerFamily) || ''
    );
    const toolsEnabled = tools.length > 0 && providerSupportsTools;
    const STREAM_STATUS_STALE_MS = 10 * 60 * 1000;

    const encoder = new TextEncoder();
    let fullText = '';
    let fullReasoning = '';
    let reasoningStartedAt = null;
    let deltaSeq = 0;
    const toolCallRecords = [];
    const messageBlocks = [];
    let streamController = null;

    const persistDelta = async (payload) => {
      if (!payload || typeof payload !== 'object') return payload;
      deltaSeq += 1;
      const payloadWithSeq = { ...payload, seq: deltaSeq };
      try {
        await db.run(
          'INSERT INTO message_deltas (message_id, seq, payload, created_at) VALUES (?, ?, ?, unixepoch())',
          [assistantMsgId, deltaSeq, JSON.stringify(payloadWithSeq)]
        );
      } catch { }
      return payloadWithSeq;
    };

    const emitSse = async (payload, { persist = false } = {}) => {
      const outgoing = persist ? await persistDelta(payload) : payload;
      if (!streamController) return outgoing;
      streamController.enqueue(encoder.encode(sseData(outgoing)));
      return outgoing;
    };

    const appendMessageBlock = (type, content = '', toolCallId = null) => {
      if (!type) return;
      const last = messageBlocks.length ? messageBlocks[messageBlocks.length - 1] : null;
      if (type === 'tool') {
        const existing = messageBlocks.find((block) => block.type === 'tool' && block.tool_call_id === toolCallId);
        if (existing) return;
        messageBlocks.push({
          type: 'tool',
          tool_call_id: String(toolCallId || ''),
        });
        return;
      }
      if (last && last.type === type && !last.tool_call_id) {
        last.content = `${last.content || ''}${content}`;
        return;
      }
      messageBlocks.push({ type, content: String(content || '') });
    };

    const readable = new ReadableStream({
      async start(controller) {
        streamController = controller;
        const citationsJson = Array.isArray(citations) ? JSON.stringify(citations) : (citations || null);
        const lifecycle = createAssistantStreamLifecycle({
          db,
          env,
          req,
          user,
          chatId,
          model,
          userMsgId,
          assistantMsgId,
          citationsJson,
          getMessageSnapshot,
          getOwnedChat,
          publishRealtimeNow,
          createRealtimeEvent,
          getOriginSessionId,
          normalizeErrorMessage,
          emitSse,
        });
        await lifecycle.ensureAssistantRow();
        if (ctx?.waitUntil) {
          ctx.waitUntil((async () => {
            await sleep(STREAM_STATUS_STALE_MS);
            await lifecycle.clearStreamingStatus();
          })());
        }
        await emitSse({ event: 'start', chat_id: chatId, message_id: assistantMsgId, user_message_id: userMsgId });

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
                stream = await streamLLM(env, model, messagesForModel, {
                  tools: toolsEnabled ? tools : undefined,
                  toolChoice,
                  userId: user?.sub || '',
                  userRole: user?.primary_role || 'member',
                });
              } catch (err) {
                await recordAttachmentCapabilityFailure(db, model, attachmentKinds, err);
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

              let emitEvent = () => { };
              const parser = new SseLineParser({
                onEvent: (event) => emitEvent(event),
              });

              emitEvent = (event) => {
                if (!event) return;
                if (event.type === 'reasoning_start') {
                  if (!reasoningStartedAt) reasoningStartedAt = Date.now();
                  void emitSse({ event: 'reasoning_start' }, { persist: true });
                  return;
                }
                if (event.type === 'reasoning_delta') {
                  const delta = String(event.delta || '');
                  if (!delta) return;
                  stepReasoningOutput = true;
                  appendMessageBlock('thinking', delta);
                  fullReasoning += delta;
                  void lifecycle.persistAssistantContent({
                    fullText,
                    fullReasoning,
                    messageBlocks,
                  });
                  void emitSse({ event: 'reasoning_delta', delta }, { persist: true });
                  return;
                }
                if (event.type === 'reasoning_end') {
                  const duration = reasoningStartedAt ? Date.now() - reasoningStartedAt : 0;
                  void emitSse({ event: 'reasoning_end', duration_ms: duration }, { persist: true });
                  void lifecycle.persistAssistantContent({
                    fullText,
                    fullReasoning,
                    messageBlocks,
                    force: true,
                  });
                  return;
                }
                if (event.type === 'tool_call_delta') {
                  applyToolCallDelta(stepToolCalls, event.tool_calls);
                  return;
                }
                if (event.type === 'finish_reason') {
                  finishReason = event.reason;
                }
              };

              while (true) {
                const { done, value } = await readStreamChunkWithHeartbeat(reader, {
                  controller,
                  encoder,
                });
                if (done) break;
                const delta = parser.push(decoder.decode(value, { stream: true }));
                if (delta) {
                  fullText += delta;
                  stepTextOutput = true;
                  appendMessageBlock('text', delta);
                  await lifecycle.persistAssistantContent({
                    fullText,
                    fullReasoning,
                    messageBlocks,
                  });
                  const persisted = await emitSse({ response: delta }, { persist: true });
                  await publishRealtimeNow(env, createRealtimeEvent({
                    type: 'message.delta',
                    userId: user.sub,
                    chatId,
                    messageId: assistantMsgId,
                    originSessionId: getOriginSessionId(req),
                    data: { delta, model, seq: persisted?.seq },
                  }));
                }
                if (await lifecycle.isCancelled()) {
                  await lifecycle.sendCancelAndClose({ controller, encoder });
                  return { action: 'final', terminate: true, nextMessagesForModel: messagesForModel };
                }
              }

              const finalDelta = parser.flush();
              if (finalDelta) {
                fullText += finalDelta;
                stepTextOutput = true;
                appendMessageBlock('text', finalDelta);
                await lifecycle.persistAssistantContent({
                  fullText,
                  fullReasoning,
                  messageBlocks,
                });
                const persisted = await emitSse({ response: finalDelta }, { persist: true });
                await publishRealtimeNow(env, createRealtimeEvent({
                  type: 'message.delta',
                  userId: user.sub,
                  chatId,
                  messageId: assistantMsgId,
                  originSessionId: getOriginSessionId(req),
                  data: { delta: finalDelta, model, seq: persisted?.seq },
                }));
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
                const toolCallsForModel = validCalls.map((call) => ({
                  id: call.toolCallId,
                  type: 'function',
                  function: {
                    name: call.modelToolName,
                    arguments: call.arguments,
                  },
                  ...(call.providerMetadata ? { providerMetadata: call.providerMetadata } : {}),
                }));

                const toolResultMessages = [];

                for (const call of unknownCalls) {
                  const errorText = `Unknown tool: ${call.name}`;
                  const record = {
                    id: call.toolCallId,
                    name: call.name || 'Unknown tool',
                    input: call.arguments,
                    output: errorText,
                    error: errorText,
                    status: 'error',
                  };
                  toolCallRecords.push(record);
                  appendMessageBlock('tool', '', call.toolCallId);
                  await lifecycle.persistToolCalls(toolCallRecords);
                  await lifecycle.persistAssistantContent({
                    fullText,
                    fullReasoning,
                    messageBlocks,
                  });
                  await emitSse({
                    event: 'tool_result',
                    message_id: assistantMsgId,
                    tool_call_id: call.toolCallId,
                    tool_name: record.name,
                    input: call.arguments,
                    output: errorText,
                    error: errorText,
                    status: 'error',
                  }, { persist: true });
                }

                for (const call of validCalls) {
                  if (await lifecycle.isCancelled()) {
                    await lifecycle.sendCancelAndClose({ controller, encoder });
                    return { action: 'final', terminate: true, nextMessagesForModel: messagesForModel };
                  }
                  await emitSse({
                    event: 'tool_status',
                    message_id: assistantMsgId,
                    tool_call_id: call.toolCallId,
                    tool_name: call.displayName,
                    state: 'running',
                    input: call.arguments,
                  }, { persist: true });

                  const server = serversById.get(call.serverId);
                  let outputText = '';
                  let errorText = '';
                  let status = 'completed';
                  const record = {
                    id: call.toolCallId,
                    name: call.displayName,
                    input: call.arguments,
                    output: '',
                    error: null,
                    status: 'running',
                    ...(call.providerMetadata ? { providerMetadata: call.providerMetadata } : {}),
                  };
                  toolCallRecords.push(record);
                  appendMessageBlock('tool', '', call.toolCallId);
                  await lifecycle.persistToolCalls(toolCallRecords);

                  try {
                    const args = parseToolArguments(call.arguments);
                    const output = await executeMcpToolCall({
                      server,
                      toolName: call.toolName,
                      args,
                    });
                    outputText = stringifyToolPayload(output);
                  } catch (err) {
                    status = 'error';
                    errorText = normalizeErrorMessage(err, 'Tool call failed', 8000);
                    outputText = errorText;
                  }

                  record.output = outputText;
                  record.error = errorText || null;
                  record.status = status;
                  await lifecycle.persistToolCalls(toolCallRecords);
                  await lifecycle.persistAssistantContent({
                    fullText,
                    fullReasoning,
                    messageBlocks,
                  });

                  await emitSse({
                    event: 'tool_result',
                    message_id: assistantMsgId,
                    tool_call_id: call.toolCallId,
                    tool_name: call.displayName,
                    input: call.arguments,
                    output: outputText,
                    error: errorText || null,
                    status,
                  }, { persist: true });

                  toolResultMessages.push({
                    role: 'tool',
                    tool_call_id: call.toolCallId,
                    content: outputText,
                  });

                  if (await lifecycle.isCancelled()) {
                    await lifecycle.sendCancelAndClose({ controller, encoder });
                    return { action: 'final', terminate: true, nextMessagesForModel: messagesForModel };
                  }
                }

                let nextMessagesForModel = [...messagesForModel];
                if (toolCallsForModel.length) {
                  nextMessagesForModel = [
                    ...nextMessagesForModel,
                    { role: 'assistant', content: '', tool_calls: toolCallsForModel },
                    ...toolResultMessages,
                  ];
                }
                if (unknownCalls.length) {
                  nextMessagesForModel = [
                    ...nextMessagesForModel,
                    { role: 'system', content: buildUnknownToolPrompt(unknownCalls, toolMap) },
                  ];
                }

                return {
                  action: 'tool_loop',
                  nextMessagesForModel,
                };
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

              return {
                action: 'final',
                nextMessagesForModel: messagesForModel,
              };
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

    return { response: new Response(readable, { headers: sseHeaders(req) }), assistantMsgId };
  };
}
