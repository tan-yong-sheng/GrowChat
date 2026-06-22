import { describe, expect, it, vi } from 'vitest';
import { handleParsed } from './stream-parser-handler.js';

// Minimal mock parser object for testing
function createMockParser() {
  const events = [];
  return {
    _hasToolCalls: false,
    _googleToolCallIndex: 0,
    _anthropicToolCalls: new Map(),
    _emit: vi.fn((event) => events.push(event)),
    _emitTextDelta: vi.fn((delta) => events.push({ type: 'text_delta', delta })),
    _emitReasoningDelta: vi.fn((delta) => events.push({ type: 'reasoning_delta', delta })),
    _extractTaggedSegments: vi.fn((text) => [{ type: 'text', text }]),
    events,
  };
}

describe('stream-parser-handler', () => {
  describe('Google/Gemini responses', () => {
    it('extracts text from Google candidates', () => {
      const parser = createMockParser();
      const parsed = {
        candidates: [
          {
            content: {
              parts: [{ text: 'Hello from Gemini' }],
            },
          },
        ],
      };

      const text = handleParsed(parser, parsed);
      expect(text).toBe('Hello from Gemini');
      expect(parser._emitTextDelta).toHaveBeenCalledWith('Hello from Gemini');
    });

    it('extracts Google tool calls', () => {
      const parser = createMockParser();
      const parsed = {
        candidates: [
          {
            content: {
              parts: [
                { text: 'Let me check' },
                {
                  functionCall: {
                    name: 'getWeather',
                    args: { location: 'NYC' },
                  },
                },
              ],
            },
            finishReason: 'STOP',
          },
        ],
      };

      const text = handleParsed(parser, parsed);
      expect(text).toBe('Let me check');
      expect(parser.events).toContainEqual(
        expect.objectContaining({
          type: 'tool_call_delta',
          tool_calls: expect.arrayContaining([
            expect.objectContaining({
              id: 'google_tool_1',
              function: expect.objectContaining({
                name: 'getWeather',
                arguments: '{"location":"NYC"}',
              }),
            }),
          ]),
        })
      );
    });

    it('handles Google tool calls with thought signatures', () => {
      const parser = createMockParser();
      const parsed = {
        candidates: [
          {
            content: {
              parts: [
                {
                  functionCall: { name: 'test', args: {} },
                  thoughtSignature: 'sig-abc-123',
                },
              ],
            },
          },
        ],
      };

      handleParsed(parser, parsed);
      const toolCallEvent = parser.events.find((e) => e.type === 'tool_call_delta');
      expect(toolCallEvent.tool_calls[0]).toMatchObject({
        providerMetadata: { google: { thoughtSignature: 'sig-abc-123' } },
      });
    });

    it('handles Google finish_reason with tool_calls', () => {
      const parser = createMockParser();
      parser._hasToolCalls = true;
      const parsed = {
        candidates: [
          {
            finishReason: 'STOP',
          },
        ],
      };

      handleParsed(parser, parsed);
      const finishEvent = parser.events.find((e) => e.type === 'finish_reason');
      expect(finishEvent.reason).toBe('tool_calls');
    });

    it('emits finish_reason for Google candidate', () => {
      const parser = createMockParser();
      const parsed = {
        candidates: [
          {
            content: { parts: [{ text: 'Done' }] },
            finishReason: 'STOP',
          },
        ],
      };

      handleParsed(parser, parsed);
      expect(parser.events).toContainEqual({ type: 'finish_reason', reason: 'stop' });
    });

    it('does not emit finish_reason when absent', () => {
      const parser = createMockParser();
      const parsed = {
        candidates: [{ content: { parts: [{ text: 'Hello' }] } }],
      };

      handleParsed(parser, parsed);
      const finishEvents = parser.events.filter((e) => e.type === 'finish_reason');
      expect(finishEvents).toHaveLength(0);
    });

    it('returns empty string when no candidates have content', () => {
      const parser = createMockParser();
      const parsed = { candidates: [] };
      expect(handleParsed(parser, parsed)).toBe('');
    });
  });

  describe('Anthropic responses', () => {
    it('handles content_block_start for tool_use', () => {
      const parser = createMockParser();
      const parsed = {
        type: 'content_block_start',
        index: 0,
        content_block: {
          type: 'tool_use',
          id: 'tool_01',
          name: 'calculator',
          input: { expression: '1+1' },
        },
      };

      handleParsed(parser, parsed);
      expect(parser.events).toContainEqual(
        expect.objectContaining({
          type: 'tool_call_delta',
          tool_calls: [
            expect.objectContaining({
              id: 'tool_01',
              function: expect.objectContaining({
                name: 'calculator',
                arguments: '{"expression":"1+1"}',
              }),
            }),
          ],
        })
      );
    });

    it('handles content_block_start for mcp_tool_use', () => {
      const parser = createMockParser();
      const parsed = {
        type: 'content_block_start',
        index: 1,
        content_block: {
          type: 'mcp_tool_use',
          id: 'mcp_01',
          name: 'weather',
          input: '{}',
        },
      };

      handleParsed(parser, parsed);
      const toolCallEvent = parser.events.find((e) => e.type === 'tool_call_delta');
      expect(toolCallEvent.tool_calls[0]).toMatchObject({
        index: 1,
        id: 'mcp_01',
      });
    });

    it('falls back to generated id when block id is missing', () => {
      const parser = createMockParser();
      const parsed = {
        type: 'content_block_start',
        index: 2,
        content_block: {
          type: 'tool_use',
          name: 'test',
          input: {},
        },
      };

      handleParsed(parser, parsed);
      const toolCallEvent = parser.events.find((e) => e.type === 'tool_call_delta');
      expect(toolCallEvent.tool_calls[0].id).toBe('anthropic_tool_2');
    });

    it('handles content_block_delta with input_json_delta', () => {
      const parser = createMockParser();
      parser._anthropicToolCalls.set(0, {
        index: 0,
        id: 'tool_01',
        function: { name: 'calc', arguments: '{"a":' },
      });

      const parsed = {
        type: 'content_block_delta',
        index: 0,
        delta: { type: 'input_json_delta', partial_json: '1}' },
      };

      handleParsed(parser, parsed);
      expect(parser.events).toContainEqual(
        expect.objectContaining({
          type: 'tool_call_delta',
          tool_calls: [expect.objectContaining({ function: { arguments: '1}' } })],
        })
      );
      expect(parser._anthropicToolCalls.get(0).function.arguments).toBe('{"a":1}');
    });

    it('handles content_block_delta with missing existing tool call', () => {
      const parser = createMockParser();
      const parsed = {
        type: 'content_block_delta',
        index: 5,
        delta: { type: 'input_json_delta', partial_json: '{"key":"val"}' },
      };

      handleParsed(parser, parsed);
      expect(parser._anthropicToolCalls.has(5)).toBe(true);
      expect(parser._anthropicToolCalls.get(5)).toMatchObject({
        index: 5,
        id: 'anthropic_tool_5',
      });
    });

    it('extracts text from content_block_delta', () => {
      const parser = createMockParser();
      const parsed = {
        type: 'content_block_delta',
        delta: { text: 'Hello Claude' },
      };

      const text = handleParsed(parser, parsed);
      expect(text).toBe('Hello Claude');
      expect(parser._emitTextDelta).toHaveBeenCalledWith('Hello Claude');
    });

    it('emits finish_reason on message_delta with stop_reason', () => {
      const parser = createMockParser();
      const parsed = {
        type: 'message_delta',
        delta: { stop_reason: 'end_turn' },
      };

      handleParsed(parser, parsed);
      expect(parser.events).toContainEqual({ type: 'finish_reason', reason: 'stop' });
    });

    it('emits finish_reason on message_stop', () => {
      const parser = createMockParser();
      const parsed = { type: 'message_stop' };

      handleParsed(parser, parsed);
      expect(parser.events).toContainEqual({ type: 'finish_reason', reason: 'stop' });
    });

    it('returns empty string for message_start', () => {
      const parser = createMockParser();
      expect(handleParsed(parser, { type: 'message_start' })).toBe('');
    });
  });

  describe('OpenAI-compatible responses', () => {
    it('extracts text from delta.content', () => {
      const parser = createMockParser();
      const parsed = {
        choices: [
          {
            delta: { content: 'Hello world' },
          },
        ],
      };

      const text = handleParsed(parser, parsed);
      expect(text).toBe('Hello world');
      expect(parser._emitTextDelta).toHaveBeenCalledWith('Hello world');
    });

    it('handles reasoning fields', () => {
      const parser = createMockParser();
      const parsed = {
        choices: [
          {
            delta: { reasoning: 'Let me think...' },
          },
        ],
      };

      handleParsed(parser, parsed);
      expect(parser._emitReasoningDelta).toHaveBeenCalledWith('Let me think...');
    });

    it('handles thinking field', () => {
      const parser = createMockParser();
      const parsed = {
        choices: [
          {
            delta: { thinking: 'Thinking deeply' },
          },
        ],
      };

      handleParsed(parser, parsed);
      expect(parser._emitReasoningDelta).toHaveBeenCalledWith('Thinking deeply');
    });

    it('handles reasoning_content field', () => {
      const parser = createMockParser();
      const parsed = {
        choices: [
          {
            delta: { reasoning_content: 'Chain of thought' },
          },
        ],
      };

      handleParsed(parser, parsed);
      expect(parser._emitReasoningDelta).toHaveBeenCalledWith('Chain of thought');
    });

    it('handles reasoningContent field (camelCase)', () => {
      const parser = createMockParser();
      const parsed = {
        choices: [
          {
            delta: { reasoningContent: 'Deep reasoning' },
          },
        ],
      };

      handleParsed(parser, parsed);
      expect(parser._emitReasoningDelta).toHaveBeenCalledWith('Deep reasoning');
    });

    it('handles response field', () => {
      const parser = createMockParser();
      const parsed = {
        response: 'Direct response text',
      };

      const text = handleParsed(parser, parsed);
      expect(text).toBe('Direct response text');
    });

    it('handles message.content fallback', () => {
      const parser = createMockParser();
      const parsed = {
        choices: [
          {
            message: { content: 'Message content' },
          },
        ],
      };

      const text = handleParsed(parser, parsed);
      expect(text).toBe('Message content');
    });

    it('handles choices[0].text fallback', () => {
      const parser = createMockParser();
      const parsed = {
        choices: [{ text: 'Choice text' }],
      };

      const text = handleParsed(parser, parsed);
      expect(text).toBe('Choice text');
    });

    it('coerces object delta.content to string via object toString', () => {
      const parser = createMockParser();
      const parsed = {
        choices: [
          {
            delta: {
              content: { text: 'Nested text' },
            },
          },
        ],
      };

      const text = handleParsed(parser, parsed);
      expect(text).toBe('[object Object]');
    });

    it('handles array content with text parts', () => {
      const parser = createMockParser();
      parser._extractTaggedSegments = vi.fn((text) => [{ type: 'text', text }]);
      const parsed = {
        choices: [
          {
            delta: {
              content: [
                { type: 'text', text: 'Part 1' },
                { type: 'text', text: 'Part 2' },
              ],
            },
          },
        ],
      };

      const text = handleParsed(parser, parsed);
      expect(text).toBe('Part 1Part 2');
    });

    it('handles tagged segments with reasoning type', () => {
      const parser = createMockParser();
      parser._extractTaggedSegments = vi.fn((text) => [
        { type: 'reasoning', text: 'Thinking' },
        { type: 'text', text: 'Answer' },
      ]);
      const parsed = {
        choices: [{ delta: { content: 'Mixed content' } }],
      };

      const text = handleParsed(parser, parsed);
      expect(text).toBe('Answer');
      expect(parser._emitReasoningDelta).toHaveBeenCalledWith('Thinking');
      expect(parser._emitTextDelta).toHaveBeenCalledWith('Answer');
    });

    it('emits tool_calls', () => {
      const parser = createMockParser();
      const parsed = {
        choices: [
          {
            delta: {
              tool_calls: [{ index: 0, function: { name: 'test' } }],
            },
          },
        ],
      };

      handleParsed(parser, parsed);
      expect(parser.events).toContainEqual(
        expect.objectContaining({
          type: 'tool_call_delta',
          tool_calls: [{ index: 0, function: { name: 'test' } }],
        })
      );
      expect(parser._hasToolCalls).toBe(true);
    });

    it('emits finish_reason', () => {
      const parser = createMockParser();
      const parsed = {
        choices: [{ finish_reason: 'stop', delta: {} }],
      };

      handleParsed(parser, parsed);
      expect(parser.events).toContainEqual({ type: 'finish_reason', reason: 'stop' });
    });

    it('maps stop_sequence to stop', () => {
      const parser = createMockParser();
      const parsed = {
        choices: [{ finish_reason: 'stop_sequence', delta: {} }],
      };

      handleParsed(parser, parsed);
      expect(parser.events).toContainEqual({ type: 'finish_reason', reason: 'stop' });
    });

    it('maps end_turn to stop', () => {
      const parser = createMockParser();
      const parsed = {
        choices: [{ finish_reason: 'end_turn', delta: {} }],
      };

      handleParsed(parser, parsed);
      expect(parser.events).toContainEqual({ type: 'finish_reason', reason: 'stop' });
    });

    it('maps max_tokens to length', () => {
      const parser = createMockParser();
      const parsed = {
        choices: [{ finish_reason: 'max_tokens', delta: {} }],
      };

      handleParsed(parser, parsed);
      expect(parser.events).toContainEqual({ type: 'finish_reason', reason: 'length' });
    });

    it('maps length to length', () => {
      const parser = createMockParser();
      const parsed = {
        choices: [{ finish_reason: 'length', delta: {} }],
      };

      handleParsed(parser, parsed);
      expect(parser.events).toContainEqual({ type: 'finish_reason', reason: 'length' });
    });

    it('converts finish_reason to tool_calls when has tool calls', () => {
      const parser = createMockParser();
      parser._hasToolCalls = true;
      const parsed = {
        choices: [{ finish_reason: 'stop', delta: {} }],
      };

      handleParsed(parser, parsed);
      expect(parser.events).toContainEqual({ type: 'finish_reason', reason: 'tool_calls' });
    });

    it('returns unknown finish_reason as-is', () => {
      const parser = createMockParser();
      const parsed = {
        choices: [{ finish_reason: 'custom_reason', delta: {} }],
      };

      handleParsed(parser, parsed);
      expect(parser.events).toContainEqual({ type: 'finish_reason', reason: 'custom_reason' });
    });

    it('handles empty delta with parsed.type', () => {
      const parser = createMockParser();
      parser._extractTaggedSegments = vi.fn((text) => [{ type: 'text', text }]);
      const parsed = {
        type: 'some_event',
        delta: 'Some text from delta',
      };

      const text = handleParsed(parser, parsed);
      expect(text).toBe('Some text from delta');
    });

    it('handles parsed.text when no content', () => {
      const parser = createMockParser();
      parser._extractTaggedSegments = vi.fn((text) => [{ type: 'text', text }]);
      const parsed = {
        type: 'some_event',
        text: 'Direct text',
      };

      const text = handleParsed(parser, parsed);
      expect(text).toBe('Direct text');
    });

    it('skips empty string delta.text', () => {
      const parser = createMockParser();
      parser._extractTaggedSegments = vi.fn((text) => [{ type: 'text', text }]);
      const parsed = {
        type: 'some_event',
        text: '',
      };

      const text = handleParsed(parser, parsed);
      expect(text).toBe('');
      expect(parser._extractTaggedSegments).not.toHaveBeenCalled();
    });
  });

  describe('edge cases', () => {
    it('handles null parsed', () => {
      const parser = createMockParser();
      const text = handleParsed(parser, null);
      expect(text).toBe('');
    });

    it('handles undefined parsed', () => {
      const parser = createMockParser();
      const text = handleParsed(parser, undefined);
      expect(text).toBe('');
    });

    it('handles empty choices array', () => {
      const parser = createMockParser();
      const parsed = { choices: [] };
      const text = handleParsed(parser, parsed);
      expect(text).toBe('');
    });

    it('handles null delta', () => {
      const parser = createMockParser();
      const parsed = { choices: [{ delta: null }] };
      const text = handleParsed(parser, parsed);
      expect(text).toBe('');
    });

    it('handles empty array content with non-text parts', () => {
      const parser = createMockParser();
      const parsed = {
        choices: [
          {
            delta: {
              content: [{ type: 'image', url: '...' }, null],
            },
          },
        ],
      };

      const text = handleParsed(parser, parsed);
      expect(text).toBe('');
    });

    it('skips empty segments', () => {
      const parser = createMockParser();
      parser._extractTaggedSegments = vi.fn(() => [
        { type: 'text', text: '' },
        { type: 'text', text: '' },
      ]);
      const parsed = {
        choices: [{ delta: { content: 'x' } }],
      };

      const text = handleParsed(parser, parsed);
      expect(text).toBe('');
      expect(parser._emitTextDelta).not.toHaveBeenCalled();
    });

    it('does not emit tool_calls for empty array', () => {
      const parser = createMockParser();
      const parsed = {
        choices: [{ delta: { tool_calls: [] } }],
      };

      handleParsed(parser, parsed);
      const toolCallEvents = parser.events.filter((e) => e.type === 'tool_call_delta');
      expect(toolCallEvents).toHaveLength(0);
    });

    it('does not emit tool_calls for non-array', () => {
      const parser = createMockParser();
      const parsed = {
        choices: [{ delta: { tool_calls: 'not-array' } }],
      };

      handleParsed(parser, parsed);
      const toolCallEvents = parser.events.filter((e) => e.type === 'tool_call_delta');
      expect(toolCallEvents).toHaveLength(0);
    });

    it('handles content_block_start with non-tool block type', () => {
      const parser = createMockParser();
      const parsed = {
        type: 'content_block_start',
        index: 0,
        content_block: { type: 'text', text: 'Hello' },
      };

      const text = handleParsed(parser, parsed);
      expect(text).toBe('');
      expect(parser.events).toHaveLength(0);
    });

    it('handles array content parts with reasoning segments', () => {
      const parser = createMockParser();
      parser._extractTaggedSegments = vi.fn((text) => [{ type: 'reasoning', text: 'Reasoning' }]);
      const parsed = {
        choices: [
          {
            delta: {
              content: [{ type: 'text', text: '<think>test</think>' }],
            },
          },
        ],
      };

      handleParsed(parser, parsed);
      expect(parser._emitReasoningDelta).toHaveBeenCalled();
    });

    it('handles finish_reason when already has tool calls', () => {
      const parser = createMockParser();
      parser._hasToolCalls = true;
      const parsed = {
        choices: [{ finish_reason: 'stop', delta: {} }],
      };
      handleParsed(parser, parsed);
      expect(parser.events).toContainEqual({ type: 'finish_reason', reason: 'tool_calls' });
    });

    it('normalizes finish_reason with tool in value', () => {
      const parser = createMockParser();
      const parsed = {
        choices: [{ finish_reason: 'tool_use', delta: {} }],
      };
      handleParsed(parser, parsed);
      expect(parser.events).toContainEqual({ type: 'finish_reason', reason: 'tool_calls' });
    });

    it('returns empty string for content_block_delta without recognized delta type', () => {
      const parser = createMockParser();
      const parsed = {
        type: 'content_block_delta',
        index: 0,
        delta: { type: 'unknown_delta' },
      };
      const text = handleParsed(parser, parsed);
      expect(text).toBe('');
    });
  });
});
