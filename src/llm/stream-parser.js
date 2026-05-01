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

function looksLikeIncompleteJson(text) {
  const raw = String(text || '');
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (const char of raw) {
    if (escaped) {
      escaped = false;
      continue;
    }
    if (char === '\\') {
      escaped = inString;
      continue;
    }
    if (char === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;
    if (char === '{' || char === '[') depth += 1;
    if (char === '}' || char === ']') depth -= 1;
  }
  return inString || depth > 0;
}

function extractTextFromGoogle(parsed) {
  const candidate = parsed?.candidates?.[0];
  const parts = candidate?.content?.parts;
  if (!Array.isArray(parts)) return '';
  return parts
    .map((part) => {
      if (!part) return '';
      if (typeof part.text === 'string') return part.text;
      return '';
    })
    .join('');
}

function extractTextFromAnthropic(parsed) {
  if (parsed?.type === 'content_block_delta') {
    return String(parsed?.delta?.text || '');
  }
  if (parsed?.type === 'message_start') {
    return '';
  }
  if (parsed?.type === 'message_delta') {
    return '';
  }
  if (parsed?.type === 'message_stop') {
    return '';
  }
  return '';
}

export class SseLineParser {
  constructor({ onEvent = null, tagNames = DEFAULT_REASONING_TAGS } = {}) {
    this._buf = '';
    this._tagBuffer = '';
    this._dataBuffer = '';
    this._inReasoning = false;
    this._currentTag = null;
    this._reasoningStarted = false;
    this._reasoningEnded = false;
    this._onEvent = typeof onEvent === 'function' ? onEvent : null;
    this._tagNames = Array.isArray(tagNames) && tagNames.length ? tagNames : DEFAULT_REASONING_TAGS;
    this._hasToolCalls = false;
    this._googleToolCallIndex = 0;
    this._anthropicToolCalls = new Map();
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
    const emitToolCalls = (toolCalls = []) => {
      if (!Array.isArray(toolCalls) || !toolCalls.length) return;
      this._hasToolCalls = true;
      this._emit({ type: 'tool_call_delta', tool_calls: toolCalls });
    };

    const normalizeFinishReason = (raw) => {
      const value = String(raw || '')
        .trim()
        .toLowerCase();
      if (!value) return null;
      if (this._hasToolCalls) return 'tool_calls';
      if (value.includes('tool')) return 'tool_calls';
      if (value === 'stop_sequence' || value === 'end_turn') return 'stop';
      if (value === 'max_tokens' || value === 'length') return 'length';
      if (value === 'stop') return 'stop';
      return value;
    };

    const hasGoogleCandidate = Array.isArray(parsed?.candidates) && parsed.candidates.length > 0;
    if (hasGoogleCandidate) {
      const googleText = extractTextFromGoogle(parsed);
      if (googleText) {
        this._emitTextDelta(googleText);
        text += googleText;
      }
      const googleToolCalls = [];
      const parts = parsed?.candidates?.[0]?.content?.parts;
      if (Array.isArray(parts)) {
        for (const part of parts) {
          if (!part?.functionCall) continue;
          const id = `google_tool_${(this._googleToolCallIndex += 1)}`;
          const thoughtSignature =
            part?.thoughtSignature != null ? String(part.thoughtSignature) : undefined;
          googleToolCalls.push({
            index: googleToolCalls.length,
            id,
            function: {
              name: String(part.functionCall.name || ''),
              arguments: JSON.stringify(part.functionCall.args ?? {}),
            },
            ...(thoughtSignature
              ? {
                  providerMetadata: {
                    google: { thoughtSignature },
                  },
                }
              : {}),
          });
        }
      }
      emitToolCalls(googleToolCalls);
      const finishReason =
        parsed?.candidates?.[0]?.finishReason || parsed?.candidates?.[0]?.finish_reason;
      if (finishReason) {
        this._emit({ type: 'finish_reason', reason: normalizeFinishReason(finishReason) });
      }
      return text;
    }

    if (parsed?.type === 'content_block_start') {
      const block = parsed?.content_block;
      if (block && (block.type === 'tool_use' || block.type === 'mcp_tool_use')) {
        const index = Number.isFinite(parsed.index) ? parsed.index : 0;
        const toolCall = {
          index,
          id: String(block.id || `anthropic_tool_${index}`),
          function: {
            name: String(block.name || ''),
            arguments:
              typeof block.input === 'string' ? block.input : JSON.stringify(block.input ?? {}),
          },
        };
        this._anthropicToolCalls.set(index, toolCall);
        emitToolCalls([toolCall]);
        return text;
      }
    }

    if (parsed?.type === 'content_block_delta') {
      const delta = parsed?.delta;
      if (delta?.type === 'input_json_delta') {
        const index = Number.isFinite(parsed.index) ? parsed.index : 0;
        const existing = this._anthropicToolCalls.get(index) || {
          index,
          id: `anthropic_tool_${index}`,
          function: { name: '', arguments: '' },
        };
        existing.function.arguments = `${existing.function.arguments || ''}${String(delta.partial_json || '')}`;
        this._anthropicToolCalls.set(index, existing);
        emitToolCalls([
          {
            index: existing.index,
            id: existing.id,
            function: {
              arguments: String(delta.partial_json || ''),
            },
          },
        ]);
        return text;
      }
    }

    if (
      parsed?.type === 'content_block_delta' ||
      parsed?.type === 'message_delta' ||
      parsed?.type === 'message_stop'
    ) {
      const anthropicText = extractTextFromAnthropic(parsed);
      if (anthropicText) {
        this._emitTextDelta(anthropicText);
        text += anthropicText;
      }
      if (parsed?.type === 'message_delta' && parsed?.delta?.stop_reason) {
        this._emit({
          type: 'finish_reason',
          reason: normalizeFinishReason(parsed.delta.stop_reason),
        });
      }
      if (parsed?.type === 'message_stop') {
        this._emit({ type: 'finish_reason', reason: normalizeFinishReason('stop') });
      }
      return text;
    }

    const delta = parsed?.choices?.[0]?.delta || {};
    const finishReason = parsed?.choices?.[0]?.finish_reason;
    const reasoningField =
      delta.reasoning ?? delta.thinking ?? delta.reasoning_content ?? delta.reasoningContent;
    if (reasoningField) {
      const reasoningDelta = String(reasoningField);
      this._emitReasoningDelta(reasoningDelta);
    }

    const contentField = parsed?.response ?? delta.content;
    const messageContent = parsed?.choices?.[0]?.message?.content;
    let resolvedContent = contentField ?? messageContent ?? parsed?.choices?.[0]?.text;
    if (
      !resolvedContent &&
      delta &&
      typeof delta === 'object' &&
      delta.content &&
      typeof delta.content === 'object' &&
      !Array.isArray(delta.content) &&
      typeof delta.content.text === 'string'
    ) {
      resolvedContent = delta.content.text;
    }
    if (Array.isArray(resolvedContent)) {
      for (const part of resolvedContent) {
        if (!part || part.type !== 'text' || !part.text) continue;
        const segments = this._extractTaggedSegments(String(part.text));
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
    } else if (resolvedContent) {
      const segments = this._extractTaggedSegments(String(resolvedContent));
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

    if (!resolvedContent && typeof parsed?.type === 'string') {
      const responseDelta = parsed?.delta ?? parsed?.text;
      if (typeof responseDelta === 'string' && responseDelta) {
        const segments = this._extractTaggedSegments(responseDelta);
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
    }

    const toolCalls = delta.tool_calls;
    if (Array.isArray(toolCalls) && toolCalls.length > 0) {
      emitToolCalls(toolCalls);
    }

    if (finishReason) {
      this._emit({ type: 'finish_reason', reason: normalizeFinishReason(finishReason) });
    }

    return text;
  }

  _consumeDataPayload(payload) {
    if (!payload || payload === '[DONE]') return '';
    try {
      const parsed = JSON.parse(payload);
      return this._handleParsed(parsed);
    } catch {
      return null;
    }
  }

  _flushDataBuffer() {
    if (!this._dataBuffer) return '';
    const payload = this._dataBuffer;
    this._dataBuffer = '';
    const parsedText = this._consumeDataPayload(payload);
    return parsedText || '';
  }

  push(rawText) {
    this._buf += rawText;
    let text = '';
    let newlineIdx;
    while ((newlineIdx = this._buf.indexOf('\n')) !== -1) {
      const line = this._buf.slice(0, newlineIdx).replace(/\r$/, '');
      this._buf = this._buf.slice(newlineIdx + 1);

      if (line === '') {
        text += this._flushDataBuffer();
        continue;
      }

      if (!line.startsWith('data:')) continue;
      let payload = line.slice(5);
      if (payload.startsWith(' ')) payload = payload.slice(1);
      if (!payload) continue;

      if (this._dataBuffer) {
        if (!looksLikeIncompleteJson(this._dataBuffer)) {
          const parsedText = this._consumeDataPayload(this._dataBuffer);
          this._dataBuffer = '';
          if (parsedText !== null) {
            text += parsedText;
          }
        }
      }

      if (this._dataBuffer) {
        this._dataBuffer += `\n${payload}`;
        continue;
      }

      const parsedText = this._consumeDataPayload(payload);
      if (parsedText !== null) {
        text += parsedText;
      } else {
        this._dataBuffer = payload;
      }
    }
    return text;
  }

  flush() {
    const line = this._buf.replace(/\r$/, '');
    this._buf = '';
    let text = '';
    if (line) {
      if (line === '') {
        text += this._flushDataBuffer();
      } else if (line.startsWith('data:')) {
        let payload = line.slice(5);
        if (payload.startsWith(' ')) payload = payload.slice(1);
        if (payload) {
          if (this._dataBuffer) {
            this._dataBuffer += `\n${payload}`;
          } else {
            const parsedText = this._consumeDataPayload(payload);
            if (parsedText !== null) {
              text += parsedText;
            } else {
              this._dataBuffer = payload;
            }
          }
        }
      }
    }
    text += this._flushDataBuffer();

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

export function parseSseChunk(rawChunk) {
  return new SseLineParser().push(rawChunk);
}
