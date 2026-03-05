export async function streamLLM(env, model, messages) {
  if (!model) throw new Error('Model is required');

  if (model.startsWith('@cf/')) {
    return env.AI.run(model, { messages, stream: true });
  }

  const baseUrl = (env.OPENAI_BASE_URL || 'https://api.openai.com/v1').replace(/\/$/, '');
  const apiKey = env.OPENAI_API_KEY;
  if (!apiKey) throw new Error('OPENAI_API_KEY not configured');

  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ model, messages, stream: true }),
  });

  if (!response.ok || !response.body) {
    const body = await response.text().catch(() => '');
    throw new Error(`LLM request failed (${response.status}): ${body.slice(0, 200)}`);
  }

  return response.body;
}

// SseLineParser accumulates raw bytes across reader.read() calls and emits
// complete `data: ...` lines, handling the case where a single JSON payload
// is split across two or more network chunks.
export class SseLineParser {
  constructor() {
    this._buf = '';
  }

  // Feed a decoded text chunk; returns accumulated delta text from complete lines.
  push(rawText) {
    this._buf += rawText;
    let text = '';
    let newlineIdx;
    while ((newlineIdx = this._buf.indexOf('\n')) !== -1) {
      const line = this._buf.slice(0, newlineIdx).replace(/\r$/, '');
      this._buf = this._buf.slice(newlineIdx + 1);

      if (!line.startsWith('data: ')) continue;
      const payload = line.slice(6).trim();
      if (!payload || payload === '[DONE]') continue;

      try {
        const parsed = JSON.parse(payload);
        text += parsed.response || parsed.choices?.[0]?.delta?.content || '';
      } catch {
        // Incomplete JSON that didn't form a full line — discard (shouldn't
        // happen now that we only process newline-terminated lines).
      }
    }
    return text;
  }

  // Flush any final buffered line (for providers that omit trailing newline).
  flush() {
    const line = this._buf.replace(/\r$/, '');
    this._buf = '';
    if (!line.startsWith('data: ')) return '';

    const payload = line.slice(6).trim();
    if (!payload || payload === '[DONE]') return '';

    try {
      const parsed = JSON.parse(payload);
      return parsed.response || parsed.choices?.[0]?.delta?.content || '';
    } catch {
      return '';
    }
  }
}

// Convenience wrapper kept for backwards compatibility with any callers that
// pass a self-contained chunk (e.g. unit tests).
export function parseSseChunk(rawChunk) {
  return new SseLineParser().push(rawChunk);
}
