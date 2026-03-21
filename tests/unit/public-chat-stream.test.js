import { describe, expect, it, vi } from 'vitest';
import { consumeSseTextStream } from '../../public/js/features/chat/chat-stream.js';

function createStream(chunks) {
  const encoder = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      chunks.forEach((chunk) => controller.enqueue(encoder.encode(chunk)));
      controller.close();
    },
  });
}

describe('chat stream helper', () => {
  it('consumes SSE chunks across boundaries and flushes trailing payloads', async () => {
    const onEvent = vi.fn();
    const onDelta = vi.fn();
    const body = createStream([
      'data: {"event":"start","message_id":"m1"}\n\n',
      'data: {"response":"Hel',
      'lo"}\n\n',
      'data: {"response":" tail"}',
    ]);

    await consumeSseTextStream(body, { onEvent, onDelta });

    expect(onEvent).toHaveBeenCalledWith({ event: 'start', message_id: 'm1' });
    expect(onDelta.mock.calls.map((call) => call[0])).toEqual(['Hello', ' tail']);
  });

  it('rejects when body is missing', async () => {
    await expect(consumeSseTextStream(null)).rejects.toThrow('Stream body is required');
  });
});


