import { getAllOpenAIConnectionConfigs } from './utils/openai-connections.js';
import { buildProviderId, parseModelId, parseProviderId } from './utils/provider-registry.js';

export async function streamLLM(env, model, messages, options = {}) {
  if (!model) throw new Error('Model is required');
  const { tools, toolChoice, stream = true } = options || {};

  if (model.startsWith('@cf/')) {
    throw new Error('Workers AI models are disabled');
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

  const payload = { model: parsed.modelId, messages, stream: stream !== false };
  if (Array.isArray(tools) && tools.length) {
    payload.tools = tools;
    if (toolChoice) payload.tool_choice = toolChoice;
  }

  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers,
    body: JSON.stringify(payload),
  });

  if (!response.ok || !response.body) {
    const body = await response.text().catch(() => '');
    throw new Error(`LLM request failed (${response.status}): ${body.slice(0, 200)}`);
  }

  if (stream === false) {
    return response.json();
  }

  return response.body;
}

// SseLineParser accumulates raw bytes across reader.read() calls and emits
// complete `data: ...` lines, handling the case where a single JSON payload
// is split across two or more network chunks.
const DEFAULT_REASONING_TAGS = ['think', 'thinking', 'thought', 'thoughts', 'reason', 'reasoning'];

function getPotentialStartIndex(text, searchedText) {
  if (!searchedText.length) return null;
  const directIndex = text.indexOf(searchedText);
  if (directIndex !== -1) return directIndex;
  for (let i = text.length - 1; i >= 0; i -= 1) {
    const suffix = text.substring(i);
    if (searchedText.startsWith(suffix)) return i;
  }
  return null;
}

export class SseLineParser {
  constructor({ onEvent = null, tagNames = DEFAULT_REASONING_TAGS } = {}) {
    this._buf = '';
    this._tagBuffer = '';
    this._inReasoning = false;
    this._currentTag = null;
    this._reasoningStarted = false;
    this._reasoningEnded = false;
    this._onEvent = typeof onEvent === 'function' ? onEvent : null;
    this._tagNames = Array.isArray(tagNames) && tagNames.length ? tagNames : DEFAULT_REASONING_TAGS;
  }

  _emit(event) {
    if (this._onEvent) this._onEvent(event);
  }

  _ensureReasoningStart() {
    if (!this._reasoningStarted) {
      this._reasoningStarted = true;
      this._emit({ type: 'reasoning_start' });
    }
  }

  _emitReasoningDelta(delta) {
    if (!delta) return;
    this._ensureReasoningStart();
    this._emit({ type: 'reasoning_delta', delta });
  }

  _emitTextDelta(delta) {
    if (!delta) return;
    this._emit({ type: 'text_delta', delta });
  }

  _extractTaggedSegments(chunk) {
    if (!chunk) return [];
    this._tagBuffer += chunk;
    const segments = [];
    const bufferLower = () => this._tagBuffer.toLowerCase();
    const openTokens = this._tagNames.map((tag) => `<${tag}`);

    while (this._tagBuffer.length > 0) {
      if (!this._inReasoning) {
        let best = null;
        const lower = bufferLower();
        for (let i = 0; i < openTokens.length; i += 1) {
          const token = openTokens[i];
          const idx = getPotentialStartIndex(lower, token);
          if (idx == null) continue;
          if (!best || idx < best.index) {
            best = { index: idx, token, tagName: this._tagNames[i] };
          }
        }

        if (!best) {
          segments.push({ type: 'text', text: this._tagBuffer });
          this._tagBuffer = '';
          break;
        }

        if (best.index > 0) {
          segments.push({ type: 'text', text: this._tagBuffer.slice(0, best.index) });
        }

        const openEnd = this._tagBuffer.indexOf('>', best.index);
        if (openEnd === -1) {
          this._tagBuffer = this._tagBuffer.slice(best.index);
          break;
        }

        this._tagBuffer = this._tagBuffer.slice(openEnd + 1);
        this._inReasoning = true;
        this._currentTag = best.tagName;
      } else {
        const closeToken = `</${this._currentTag}>`;
        const lower = bufferLower();
        const closeIdx = getPotentialStartIndex(lower, closeToken);
        if (closeIdx == null) {
          segments.push({ type: 'reasoning', text: this._tagBuffer });
          this._tagBuffer = '';
          break;
        }

        if (closeIdx > 0) {
          segments.push({ type: 'reasoning', text: this._tagBuffer.slice(0, closeIdx) });
        }

        if (closeIdx + closeToken.length > this._tagBuffer.length) {
          this._tagBuffer = this._tagBuffer.slice(closeIdx);
          break;
        }

        this._tagBuffer = this._tagBuffer.slice(closeIdx + closeToken.length);
        this._inReasoning = false;
        this._currentTag = null;
      }
    }

    return segments;
  }

  _handleParsed(parsed) {
    let text = '';
    const delta = parsed?.choices?.[0]?.delta || {};
    const finishReason = parsed?.choices?.[0]?.finish_reason;
    const reasoningField =
      delta.reasoning ??
      delta.thinking ??
      delta.reasoning_content ??
      delta.reasoningContent;
    if (reasoningField) {
      const reasoningDelta = String(reasoningField);
      this._emitReasoningDelta(reasoningDelta);
    }

    const contentField = parsed?.response ?? delta.content;
    if (contentField) {
      const segments = this._extractTaggedSegments(String(contentField));
      for (const segment of segments) {
        if (!segment?.text) continue;
        if (segment.type === 'reasoning') {
          this._emitReasoningDelta(segment.text);
        } else {
          this._emitTextDelta(segment.text);
          text += segment.text;
        }
      }
    }

    const toolCalls = delta.tool_calls;
    if (Array.isArray(toolCalls) && toolCalls.length > 0) {
      this._emit({ type: 'tool_call_delta', tool_calls: toolCalls });
    }

    if (finishReason) {
      this._emit({ type: 'finish_reason', reason: finishReason });
    }

    return text;
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
        text += this._handleParsed(parsed);
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
    let text = '';
    if (line.startsWith('data: ')) {
      const payload = line.slice(6).trim();
      if (payload && payload !== '[DONE]') {
        try {
          const parsed = JSON.parse(payload);
          text += this._handleParsed(parsed);
        } catch {
          // ignore trailing parse failure
        }
      }
    }

    if (this._tagBuffer) {
      if (this._inReasoning) {
        this._emitReasoningDelta(this._tagBuffer);
      } else {
        this._emitTextDelta(this._tagBuffer);
        text += this._tagBuffer;
      }
      this._tagBuffer = '';
    }

    return text;
  }

  finalize() {
    if (this._reasoningStarted && !this._reasoningEnded) {
      this._reasoningEnded = true;
      this._emit({ type: 'reasoning_end' });
    }
  }
}

// Convenience wrapper kept for backwards compatibility with any callers that
// pass a self-contained chunk (e.g. unit tests).
export function parseSseChunk(rawChunk) {
  return new SseLineParser().push(rawChunk);
}
