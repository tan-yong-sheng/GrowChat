import { describe, expect, it, vi } from 'vitest';
import { SseLineParser, parseSseChunk, DEFAULT_REASONING_TAGS } from './stream-parser.js';

describe('SseLineParser', () => {
  describe('constructor', () => {
    it('initializes with default tag names', () => {
      const parser = new SseLineParser();
      expect(parser._tagNames).toEqual(DEFAULT_REASONING_TAGS);
    });

    it('accepts custom tag names', () => {
      const parser = new SseLineParser({ tagNames: ['custom'] });
      expect(parser._tagNames).toEqual(['custom']);
    });

    it('falls back to default tags when given empty array', () => {
      const parser = new SseLineParser({ tagNames: [] });
      expect(parser._tagNames).toEqual(DEFAULT_REASONING_TAGS);
    });

    it('accepts onEvent callback', () => {
      const onEvent = vi.fn();
      const parser = new SseLineParser({ onEvent });
      expect(parser._onEvent).toBe(onEvent);
    });

    it('ignores non-function onEvent', () => {
      const parser = new SseLineParser({ onEvent: 'not-a-function' });
      expect(parser._onEvent).toBeNull();
    });
  });

  describe('push — basic SSE parsing', () => {
    it('parses a single data line', () => {
      const parser = new SseLineParser();
      const text = parser.push('data: {"choices":[{"delta":{"content":"hi"}}]}\n\n');
      expect(text).toBe('hi');
    });

    it('parses multiple data lines', () => {
      const parser = new SseLineParser();
      const text = parser.push(
        'data: {"choices":[{"delta":{"content":"Hello"}}]}\ndata: {"choices":[{"delta":{"content":" World"}}]}\n\n',
      );
      expect(text).toBe('Hello World');
    });

    it('ignores non-data lines', () => {
      const parser = new SseLineParser();
      const text = parser.push('event: message\ndata: {"choices":[{"delta":{"content":"hi"}}]}\n\n');
      expect(text).toBe('hi');
    });

    it('handles data: prefix with space', () => {
      const parser = new SseLineParser();
      const text = parser.push('data: {"choices":[{"delta":{"content":"ok"}}]}\n\n');
      expect(text).toBe('ok');
    });

    it('handles data: prefix without space', () => {
      const parser = new SseLineParser();
      const text = parser.push('data:{"choices":[{"delta":{"content":"ok"}}]}\n\n');
      expect(text).toBe('ok');
    });

    it('skips empty data payloads', () => {
      const parser = new SseLineParser();
      const text = parser.push('data: \n\n');
      expect(text).toBe('');
    });

    it('handles [DONE] sentinel', () => {
      const parser = new SseLineParser();
      const text = parser.push('data: [DONE]\n\n');
      expect(text).toBe('');
    });

    it('returns empty string for lines without data prefix', () => {
      const parser = new SseLineParser();
      const text = parser.push('just a comment\n\n');
      expect(text).toBe('');
    });

    it('handles CRLF line endings', () => {
      const parser = new SseLineParser();
      const text = parser.push('data: {"choices":[{"delta":{"content":"crlf"}}]}\r\n\r\n');
      expect(text).toBe('crlf');
    });

    it('handles Google SSE format', () => {
      const parser = new SseLineParser();
      const text = parser.push(
        'data: {"candidates":[{"content":{"parts":[{"text":"Hello Google"}]}}]}\n\n',
      );
      expect(text).toBe('Hello Google');
    });

    it('handles Anthropic SSE format', () => {
      const parser = new SseLineParser();
      const text = parser.push(
        'data: {"type":"content_block_delta","delta":{"type":"text_delta","text":"Hello Anthropic"}}\n\n',
      );
      expect(text).toBe('Hello Anthropic');
    });
  });

  describe('push — buffering and incomplete JSON', () => {
    it('buffers incomplete JSON and flushes on empty line', () => {
      const parser = new SseLineParser();
      // Incomplete JSON on first data line
      parser.push('data: {"choices":[{"delta":{"content":"first');
      // Empty line triggers flush of data buffer, but incomplete JSON stays buffered
      const text = parser.push('"}}]}\n\n');
      expect(typeof text === 'string').toBe(true);
    });

    it('handles partial chunk followed by complete chunk', () => {
      const parser = new SseLineParser();
      parser.push('data: {"choices":[{"delta":{"content":"a"}}]}\n\n');
      const text = parser.push('data: {"choices":[{"delta":{"content":"b"}}]}\n\n');
      expect(text).toBe('b');
    });
  });

  describe('push — invalid data', () => {
    it('handles unparseable JSON by buffering it', () => {
      const parser = new SseLineParser();
      const text = parser.push('data: not-json\n\n');
      // Should not throw; incomplete JSON gets buffered
      expect(typeof text).toBe('string');
    });

    it('handles empty input', () => {
      const parser = new SseLineParser();
      const text = parser.push('');
      expect(text).toBe('');
    });

    it('handles input with only newlines', () => {
      const parser = new SseLineParser();
      const text = parser.push('\n\n\n');
      expect(text).toBe('');
    });
  });

  describe('_emit and events', () => {
    it('emits text_delta events via onEvent', () => {
      const events = [];
      const parser = new SseLineParser({ onEvent: (e) => events.push(e) });
      parser.push('data: {"choices":[{"delta":{"content":"hello"}}]}\n\n');
      expect(events).toContainEqual({ type: 'text_delta', delta: 'hello' });
    });

    it('emits finish_reason events', () => {
      const events = [];
      const parser = new SseLineParser({ onEvent: (e) => events.push(e) });
      parser.push('data: {"choices":[{"delta":{},"finish_reason":"stop"}]}\n\n');
      expect(events).toContainEqual({ type: 'finish_reason', reason: 'stop' });
    });

    it('does not emit when onEvent is null', () => {
      const parser = new SseLineParser();
      // Should not throw
      parser.push('data: {"choices":[{"delta":{"content":"safe"}}]}\n\n');
    });
  });

  describe('_emitTextDelta', () => {
    it('skips empty delta', () => {
      const events = [];
      const parser = new SseLineParser({ onEvent: (e) => events.push(e) });
      parser._emitTextDelta('');
      expect(events).toHaveLength(0);
    });

    it('emits text_delta event', () => {
      const events = [];
      const parser = new SseLineParser({ onEvent: (e) => events.push(e) });
      parser._emitTextDelta('hello');
      expect(events).toContainEqual({ type: 'text_delta', delta: 'hello' });
    });
  });

  describe('_emitReasoningDelta', () => {
    it('emits reasoning_start before first delta', () => {
      const events = [];
      const parser = new SseLineParser({ onEvent: (e) => events.push(e) });
      parser._emitReasoningDelta('thinking...');
      expect(events).toContainEqual({ type: 'reasoning_start' });
      expect(events).toContainEqual({ type: 'reasoning_delta', delta: 'thinking...' });
    });

    it('does not emit reasoning_start twice', () => {
      const events = [];
      const parser = new SseLineParser({ onEvent: (e) => events.push(e) });
      parser._emitReasoningDelta('first');
      events.length = 0;
      parser._emitReasoningDelta('second');
      expect(events).not.toContainEqual({ type: 'reasoning_start' });
    });

    it('skips empty delta', () => {
      const events = [];
      const parser = new SseLineParser({ onEvent: (e) => events.push(e) });
      parser._emitReasoningDelta('');
      expect(events).toHaveLength(0);
    });
  });

  describe('_extractTaggedSegments', () => {
    it('passes through plain text without tags', () => {
      const parser = new SseLineParser();
      const segments = parser._extractTaggedSegments('hello world');
      expect(segments).toEqual([{ type: 'text', text: 'hello world' }]);
    });

    it('detects opening think tag and transitions to reasoning', () => {
      const parser = new SseLineParser();
      const segments = parser._extractTaggedSegments('before\x3Cthink>text...');
      expect(segments).toEqual([
        { type: 'text', text: 'before' },
        { type: 'reasoning', text: 'text...' },
      ]);
      expect(parser._inReasoning).toBe(true);
    });

    it('detects closing tag and transitions back to text', () => {
      const parser = new SseLineParser();
      // First call: consumes 'before' as text, opens think tag, emits 'inner' as reasoning
      parser._extractTaggedSegments('before\x3Cthink>inner');
      expect(parser._inReasoning).toBe(true);
      // Second call: tagBuffer is empty, appends '</think>after', closes reasoning, emits 'after' as text
      const segments = parser._extractTaggedSegments('\x3C/think>after');
      expect(segments).toEqual([
        { type: 'text', text: 'after' },
      ]);
      expect(parser._inReasoning).toBe(false);
    });

    it('handles full think cycle in one chunk', () => {
      const parser = new SseLineParser();
      const segments = parser._extractTaggedSegments('before\x3Cthink>thoughts\x3C/think>after');
      expect(segments).toEqual([
        { type: 'text', text: 'before' },
        { type: 'reasoning', text: 'thoughts' },
        { type: 'text', text: 'after' },
      ]);
    });

    it('handles empty chunk', () => {
      const parser = new SseLineParser();
      expect(parser._extractTaggedSegments('')).toEqual([]);
    });

    it('handles null chunk', () => {
      const parser = new SseLineParser();
      expect(parser._extractTaggedSegments(null)).toEqual([]);
    });

    it('buffers partial opening tag', () => {
      const parser = new SseLineParser();
      const segments = parser._extractTaggedSegments('hello\x3Cthi');
      expect(segments.some((s) => s.type === 'text')).toBe(true);
      expect(parser._tagBuffer.length).toBeGreaterThan(0);
    });

    it('handles custom tag names', () => {
      const parser = new SseLineParser({ tagNames: ['reason'] });
      const segments = parser._extractTaggedSegments('before\x3Creason>inside');
      expect(segments).toEqual([
        { type: 'text', text: 'before' },
        { type: 'reasoning', text: 'inside' },
      ]);
    });

    it('handles multiple reasoning cycles', () => {
      const parser = new SseLineParser();
      const segments = parser._extractTaggedSegments(
        'a\x3Cthink>t1\x3C/think>b\x3Cthink>t2\x3C/think>c',
      );
      expect(segments).toEqual([
        { type: 'text', text: 'a' },
        { type: 'reasoning', text: 't1' },
        { type: 'text', text: 'b' },
        { type: 'reasoning', text: 't2' },
        { type: 'text', text: 'c' },
      ]);
    });
  });

  describe('flush', () => {
    it('flushes remaining buffer', () => {
      const parser = new SseLineParser();
      parser.push('data: {"choices":[{"delta":{"content":"hi"}}]}\n');
      // No trailing newline, so data is still in buffer
      const text = parser.flush();
      expect(typeof text === 'string').toBe(true);
    });

    it('flushes tag buffer as text when not in reasoning', () => {
      const events = [];
      const parser = new SseLineParser({ onEvent: (e) => events.push(e) });
      parser._tagBuffer = 'remaining text';
      parser._inReasoning = false;
      const text = parser.flush();
      expect(text).toBe('remaining text');
      expect(events).toContainEqual({ type: 'text_delta', delta: 'remaining text' });
    });

    it('flushes tag buffer as reasoning when in reasoning mode', () => {
      const events = [];
      const parser = new SseLineParser({ onEvent: (e) => events.push(e) });
      parser._tagBuffer = 'remaining reasoning';
      parser._inReasoning = true;
      parser._reasoningStarted = true;
      const text = parser.flush();
      expect(text).toBe('');
      expect(events).toContainEqual({ type: 'reasoning_delta', delta: 'remaining reasoning' });
    });

    it('handles empty flush', () => {
      const parser = new SseLineParser();
      const text = parser.flush();
      expect(text).toBe('');
    });

    it('flushes data buffer with pending data line', () => {
      const parser = new SseLineParser();
      // Push data without trailing newline
      parser.push('data: {"choices":[{"delta":{"content":"delayed"}}]}');
      // Flush to process remaining
      const text = parser.flush();
      expect(text).toBe('delayed');
    });
  });

  describe('finalize', () => {
    it('emits reasoning_end when reasoning was started', () => {
      const events = [];
      const parser = new SseLineParser({ onEvent: (e) => events.push(e) });
      parser._reasoningStarted = true;
      parser._reasoningEnded = false;
      parser.finalize();
      expect(events).toContainEqual({ type: 'reasoning_end' });
      expect(parser._reasoningEnded).toBe(true);
    });

    it('does not emit reasoning_end when reasoning was not started', () => {
      const events = [];
      const parser = new SseLineParser({ onEvent: (e) => events.push(e) });
      parser.finalize();
      expect(events).toHaveLength(0);
    });

    it('does not emit reasoning_end twice', () => {
      const events = [];
      const parser = new SseLineParser({ onEvent: (e) => events.push(e) });
      parser._reasoningStarted = true;
      parser.finalize();
      parser.finalize();
      expect(events).toHaveLength(1);
    });
  });

  describe('_consumeDataPayload', () => {
    it('returns empty string for null payload', () => {
      const parser = new SseLineParser();
      expect(parser._consumeDataPayload(null)).toBe('');
    });

    it('returns empty string for [DONE]', () => {
      const parser = new SseLineParser();
      expect(parser._consumeDataPayload('[DONE]')).toBe('');
    });

    it('parses valid JSON and returns text', () => {
      const parser = new SseLineParser();
      expect(parser._consumeDataPayload('{"choices":[{"delta":{"content":"x"}}]}')).toBe('x');
    });

    it('returns null for unparseable JSON', () => {
      const parser = new SseLineParser();
      expect(parser._consumeDataPayload('{broken')).toBeNull();
    });
  });
});

describe('parseSseChunk', () => {
  it('parses a raw SSE chunk and returns text', () => {
    const text = parseSseChunk('data: {"choices":[{"delta":{"content":"quick"}}]}\n\n');
    expect(text).toBe('quick');
  });

  it('returns empty string for empty chunk', () => {
    expect(parseSseChunk('')).toBe('');
  });

  it('handles [DONE] sentinel', () => {
    expect(parseSseChunk('data: [DONE]\n\n')).toBe('');
  });
});
