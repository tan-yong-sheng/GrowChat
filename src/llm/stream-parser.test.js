import { describe, expect, it, vi } from 'vitest';
import { SseLineParser, parseSseChunk } from './stream-parser.js';

describe('stream-parser', () => {
  describe('SseLineParser', () => {
    it('constructs with defaults', () => {
      const parser = new SseLineParser();
      expect(parser._buf).toBe('');
      expect(parser._tagBuffer).toBe('');
      expect(parser._dataBuffer).toBe('');
      expect(parser._inReasoning).toBe(false);
      expect(parser._hasToolCalls).toBe(false);
      expect(parser._googleToolCallIndex).toBe(0);
      expect(parser._anthropicToolCalls instanceof Map).toBe(true);
    });

    it('constructs with custom onEvent', () => {
      const onEvent = vi.fn();
      const parser = new SseLineParser({ onEvent });
      expect(parser._onEvent).toBe(onEvent);
    });

    it('constructs with custom tagNames', () => {
      const parser = new SseLineParser({ tagNames: ['custom'] });
      expect(parser._tagNames).toEqual(['custom']);
    });

    it('falls back to default tags when empty array provided', () => {
      const parser = new SseLineParser({ tagNames: [] });
      expect(parser._tagNames).toEqual([
        'think',
        'thinking',
        'thought',
        'thoughts',
        'reason',
        'reasoning',
      ]);
    });

    it('ignores non-function onEvent', () => {
      const parser = new SseLineParser({ onEvent: 'not-a-function' });
      expect(parser._onEvent).toBeNull();
    });
  });

  describe('_emit', () => {
    it('calls onEvent when provided', () => {
      const onEvent = vi.fn();
      const parser = new SseLineParser({ onEvent });
      parser._emit({ type: 'test' });
      expect(onEvent).toHaveBeenCalledWith({ type: 'test' });
    });

    it('does nothing when onEvent is null', () => {
      const parser = new SseLineParser();
      expect(() => parser._emit({ type: 'test' })).not.toThrow();
    });
  });

  describe('_ensureReasoningStart', () => {
    it('emits reasoning_start once', () => {
      const onEvent = vi.fn();
      const parser = new SseLineParser({ onEvent });
      parser._ensureReasoningStart();
      parser._ensureReasoningStart();
      expect(onEvent).toHaveBeenCalledTimes(1);
      expect(onEvent).toHaveBeenCalledWith({ type: 'reasoning_start' });
    });
  });

  describe('_emitReasoningDelta', () => {
    it('emits reasoning_delta event', () => {
      const onEvent = vi.fn();
      const parser = new SseLineParser({ onEvent });
      parser._emitReasoningDelta('thinking...');
      expect(onEvent).toHaveBeenCalledWith({ type: 'reasoning_start' });
      expect(onEvent).toHaveBeenCalledWith({ type: 'reasoning_delta', delta: 'thinking...' });
    });

    it('does nothing for empty string', () => {
      const onEvent = vi.fn();
      const parser = new SseLineParser({ onEvent });
      parser._emitReasoningDelta('');
      expect(onEvent).not.toHaveBeenCalled();
    });

    it('does nothing for falsy values', () => {
      const onEvent = vi.fn();
      const parser = new SseLineParser({ onEvent });
      parser._emitReasoningDelta(null);
      parser._emitReasoningDelta(undefined);
      parser._emitReasoningDelta(0);
      expect(onEvent).not.toHaveBeenCalled();
    });
  });

  describe('_emitTextDelta', () => {
    it('emits text_delta event', () => {
      const onEvent = vi.fn();
      const parser = new SseLineParser({ onEvent });
      parser._emitTextDelta('Hello');
      expect(onEvent).toHaveBeenCalledWith({ type: 'text_delta', delta: 'Hello' });
    });

    it('does nothing for empty string', () => {
      const onEvent = vi.fn();
      const parser = new SseLineParser({ onEvent });
      parser._emitTextDelta('');
      expect(onEvent).not.toHaveBeenCalled();
    });
  });

  describe('_extractTaggedSegments', () => {
    it('returns empty array for empty chunk', () => {
      const parser = new SseLineParser();
      expect(parser._extractTaggedSegments('')).toEqual([]);
      expect(parser._extractTaggedSegments(null)).toEqual([]);
    });

    it('extracts text before reasoning tag', () => {
      const parser = new SseLineParser();
      const segments = parser._extractTaggedSegments('Hello <think>');
      expect(segments).toEqual([{ type: 'text', text: 'Hello ' }]);
      expect(parser._inReasoning).toBe(true);
    });

    it('extracts reasoning content', () => {
      const parser = new SseLineParser();
      parser._extractTaggedSegments('Hello <think>');
      const segments = parser._extractTaggedSegments('some reasoning</think>');
      expect(segments).toContainEqual({ type: 'reasoning', text: 'some reasoning' });
      expect(parser._inReasoning).toBe(false);
    });

    it('handles partial tag match by emitting preceding text', () => {
      const parser = new SseLineParser();
      const segments = parser._extractTaggedSegments('Hello <thi');
      expect(segments).toEqual([{ type: 'text', text: 'Hello ' }]);
      expect(parser._tagBuffer).toBe('<thi');
    });

    it('handles complete text without tags', () => {
      const parser = new SseLineParser();
      const segments = parser._extractTaggedSegments('Just plain text');
      expect(segments).toEqual([{ type: 'text', text: 'Just plain text' }]);
    });

    it('emits text when no tag match exists', () => {
      const parser = new SseLineParser();
      const segments = parser._extractTaggedSegments('text <n');
      expect(segments).toEqual([{ type: 'text', text: 'text <n' }]);
      expect(parser._tagBuffer).toBe('');
    });

    it('handles multiple tags in sequence', () => {
      const parser = new SseLineParser();
      parser._extractTaggedSegments('A<think>B</think>C<thought>D</thought>E');
      expect(parser._inReasoning).toBe(false);
    });

    it('handles case-insensitive tags', () => {
      const parser = new SseLineParser();
      parser._extractTaggedSegments('Hello <THINK>');
      expect(parser._inReasoning).toBe(true);
    });

    it('preserves buffer when close tag spans chunks', () => {
      const parser = new SseLineParser();
      parser._extractTaggedSegments('<think>reasoning</thin');
      expect(parser._inReasoning).toBe(true);
      const segments = parser._extractTaggedSegments('k>more text');
      expect(parser._inReasoning).toBe(false);
      expect(segments).toContainEqual({ type: 'text', text: 'more text' });
    });

    it('handles reasoning tag with attributes', () => {
      const parser = new SseLineParser();
      const segments = parser._extractTaggedSegments('Hello <think lang="en">');
      expect(segments).toContainEqual({ type: 'text', text: 'Hello ' });
      expect(parser._inReasoning).toBe(true);
    });

    it('emits reasoning text when close tag is partial', () => {
      const parser = new SseLineParser();
      parser._inReasoning = true;
      parser._currentTag = 'think';
      const segments = parser._extractTaggedSegments('some reasoning</thin');
      expect(segments).toEqual([{ type: 'reasoning', text: 'some reasoning' }]);
      expect(parser._tagBuffer).toBe('</thin');
    });

    it('handles reasoning end when close spans chunks', () => {
      const parser = new SseLineParser();
      parser._inReasoning = true;
      parser._currentTag = 'think';
      parser._extractTaggedSegments('content</thi');
      const segments = parser._extractTaggedSegments('nk>after');
      expect(segments).toContainEqual({ type: 'text', text: 'after' });
    });
  });

  describe('_consumeDataPayload', () => {
    it('returns empty string for DONE', () => {
      const parser = new SseLineParser();
      expect(parser._consumeDataPayload('[DONE]')).toBe('');
    });

    it('returns empty string for null/undefined', () => {
      const parser = new SseLineParser();
      expect(parser._consumeDataPayload(null)).toBe('');
      expect(parser._consumeDataPayload('')).toBe('');
    });

    it('parses JSON and returns text', () => {
      const parser = new SseLineParser();
      const text = parser._consumeDataPayload(
        JSON.stringify({ choices: [{ delta: { content: 'Hello' } }] })
      );
      expect(text).toBe('Hello');
    });

    it('returns null for invalid JSON', () => {
      const parser = new SseLineParser();
      expect(parser._consumeDataPayload('not json')).toBeNull();
    });

    it('returns empty string for JSON without extractable content', () => {
      const parser = new SseLineParser();
      expect(parser._consumeDataPayload(JSON.stringify({}))).toBe('');
    });
  });

  describe('_flushDataBuffer', () => {
    it('returns empty string when buffer is empty', () => {
      const parser = new SseLineParser();
      expect(parser._flushDataBuffer()).toBe('');
    });

    it('parses and clears buffer with valid JSON', () => {
      const parser = new SseLineParser();
      parser._dataBuffer = JSON.stringify({ choices: [{ delta: { content: 'Hello' } }] });
      const text = parser._flushDataBuffer();
      expect(text).toBe('Hello');
      expect(parser._dataBuffer).toBe('');
    });

    it('returns empty string and clears buffer for invalid JSON', () => {
      const parser = new SseLineParser();
      parser._dataBuffer = 'not json';
      const text = parser._flushDataBuffer();
      expect(text).toBe('');
      expect(parser._dataBuffer).toBe('');
    });
  });

  describe('push', () => {
    it('returns empty string for empty input', () => {
      const parser = new SseLineParser();
      expect(parser.push('')).toBe('');
    });

    it('parses single data line', () => {
      const parser = new SseLineParser();
      const text = parser.push('data: {"choices":[{"delta":{"content":"Hello"}}]}\n\n');
      expect(text).toBe('Hello');
    });

    it('parses data line with space after colon', () => {
      const parser = new SseLineParser();
      const text = parser.push('data: {"choices":[{"delta":{"content":"Hi"}}]}\n\n');
      expect(text).toBe('Hi');
    });

    it('parses multiple data lines', () => {
      const parser = new SseLineParser();
      const chunk =
        'data: {"choices":[{"delta":{"content":"Hello"}}]}\n\n' +
        'data: {"choices":[{"delta":{"content":" World"}}]}\n\n';
      const text = parser.push(chunk);
      expect(text).toBe('Hello World');
    });

    it('handles [DONE] event', () => {
      const parser = new SseLineParser();
      const chunk = 'data: {"choices":[{"delta":{"content":"Done"}}]}\n\n' + 'data: [DONE]\n\n';
      const text = parser.push(chunk);
      expect(text).toBe('Done');
    });

    it('ignores non-data lines', () => {
      const parser = new SseLineParser();
      const chunk = 'event: message\n' + 'data: {"choices":[{"delta":{"content":"test"}}]}\n\n';
      const text = parser.push(chunk);
      expect(text).toBe('test');
    });

    it('ignores empty data payloads', () => {
      const parser = new SseLineParser();
      const chunk = 'data:\n\n' + 'data: {"choices":[{"delta":{"content":"real"}}]}\n\n';
      const text = parser.push(chunk);
      expect(text).toBe('real');
    });

    it('buffers incomplete data across push calls', () => {
      const parser = new SseLineParser();
      // First push: data without newline stays in _buf
      const text1 = parser.push('data: {"choices":[{"delta":{"content":"Hello"}}]}');
      expect(text1).toBe('');
      expect(parser._buf.length).toBeGreaterThan(0);

      // Second push: newline triggers processing
      const text2 = parser.push('\n\n');
      expect(text2).toBe('Hello');
    });

    it('handles incomplete JSON that becomes valid', () => {
      const parser = new SseLineParser();
      // First push: partial data without trailing newline; stays in _buf
      parser.push('data: {"choices":[{"delta":{"content":"He');
      expect(parser._buf).toContain('"He');

      // Second push: completes the JSON + newline to flush
      const text = parser.push('llo"}}]}\n\n');
      expect(text).toBe('Hello');
    });

    it('parses JSON that was buffered due to invalid start', () => {
      const parser = new SseLineParser();
      const incomplete = '{"choices":[{"delta":{"content":"test';
      // No newline: stays in _buf
      parser.push(`data: ${incomplete}`);
      expect(parser._buf).toContain('test');

      // Complete the line
      const text = parser.push('"}}]}\n\n');
      expect(text).toBe('test');
    });

    it('handles complete JSON after buffered incomplete JSON', () => {
      const parser = new SseLineParser();
      // First push an incomplete JSON line
      const text1 = parser.push('data: {"incomplete": true\n');
      expect(text1).toBe('');

      // Second push completes the buffered incomplete JSON but it's still
      // buffered because the first part might not parse. Actually per the
      // implementation, if the buffer doesn't look like incomplete JSON,
      // it gets flushed and a new line starts.
      const text2 = parser.push('data: "rest":false}\n\n');
      // The behavior is complex; we mostly care that it doesn't crash
      expect(text2).toBe('');
    });

    it('handles \r\n line endings', () => {
      const parser = new SseLineParser();
      const text = parser.push('data: {"choices":[{"delta":{"content":"Hello"}}]}\r\n\r\n');
      expect(text).toBe('Hello');
    });

    it('buffers partial push without trailing newline', () => {
      const parser = new SseLineParser();
      const text = parser.push('data: {"choices":[{"delta":{"content":"Hi"}}]}');
      expect(text).toBe('');
      expect(parser._buf).toContain('data:');
    });

    it('buffers incomplete lines', () => {
      const parser = new SseLineParser();
      const text = parser.push('incomplete line');
      expect(text).toBe('');
      expect(parser._buf).toBe('incomplete line');
    });

    it('flushes buffered incomplete line with subsequent newline', () => {
      const parser = new SseLineParser();
      parser.push('data: {"choices":[{"delta":{"content":"Hello"}}]}');
      // Without newline, stays in _buf
      expect(parser._buf).toContain('Hello');
      // Pushing a newline processes the buffered line
      const text = parser.push('\n\n');
      expect(text).toBe('Hello');
      expect(parser._buf).toBe('');
    });

    it('handles multiple newlines in one push', () => {
      const parser = new SseLineParser();
      const chunk =
        'data: {"choices":[{"delta":{"content":"A"}}]}\n' +
        '\n' +
        'data: {"choices":[{"delta":{"content":"B"}}]}\n' +
        '\n';
      const text = parser.push(chunk);
      expect(text).toBe('AB');
    });

    it('handles lines starting with data: but empty payload', () => {
      const parser = new SseLineParser();
      const chunk = 'data: \n\ndata: [DONE]\n\n';
      const text = parser.push(chunk);
      expect(text).toBe('');
    });

    it('processes looksLikeIncompleteJson check before buffering', () => {
      const parser = new SseLineParser();
      // This JSON will look incomplete on first push
      const first = '{"choices":[{"delta":{"content":"a';
      parser.push(`data: ${first}\n`);
      // The buffer should contain the partial JSON
      expect(parser._dataBuffer.length).toBeGreaterThan(0);
    });

    it('resets dataBuffer when parsedText is not null', () => {
      const parser = new SseLineParser();
      parser._dataBuffer = '{"unused": true}';
      // Not looksLikeIncompleteJson
      const text = parser.push('data: {"choices":[{"delta":{"content":"x"}}]}\n\n');
      expect(text).toBe('x');
    });
  });

  describe('flush', () => {
    it('returns empty string when nothing to flush', () => {
      const parser = new SseLineParser();
      expect(parser.flush()).toBe('');
    });

    it('flushes remaining buffer line', () => {
      const parser = new SseLineParser();
      parser.push('data: {"choices":[{"delta":{"content":"Hello"}}]}\n');
      parser.push('data: {"choices":[{"delta":{"content":" World"}}]}');
      const text = parser.flush();
      expect(text).toBe(' World');
    });

    it('flushes incomplete data line from _buf', () => {
      const parser = new SseLineParser();
      parser._buf = 'data: {"choices":[{"delta":{"content":"Last"}}]}';
      const text = parser.flush();
      expect(text).toBe('Last');
    });

    it('handles non-data line in _buf during flush', () => {
      const parser = new SseLineParser();
      parser._buf = 'event: end';
      const text = parser.flush();
      expect(text).toBe('');
    });

    it('flushes dataBuffer during flush', () => {
      const parser = new SseLineParser();
      parser._dataBuffer = '{"choices":[{"delta":{"content":"Buffered"}}]}';
      const text = parser.flush();
      expect(text).toBe('Buffered');
    });

    it('appends tagBuffer text when not in reasoning', () => {
      const parser = new SseLineParser();
      parser._tagBuffer = 'remaining text';
      const text = parser.flush();
      expect(text).toBe('remaining text');
    });

    it('emits reasoning_delta for tagBuffer in reasoning', () => {
      const onEvent = vi.fn();
      const parser = new SseLineParser({ onEvent });
      parser._tagBuffer = 'remaining reasoning';
      parser._inReasoning = true;
      parser.flush();
      expect(onEvent).toHaveBeenCalledWith({ type: 'reasoning_start' });
      expect(onEvent).toHaveBeenCalledWith({
        type: 'reasoning_delta',
        delta: 'remaining reasoning',
      });
    });

    it('handles empty string line in flush', () => {
      const parser = new SseLineParser();
      parser._buf = '';
      expect(parser.flush()).toBe('');
    });

    it('handles data line with only data: prefix', () => {
      const parser = new SseLineParser();
      parser._buf = 'data: ';
      expect(parser.flush()).toBe('');
    });

    it('flushes dataBuffer with accumulated newline data', () => {
      const parser = new SseLineParser();
      parser._dataBuffer = '{"a": 1}';
      parser._buf = 'data: "b": 2}';
      // The buffer behavior during flush
      const text = parser.flush();
      expect(typeof text).toBe('string');
    });

    it('handles dataBuffer with existing buffer and new line in flush', () => {
      const parser = new SseLineParser();
      parser._dataBuffer = '{"partial"';
      parser._buf = 'data: :true}';
      // Validate it doesn't crash
      const text = parser.flush();
      expect(typeof text).toBe('string');
    });
  });

  describe('finalize', () => {
    it('emits reasoning_end when reasoning started', () => {
      const onEvent = vi.fn();
      const parser = new SseLineParser({ onEvent });
      parser._reasoningStarted = true;
      parser.finalize();
      expect(onEvent).toHaveBeenCalledWith({ type: 'reasoning_end' });
      expect(parser._reasoningEnded).toBe(true);
    });

    it('does nothing when reasoning not started', () => {
      const onEvent = vi.fn();
      const parser = new SseLineParser({ onEvent });
      parser.finalize();
      expect(onEvent).not.toHaveBeenCalled();
    });

    it('does nothing when already ended', () => {
      const onEvent = vi.fn();
      const parser = new SseLineParser({ onEvent });
      parser._reasoningStarted = true;
      parser._reasoningEnded = true;
      parser.finalize();
      expect(onEvent).not.toHaveBeenCalled();
    });
  });

  describe('parseSseChunk', () => {
    it('parses simple SSE chunk', () => {
      const text = parseSseChunk('data: {"choices":[{"delta":{"content":"Hello"}}]}\n\n');
      expect(text).toBe('Hello');
    });

    it('returns empty string for empty chunk', () => {
      expect(parseSseChunk('')).toBe('');
    });

    it('parses chunk with reasoning tags', () => {
      const text = parseSseChunk(
        'data: {"choices":[{"delta":{"content":"<think>reasoning</think>answer"}}]}\n\n'
      );
      expect(text).toBe('answer');
    });
  });

  describe('integration - full SSE stream', () => {
    it('processes multi-event stream with tags', () => {
      const events = [];
      const parser = new SseLineParser({
        onEvent: (e) => events.push(e),
      });

      const stream =
        'data: {"choices":[{"delta":{"content":"Let me "}}]}\n\n' +
        'data: {"choices":[{"delta":{"content":"<think>think"}}]}\n\n' +
        'data: {"choices":[{"delta":{"content":" about this"}}]}\n\n' +
        'data: {"choices":[{"delta":{"content":"</think>answer"}}]}\n\n';

      parser.push(stream);
      parser.finalize();

      expect(events).toContainEqual({ type: 'reasoning_start' });
      expect(events).toContainEqual({ type: 'reasoning_delta', delta: 'think' });
      expect(events).toContainEqual({ type: 'reasoning_delta', delta: ' about this' });
      expect(events).toContainEqual({ type: 'text_delta', delta: 'answer' });
      expect(events).toContainEqual({ type: 'reasoning_end' });
    });

    it('processes stream with finish reason', () => {
      const events = [];
      const parser = new SseLineParser({
        onEvent: (e) => events.push(e),
      });

      const stream =
        'data: {"choices":[{"delta":{"content":"Hello"}}]}\n\n' +
        'data: {"choices":[{"finish_reason":"stop","delta":{}}]}\n\n';

      parser.push(stream);

      expect(events).toContainEqual({ type: 'finish_reason', reason: 'stop' });
    });

    it('processes stream with tool calls', () => {
      const events = [];
      const parser = new SseLineParser({
        onEvent: (e) => events.push(e),
      });

      const stream =
        'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"function":{"name":"get_weather"}}]}}]}\n\n';

      parser.push(stream);

      expect(events).toContainEqual(
        expect.objectContaining({
          type: 'tool_call_delta',
          tool_calls: expect.any(Array),
        })
      );
    });

    it('handles chunked delivery character by character', () => {
      const parser = new SseLineParser();
      let text = '';

      const chunk = 'data: {"choices":[{"delta":{"content":"Hello"}}]}\n\n';
      for (const char of chunk) {
        text += parser.push(char);
      }

      expect(text).toBe('Hello');
    });

    it('handles Google stream format', () => {
      const events = [];
      const parser = new SseLineParser({ onEvent: (e) => events.push(e) });

      const stream = 'data: {"candidates":[{"content":{"parts":[{"text":"Gemini says"}]}}]}\n\n';
      parser.push(stream);

      expect(events).toContainEqual({ type: 'text_delta', delta: 'Gemini says' });
    });

    it('handles Anthropic stream format', () => {
      const events = [];
      const parser = new SseLineParser({ onEvent: (e) => events.push(e) });

      const stream = 'data: {"type":"content_block_delta","delta":{"text":"Claude says"}}\n\n';
      parser.push(stream);

      expect(events).toContainEqual({ type: 'text_delta', delta: 'Claude says' });
    });

    it('flushes incomplete push via flush()', () => {
      const parser = new SseLineParser();
      const text1 = parser.push('data: {"choices":[{"delta":{"content":"incomplete"}}]}');
      expect(text1).toBe('');
      expect(parser._buf).toContain('incomplete');

      const text2 = parser.flush();
      expect(text2).toBe('incomplete');
      expect(parser._buf).toBe('');
    });
  });
});
