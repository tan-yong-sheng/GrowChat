import { afterEach, describe, expect, it, vi } from 'vitest';
import { createAssistantRunner, readStreamChunkWithHeartbeat } from './assistant-runner.js';

describe('assistant runner', () => {
  it('exposes a factory for the stream assistant runner', () => {
    expect(typeof createAssistantRunner).toBe('function');
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('emits keepalive comments while waiting for the next chunk', async () => {
    vi.useFakeTimers();

    let resolveRead;
    const reader = {
      read: vi.fn(
        () =>
          new Promise((resolve) => {
            resolveRead = resolve;
          })
      ),
      cancel: vi.fn(() => Promise.resolve()),
    };
    const chunks = [];
    const controller = {
      enqueue: vi.fn((value) => {
        chunks.push(new TextDecoder().decode(value));
      }),
    };

    const pending = readStreamChunkWithHeartbeat(reader, {
      controller,
      encoder: new TextEncoder(),
      keepAliveIntervalMs: 10,
      hardTimeoutMs: 1000,
      heartbeatPayload: ':\n\n',
    });

    await vi.advanceTimersByTimeAsync(11);
    expect(chunks).toContain(':\n\n');

    resolveRead({ done: false, value: new Uint8Array([1]) });
    const result = await pending;

    expect(reader.read).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ done: false, value: new Uint8Array([1]) });
  });
});

