import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import {
  MAX_TOOL_STEPS,
  MAX_FOLLOW_UPS,
  FOLLOW_UP_PROMPT,
  STREAM_KEEPALIVE_INTERVAL_MS,
  STREAM_HARD_TIMEOUT_MS,
  STREAM_KEEPALIVE_PAYLOAD,
  STREAM_STATUS_STALE_MS,
  readStreamChunkWithHeartbeat,
  createStreamHelpers,
} from './assistant-stream-utils.js';

describe('constants', () => {
  it('exports expected constant values', () => {
    expect(MAX_TOOL_STEPS).toBe(100);
    expect(MAX_FOLLOW_UPS).toBe(20);
    expect(FOLLOW_UP_PROMPT).toBe(
      'Provide a complete final answer to the user. Do not return tool calls or reasoning-only output.'
    );
    expect(STREAM_KEEPALIVE_INTERVAL_MS).toBe(15000);
    expect(STREAM_HARD_TIMEOUT_MS).toBe(10 * 60 * 1000);
    expect(STREAM_KEEPALIVE_PAYLOAD).toBe(':\n\n');
    expect(STREAM_STATUS_STALE_MS).toBe(10 * 60 * 1000);
  });
});

describe('readStreamChunkWithHeartbeat', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('reads a chunk from the reader', async () => {
    const reader = {
      read: vi.fn().mockResolvedValue({ value: new Uint8Array([1, 2, 3]), done: false }),
      cancel: vi.fn(),
    };

    const result = await readStreamChunkWithHeartbeat(reader, {
      keepAliveIntervalMs: 0, // Disable heartbeat
      hardTimeoutMs: 5000,
    });

    expect(result.value).toEqual(new Uint8Array([1, 2, 3]));
    expect(result.done).toBe(false);
  });

  it('sends heartbeat when controller and interval are provided', async () => {
    vi.useFakeTimers();
    const enqueue = vi.fn();
    const controller = { enqueue };
    let resolveRead;
    const reader = {
      read: vi.fn().mockImplementation(
        () =>
          new Promise((resolve) => {
            resolveRead = resolve;
          })
      ),
      cancel: vi.fn().mockReturnValue(Promise.resolve()),
    };

    const readPromise = readStreamChunkWithHeartbeat(reader, {
      controller,
      keepAliveIntervalMs: 50,
      hardTimeoutMs: 0,
    });

    await vi.advanceTimersByTimeAsync(120);
    resolveRead({ value: 'data', done: false });

    const result = await readPromise;
    expect(result.value).toBe('data');
    expect(enqueue).toHaveBeenCalled();
    vi.useRealTimers();
  });

  it('throws on timeout', async () => {
    vi.useFakeTimers();
    const reader = {
      read: vi.fn().mockImplementation(() => new Promise(() => {})),
      cancel: vi.fn().mockReturnValue(Promise.resolve()),
    };

    const readPromise = readStreamChunkWithHeartbeat(reader, {
      keepAliveIntervalMs: 0,
      hardTimeoutMs: 200,
    });
    readPromise.catch(() => {});

    await vi.advanceTimersByTimeAsync(200);

    await expect(readPromise).rejects.toThrow('LLM stream timed out');
    expect(reader.cancel).toHaveBeenCalled();
    vi.useRealTimers();
  });

  it('throws when deadline is already exceeded', async () => {
    const reader = {
      read: vi.fn().mockResolvedValue({ value: 'data', done: false }),
      cancel: vi.fn().mockReturnValue(Promise.resolve()),
    };

    const pastDeadline = Date.now() - 1000;
    await expect(
      readStreamChunkWithHeartbeat(reader, { deadlineAt: pastDeadline })
    ).rejects.toThrow('LLM stream timed out (deadline exceeded)');

    expect(reader.cancel).toHaveBeenCalled();
  });

  it('uses remaining time from deadline when valid', async () => {
    vi.useFakeTimers();
    const reader = {
      read: vi.fn().mockImplementation(() => new Promise(() => {})),
      cancel: vi.fn().mockReturnValue(Promise.resolve()),
    };

    const deadlineAt = Date.now() + 200;
    const readPromise = readStreamChunkWithHeartbeat(reader, {
      deadlineAt,
      keepAliveIntervalMs: 0,
    });
    readPromise.catch(() => {});

    await vi.advanceTimersByTimeAsync(200);

    await expect(readPromise).rejects.toThrow('LLM stream timed out');
    expect(reader.cancel).toHaveBeenCalled();
    vi.useRealTimers();
  });

  it('cancels reader on timeout', async () => {
    vi.useFakeTimers();
    const reader = {
      read: vi.fn().mockImplementation(() => new Promise(() => {})),
      cancel: vi.fn().mockReturnValue(Promise.resolve()),
    };

    const readPromise = readStreamChunkWithHeartbeat(reader, {
      keepAliveIntervalMs: 0,
      hardTimeoutMs: 200,
    });
    readPromise.catch(() => {});

    await vi.advanceTimersByTimeAsync(200);

    await expect(readPromise).rejects.toThrow();
    expect(reader.cancel).toHaveBeenCalled();
    vi.useRealTimers();
  });

  it('does not cancel reader on non-timeout error', async () => {
    const reader = {
      read: vi.fn().mockRejectedValue(new Error('stream error')),
      cancel: vi.fn().mockReturnValue(Promise.resolve()),
    };

    await expect(
      readStreamChunkWithHeartbeat(reader, {
        keepAliveIntervalMs: 0,
        hardTimeoutMs: 0,
      })
    ).rejects.toThrow('stream error');

    expect(reader.cancel).not.toHaveBeenCalled();
  });

  it('cleans up heartbeat timer on success', async () => {
    vi.useFakeTimers();
    const enqueue = vi.fn();
    let resolveRead;
    const reader = {
      read: vi.fn().mockImplementation(
        () =>
          new Promise((resolve) => {
            resolveRead = resolve;
          })
      ),
      cancel: vi.fn().mockReturnValue(Promise.resolve()),
    };

    const readPromise = readStreamChunkWithHeartbeat(reader, {
      controller: { enqueue },
      keepAliveIntervalMs: 100,
      hardTimeoutMs: 0,
    });

    await vi.advanceTimersByTimeAsync(110);
    expect(enqueue).toHaveBeenCalledTimes(1);

    resolveRead({ value: 'data', done: false });
    await readPromise;

    await vi.advanceTimersByTimeAsync(200);
    expect(enqueue).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });

  it('skips heartbeat when keepAliveIntervalMs is 0', async () => {
    vi.useFakeTimers();
    const enqueue = vi.fn();
    const reader = {
      read: vi.fn().mockResolvedValue({ value: 'data', done: false }),
      cancel: vi.fn().mockReturnValue(Promise.resolve()),
    };

    await readStreamChunkWithHeartbeat(reader, {
      controller: { enqueue },
      keepAliveIntervalMs: 0,
    });

    await vi.advanceTimersByTimeAsync(200);
    expect(enqueue).not.toHaveBeenCalled();
    vi.useRealTimers();
  });
});

