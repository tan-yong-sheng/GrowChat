import { describe, expect, it, vi } from 'vitest';
import { executeToolCalls } from './assistant-tool-executor.js';

describe('executeToolCalls', () => {
  function makeLifecycle() {
    return {
      isCancelled: vi.fn().mockResolvedValue(false),
      persistToolCalls: vi.fn().mockResolvedValue(),
      persistAssistantContent: vi.fn().mockResolvedValue(),
      sendCancelAndClose: vi.fn().mockResolvedValue(),
    };
  }

  function makeDeps(overrides = {}) {
    return {
      validCalls: [],
      unknownCalls: [],
      serversById: new Map(),
      parseToolArguments: vi.fn((args) => JSON.parse(args)),
      executeMcpToolCall: vi.fn().mockResolvedValue({ result: 'ok' }),
      stringifyToolPayload: vi.fn((payload) => JSON.stringify(payload)),
      lifecycle: makeLifecycle(),
      assistantMsgId: 'msg-1',
      toolCallRecords: [],
      appendMessageBlock: vi.fn(),
      fullText: '',
      fullReasoning: '',
      messageBlocks: [],
      emitSse: vi.fn().mockResolvedValue(),
      controller: { close: vi.fn(), enqueue: vi.fn() },
      encoder: { encode: vi.fn((s) => s) },
      normalizeErrorMessage: vi.fn((err, fallback, _max) =>
        String(err?.message || err || fallback)
      ),
      ...overrides,
    };
  }

  it('returns empty results with no calls', async () => {
    const deps = makeDeps();
    const result = await executeToolCalls(deps);
    expect(result.cancelled).toBe(false);
    expect(result.toolCallsForModel).toEqual([]);
    expect(result.toolResultMessages).toEqual([]);
  });

  it('handles unknown tool calls with error', async () => {
    const deps = makeDeps({
      unknownCalls: [{ toolCallId: 'tc-1', name: ' mystery_tool ', arguments: '{}' }],
    });

    const result = await executeToolCalls(deps);
    expect(result.cancelled).toBe(false);
    expect(deps.toolCallRecords).toHaveLength(1);
    expect(deps.toolCallRecords[0]).toMatchObject({
      id: 'tc-1',
      name: ' mystery_tool ',
      status: 'error',
      error: 'Unknown tool:  mystery_tool ',
    });
    expect(deps.emitSse).toHaveBeenCalledWith(
      expect.objectContaining({ event: 'tool_result', status: 'error' }),
      { persist: true }
    );
  });

  it('executes valid tool calls', async () => {
    const deps = makeDeps({
      validCalls: [
        {
          toolCallId: 'tc-2',
          modelToolName: 'read_file',
          displayName: 'Read File',
          toolName: 'readFile',
          serverId: 'srv-1',
          arguments: '{"path": "/etc/hosts"}',
        },
      ],
      serversById: new Map([['srv-1', { url: 'http://localhost', name: 'fs' }]]),
    });

    const result = await executeToolCalls(deps);
    expect(result.cancelled).toBe(false);
    expect(deps.executeMcpToolCall).toHaveBeenCalledWith({
      server: { url: 'http://localhost', name: 'fs' },
      toolName: 'readFile',
      args: { path: '/etc/hosts' },
    });
    expect(result.toolResultMessages).toHaveLength(1);
    expect(result.toolResultMessages[0]).toMatchObject({
      role: 'tool',
      tool_call_id: 'tc-2',
    });
  });

  it('includes providerMetadata in toolCallsForModel when present', async () => {
    const deps = makeDeps({
      validCalls: [
        {
          toolCallId: 'tc-3',
          modelToolName: 'search',
          displayName: 'Search',
          toolName: 'search',
          serverId: 'srv-1',
          arguments: '{}',
          providerMetadata: { id: 'meta-1', index: 0 },
        },
      ],
      serversById: new Map([['srv-1', {}]]),
    });

    const result = await executeToolCalls(deps);
    expect(result.toolCallsForModel).toHaveLength(1);
    expect(result.toolCallsForModel[0]).toMatchObject({
      id: 'tc-3',
      providerMetadata: { id: 'meta-1', index: 0 },
    });
  });

  it('cancels when lifecycle reports cancelled before tool execution', async () => {
    const lifecycle = makeLifecycle();
    lifecycle.isCancelled.mockResolvedValueOnce(true);

    const deps = makeDeps({
      validCalls: [
        {
          toolCallId: 'tc-4',
          modelToolName: 'tool',
          displayName: 'T',
          toolName: 't',
          serverId: 's1',
          arguments: '{}',
        },
      ],
      serversById: new Map([['s1', {}]]),
      lifecycle,
    });

    const result = await executeToolCalls(deps);
    expect(result.cancelled).toBe(true);
    expect(deps.executeMcpToolCall).not.toHaveBeenCalled();
    expect(lifecycle.sendCancelAndClose).toHaveBeenCalled();
  });

  it('cancels during loop after executing a tool', async () => {
    const lifecycle = makeLifecycle();
    lifecycle.isCancelled
      .mockResolvedValueOnce(false) // before first tool
      .mockResolvedValueOnce(true); // after first tool

    const deps = makeDeps({
      validCalls: [
        {
          toolCallId: 'tc-5',
          modelToolName: 'tool',
          displayName: 'T',
          toolName: 't',
          serverId: 's1',
          arguments: '{}',
        },
      ],
      serversById: new Map([['s1', {}]]),
      lifecycle,
    });

    const result = await executeToolCalls(deps);
    expect(result.cancelled).toBe(true);
    expect(lifecycle.sendCancelAndClose).toHaveBeenCalled();
  });

  it('handles tool execution errors', async () => {
    const deps = makeDeps({
      validCalls: [
        {
          toolCallId: 'tc-6',
          modelToolName: 'fail_tool',
          displayName: 'Fail Tool',
          toolName: 'failTool',
          serverId: 'srv-1',
          arguments: '{}',
        },
      ],
      serversById: new Map([['srv-1', {}]]),
    });
    deps.executeMcpToolCall.mockRejectedValueOnce(new Error('tool exploded'));

    const result = await executeToolCalls(deps);
    expect(result.cancelled).toBe(false);
    expect(result.toolResultMessages).toHaveLength(1);
    expect(deps.toolCallRecords[0].status).toBe('error');
    expect(deps.emitSse).toHaveBeenCalledWith(
      expect.objectContaining({ event: 'tool_result', status: 'error' }),
      { persist: true }
    );
  });

  it('handles JSON parse errors from parseToolArguments', async () => {
    const deps = makeDeps({
      validCalls: [
        {
          toolCallId: 'tc-7',
          modelToolName: 'bad_json',
          displayName: 'Bad JSON',
          toolName: 'badJson',
          serverId: 's1',
          arguments: 'not-json',
        },
      ],
      serversById: new Map([['s1', {}]]),
      parseToolArguments: vi.fn(() => {
        throw new SyntaxError('Unexpected token');
      }),
    });

    const result = await executeToolCalls(deps);
    expect(result.cancelled).toBe(false);
    expect(deps.toolCallRecords[0].status).toBe('error');
    expect(deps.toolCallRecords[0].error).toContain('Unexpected token');
  });

  it('emits tool_status before executing each tool', async () => {
    const deps = makeDeps({
      validCalls: [
        {
          toolCallId: 'tc-8',
          modelToolName: 't1',
          displayName: 'Tool One',
          toolName: 't1',
          serverId: 's1',
          arguments: '{}',
        },
      ],
      serversById: new Map([['s1', {}]]),
    });

    await executeToolCalls(deps);
    expect(deps.emitSse).toHaveBeenCalledWith(
      expect.objectContaining({ event: 'tool_status', state: 'running' }),
      { persist: true }
    );
  });

  it('handles multiple valid and unknown calls', async () => {
    const deps = makeDeps({
      validCalls: [
        {
          toolCallId: 'tc-v1',
          modelToolName: 'a',
          displayName: 'A',
          toolName: 'a',
          serverId: 's1',
          arguments: '{}',
        },
        {
          toolCallId: 'tc-v2',
          modelToolName: 'b',
          displayName: 'B',
          toolName: 'b',
          serverId: 's1',
          arguments: '{}',
        },
      ],
      unknownCalls: [{ toolCallId: 'tc-u1', name: 'unknown1', arguments: '{}' }],
      serversById: new Map([['s1', {}]]),
    });

    const result = await executeToolCalls(deps);
    expect(result.toolCallsForModel).toHaveLength(2);
    expect(result.toolResultMessages).toHaveLength(2);
    expect(deps.toolCallRecords).toHaveLength(3); // 2 valid + 1 unknown
  });

  it('calls normalizeErrorMessage on tool errors', async () => {
    const normalizeErrorMessage = vi.fn((err, fallback) => fallback);
    const deps = makeDeps({
      validCalls: [
        {
          toolCallId: 'tc-9',
          modelToolName: 'fail',
          displayName: 'F',
          toolName: 'fail',
          serverId: 's1',
          arguments: '{}',
        },
      ],
      serversById: new Map([['s1', {}]]),
      normalizeErrorMessage,
    });
    deps.executeMcpToolCall.mockRejectedValueOnce(new Error('boom'));

    await executeToolCalls(deps);
    expect(normalizeErrorMessage).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'boom' }),
      'Tool call failed',
      8000
    );
  });
});