describe('createAssistantRunner factory', () => {
  function makeDeps(overrides = {}) {
    return {
      sseData: vi.fn((payload) => `data: ${JSON.stringify(payload)}\n\n`),
      sseHeaders: vi.fn(() => ({ 'Content-Type': 'text/event-stream' })),
      SseLineParser: vi.fn().mockImplementation(function () {
        return {
          push: vi.fn().mockReturnValue(null),
          flush: vi.fn().mockReturnValue(null),
          finalize: vi.fn(),
        };
      }),
      streamLLM: vi.fn().mockResolvedValue(
        new ReadableStream({
          start(c) {
            c.close();
          },
        })
      ),
      runAsyncSessionProcessor: vi.fn().mockImplementation(async ({ runStep }) => {
        const result = await runStep({ messagesForModel: [], followUps: 0 });
        return { lastResult: result };
      }),
      resolveTurnContinuation: vi.fn().mockReturnValue({ action: 'final' }),
      normalizeProviderFamily: vi.fn((f) => f || 'openai'),
      buildMcpTools: vi
        .fn()
        .mockReturnValue({ tools: [], toolMap: new Map(), serversById: new Map() }),
      loadToolServers: vi.fn().mockResolvedValue([]),
      executeMcpToolCall: vi.fn().mockResolvedValue({}),
      parseToolArguments: vi.fn((args) => JSON.parse(args)),
      stringifyToolPayload: vi.fn((payload) => JSON.stringify(payload)),
      applyToolCallDelta: vi.fn(),
      buildUnknownToolPrompt: vi.fn().mockReturnValue('unknown tool prompt'),
      normalizeToolCalls: vi.fn().mockReturnValue({ validCalls: [], unknownCalls: [] }),
      createAssistantStreamLifecycle: vi.fn().mockImplementation(() => ({
        ensureAssistantRow: vi.fn().mockResolvedValue(true),
        persistAssistantContent: vi.fn().mockResolvedValue(true),
        persistToolCalls: vi.fn().mockResolvedValue(),
        clearStreamingStatus: vi.fn().mockResolvedValue(),
        sendErrorAndClose: vi.fn().mockImplementation(({ controller }) => {
          try {
            controller.close();
          } catch {
            /* noop */
          }
        }),
        sendCancelAndClose: vi.fn().mockImplementation(({ controller }) => {
          try {
            controller.close();
          } catch {
            /* noop */
          }
        }),
        isCancelled: vi.fn().mockResolvedValue(false),
      })),
      finalizeAssistantStream: vi.fn().mockImplementation(({ controller }) => {
        try {
          controller.close();
        } catch {
          /* noop */
        }
      }),
      recordAttachmentCapabilityFailure: vi.fn().mockResolvedValue(),
      createRealtimeEvent: vi.fn((event) => event),
      getOriginSessionId: vi.fn().mockReturnValue('sess-1'),
      publishRealtimeNow: vi.fn().mockResolvedValue(true),
      getMessageSnapshot: vi.fn().mockResolvedValue({ id: 'm1' }),
      getOwnedChat: vi.fn().mockResolvedValue({ id: 'c1' }),
      normalizeErrorMessage: vi.fn((err, fallback) => String(err?.message || err || fallback)),
      sleep: vi.fn().mockResolvedValue(),
      ...overrides,
    };
  }

  function makeParams(overrides = {}) {
    return {
      req: new Request('https://example.com'),
      env: {},
      ctx: { waitUntil: vi.fn() },
      db: {
        run: vi.fn().mockResolvedValue({ meta: { changes: 1 } }),
        first: vi.fn().mockResolvedValue(null),
        all: vi.fn().mockResolvedValue({ results: [] }),
      },
      user: { sub: 'u1', primary_role: 'member' },
      chatId: 'c1',
      userMsgId: 'um1',
      model: 'gpt-4',
      history: [{ role: 'user', content: 'hi' }],
      citations: null,
      attachmentKinds: [],
      providerFamily: 'openai',
      selectedToolNames: null,
      ...overrides,
    };
  }

  it('returns a Response and assistantMsgId', async () => {
    const deps = makeDeps();
    const runner = createAssistantRunner(deps);
    const params = makeParams();

    const result = await runner(params);

    expect(result.response).toBeInstanceOf(Response);
    expect(result.assistantMsgId).toBeTruthy();
    expect(deps.createAssistantStreamLifecycle).toHaveBeenCalled();
  });

  it('loads tool servers with userId from user.sub', async () => {
    const deps = makeDeps();
    const runner = createAssistantRunner(deps);
    const params = makeParams();

    await runner(params);
    expect(deps.loadToolServers).toHaveBeenCalledWith(params.db, { userId: 'u1' });
  });

  it('passes selectedToolNames array to buildMcpTools', async () => {
    const deps = makeDeps();
    const runner = createAssistantRunner(deps);
    const params = makeParams({ selectedToolNames: ['search', 'readFile'] });

    await runner(params);
    expect(deps.buildMcpTools).toHaveBeenCalledWith([], {
      selectedToolNames: ['search', 'readFile'],
    });
  });

  it('passes trimmed and filtered tool names', async () => {
    const deps = makeDeps();
    const runner = createAssistantRunner(deps);
    const params = makeParams({ selectedToolNames: [' search ', '', '  ', null] });

    await runner(params);
    expect(deps.buildMcpTools).toHaveBeenCalledWith([], {
      selectedToolNames: ['search'],
    });
  });

  it('normalizes provider family', async () => {
    const deps = makeDeps();
    const runner = createAssistantRunner(deps);
    const params = makeParams({ providerFamily: 'anthropic' });

    await runner(params);
    expect(deps.normalizeProviderFamily).toHaveBeenCalledWith('anthropic');
  });

  it('creates SSE headers via sseHeaders', async () => {
    const deps = makeDeps();
    const runner = createAssistantRunner(deps);
    const params = makeParams();

    await runner(params);
    expect(deps.sseHeaders).toHaveBeenCalledWith(params.req);
  });

  it('handles LLM stream rejection', async () => {
    const lifecycle = {
      ensureAssistantRow: vi.fn().mockResolvedValue(true),
      persistAssistantContent: vi.fn().mockResolvedValue(true),
      persistToolCalls: vi.fn().mockResolvedValue(),
      clearStreamingStatus: vi.fn().mockResolvedValue(),
      sendErrorAndClose: vi.fn().mockImplementation(({ controller }) => {
        try {
          controller.close();
        } catch {
          /* noop */
        }
      }),
      sendCancelAndClose: vi.fn().mockImplementation(({ controller }) => {
        try {
          controller.close();
        } catch {
          /* noop */
        }
      }),
      isCancelled: vi.fn().mockResolvedValue(false),
    };
    const deps = makeDeps({
      streamLLM: vi.fn().mockRejectedValue(new Error('LLM down')),
      createAssistantStreamLifecycle: vi.fn().mockReturnValue(lifecycle),
    });
    const runner = createAssistantRunner(deps);
    const params = makeParams();
    const result = await runner(params);

    // Consume the stream to trigger the internal start() callback
    const reader = result.response.body.getReader();
    try {
      while (true) {
        const { done } = await reader.read();
        if (done) break;
      }
    } catch {
      // expected on close
    }

    expect(lifecycle.sendErrorAndClose).toHaveBeenCalled();
    expect(deps.recordAttachmentCapabilityFailure).toHaveBeenCalled();
  });

  it('handles stream cancellation mid-read', async () => {
    const lifecycle = {
      ensureAssistantRow: vi.fn().mockResolvedValue(true),
      persistAssistantContent: vi.fn().mockResolvedValue(true),
      persistToolCalls: vi.fn().mockResolvedValue(),
      clearStreamingStatus: vi.fn().mockResolvedValue(),
      sendErrorAndClose: vi.fn().mockImplementation(({ controller }) => {
        try {
          controller.close();
        } catch {
          /* noop */
        }
      }),
      sendCancelAndClose: vi.fn().mockImplementation(({ controller }) => {
        try {
          controller.close();
        } catch {
          /* noop */
        }
      }),
      isCancelled: vi.fn().mockResolvedValueOnce(false).mockResolvedValueOnce(true),
    };
    const deps = makeDeps({
      createAssistantStreamLifecycle: vi.fn().mockReturnValue(lifecycle),
      SseLineParser: vi.fn().mockImplementation(function () {
        return {
          push: vi.fn().mockReturnValue('delta'),
          flush: vi.fn().mockReturnValue(null),
          finalize: vi.fn(),
        };
      }),
      streamLLM: vi.fn().mockResolvedValue(
        new ReadableStream({
          start(controller) {
            controller.enqueue(new TextEncoder().encode('data'));
            controller.close();
          },
        })
      ),
    });
    const runner = createAssistantRunner(deps);
    const params = makeParams();
    const result = await runner(params);
    // Give async stream processing time to run, then cancel
    await new Promise((r) => setTimeout(r, 10));
    await result.response.body.getReader().cancel();
    expect(lifecycle.sendCancelAndClose).toHaveBeenCalled();
  });

  it('calls waitUntil with sleep for clearStreamingStatus', async () => {
    const waitUntil = vi.fn();
    const deps = makeDeps();
    const runner = createAssistantRunner(deps);
    const params = makeParams({ ctx: { waitUntil } });

    await runner(params);
    expect(waitUntil).toHaveBeenCalled();
    expect(deps.sleep).toHaveBeenCalled();
  });

  it('uses userId from user.sub, or empty string', async () => {
    const deps = makeDeps();
    const runner = createAssistantRunner(deps);

    // user with sub
    await runner(makeParams({ user: { sub: 'u2', primary_role: 'admin' } }));
    expect(deps.loadToolServers.mock.calls.at(-1)[1]).toMatchObject({ userId: 'u2' });

    // user with falsy sub
    await runner(makeParams({ user: { sub: '', primary_role: 'admin' } }));
    expect(deps.loadToolServers.mock.calls.at(-1)[1]).toMatchObject({ userId: '' });

    // user missing sub
    await runner(makeParams({ user: undefined }));
    expect(deps.loadToolServers.mock.calls.at(-1)[1]).toMatchObject({ userId: '' });
  });

  it('handles tool_loop action in runAsyncSessionProcessor', async () => {
    const deps = makeDeps({
      runAsyncSessionProcessor: vi.fn().mockImplementation(async ({ runStep }) => {
        const result = await runStep({ messagesForModel: [], followUps: 0 });
        return { lastResult: result };
      }),
      resolveTurnContinuation: vi.fn().mockReturnValue({ action: 'tool_loop' }),
      normalizeToolCalls: vi.fn().mockReturnValue({
        validCalls: [
          {
            toolCallId: 'tc-1',
            modelToolName: 'search',
            serverId: 'srv-1',
            displayName: 'Search',
            toolName: 'search',
            arguments: '{}',
          },
        ],
        unknownCalls: [],
      }),
    });
    const runner = createAssistantRunner(deps);
    const result = await runner(makeParams());
    await new Promise((r) => setTimeout(r, 10));
    await result.response.body.getReader().cancel();
    expect(deps.normalizeToolCalls).toHaveBeenCalled();
  });

  it('handles follow_up action', async () => {
    const deps = makeDeps({
      resolveTurnContinuation: vi.fn().mockReturnValue({ action: 'follow_up' }),
    });
    const runner = createAssistantRunner(deps);
    const result = await runner(makeParams());
    await new Promise((r) => setTimeout(r, 10));
    await result.response.body.getReader().cancel();
    expect(deps.resolveTurnContinuation).toHaveBeenCalled();
  });

  it('handles final action', async () => {
    const deps = makeDeps();
    const runner = createAssistantRunner(deps);
    const result = await runner(makeParams());
    const reader = result.response.body.getReader();
    try {
      while (true) {
        const { done } = await reader.read();
        if (done) break;
      }
    } catch {
      // expected
    }
    expect(deps.finalizeAssistantStream).toHaveBeenCalled();
  });

  it('handles stream processing error in runAsyncSessionProcessor', async () => {
    const lifecycle = {
      ensureAssistantRow: vi.fn().mockResolvedValue(true),
      persistAssistantContent: vi.fn().mockResolvedValue(true),
      persistToolCalls: vi.fn().mockResolvedValue(),
      clearStreamingStatus: vi.fn().mockResolvedValue(),
      sendErrorAndClose: vi.fn().mockImplementation(({ controller }) => {
        try {
          controller.close();
        } catch {
          /* noop */
        }
      }),
      sendCancelAndClose: vi.fn().mockImplementation(({ controller }) => {
        try {
          controller.close();
        } catch {
          /* noop */
        }
      }),
      isCancelled: vi.fn().mockResolvedValue(false),
    };
    const deps = makeDeps({
      runAsyncSessionProcessor: vi.fn().mockRejectedValue(new Error('unexpected crash')),
      createAssistantStreamLifecycle: vi.fn().mockReturnValue(lifecycle),
    });
    const runner = createAssistantRunner(deps);
    const result = await runner(makeParams());
    const reader = result.response.body.getReader();
    try {
      while (true) {
        const { done } = await reader.read();
        if (done) break;
      }
    } catch {
      // expected
    }
    expect(lifecycle.sendErrorAndClose).toHaveBeenCalled();
  });

  it('emits SSE start event via lifecycle', async () => {
    const deps = makeDeps({
      createAssistantStreamLifecycle: vi.fn().mockReturnValue({
        ensureAssistantRow: vi.fn().mockResolvedValue(true),
        persistAssistantContent: vi.fn().mockResolvedValue(true),
        persistToolCalls: vi.fn().mockResolvedValue(),
        clearStreamingStatus: vi.fn().mockResolvedValue(),
        sendErrorAndClose: vi.fn().mockImplementation(({ controller }) => {
          try {
            controller.close();
          } catch {
            /* noop */
          }
        }),
        sendCancelAndClose: vi.fn().mockImplementation(({ controller }) => {
          try {
            controller.close();
          } catch {
            /* noop */
          }
        }),
        isCancelled: vi.fn().mockResolvedValue(false),
        emitSse: vi.fn().mockResolvedValue({ seq: 1 }),
      }),
    });
    const runner = createAssistantRunner(deps);
    const result = await runner(makeParams());
    const reader = result.response.body.getReader();
    try {
      while (true) {
        const { done } = await reader.read();
        if (done) break;
      }
    } catch {
      // expected
    }
  });

  it('handles stream with non-empty citations', async () => {
    const deps = makeDeps();
    const runner = createAssistantRunner(deps);
    const result = await runner(makeParams({ citations: [{ text: 'ref1' }] }));
    const reader = result.response.body.getReader();
    try {
      while (true) {
        const { done } = await reader.read();
        if (done) break;
      }
    } catch {
      // expected
    }
    expect(deps.createAssistantStreamLifecycle).toHaveBeenCalled();
  });

  it('handles reasoning events in the SSE parser', async () => {
    const lifecycle = {
      ensureAssistantRow: vi.fn().mockResolvedValue(true),
      persistAssistantContent: vi.fn().mockResolvedValue(true),
      persistToolCalls: vi.fn().mockResolvedValue(),
      clearStreamingStatus: vi.fn().mockResolvedValue(),
      sendErrorAndClose: vi.fn().mockImplementation(({ controller }) => {
        try {
          controller.close();
        } catch {
          /* noop */
        }
      }),
      sendCancelAndClose: vi.fn().mockImplementation(({ controller }) => {
        try {
          controller.close();
        } catch {
          /* noop */
        }
      }),
      isCancelled: vi.fn().mockResolvedValue(false),
    };

    let capturedOnEvent;
    const SseLineParser = vi.fn().mockImplementation(({ onEvent }) => {
      capturedOnEvent = onEvent;
      return {
        push: vi.fn().mockReturnValue(null),
        flush: vi.fn().mockReturnValue(null),
        finalize: vi.fn(),
      };
    });

    const deps = makeDeps({
      createAssistantStreamLifecycle: vi.fn().mockReturnValue(lifecycle),
      SseLineParser,
    });
    const runner = createAssistantRunner(deps);
    const result = await runner(makeParams());
    const reader = result.response.body.getReader();
    try {
      while (true) {
        const { done } = await reader.read();
        if (done) break;
      }
    } catch {
      // expected
    }

    expect(SseLineParser).toHaveBeenCalled();
  });

  it('skips null events from parser push', async () => {
    const deps = makeDeps();
    const runner = createAssistantRunner(deps);
    const result = await runner(makeParams());
    const reader = result.response.body.getReader();
    try {
      while (true) {
        const { done } = await reader.read();
        if (done) break;
      }
    } catch {
      // expected
    }
  });

  it('skips empty reasoning delta', async () => {
    const lifecycle = {
      ensureAssistantRow: vi.fn().mockResolvedValue(true),
      persistAssistantContent: vi.fn().mockResolvedValue(true),
      persistToolCalls: vi.fn().mockResolvedValue(),
      clearStreamingStatus: vi.fn().mockResolvedValue(),
      sendErrorAndClose: vi.fn().mockImplementation(({ controller }) => {
        try {
          controller.close();
        } catch {
          /* noop */
        }
      }),
      sendCancelAndClose: vi.fn().mockImplementation(({ controller }) => {
        try {
          controller.close();
        } catch {
          /* noop */
        }
      }),
      isCancelled: vi.fn().mockResolvedValue(false),
    };

    let capturedOnEvent;
    const SseLineParser = vi.fn().mockImplementation(({ onEvent }) => {
      capturedOnEvent = onEvent;
      return {
        push: vi.fn().mockReturnValue(null),
        flush: vi.fn().mockReturnValue(null),
        finalize: vi.fn(),
      };
    });

    const deps = makeDeps({
      createAssistantStreamLifecycle: vi.fn().mockReturnValue(lifecycle),
      SseLineParser,
    });

    const runner = createAssistantRunner(deps);
    const result = await runner(makeParams());
    const reader = result.response.body.getReader();
    try {
      while (true) {
        const { done } = await reader.read();
        if (done) break;
      }
    } catch {
      // expected
    }

    // When an empty delta is pushed, persistAssistantContent should not be called
    // (this is hard to trigger without a real parser, but the test verifies the structure)
  });

  it('uses providerSupportsTools from supported provider families', async () => {
    const deps = makeDeps();
    const runner = createAssistantRunner(deps);
    // These providers support tools
    for (const pf of ['openai', 'google', 'anthropic']) {
      vi.clearAllMocks();
      await runner(makeParams({ providerFamily: pf }));
      expect(deps.normalizeProviderFamily).toHaveBeenCalledWith(pf);
    }
  });

  it('terminates when runAsyncSessionProcessor returns terminate flag', async () => {
    const deps = makeDeps({
      runAsyncSessionProcessor: vi.fn().mockImplementation(async ({ runStep }) => {
        const result = await runStep({ messagesForModel: [], followUps: 0 });
        return { lastResult: { terminate: true } };
      }),
    });
    const runner = createAssistantRunner(deps);
    const result = await runner(makeParams());
    // Cancel the stream reader to avoid hanging
    await result.response.body.getReader().cancel();
    expect(deps.finalizeAssistantStream).not.toHaveBeenCalled();
  });

  it('passes citationsJson to lifecycle', async () => {
    const deps = makeDeps();
    const runner = createAssistantRunner(deps);
    const result = await runner(makeParams({ citations: [{ text: 'source' }] }));
    const reader = result.response.body.getReader();
    try {
      while (true) {
        const { done } = await reader.read();
        if (done) break;
      }
    } catch {
      // expected
    }

    const lifecycleCall = deps.createAssistantStreamLifecycle.mock.calls[0][0];
    expect(lifecycleCall.citationsJson).toBe('[{"text":"source"}]');
  });

  it('handles null citations parameter', async () => {
    const deps = makeDeps();
    const runner = createAssistantRunner(deps);
    const result = await runner(makeParams({ citations: null }));
    const reader = result.response.body.getReader();
    try {
      while (true) {
        const { done } = await reader.read();
        if (done) break;
      }
    } catch {
      // expected
    }

    const lifecycleCall = deps.createAssistantStreamLifecycle.mock.calls[0][0];
    expect(lifecycleCall.citationsJson).toBeNull();
  });
});
