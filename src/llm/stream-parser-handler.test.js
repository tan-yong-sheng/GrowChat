import { describe, expect, it, vi } from 'vitest';
import { handleParsed } from './stream-parser-handler.js';

function createMockParser(overrides = {}) {
  const events = [];
  const parser = {
    _hasToolCalls: false,
    _googleToolCallIndex: 0,
    _anthropicToolCalls: new Map(),
    _emit(event) {
      events.push(event);
    },
    _emitTextDelta(delta) {
      if (!delta) return;
      events.push({ type: 'text_delta', delta });
    },
    _emitReasoningDelta(delta) {
      if (!delta) return;
      events.push({ type: 'reasoning_delta', delta });
    },
    _extractTaggedSegments(chunk) {
      // Default: no reasoning tags, just return text
      if (!chunk) return [];
      return [{ type: 'text', text: chunk }];
    },
    events,
    ...overrides,
  };
  return parser;
}

describe('handleParsed', () => {
  describe('OpenAI format', () => {
    it('extracts text from delta.content', () => {
      const parser = createMockParser();
      const parsed = {
        choices: [{ delta: { content: 'Hello' } }],
      };
      const text = handleParsed(parser, parsed);
      expect(text).toBe('Hello');
      expect(parser.events).toContainEqual({ type: 'text_delta', delta: 'Hello' });
    });

    it('extracts text from response field', () => {
      const parser = createMockParser();
      const parsed = {
        choices: [{ delta: { content: null } }],
        response: 'Response text',
      };
      const text = handleParsed(parser, parsed);
      expect(text).toBe('Response text');
    });

    it('extracts text from choices[0].message.content', () => {
      const parser = createMockParser();
      const parsed = {
        choices: [{ message: { content: 'Message text' } }],
      };
      const text = handleParsed(parser, parsed);
      expect(text).toBe('Message text');
    });

    it('extracts reasoning from delta.reasoning', () => {
      const parser = createMockParser();
      const parsed = {
        choices: [{ delta: { reasoning: 'thinking...' } }],
      };
      handleParsed(parser, parsed);
      expect(parser.events).toContainEqual({ type: 'reasoning_delta', delta: 'thinking...' });
    });

    it('extracts reasoning from delta.thinking', () => {
      const parser = createMockParser();
      const parsed = {
        choices: [{ delta: { thinking: 'deep thought' } }],
      };
      handleParsed(parser, parsed);
      expect(parser.events).toContainEqual({ type: 'reasoning_delta', delta: 'deep thought' });
    });

    it('extracts reasoning from delta.reasoning_content', () => {
      const parser = createMockParser();
      const parsed = {
        choices: [{ delta: { reasoning_content: 'cot' } }],
      };
      handleParsed(parser, parsed);
      expect(parser.events).toContainEqual({ type: 'reasoning_delta', delta: 'cot' });
    });

    it('extracts text from choices[0].text', () => {
      const parser = createMockParser();
      const parsed = {
        choices: [{ text: 'plain text' }],
      };
      const text = handleParsed(parser, parsed);
      expect(text).toBe('plain text');
    });

    it('handles tool_calls in delta', () => {
      const parser = createMockParser();
      const parsed = {
        choices: [
          {
            delta: {
              tool_calls: [
                { index: 0, id: 'call_1', function: { name: 'get_weather', arguments: '{}' } },
              ],
            },
          },
        ],
      };
      handleParsed(parser, parsed);
      expect(parser._hasToolCalls).toBe(true);
      expect(parser.events).toContainEqual({
        type: 'tool_call_delta',
        tool_calls: [
          { index: 0, id: 'call_1', function: { name: 'get_weather', arguments: '{}' } },
        ],
      });
    });

    it('emits finish_reason for stop', () => {
      const parser = createMockParser();
      const parsed = {
        choices: [{ delta: {}, finish_reason: 'stop' }],
      };
      handleParsed(parser, parsed);
      expect(parser.events).toContainEqual({ type: 'finish_reason', reason: 'stop' });
    });

    it('maps length finish_reason', () => {
      const parser = createMockParser();
      const parsed = {
        choices: [{ delta: {}, finish_reason: 'length' }],
      };
      handleParsed(parser, parsed);
      expect(parser.events).toContainEqual({ type: 'finish_reason', reason: 'length' });
    });

    it('maps max_tokens finish_reason to length', () => {
      const parser = createMockParser();
      const parsed = {
        choices: [{ delta: {}, finish_reason: 'max_tokens' }],
      };
      handleParsed(parser, parsed);
      expect(parser.events).toContainEqual({ type: 'finish_reason', reason: 'length' });
    });

    it('maps tool_calls finish_reason', () => {
      const parser = createMockParser();
      const parsed = {
        choices: [{ delta: {}, finish_reason: 'tool_calls' }],
      };
      handleParsed(parser, parsed);
      expect(parser.events).toContainEqual({ type: 'finish_reason', reason: 'tool_calls' });
    });

    it('overrides finish_reason with tool_calls when parser has tool calls', () => {
      const parser = createMockParser();
      parser._hasToolCalls = true;
      const parsed = {
        choices: [{ delta: {}, finish_reason: 'stop' }],
      };
      handleParsed(parser, parsed);
      expect(parser.events).toContainEqual({ type: 'finish_reason', reason: 'tool_calls' });
    });

    it('handles delta.content as object with text field when response is null', () => {
      const parser = createMockParser();
      // When delta.content is a non-array object with a .text string,
      // the parser should extract the nested text instead of stringifying the object.
      const parsed = {
        response: null,
        choices: [{ delta: { content: { text: 'nested text' }, role: undefined } }],
      };
      const text = handleParsed(parser, parsed);
      expect(text).toBe('nested text');
      expect(parser.events).toContainEqual({ type: 'text_delta', delta: 'nested text' });
    });

    it('handles array content with text parts', () => {
      const parser = createMockParser();
      const parsed = {
        choices: [
          {
            delta: {
              content: [{ type: 'text', text: 'part1' }, { type: 'image_url' }],
            },
          },
        ],
      };
      const text = handleParsed(parser, parsed);
      expect(text).toBe('part1');
    });

    it('handles delta.text for non-standard providers', () => {
      const parser = createMockParser();
      const parsed = {
        type: 'response',
        delta: 'simple text',
      };
      const text = handleParsed(parser, parsed);
      expect(text).toBe('simple text');
    });

    it('handles parsed.text for non-standard providers', () => {
      const parser = createMockParser();
      const parsed = {
        type: 'response',
        text: 'simple text',
      };
      const text = handleParsed(parser, parsed);
      expect(text).toBe('simple text');
    });

    it('returns empty string when no content found', () => {
      const parser = createMockParser();
      const parsed = { choices: [{ delta: {} }] };
      const text = handleParsed(parser, parsed);
      expect(text).toBe('');
    });
  });

  describe('Google format', () => {
    it('extracts text from Google candidates', () => {
      const parser = createMockParser();
      const parsed = {
        candidates: [
          {
            content: { parts: [{ text: 'Google response' }] },
          },
        ],
      };
      const text = handleParsed(parser, parsed);
      expect(text).toBe('Google response');
    });

    it('extracts function calls from Google parts', () => {
      const parser = createMockParser();
      const parsed = {
        candidates: [
          {
            content: {
              parts: [{ functionCall: { name: 'search', args: { q: 'test' } } }],
            },
          },
        ],
      };
      handleParsed(parser, parsed);
      expect(parser._hasToolCalls).toBe(true);
      expect(parser.events).toContainEqual({
        type: 'tool_call_delta',
        tool_calls: [
          {
            index: 0,
            id: 'google_tool_1',
            function: { name: 'search', arguments: JSON.stringify({ q: 'test' }) },
          },
        ],
      });
    });

    it('increments google tool call index', () => {
      const parser = createMockParser();
      const parsed = {
        candidates: [
          {
            content: {
              parts: [
                { functionCall: { name: 'fn1', args: {} } },
                { functionCall: { name: 'fn2', args: {} } },
              ],
            },
          },
        ],
      };
      handleParsed(parser, parsed);
      expect(parser._googleToolCallIndex).toBe(2);
    });

    it('includes thoughtSignature when present', () => {
      const parser = createMockParser();
      const parsed = {
        candidates: [
          {
            content: {
              parts: [
                {
                  functionCall: { name: 'fn1', args: {} },
                  thoughtSignature: 'sig123',
                },
              ],
            },
          },
        ],
      };
      handleParsed(parser, parsed);
      const toolCallEvent = parser.events.find((e) => e.type === 'tool_call_delta');
      expect(toolCallEvent.tool_calls[0].providerMetadata.google.thoughtSignature).toBe('sig123');
    });

    it('emits finish_reason from Google finishReason', () => {
      const parser = createMockParser();
      const parsed = {
        candidates: [
          {
            content: { parts: [{ text: 'ok' }] },
            finishReason: 'STOP',
          },
        ],
      };
      handleParsed(parser, parsed);
      expect(parser.events).toContainEqual({ type: 'finish_reason', reason: 'stop' });
    });

    it('maps Google end_turn finish_reason to stop', () => {
      const parser = createMockParser();
      const parsed = {
        candidates: [
          {
            content: { parts: [] },
            finishReason: 'end_turn',
          },
        ],
      };
      handleParsed(parser, parsed);
      expect(parser.events).toContainEqual({ type: 'finish_reason', reason: 'stop' });
    });

    it('maps Google stop_sequence finish_reason to stop', () => {
      const parser = createMockParser();
      const parsed = {
        candidates: [
          {
            content: { parts: [] },
            finishReason: 'stop_sequence',
          },
        ],
      };
      handleParsed(parser, parsed);
      expect(parser.events).toContainEqual({ type: 'finish_reason', reason: 'stop' });
    });

    it('handles empty candidates array', () => {
      const parser = createMockParser();
      const parsed = { candidates: [] };
      // Falls through to OpenAI path
      const text = handleParsed(parser, parsed);
      expect(text).toBe('');
    });
  });

  describe('Anthropic format', () => {
    it('handles content_block_start for tool_use', () => {
      const parser = createMockParser();
      const parsed = {
        type: 'content_block_start',
        index: 2,
        content_block: {
          type: 'tool_use',
          id: 'toolu_123',
          name: 'get_weather',
          input: '{}',
        },
      };
      handleParsed(parser, parsed);
      expect(parser._hasToolCalls).toBe(true);
      const toolCall = parser._anthropicToolCalls.get(2);
      expect(toolCall).toBeDefined();
      expect(toolCall.function.name).toBe('get_weather');
    });

    it('handles content_block_start for mcp_tool_use', () => {
      const parser = createMockParser();
      const parsed = {
        type: 'content_block_start',
        index: 0,
        content_block: {
          type: 'mcp_tool_use',
          id: 'mcp_1',
          name: 'mcp_fn',
          input: { key: 'val' },
        },
      };
      handleParsed(parser, parsed);
      expect(parser._hasToolCalls).toBe(true);
      const toolCall = parser._anthropicToolCalls.get(0);
      expect(toolCall.function.name).toBe('mcp_fn');
      expect(toolCall.function.arguments).toBe(JSON.stringify({ key: 'val' }));
    });

    it('uses default index 0 when index not present in content_block_start', () => {
      const parser = createMockParser();
      const parsed = {
        type: 'content_block_start',
        content_block: {
          type: 'tool_use',
          id: 'toolu_1',
          name: 'fn',
          input: {},
        },
      };
      handleParsed(parser, parsed);
      expect(parser._anthropicToolCalls.has(0)).toBe(true);
    });

    it('generates fallback id when block.id is missing', () => {
      const parser = createMockParser();
      const parsed = {
        type: 'content_block_start',
        index: 3,
        content_block: { type: 'tool_use', name: 'fn' },
      };
      handleParsed(parser, parsed);
      const toolCall = parser._anthropicToolCalls.get(3);
      expect(toolCall.id).toBe('anthropic_tool_3');
    });

    it('handles input_json_delta for tool call arguments', () => {
      const parser = createMockParser();
      // First, set up an existing tool call
      parser._anthropicToolCalls.set(0, {
        index: 0,
        id: 'toolu_1',
        function: { name: 'search', arguments: '' },
      });
      const parsed = {
        type: 'content_block_delta',
        index: 0,
        delta: { type: 'input_json_delta', partial_json: '{"query": ' },
      };
      handleParsed(parser, parsed);
      const toolCall = parser._anthropicToolCalls.get(0);
      expect(toolCall.function.arguments).toBe('{"query": ');
    });

    it('appends partial_json to existing arguments', () => {
      const parser = createMockParser();
      parser._anthropicToolCalls.set(0, {
        index: 0,
        id: 'toolu_1',
        function: { name: 'search', arguments: '{"q": ' },
      });
      const parsed = {
        type: 'content_block_delta',
        index: 0,
        delta: { type: 'input_json_delta', partial_json: '"hello"}' },
      };
      handleParsed(parser, parsed);
      const toolCall = parser._anthropicToolCalls.get(0);
      expect(toolCall.function.arguments).toBe('{"q": "hello"}');
    });

    it('creates stub tool call when no existing entry for input_json_delta index', () => {
      const parser = createMockParser();
      const parsed = {
        type: 'content_block_delta',
        index: 5,
        delta: { type: 'input_json_delta', partial_json: '{"x":1}' },
      };
      handleParsed(parser, parsed);
      const toolCall = parser._anthropicToolCalls.get(5);
      expect(toolCall).toBeDefined();
      expect(toolCall.id).toBe('anthropic_tool_5');
    });

    it('extracts text from content_block_delta with text type', () => {
      const parser = createMockParser();
      const parsed = {
        type: 'content_block_delta',
        delta: { type: 'text_delta', text: 'Hello from Anthropic' },
      };
      const text = handleParsed(parser, parsed);
      expect(text).toBe('Hello from Anthropic');
    });

    it('emits finish_reason from message_delta stop_reason', () => {
      const parser = createMockParser();
      const parsed = {
        type: 'message_delta',
        delta: { stop_reason: 'end_turn' },
      };
      handleParsed(parser, parsed);
      expect(parser.events).toContainEqual({ type: 'finish_reason', reason: 'stop' });
    });

    it('emits finish_reason stop on message_stop', () => {
      const parser = createMockParser();
      const parsed = { type: 'message_stop' };
      handleParsed(parser, parsed);
      expect(parser.events).toContainEqual({ type: 'finish_reason', reason: 'stop' });
    });

    it('skips content_block_start for non-tool blocks', () => {
      const parser = createMockParser();
      const parsed = {
        type: 'content_block_start',
        index: 0,
        content_block: { type: 'text', text: 'Hello' },
      };
      const text = handleParsed(parser, parsed);
      expect(text).toBe('');
      expect(parser._hasToolCalls).toBe(false);
    });
  });

  describe('edge cases', () => {
    it('handles empty parsed object', () => {
      const parser = createMockParser();
      const text = handleParsed(parser, {});
      expect(text).toBe('');
    });

    it('handles null parsed', () => {
      const parser = createMockParser();
      const text = handleParsed(parser, null);
      expect(text).toBe('');
    });

    it('does not emit tool_call_delta for empty tool_calls array', () => {
      const parser = createMockParser();
      const parsed = {
        choices: [{ delta: { tool_calls: [] } }],
      };
      handleParsed(parser, parsed);
      expect(parser._hasToolCalls).toBe(false);
      expect(parser.events).not.toContainEqual(
        expect.objectContaining({ type: 'tool_call_delta' })
      );
    });

    it('handles finish_reason with tool keyword in value', () => {
      const parser = createMockParser();
      const parsed = {
        choices: [{ delta: {}, finish_reason: 'tool_use' }],
      };
      handleParsed(parser, parsed);
      expect(parser.events).toContainEqual({ type: 'finish_reason', reason: 'tool_calls' });
    });

    it('normalizes finish_reason: empty string yields null', () => {
      const parser = createMockParser();
      const parsed = {
        choices: [{ delta: {}, finish_reason: '' }],
      };
      handleParsed(parser, parsed);
      expect(parser.events).not.toContainEqual(expect.objectContaining({ type: 'finish_reason' }));
    });

    it('handles reasoning with tagged segments', () => {
      const parser = createMockParser({
        _extractTaggedSegments: (chunk) => [
          { type: 'reasoning', text: 'inner thought' },
          { type: 'text', text: 'answer' },
        ],
      });
      const parsed = {
        choices: [{ delta: { content: '<think>inner thought</think>answer' } }],
      };
      const text = handleParsed(parser, parsed);
      expect(text).toBe('answer');
      expect(parser.events).toContainEqual({ type: 'reasoning_delta', delta: 'inner thought' });
    });
  });
});
