/**
 * Tests for src/llm/stream-parser-handler.js
 * Tests: handleParsed with Google, Anthropic, and OpenAI stream formats.
 * Uses real stream-parser-utils (extractTextFromGoogle, extractTextFromAnthropic).
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { handleParsed } from './stream-parser-handler.js';

function makeParser() {
  return {
    _emit: vi.fn(),
    _emitTextDelta: vi.fn(),
    _emitReasoningDelta: vi.fn(),
    _hasToolCalls: false,
    _googleToolCallIndex: 0,
    _anthropicToolCalls: new Map(),
    _extractTaggedSegments: (text) => {
      // Default: return text as single text segment
      if (!text) return [];
      return [{ type: 'text', text }];
    },
  };
}

describe('handleParsed', () => {
  let parser;

  beforeEach(() => {
    parser = makeParser();
  });

  describe('Google candidate format', () => {
    it('emits text delta from Google candidates', () => {
      const parsed = {
        candidates: [
          {
            content: {
              parts: [{ text: 'Hello from Google' }],
            },
            finishReason: 'stop',
          },
        ],
      };
      handleParsed(parser, parsed);
      expect(parser._emitTextDelta).toHaveBeenCalledWith('Hello from Google');
    });

    it('emits tool calls from Google functionCall parts', () => {
      const parsed = {
        candidates: [
          {
            content: {
              parts: [
                { text: 'Thinking...' },
                {
                  functionCall: {
                    name: 'get_weather',
                    args: { city: 'Boston' },
                  },
                },
              ],
            },
            finishReason: 'tool_calls',
          },
        ],
      };
      handleParsed(parser, parsed);
      expect(parser._emit).toHaveBeenCalledWith({
        type: 'tool_call_delta',
        tool_calls: [
          expect.objectContaining({
            id: 'google_tool_1',
            function: {
              name: 'get_weather',
              arguments: '{"city":"Boston"}',
            },
          }),
        ],
      });
    });

    it('attaches thoughtSignature from Google part', () => {
      const parsed = {
        candidates: [
          {
            content: {
              parts: [
                {
                  functionCall: { name: 'think', args: {} },
                  thoughtSignature: 'reasoning here',
                },
              ],
            },
          },
        ],
      };
      handleParsed(parser, parsed);
      const call = parser._emit.mock.calls.find((c) => c[0].type === 'tool_call_delta');
      expect(call[0].tool_calls[0].providerMetadata.google.thoughtSignature).toBe('reasoning here');
    });

    it('emits finish_reason for Google stop', () => {
      const parsed = {
        candidates: [
          {
            content: { parts: [{ text: 'done' }] },
            finishReason: 'STOP',
          },
        ],
      };
      handleParsed(parser, parsed);
      expect(parser._emit).toHaveBeenCalledWith({
        type: 'finish_reason',
        reason: 'stop',
      });
    });

    it('handles finish_reason from snake_case variant', () => {
      const parsed = {
        candidates: [
          {
            content: { parts: [{ text: 'done' }] },
            finish_reason: 'stop',
          },
        ],
      };
      handleParsed(parser, parsed);
      expect(parser._emit).toHaveBeenCalledWith({
        type: 'finish_reason',
        reason: 'stop',
      });
    });

    it('returns accumulated text', () => {
      const parsed = {
        candidates: [
          {
            content: { parts: [{ text: 'Part1' }, { text: 'Part2' }] },
          },
        ],
      };
      const result = handleParsed(parser, parsed);
      expect(typeof result).toBe('string');
    });

    it('skips empty parts in Google content', () => {
      const parsed = {
        candidates: [
          {
            content: { parts: [{ text: '' }] },
          },
        ],
      };
      handleParsed(parser, parsed);
      expect(parser._emitTextDelta).not.toHaveBeenCalled();
    });

    it('handles null candidates array', () => {
      const parsed = { candidates: null };
      handleParsed(parser, parsed);
      expect(parser._emitTextDelta).not.toHaveBeenCalled();
    });
  });

  describe('Anthropic content_block_start', () => {
    it('emits tool call for tool_use block', () => {
      const parsed = {
        type: 'content_block_start',
        index: 0,
        content_block: {
          type: 'tool_use',
          id: 'tool_use_1',
          name: 'get_weather',
          input: { city: 'NYC' },
        },
      };
      handleParsed(parser, parsed);
      expect(parser._emit).toHaveBeenCalledWith({
        type: 'tool_call_delta',
        tool_calls: [
          expect.objectContaining({
            id: 'tool_use_1',
            function: expect.objectContaining({ name: 'get_weather' }),
          }),
        ],
      });
    });

    it('emits tool call for mcp_tool_use block', () => {
      const parsed = {
        type: 'content_block_start',
        index: 2,
        content_block: {
          type: 'mcp_tool_use',
          id: 'mcp_1',
          name: 'mcp_tool',
          input: { query: 'test' },
        },
      };
      handleParsed(parser, parsed);
      expect(parser._emit).toHaveBeenCalledWith({
        type: 'tool_call_delta',
        tool_calls: [
          expect.objectContaining({
            index: 2,
            id: 'mcp_1',
            function: expect.objectContaining({ name: 'mcp_tool' }),
          }),
        ],
      });
    });

    it('uses default index when missing', () => {
      const parsed = {
        type: 'content_block_start',
        content_block: { type: 'tool_use', name: 'tool', input: {} },
      };
      handleParsed(parser, parsed);
      expect(parser._emit).toHaveBeenCalledWith(
        expect.objectContaining({ tool_calls: [expect.objectContaining({ index: 0 })] })
      );
    });
  });

  describe('Anthropic content_block_delta', () => {
    it('accumulates input_json_delta into tool call', () => {
      const parsed = {
        type: 'content_block_delta',
        index: 0,
        delta: { type: 'input_json_delta', partial_json: '{"arg1"' },
      };
      handleParsed(parser, parsed);

      parsed.delta.partial_json = ':"value"}';
      handleParsed(parser, parsed);

      const toolCall = parser._anthropicToolCalls.get(0);
      expect(toolCall.function.arguments).toBe('{"arg1":"value"}');
    });

    it('emits partial tool call delta', () => {
      const parsed = {
        type: 'content_block_delta',
        index: 1,
        delta: { type: 'input_json_delta', partial_json: '"hello"' },
      };
      handleParsed(parser, parsed);
      expect(parser._emit).toHaveBeenCalledWith({
        type: 'tool_call_delta',
        tool_calls: [
          {
            index: 1,
            id: 'anthropic_tool_1',
            function: { arguments: '"hello"' },
          },
        ],
      });
    });

    it('ignores non-input_json_delta deltas', () => {
      const parsed = {
        type: 'content_block_delta',
        delta: { type: 'text_delta', text: 'some text' },
      };
      handleParsed(parser, parsed);
      expect(parser._emit).not.toHaveBeenCalled();
    });
  });

  describe('Anthropic message_delta and message_stop', () => {
    it('extracts text from content_block_delta', () => {
      parser._extractTaggedSegments = (text) => [{ type: 'text', text }];
      const parsed = {
        type: 'content_block_delta',
        delta: { type: 'text_delta', text: 'streaming text' },
      };
      handleParsed(parser, parsed);
      expect(parser._emitTextDelta).toHaveBeenCalledWith('streaming text');
    });

    it('emits finish_reason from message_delta stop_reason', () => {
      const parsed = {
        type: 'message_delta',
        delta: { stop_reason: 'end_turn' },
      };
      handleParsed(parser, parsed);
      expect(parser._emit).toHaveBeenCalledWith({
        type: 'finish_reason',
        reason: 'stop',
      });
    });

    it('emits stop finish_reason for message_stop', () => {
      const parsed = { type: 'message_stop' };
      handleParsed(parser, parsed);
      expect(parser._emit).toHaveBeenCalledWith({
        type: 'finish_reason',
        reason: 'stop',
      });
    });
  });

  describe('OpenAI / generic delta format', () => {
    it('extracts text from choices[0].delta.content', () => {
      parser._extractTaggedSegments = (text) => [{ type: 'text', text }];
      const parsed = {
        choices: [{ delta: { content: 'OpenAI text' } }],
      };
      handleParsed(parser, parsed);
      expect(parser._emitTextDelta).toHaveBeenCalledWith('OpenAI text');
    });

    it('extracts text from response field (via parsed.response, not delta.response)', () => {
      parser._extractTaggedSegments = (text) => [{ type: 'text', text }];
      // Code reads parsed?.response, NOT parsed.choices[0].delta.response
      const parsed = {
        response: 'response field text',
        choices: [{ delta: {} }],
      };
      handleParsed(parser, parsed);
      expect(parser._emitTextDelta).toHaveBeenCalledWith('response field text');
    });

    it('extracts text from choices[0].text', () => {
      parser._extractTaggedSegments = (text) => [{ type: 'text', text }];
      const parsed = {
        choices: [{ text: 'legacy text' }],
      };
      handleParsed(parser, parsed);
      expect(parser._emitTextDelta).toHaveBeenCalledWith('legacy text');
    });
    it('extracts text from choices[0].message.content', () => {
      parser._extractTaggedSegments = (text) => [{ type: 'text', text }];
      const parsed = {
        choices: [{ message: { content: 'message content' } }],
      };
      handleParsed(parser, parsed);
      expect(parser._emitTextDelta).toHaveBeenCalledWith('message content');
    });

    it('extracts from choices[0].message.content', () => {
      parser._extractTaggedSegments = (text) => [{ type: 'text', text }];
      const parsed = {
        choices: [{ message: { content: 'message content' } }],
      };
      handleParsed(parser, parsed);
      expect(parser._emitTextDelta).toHaveBeenCalledWith('message content');
    });

    it('extracts from choices[0].text', () => {
      parser._extractTaggedSegments = (text) => [{ type: 'text', text }];
      const parsed = {
        choices: [{ text: 'legacy text' }],
      };
      handleParsed(parser, parsed);
      expect(parser._emitTextDelta).toHaveBeenCalledWith('legacy text');
    });

    it('emits reasoning delta from reasoning field', () => {
      const parsed = {
        choices: [{ delta: { reasoning: 'thinking...' } }],
      };
      handleParsed(parser, parsed);
      expect(parser._emitReasoningDelta).toHaveBeenCalledWith('thinking...');
    });

    it('emits reasoning delta from thinking field', () => {
      const parsed = {
        choices: [{ delta: { thinking: 'thought process' } }],
      };
      handleParsed(parser, parsed);
      expect(parser._emitReasoningDelta).toHaveBeenCalledWith('thought process');
    });

    it('emits reasoning delta from reasoning_content field', () => {
      const parsed = {
        choices: [{ delta: { reasoning_content: 'reasoning content' } }],
      };
      handleParsed(parser, parsed);
      expect(parser._emitReasoningDelta).toHaveBeenCalledWith('reasoning content');
    });

    it('emits tool calls from delta.tool_calls', () => {
      const parsed = {
        choices: [
          {
            delta: {
              tool_calls: [
                {
                  index: 0,
                  id: 'call_1',
                  function: { name: 'search', arguments: '{}' },
                },
              ],
            },
          },
        ],
      };
      handleParsed(parser, parsed);
      expect(parser._emit).toHaveBeenCalledWith({
        type: 'tool_call_delta',
        tool_calls: [
          {
            index: 0,
            id: 'call_1',
            function: { name: 'search', arguments: '{}' },
          },
        ],
      });
    });

    it('emits finish_reason from choices[0].finish_reason', () => {
      const parsed = {
        choices: [{ finish_reason: 'length' }],
      };
      handleParsed(parser, parsed);
      expect(parser._emit).toHaveBeenCalledWith({
        type: 'finish_reason',
        reason: 'length',
      });
    });
  });

  describe('tagged segment extraction', () => {
    it('routes reasoning segments to _emitReasoningDelta', () => {
      parser._extractTaggedSegments = (text) => [
        { type: 'reasoning', text: '<reasoning>thought process</reasoning>' },
        { type: 'text', text: 'final answer' },
      ];
      const parsed = {
        choices: [{ delta: { content: 'mixed' } }],
      };
      handleParsed(parser, parsed);
      expect(parser._emitReasoningDelta).toHaveBeenCalledWith(
        '<reasoning>thought process</reasoning>'
      );
      expect(parser._emitTextDelta).toHaveBeenCalledWith('final answer');
    });

    it('skips segments without text', () => {
      parser._extractTaggedSegments = (text) => [
        null,
        { type: 'text', text: '' },
        { type: 'text', text: 'valid' },
      ];
      const parsed = {
        choices: [{ delta: { content: 'x' } }],
      };
      handleParsed(parser, parsed);
      expect(parser._emitTextDelta).toHaveBeenCalledTimes(1);
    });

    it('handles array content with tagged segments', () => {
      parser._extractTaggedSegments = (text) => [{ type: 'text', text }];
      const parsed = {
        choices: [
          {
            delta: {
              content: [
                { type: 'text', text: 'hello' },
                { type: 'text', text: 'world' },
              ],
            },
          },
        ],
      };
      handleParsed(parser, parsed);
      expect(parser._emitTextDelta).toHaveBeenCalledTimes(2);
    });
  });

  describe('normalizeFinishReason edge cases', () => {
    it('returns tool_calls when _hasToolCalls is true', () => {
      parser._hasToolCalls = true;
      const parsed = {
        choices: [{ finish_reason: 'stop' }],
      };
      handleParsed(parser, parsed);
      expect(parser._emit).toHaveBeenCalledWith({
        type: 'finish_reason',
        reason: 'tool_calls',
      });
    });

    it('maps stop_sequence to stop', () => {
      const parsed = {
        choices: [{ finish_reason: 'stop_sequence' }],
      };
      handleParsed(parser, parsed);
      expect(parser._emit).toHaveBeenCalledWith({
        type: 'finish_reason',
        reason: 'stop',
      });
    });

    it('maps max_tokens to length', () => {
      const parsed = {
        choices: [{ finish_reason: 'max_tokens' }],
      };
      handleParsed(parser, parsed);
      expect(parser._emit).toHaveBeenCalledWith({
        type: 'finish_reason',
        reason: 'length',
      });
    });

    it('maps length to length', () => {
      const parsed = {
        choices: [{ finish_reason: 'length' }],
      };
      handleParsed(parser, parsed);
      expect(parser._emit).toHaveBeenCalledWith({
        type: 'finish_reason',
        reason: 'length',
      });
    });

    it('returns value as-is for unknown finish reasons', () => {
      const parsed = {
        choices: [{ finish_reason: 'unknown_reason' }],
      };
      handleParsed(parser, parsed);
      expect(parser._emit).toHaveBeenCalledWith({
        type: 'finish_reason',
        reason: 'unknown_reason',
      });
    });

    it('normalizes finish reason containing tool', () => {
      const parsed = {
        choices: [{ finish_reason: 'tool_use' }],
      };
      handleParsed(parser, parsed);
      expect(parser._emit).toHaveBeenCalledWith({
        type: 'finish_reason',
        reason: 'tool_calls',
      });
    });
  });

  describe('fallback text from type/delta', () => {
    it('extracts text from parsed.delta string', () => {
      parser._extractTaggedSegments = (text) => [{ type: 'text', text }];
      const parsed = {
        type: 'unknown_event',
        delta: 'fallback text',
      };
      handleParsed(parser, parsed);
      expect(parser._emitTextDelta).toHaveBeenCalledWith('fallback text');
    });

    it('extracts text from parsed.text string', () => {
      parser._extractTaggedSegments = (text) => [{ type: 'text', text }];
      const parsed = {
        type: 'custom_event',
        text: 'direct text field',
      };
      handleParsed(parser, parsed);
      expect(parser._emitTextDelta).toHaveBeenCalledWith('direct text field');
    });

    it('ignores empty string delta', () => {
      parser._extractTaggedSegments = (text) => [{ type: 'text', text }];
      const parsed = {
        type: 'custom_event',
        delta: '',
      };
      handleParsed(parser, parsed);
      expect(parser._emitTextDelta).not.toHaveBeenCalled();
    });
  });
});
