export async function executeToolCalls({
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
}) {
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
    await lifecycle.persistAssistantContent({ fullText, fullReasoning, messageBlocks });
    await emitSse(
      {
        event: 'tool_result',
        message_id: assistantMsgId,
        tool_call_id: call.toolCallId,
        tool_name: record.name,
        input: call.arguments,
        output: errorText,
        error: errorText,
        status: 'error',
      },
      { persist: true }
    );
  }

  for (const call of validCalls) {
    if (await lifecycle.isCancelled()) {
      await lifecycle.sendCancelAndClose({ controller, encoder });
      return { cancelled: true };
    }

    await emitSse(
      {
        event: 'tool_status',
        message_id: assistantMsgId,
        tool_call_id: call.toolCallId,
        tool_name: call.displayName,
        state: 'running',
        input: call.arguments,
      },
      { persist: true }
    );

    const server = serversById.get(call.serverId);
    let outputText;
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
      const output = await executeMcpToolCall({ server, toolName: call.toolName, args });
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
    await lifecycle.persistAssistantContent({ fullText, fullReasoning, messageBlocks });
    await emitSse(
      {
        event: 'tool_result',
        message_id: assistantMsgId,
        tool_call_id: call.toolCallId,
        tool_name: call.displayName,
        input: call.arguments,
        output: outputText,
        error: errorText || null,
        status,
      },
      { persist: true }
    );

    toolResultMessages.push({
      role: 'tool',
      tool_call_id: call.toolCallId,
      content: outputText,
    });

    if (await lifecycle.isCancelled()) {
      await lifecycle.sendCancelAndClose({ controller, encoder });
      return { cancelled: true };
    }
  }

  return { toolCallsForModel, toolResultMessages, cancelled: false };
}
