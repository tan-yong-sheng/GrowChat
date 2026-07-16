import { describe, expect, it, vi } from 'vitest';
import { consumeSseTextStream } from '../../public/js/features/chat/chat-stream.js';

vi.mock('../../public/js/shared/utils.js', () => ({
  SseLineParser: class {
    constructor(onEvent = null) {
      this._buf = '';
      this._onEvent = typeof onEvent === 'function' ? onEvent : null;
    }

    extractPayloadText(line) {
      if (!line.startsWith('data: ')) return null;
      const payload = line.slice(6).trim();
      if (!payload || payload === '[DONE]') return null;
      return payload;
    }

    processPayloadText(payload) {
      try {
        const parsed = JSON.parse(payload);
        if (this._onEvent) this._onEvent(parsed);
        const choices = parsed.choices;
        return (
          parsed.response ||
          (choices && choices[0] && choices[0].delta && choices[0].delta.content) ||
          ''
        );
      } catch {
        return '';
      }
    }

    push(rawText) {
      this._buf += rawText;
      let text = '';
      let newlineIdx;
      while ((newlineIdx = this._buf.indexOf('\n')) !== -1) {
        const line = this._buf.slice(0, newlineIdx).replace(/\r$/, '');
        this._buf = this._buf.slice(newlineIdx + 1);

        const payload = this.extractPayloadText(line);
        if (!payload) continue;
        text += this.processPayloadText(payload);
      }
      return text;
    }

    flush() {
      const line = this._buf.replace(/\r$/, '');
      this._buf = '';
      if (!line.startsWith('data: ')) return '';
      const payload = line.slice(6).trim();
      if (!payload || payload === '[DONE]') return '';

      try {
        const parsed = JSON.parse(payload);
        if (this._onEvent) this._onEvent(parsed);
        return parsed.response || parsed.choices?.[0]?.delta?.content || '';
      } catch {
        return '';
      }
    }
  },
}));

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
