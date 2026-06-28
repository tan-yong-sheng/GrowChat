import { describe, expect, it, vi, beforeEach } from 'vitest';
import { executeToolCalls } from './assistant-tool-executor.js';

describe('executeToolCalls', () => {
  let lifecycle;
  let emitSse;
  let appendMessageBlock;
  let controller;
  let encoder;
  let parseToolArguments;
  let executeMcpToolCall;
  let stringifyToolPayload;
  let normalizeErrorMessage;

  beforeEach(() => {
    lifecycle = {
      isCancelled: vi.fn().mockResolvedValue(false),
      persistToolCalls: vi.fn().mockResolvedValue(undefined),
      persistAssistantContent: vi.fn().mockResolvedValue(undefined),
      sendCancelAndClose: vi.fn().mockResolvedValue(undefined),
    };
    emitSse = vi.fn().mockResolvedValue(undefined);
    appendMessageBlock = vi.fn();
    controller = { close: vi.fn() };
    encoder = new TextEncoder();
    parseToolArguments = vi.fn((args) => JSON.parse(args));
    executeMcpToolCall = vi.fn().mockResolvedValue({ result: 'ok' });
    stringifyToolPayload = vi.fn((payload) => JSON.stringify(payload));
    normalizeErrorMessage = vi.fn((err, fallback, maxLen) => err.message || fallback);
  });

  it('executes valid tool calls and returns results', async () => {
    const validCalls = [
      {
        toolCallId: 'tc-1',
        modelToolName: 'read_file',
        displayName: 'Read File',
        toolName: 'read_file',
        serverId: 'server-1',
        arguments: '{}',
      },
    ];

    const result = await executeToolCalls({
      validCalls,
      unknownCalls: [],
      serversById: new Map([['server-1', { id: 'server-1' }]]),
      parseToolArguments,
      executeMcpToolCall,
      stringifyToolPayload,
      lifecycle,
      assistantMsgId: 'msg-1',
      toolCallRecords: [],
      appendMessageBlock,
      fullText: '',
      fullReasoning: '',
      messageBlocks: [],
      emitSse,
      controller,
      encoder,
      normalizeErrorMessage,
    });

    expect(result.cancelled).toBe(false);
    expect(result.toolResultMessages).toHaveLength(1);
    expect(result.toolResultMessages[0].role).toBe('tool');
    expect(result.toolCallsForModel).toHaveLength(1);
    expect(result.toolCallsForModel[0].id).toBe('tc-1');
    expect(executeMcpToolCall).toHaveBeenCalled();
  });

  it('handles tool execution error', async () => {
    executeMcpToolCall.mockRejectedValueOnce(new Error('MCP connection failed'));

    const validCalls = [
      {
        toolCallId: 'tc-1',
        modelToolName: 'bad_tool',
        displayName: 'Bad Tool',
        toolName: 'bad_tool',
        serverId: 'server-1',
        arguments: '{}',
      },
    ];
    const toolCallRecords = [];

    const result = await executeToolCalls({
      validCalls,
      unknownCalls: [],
      serversById: new Map([['server-1', { id: 'server-1' }]]),
      parseToolArguments,
      executeMcpToolCall,
      stringifyToolPayload,
      lifecycle,
      assistantMsgId: 'msg-1',
      toolCallRecords,
      appendMessageBlock,
      fullText: '',
      fullReasoning: '',
      messageBlocks: [],
      emitSse,
      controller,
      encoder,
      normalizeErrorMessage,
    });

    expect(result.cancelled).toBe(false);
    expect(result.toolResultMessages[0].content).toBe('MCP connection failed');
    expect(toolCallRecords[0].status).toBe('error');
    expect(toolCallRecords[0].error).toBe('MCP connection failed');
    expect(emitSse).toHaveBeenCalledWith(
      expect.objectContaining({
        event: 'tool_result',
        tool_call_id: 'tc-1',
        status: 'error',
        error: 'MCP connection failed',
      }),
      { persist: true }
    );
    expect(normalizeErrorMessage).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'MCP connection failed' }),
      'Tool call failed',
      8000
    );
  });

  it('handles unknown tool calls with error', async () => {
    const unknownCalls = [{ toolCallId: 'tc-unknown', name: 'nonexistent_tool', arguments: '{}' }];

    const result = await executeToolCalls({
      validCalls: [],
      unknownCalls,
      serversById: new Map(),
      parseToolArguments,
      executeMcpToolCall,
      stringifyToolPayload,
      lifecycle,
      assistantMsgId: 'msg-1',
      toolCallRecords: [],
      appendMessageBlock,
      fullText: '',
      fullReasoning: '',
      messageBlocks: [],
      emitSse,
      controller,
      encoder,
      normalizeErrorMessage,
    });

    expect(result.toolResultMessages).toHaveLength(0);
    expect(emitSse).toHaveBeenCalledWith(
      expect.objectContaining({
        event: 'tool_result',
        status: 'error',
        error: 'Unknown tool: nonexistent_tool',
      }),
      { persist: true }
    );
  });

  it('returns cancelled when lifecycle is cancelled before a tool call', async () => {
    lifecycle.isCancelled
      .mockResolvedValueOnce(false) // before first tool
      .mockResolvedValueOnce(true); // after first tool

    const validCalls = [
      {
        toolCallId: 'tc-1',
        modelToolName: 'tool1',
        displayName: 'Tool1',
        toolName: 'tool1',
        serverId: 'server-1',
        arguments: '{}',
      },
    ];

    const result = await executeToolCalls({
      validCalls,
      unknownCalls: [],
      serversById: new Map([['server-1', { id: 'server-1' }]]),
      parseToolArguments,
      executeMcpToolCall,
      stringifyToolPayload,
      lifecycle,
      assistantMsgId: 'msg-1',
      toolCallRecords: [],
      appendMessageBlock,
      fullText: '',
      fullReasoning: '',
      messageBlocks: [],
      emitSse,
      controller,
      encoder,
      normalizeErrorMessage,
    });

    expect(result.cancelled).toBe(true);
    expect(lifecycle.sendCancelAndClose).toHaveBeenCalledWith({ controller, encoder });
  });

  it('returns cancelled when lifecycle is cancelled at start', async () => {
    lifecycle.isCancelled.mockResolvedValueOnce(true);

    const validCalls = [
      {
        toolCallId: 'tc-1',
        modelToolName: 'tool1',
        displayName: 'Tool1',
        toolName: 'tool1',
        serverId: 'server-1',
        arguments: '{}',
      },
    ];

    const result = await executeToolCalls({
      validCalls,
      unknownCalls: [],
      serversById: new Map([['server-1', { id: 'server-1' }]]),
      parseToolArguments,
      executeMcpToolCall,
      stringifyToolPayload,
      lifecycle,
      assistantMsgId: 'msg-1',
      toolCallRecords: [],
      appendMessageBlock,
      fullText: '',
      fullReasoning: '',
      messageBlocks: [],
      emitSse,
      controller,
      encoder,
      normalizeErrorMessage,
    });

    expect(result.cancelled).toBe(true);
    expect(executeMcpToolCall).not.toHaveBeenCalled();
  });

  it('includes providerMetadata in toolCallsForModel when present', async () => {
    const validCalls = [
      {
        toolCallId: 'tc-1',
        modelToolName: 'tool1',
        displayName: 'Tool1',
        toolName: 'tool1',
        serverId: 'server-1',
        arguments: '{}',
        providerMetadata: { custom: 'data' },
      },
    ];

    const result = await executeToolCalls({
      validCalls,
      unknownCalls: [],
      serversById: new Map([['server-1', { id: 'server-1' }]]),
      parseToolArguments,
      executeMcpToolCall,
      stringifyToolPayload,
      lifecycle,
      assistantMsgId: 'msg-1',
      toolCallRecords: [],
      appendMessageBlock,
      fullText: '',
      fullReasoning: '',
      messageBlocks: [],
      emitSse,
      controller,
      encoder,
      normalizeErrorMessage,
    });

    expect(result.toolCallsForModel[0].providerMetadata).toEqual({ custom: 'data' });
  });

  it('emits tool_status event with running state', async () => {
    const validCalls = [
      {
        toolCallId: 'tc-1',
        modelToolName: 'tool1',
        displayName: 'Tool1',
        toolName: 'tool1',
        serverId: 'server-1',
        arguments: '{}',
      },
    ];

    await executeToolCalls({
      validCalls,
      unknownCalls: [],
      serversById: new Map([['server-1', { id: 'server-1' }]]),
      parseToolArguments,
      executeMcpToolCall,
      stringifyToolPayload,
      lifecycle,
      assistantMsgId: 'msg-1',
      toolCallRecords: [],
      appendMessageBlock,
      fullText: '',
      fullReasoning: '',
      messageBlocks: [],
      emitSse,
      controller,
      encoder,
      normalizeErrorMessage,
    });

    expect(emitSse).toHaveBeenCalledWith(
      expect.objectContaining({ event: 'tool_status', state: 'running' }),
      { persist: true }
    );
  });

  it('emits tool_result event with completed status on success', async () => {
    const validCalls = [
      {
        toolCallId: 'tc-1',
        modelToolName: 'tool1',
        displayName: 'Tool1',
        toolName: 'tool1',
        serverId: 'server-1',
        arguments: '{}',
      },
    ];

    await executeToolCalls({
      validCalls,
      unknownCalls: [],
      serversById: new Map([['server-1', { id: 'server-1' }]]),
      parseToolArguments,
      executeMcpToolCall,
      stringifyToolPayload,
      lifecycle,
      assistantMsgId: 'msg-1',
      toolCallRecords: [],
      appendMessageBlock,
      fullText: '',
      fullReasoning: '',
      messageBlocks: [],
      emitSse,
      controller,
      encoder,
      normalizeErrorMessage,
    });

    expect(emitSse).toHaveBeenCalledWith(
      expect.objectContaining({ event: 'tool_result', status: 'completed', error: null }),
      { persist: true }
    );
  });

  it('handles multiple valid tool calls in sequence', async () => {
    const validCalls = [
      {
        toolCallId: 'tc-1',
        modelToolName: 'tool1',
        displayName: 'Tool1',
        toolName: 'tool1',
        serverId: 'server-1',
        arguments: '{}',
      },
      {
        toolCallId: 'tc-2',
        modelToolName: 'tool2',
        displayName: 'Tool2',
        toolName: 'tool2',
        serverId: 'server-1',
        arguments: '{}',
      },
    ];

    const result = await executeToolCalls({
      validCalls,
      unknownCalls: [],
      serversById: new Map([['server-1', { id: 'server-1' }]]),
      parseToolArguments,
      executeMcpToolCall,
      stringifyToolPayload,
      lifecycle,
      assistantMsgId: 'msg-1',
      toolCallRecords: [],
      appendMessageBlock,
      fullText: '',
      fullReasoning: '',
      messageBlocks: [],
      emitSse,
      controller,
      encoder,
      normalizeErrorMessage,
    });

    expect(result.toolResultMessages).toHaveLength(2);
    expect(result.toolCallsForModel).toHaveLength(2);
    expect(executeMcpToolCall).toHaveBeenCalledTimes(2);
  });

  it('passes server from serversById to executeMcpToolCall', async () => {
    const server = { id: 'server-1', name: 'MyMCP' };
    const validCalls = [
      {
        toolCallId: 'tc-1',
        modelToolName: 'tool1',
        displayName: 'Tool1',
        toolName: 'tool1',
        serverId: 'server-1',
        arguments: '{"key":"value"}',
      },
    ];

    await executeToolCalls({
      validCalls,
      unknownCalls: [],
      serversById: new Map([['server-1', server]]),
      parseToolArguments,
      executeMcpToolCall,
      stringifyToolPayload,
      lifecycle,
      assistantMsgId: 'msg-1',
      toolCallRecords: [],
      appendMessageBlock,
      fullText: '',
      fullReasoning: '',
      messageBlocks: [],
      emitSse,
      controller,
      encoder,
      normalizeErrorMessage,
    });

    expect(executeMcpToolCall).toHaveBeenCalledWith({
      server,
      toolName: 'tool1',
      args: { key: 'value' },
    });
  });
});
