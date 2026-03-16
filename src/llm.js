import { getAllOpenAIConnectionConfigs } from './utils/openai-connections.js';
import { buildProviderId, parseModelId, parseProviderId } from './utils/provider-registry.js';

export async function streamLLM(env, model, messages) {
  if (!model) throw new Error('Model is required');

  if (model.startsWith('@cf/')) {
    return env.AI.run(model, { messages, stream: true });
  }

  let parsed = parseModelId(model);
  let primaryConn = null;
  let providerInfo = null;

  if (!parsed) {
    const enabledConnections = await getAllOpenAIConnectionConfigs(env);
    if (enabledConnections.length === 0) {
      throw new Error('No provider connection configured');
    }
    if (enabledConnections.length > 1) {
      throw new Error('Model id must include provider prefix when multiple providers are enabled');
    }
    primaryConn = enabledConnections[0];
    parsed = { providerId: buildProviderId(primaryConn), modelId: model };
  } else {
    providerInfo = parseProviderId(parsed.providerId);
    if (!providerInfo?.connectionId) {
      throw new Error('Invalid provider id');
    }

    const allConnections = await getAllOpenAIConnectionConfigs(env, { includeDisabled: true });
    primaryConn = allConnections.find((conn) => {
      if (String(conn.id) !== providerInfo.connectionId) return false;
      const type = String(conn.providerType || 'openai-compatible').toLowerCase();
      return type === providerInfo.providerType;
    });
  }

  if (!primaryConn) {
    throw new Error('No matching provider connection configured');
  }
  if (primaryConn.enabled === false) {
    throw new Error('Provider connection is disabled');
  }

  const baseUrl = (primaryConn.baseUrl || 'https://api.openai.com/v1').replace(/\/$/, '');
  const apiKey = primaryConn.key;
  const headers = { ...(primaryConn.headers || {}) };
  if (apiKey && !headers.Authorization) {
    headers.Authorization = `Bearer ${apiKey}`;
  }
  headers['Content-Type'] = 'application/json';

  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ model: parsed.modelId, messages, stream: true }),
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
