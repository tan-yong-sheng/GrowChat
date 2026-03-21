import { SseLineParser } from '../../shared/utils.js';

export async function consumeSseTextStream(body, { onEvent, onDelta } = {}) {
  if (!body || typeof body.getReader !== 'function') {
    throw new Error('Stream body is required');
  }

  const reader = body.getReader();
  const decoder = new TextDecoder();
  const parser = new SseLineParser(typeof onEvent === 'function' ? onEvent : null);

  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      const finalDelta = parser.flush();
      if (finalDelta && typeof onDelta === 'function') {
        onDelta(finalDelta);
      }
      return;
    }

    const chunk = decoder.decode(value, { stream: true });
    const delta = parser.push(chunk);
    if (delta && typeof onDelta === 'function') {
      onDelta(delta);
    }
  }
}

