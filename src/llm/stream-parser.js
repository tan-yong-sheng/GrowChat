// fallow-ignore-file code-duplication
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
    const openTokens = this._tagNames.map((tag) => `<${tag}`);

    while (this._tagBuffer.length > 0) {
      if (!this._inReasoning) {
        const continueLoop = this._consumeOutsideReasoning(segments, openTokens);
        if (!continueLoop) break;
      } else {
        const continueLoop = this._consumeInsideReasoning(segments);
        if (!continueLoop) break;
      }
    }

    return segments;
  }

  _bufferLower() {
    return this._tagBuffer.toLowerCase();
  }

  _findBestOpenToken(lower, openTokens) {
    let best = null;
    for (let i = 0; i < openTokens.length; i += 1) {
      const token = openTokens[i];
      const idx = getPotentialStartIndex(lower, token);
      if (idx == null) continue;
      if (!best || idx < best.index) {
        best = { index: idx, token, tagName: this._tagNames[i] };
      }
    }
    return best;
  }

  _consumeOutsideReasoning(segments, openTokens) {
    const lower = this._bufferLower();
    const best = this._findBestOpenToken(lower, openTokens);
    if (!best) {
      segments.push({ type: 'text', text: this._tagBuffer });
      this._tagBuffer = '';
      return false;
    }
    if (best.index > 0) {
      segments.push({ type: 'text', text: this._tagBuffer.slice(0, best.index) });
    }
    const openEnd = this._tagBuffer.indexOf('>', best.index);
    if (openEnd === -1) {
      this._tagBuffer = this._tagBuffer.slice(best.index);
      return false;
    }
    this._tagBuffer = this._tagBuffer.slice(openEnd + 1);
    this._inReasoning = true;
    this._currentTag = best.tagName;
    return true;
  }

  _consumeInsideReasoning(segments) {
    const closeToken = `</${this._currentTag}>`;
    const lower = this._bufferLower();
    const closeIdx = getPotentialStartIndex(lower, closeToken);
    if (closeIdx == null) {
      segments.push({ type: 'reasoning', text: this._tagBuffer });
      this._tagBuffer = '';
      return false;
    }
    if (closeIdx > 0) {
      segments.push({ type: 'reasoning', text: this._tagBuffer.slice(0, closeIdx) });
    }
    if (closeIdx + closeToken.length > this._tagBuffer.length) {
      this._tagBuffer = this._tagBuffer.slice(closeIdx);
      return false;
    }
    this._tagBuffer = this._tagBuffer.slice(closeIdx + closeToken.length);
    this._inReasoning = false;
    this._currentTag = null;
    return true;
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

  // fallow-ignore-next-line code-duplication
  push(rawText) {
    this._buf += rawText;
    let text = '';
    let newlineIdx;
    while ((newlineIdx = this._buf.indexOf('\n')) !== -1) {
      const line = this._buf.slice(0, newlineIdx).replace(/\r$/, '');
      this._buf = this._buf.slice(newlineIdx + 1);
      text += this._processLine(line);
    }
    return text;
  }

  _processLine(line) {
    if (line === '') return this._flushDataBuffer();
    if (!line.startsWith('data:')) return '';
    const payload = line.slice(5).replace(/^ /, '');
    if (!payload) return '';
    return this._ingestPayload(payload);
  }

  _ingestPayload(payload) {
    let text = '';
    if (this._dataBuffer) {
      if (!looksLikeIncompleteJson(this._dataBuffer)) {
        const parsedText = this._consumeDataPayload(this._dataBuffer);
        this._dataBuffer = '';
        if (parsedText !== null) text += parsedText;
      }
    }
    if (this._dataBuffer) {
      this._dataBuffer += `\n${payload}`;
      return text;
    }
    const parsedText = this._consumeDataPayload(payload);
    if (parsedText !== null) text += parsedText;
    else this._dataBuffer = payload;
    return text;
  }

  flush() {
    const line = this._buf.replace(/\r$/, '');
    this._buf = '';
    let text = '';
    if (line) text += this._flushTrailingLine(line);
    text += this._flushDataBuffer();
    text += this._flushTagBuffer();
    return text;
  }

  _flushTrailingLine(line) {
    if (line === '') return this._flushDataBuffer();
    if (!line.startsWith('data:')) return '';
    return this._flushDataPayload(line.slice(5).replace(/^ /, ''));
  }

  _flushDataPayload(payload) {
    if (!payload) return '';
    if (this._dataBuffer) {
      this._dataBuffer += `\n${payload}`;
      return '';
    }
    let text = '';
    const parsedText = this._consumeDataPayload(payload);
    if (parsedText !== null) text += parsedText;
    else this._dataBuffer = payload;
    return text;
  }

  _flushTagBuffer() {
    if (!this._tagBuffer) return '';
    if (this._inReasoning) this._emitReasoningDelta(this._tagBuffer);
    else {
      this._emitTextDelta(this._tagBuffer);
    }
    const text = this._inReasoning ? '' : this._tagBuffer;
    this._tagBuffer = '';
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
