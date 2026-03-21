// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { createChatStreamController } from '../../public/js/features/chat/chat-stream-controller.js';

function createStream(chunks) {
  const encoder = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      chunks.forEach((chunk) => controller.enqueue(encoder.encode(chunk)));
      controller.close();
    },
  });
}

describe('chat stream controller', () => {
  it('finds the running assistant message', () => {
    const controller = createChatStreamController({ apiFetch: vi.fn() });
    expect(controller.getRunningMessageId([
      { id: 'm1', role: 'user' },
      { id: 'm2', role: 'assistant', status: 'streaming' },
      { id: 'm3', role: 'assistant', status: 'done' },
    ])).toBe('m2');
  });

  it('polls message status and stops when the message is done', async () => {
    const apiFetch = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        message: { id: 'm1', role: 'assistant', status: 'done' },
      }),
    }));
    const controller = createChatStreamController({ apiFetch, pollIntervalMs: 5, pollTimeoutMs: 50 });
    const onMessage = vi.fn();
    const onStop = vi.fn();

    controller.startStreamPolling('chat-1', 'm1', { onMessage, onStop });
    await new Promise((resolve) => setTimeout(resolve, 25));

    expect(onMessage).toHaveBeenCalledWith(
      { id: 'm1', role: 'assistant', status: 'done' },
      expect.objectContaining({ isRunning: false })
    );
    expect(onStop).toHaveBeenCalled();
    expect(controller.getStreamPolling('chat-1')).toBeNull();
  });

  it('tracks resume sessions and cleans them up', () => {
    const controller = createChatStreamController({ apiFetch: vi.fn() });
    const resume = { controller: new AbortController(), messageId: 'm1' };

    controller.setResumeStream('chat-1', resume);
    expect(controller.getResumeStream('chat-1')).toBe(resume);

    controller.clearResumeStream('chat-1', resume.controller);
    expect(controller.getResumeStream('chat-1')).toBeNull();
  });

  it('disposes outstanding pollers and resume sessions', async () => {
    const apiFetch = vi.fn(async () => ({ ok: true, json: async () => ({ message: { id: 'm1', role: 'assistant', status: 'streaming' } }) }));
    const controller = createChatStreamController({ apiFetch, pollIntervalMs: 5, pollTimeoutMs: 50 });
    controller.startStreamPolling('chat-1', 'm1');
    controller.setResumeStream('chat-2', { controller: new AbortController(), messageId: 'm2' });

    controller.dispose();
    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(controller.getStreamPolling('chat-1')).toBeNull();
    expect(controller.getResumeStream('chat-2')).toBeNull();
  });
});


