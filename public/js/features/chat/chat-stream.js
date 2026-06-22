import { SseLineParser } from '../../shared/utils.js';

function maybeEmit(delta, callback) {
  if (delta && typeof callback === 'function') {
    callback(delta);
  }
}

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
      maybeEmit(parser.flush(), onDelta);
      return;
    }

    const chunk = decoder.decode(value, { stream: true });
    maybeEmit(parser.push(chunk), onDelta);
  }
}