describe('createStreamHelpers', () => {
  let mockDb;
  let mockSseData;

  beforeEach(() => {
    mockDb = { run: vi.fn().mockResolvedValue({ success: true }) };
    mockSseData = (payload) => `data: ${JSON.stringify(payload)}\n\n`;
  });

  it('persists delta to database', async () => {
    const { persistDelta } = createStreamHelpers({
      db: mockDb,
      assistantMsgId: 'msg-1',
      encoder: new TextEncoder(),
      sseData: mockSseData,
    });

    const result = await persistDelta({ text: 'hello' });
    expect(result.seq).toBe(1);
    expect(mockDb.run).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO message_deltas'),
      expect.arrayContaining(['msg-1', 1])
    );
  });

  it('increments delta sequence', async () => {
    const { persistDelta } = createStreamHelpers({
      db: mockDb,
      assistantMsgId: 'msg-1',
      encoder: new TextEncoder(),
      sseData: mockSseData,
    });

    const r1 = await persistDelta({ text: 'a' });
    const r2 = await persistDelta({ text: 'b' });
    expect(r1.seq).toBe(1);
    expect(r2.seq).toBe(2);
  });

  it('returns payload unchanged when null or non-object', async () => {
    const { persistDelta } = createStreamHelpers({
      db: mockDb,
      assistantMsgId: 'msg-1',
      encoder: new TextEncoder(),
      sseData: mockSseData,
    });

    expect(await persistDelta(null)).toBeNull();
    expect(await persistDelta('string')).toBe('string');
    expect(mockDb.run).not.toHaveBeenCalled();
  });

  it('handles DB failure gracefully in persistDelta', async () => {
    mockDb.run.mockRejectedValueOnce(new Error('DB error'));
    const { persistDelta } = createStreamHelpers({
      db: mockDb,
      assistantMsgId: 'msg-1',
      encoder: new TextEncoder(),
      sseData: mockSseData,
    });

    const result = await persistDelta({ text: 'hello' });
    expect(result.seq).toBe(1);
  });

  it('emits SSE with persistence when persist is true', async () => {
    const enqueue = vi.fn();
    const { emitSse, state } = createStreamHelpers({
      db: mockDb,
      assistantMsgId: 'msg-1',
      encoder: new TextEncoder(),
      sseData: mockSseData,
    });

    state.streamController = { enqueue };
    const result = await emitSse({ event: 'delta', text: 'hi' }, { persist: true });

    expect(result.seq).toBe(1);
    expect(enqueue).toHaveBeenCalled();
  });

  it('emits SSE without persistence when persist is false', async () => {
    const enqueue = vi.fn();
    const { emitSse, state } = createStreamHelpers({
      db: mockDb,
      assistantMsgId: 'msg-1',
      encoder: new TextEncoder(),
      sseData: mockSseData,
    });

    state.streamController = { enqueue };
    const result = await emitSse({ event: 'delta', text: 'hi' }, { persist: false });

    expect(result.seq).toBeUndefined();
    expect(enqueue).toHaveBeenCalled();
  });

  it('does not enqueue when no streamController', async () => {
    const { emitSse } = createStreamHelpers({
      db: mockDb,
      assistantMsgId: 'msg-1',
      encoder: new TextEncoder(),
      sseData: mockSseData,
    });

    const result = await emitSse({ text: 'hi' });
    expect(result).toEqual({ text: 'hi' });
  });

  it('appends text block of same type to last block', () => {
    const { appendMessageBlock, messageBlocks } = createStreamHelpers({
      db: mockDb,
      assistantMsgId: 'msg-1',
      encoder: new TextEncoder(),
      sseData: mockSseData,
    });

    appendMessageBlock('text', 'Hello ');
    appendMessageBlock('text', 'World');
    expect(messageBlocks).toHaveLength(1);
    expect(messageBlocks[0].content).toBe('Hello World');
  });

  it('creates new block for different type', () => {
    const { appendMessageBlock, messageBlocks } = createStreamHelpers({
      db: mockDb,
      assistantMsgId: 'msg-1',
      encoder: new TextEncoder(),
      sseData: mockSseData,
    });

    appendMessageBlock('text', 'Hello');
    appendMessageBlock('code', 'console.log()');
    expect(messageBlocks).toHaveLength(2);
  });

  it('creates new block when previous has tool_call_id', () => {
    const { appendMessageBlock, messageBlocks } = createStreamHelpers({
      db: mockDb,
      assistantMsgId: 'msg-1',
      encoder: new TextEncoder(),
      sseData: mockSseData,
    });

    appendMessageBlock('tool', '', 'tc-1');
    appendMessageBlock('text', 'After tool');
    expect(messageBlocks).toHaveLength(2);
  });

  it('does not add duplicate tool blocks with same tool_call_id', () => {
    const { appendMessageBlock, messageBlocks } = createStreamHelpers({
      db: mockDb,
      assistantMsgId: 'msg-1',
      encoder: new TextEncoder(),
      sseData: mockSseData,
    });

    appendMessageBlock('tool', '', 'tc-1');
    appendMessageBlock('tool', '', 'tc-1');
    expect(messageBlocks).toHaveLength(1);
  });

  it('skips append when type is empty', () => {
    const { appendMessageBlock, messageBlocks } = createStreamHelpers({
      db: mockDb,
      assistantMsgId: 'msg-1',
      encoder: new TextEncoder(),
      sseData: mockSseData,
    });

    appendMessageBlock('', 'content');
    appendMessageBlock(null, 'content');
    expect(messageBlocks).toHaveLength(0);
  });

  it('initializes state with deltaSeq: 0', () => {
    const { state } = createStreamHelpers({
      db: mockDb,
      assistantMsgId: 'msg-1',
      encoder: new TextEncoder(),
      sseData: mockSseData,
    });

    expect(state.deltaSeq).toBe(0);
    expect(state.streamController).toBeNull();
  });
});
