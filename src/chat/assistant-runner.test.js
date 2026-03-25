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
      read: vi.fn(() => new Promise((resolve) => {
        resolveRead = resolve;
      })),
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
