import {
  DEFAULT_REASONING_TAGS,
  getPotentialStartIndex,
  looksLikeIncompleteJson,
} from './stream-parser-utils.js';
import { handleParsed } from './stream-parser-handler.js';

// Re-export for backward compatibility
export { DEFAULT_REASONING_TAGS } from './stream-parser-utils.js';

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
    return handleParsed(this, parsed);
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
