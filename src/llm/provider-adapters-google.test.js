/**
 * Tests for src/llm/provider-adapters-google.js
 * Pure functions: buildGooglePayload, buildGoogleTools, buildGoogleToolConfig
 */
import { describe, expect, it } from 'vitest';
import { buildGooglePayload } from './provider-adapters-google.js';

describe('buildGooglePayload', () => {
  describe('empty / null input', () => {
    it('returns basic payload for empty messages array', () => {
      const result = buildGooglePayload([]);
      expect(result.contents).toEqual([]);
      expect(result.generationConfig).toEqual({});
    });

    it('returns basic payload when messages is undefined', () => {
      const result = buildGooglePayload(undefined);
      expect(result.contents).toEqual([]);
    });

    it('returns basic payload when messages is null', () => {
      const result = buildGooglePayload(null);
      expect(result.contents).toEqual([]);
    });
  });

  describe('system messages', () => {
    it('extracts system message as systemInstruction', () => {
      const result = buildGooglePayload([
        { role: 'system', content: 'You are a helpful assistant.' },
      ]);
      expect(result.contents).toEqual([]);
      expect(result.systemInstruction).toEqual({
        parts: [{ text: 'You are a helpful assistant.' }],
      });
    });

    it('concatenates multiple system messages', () => {
      const result = buildGooglePayload([
        { role: 'system', content: 'Part one.' },
        { role: 'system', content: 'Part two.' },
      ]);
      expect(result.systemInstruction).toEqual({
        parts: [{ text: 'Part one.\n\nPart two.' }],
      });
    });

    it('skips empty system content', () => {
      const result = buildGooglePayload([
        { role: 'system', content: '' },
        { role: 'system', content: 'Visible.' },
      ]);
      expect(result.systemInstruction).toEqual({
        parts: [{ text: 'Visible.' }],
      });
    });

    it('does not include systemInstruction when no system content', () => {
      const result = buildGooglePayload([
        { role: 'system', content: '' },
        { role: 'user', content: 'hello' },
      ]);
      expect(result.systemInstruction).toBeUndefined();
    });
  });

  describe('user messages', () => {
    it('converts string content to text part', () => {
      const result = buildGooglePayload([{ role: 'user', content: 'Hello world' }]);
      expect(result.contents).toEqual([{ role: 'user', parts: [{ text: 'Hello world' }] }]);
    });

    it('converts text part in content array', () => {
      const result = buildGooglePayload([
        { role: 'user', content: [{ type: 'text', text: 'Hello' }] },
      ]);
      expect(result.contents).toEqual([{ role: 'user', parts: [{ text: 'Hello' }] }]);
    });

    it('skips messages with no usable content', () => {
      const result = buildGooglePayload([
        { role: 'user', content: [] },
        { role: 'user', content: [{ type: 'image_url', image_url: { url: '' } }] },
      ]);
      expect(result.contents).toEqual([]);
    });

    it('maps user role to google role', () => {
      const result = buildGooglePayload([{ role: 'user', content: 'test' }]);
      expect(result.contents[0].role).toBe('user');
    });
  });

  describe('assistant messages', () => {
    it('converts string content to text part', () => {
      const result = buildGooglePayload([{ role: 'assistant', content: 'I can help.' }]);
      expect(result.contents).toEqual([{ role: 'model', parts: [{ text: 'I can help.' }] }]);
    });

    it('maps assistant role to model', () => {
      const result = buildGooglePayload([{ role: 'assistant', content: 'response' }]);
      expect(result.contents[0].role).toBe('model');
    });

    it('skips empty assistant content', () => {
      const result = buildGooglePayload([{ role: 'assistant', content: '' }]);
      expect(result.contents).toEqual([]);
    });

    it('handles message with no role', () => {
      const result = buildGooglePayload([{ content: 'fallback text' }]);
      expect(result.contents).toEqual([{ role: 'user', parts: [{ text: 'fallback text' }] }]);
    });

    it('handles message with empty role', () => {
      const result = buildGooglePayload([{ role: '', content: 'test' }]);
      expect(result.contents).toEqual([{ role: 'user', parts: [{ text: 'test' }] }]);
    });
  });

  describe('assistant messages with tool calls', () => {
    it('converts tool call to functionCall part', () => {
      const result = buildGooglePayload([
        {
          role: 'assistant',
          content: 'Let me check.',
          tool_calls: [
            {
              id: 'call_123',
              function: { name: 'get_weather', arguments: '{"city":"Boston"}' },
            },
          ],
        },
      ]);
      expect(result.contents).toEqual([
        {
          role: 'model',
          parts: [
            { text: 'Let me check.' },
            {
              functionCall: {
                name: 'get_weather',
                args: { city: 'Boston' },
              },
            },
          ],
        },
      ]);
    });

    it('skips tool calls with empty name', () => {
      const result = buildGooglePayload([
        {
          role: 'assistant',
          content: 'Check.',
          tool_calls: [
            { id: 'call_1', function: { name: '', arguments: '{}' } },
            { id: 'call_2', function: { name: 'valid_tool', arguments: '{}' } },
          ],
        },
      ]);
      expect(result.contents[0].parts).toHaveLength(2); // text + 1 valid tool
      expect(result.contents[0].parts[1].functionCall.name).toBe('valid_tool');
    });

    it('parses JSON arguments from string', () => {
      const result = buildGooglePayload([
        {
          role: 'assistant',
          content: '',
          tool_calls: [
            {
              id: 'call_1',
              function: { name: 'search', arguments: '{"query":"test","limit":5}' },
            },
          ],
        },
      ]);
      expect(result.contents[0].parts[0].functionCall.args).toEqual({
        query: 'test',
        limit: 5,
      });
    });

    it('keeps raw arguments on JSON parse failure', () => {
      const result = buildGooglePayload([
        {
          role: 'assistant',
          content: '',
          tool_calls: [
            {
              id: 'call_1',
              function: { name: 'search', arguments: 'not valid json' },
            },
          ],
        },
      ]);
      expect(result.contents[0].parts[0].functionCall.args).toBe('not valid json');
    });

    it('skips message when no text and no valid tool calls', () => {
      const result = buildGooglePayload([
        {
          role: 'assistant',
          content: '',
          tool_calls: [{ id: 'call_1', function: { name: '', arguments: '{}' } }],
        },
      ]);
      expect(result.contents).toEqual([]);
    });

    it('attaches thoughtSignature from providerMetadata.google', () => {
      const result = buildGooglePayload([
        {
          role: 'assistant',
          content: '',
          tool_calls: [
            {
              id: 'call_1',
              function: { name: 'think', arguments: '{}' },
              providerMetadata: { google: { thoughtSignature: 'reasoning here' } },
            },
          ],
        },
      ]);
      expect(result.contents[0].parts[0].thoughtSignature).toBe('reasoning here');
    });

    it('attaches thoughtSignature from providerMetadata.vertex', () => {
      const result = buildGooglePayload([
        {
          role: 'assistant',
          content: '',
          tool_calls: [
            {
              id: 'call_1',
              function: { name: 'think', arguments: '{}' },
              providerMetadata: { vertex: { thoughtSignature: 'vertex thought' } },
            },
          ],
        },
      ]);
      expect(result.contents[0].parts[0].thoughtSignature).toBe('vertex thought');
    });

    it('attaches thoughtSignature from providerOptions.google', () => {
      const result = buildGooglePayload([
        {
          role: 'assistant',
          content: '',
          tool_calls: [
            {
              id: 'call_1',
              function: { name: 'think', arguments: '{}' },
              providerOptions: { google: { thoughtSignature: 'options thought' } },
            },
          ],
        },
      ]);
      expect(result.contents[0].parts[0].thoughtSignature).toBe('options thought');
    });
  });

  describe('tool messages', () => {
    it('converts tool result to user functionResponse', () => {
      const result = buildGooglePayload([
        {
          role: 'tool',
          tool_call_id: 'call_123',
          name: 'get_weather',
          content: 'Sunny, 72°F',
        },
      ]);
      expect(result.contents).toEqual([
        {
          role: 'user',
          parts: [
            {
              functionResponse: {
                name: 'get_weather',
                response: { name: 'get_weather', content: 'Sunny, 72°F' },
              },
            },
          ],
        },
      ]);
    });

    it('falls back to name lookup when name is missing', () => {
      const result = buildGooglePayload([
        {
          role: 'assistant',
          content: '',
          tool_calls: [{ id: 'call_abc', function: { name: 'weather_tool', arguments: '{}' } }],
        },
        {
          role: 'tool',
          tool_call_id: 'call_abc',
          content: 'Result',
        },
      ]);
      expect(result.contents[1].parts[0].functionResponse.name).toBe('weather_tool');
    });

    it('uses "tool" as default name when no name or id match', () => {
      const result = buildGooglePayload([
        {
          role: 'tool',
          tool_call_id: 'call_unknown',
          content: 'some result',
        },
      ]);
      expect(result.contents[0].parts[0].functionResponse.name).toBe('tool');
    });
  });

  describe('image handling', () => {
    it('converts base64 data URL to inlineData', () => {
      const result = buildGooglePayload([
        {
          role: 'user',
          content: [
            {
              type: 'image_url',
              image_url: { url: 'data:image/png;base64,abc123xyz==' },
            },
          ],
        },
      ]);
      expect(result.contents[0].parts[0]).toEqual({
        inlineData: { mimeType: 'image/png', data: 'abc123xyz==' },
      });
    });

    it('converts non-base64 data URL to fileUri', () => {
      const result = buildGooglePayload([
        {
          role: 'user',
          content: [
            {
              type: 'image_url',
              image_url: { url: 'https://example.com/image.png' },
            },
          ],
        },
      ]);
      expect(result.contents[0].parts[0]).toEqual({
        fileData: { fileUri: 'https://example.com/image.png', mimeType: 'image/*' },
      });
    });

    it('skips empty image_url', () => {
      const result = buildGooglePayload([
        {
          role: 'user',
          content: [{ type: 'image_url', image_url: { url: '' } }],
        },
      ]);
      expect(result.contents).toEqual([]);
    });
  });

  describe('tools option', () => {
    it('includes tools when provided', () => {
      const tools = [
        {
          type: 'function',
          function: {
            name: 'get_weather',
            description: 'Get weather',
            parameters: { type: 'object', properties: {} },
          },
        },
      ];
      const result = buildGooglePayload([], { tools });
      expect(result.tools).toBeDefined();
      expect(result.tools[0].functionDeclarations).toHaveLength(1);
      expect(result.tools[0].functionDeclarations[0].name).toBe('get_weather');
      expect(result.tools[0].functionDeclarations[0].description).toBe('Get weather');
      // parameters normalized to undefined for empty object schema at root
      expect(result.tools[0].functionDeclarations[0].parameters).toBeUndefined();
    });

    it('skips tools without function name', () => {
      const tools = [
        { type: 'function', function: { name: '', description: 'Empty' } },
        { type: 'function', function: { name: 'valid', description: 'Valid' } },
      ];
      const result = buildGooglePayload([], { tools });
      expect(result.tools[0].functionDeclarations).toHaveLength(1);
      expect(result.tools[0].functionDeclarations[0].name).toBe('valid');
    });

    it('returns undefined tools when array is empty', () => {
      const result = buildGooglePayload([], { tools: [] });
      expect(result.tools).toBeUndefined();
    });

    it('returns undefined tools when not an array', () => {
      const result = buildGooglePayload([], { tools: null });
      expect(result.tools).toBeUndefined();
    });
  });

  describe('toolChoice option', () => {
    it('sets toolConfig for auto', () => {
      const result = buildGooglePayload([], { toolChoice: 'auto' });
      expect(result.toolConfig).toEqual({
        functionCallingConfig: { mode: 'AUTO' },
      });
    });

    it('sets toolConfig for none', () => {
      const result = buildGooglePayload([], { toolChoice: 'none' });
      expect(result.toolConfig).toEqual({
        functionCallingConfig: { mode: 'NONE' },
      });
    });

    it('sets toolConfig for required', () => {
      const result = buildGooglePayload([], { toolChoice: 'required' });
      expect(result.toolConfig).toEqual({
        functionCallingConfig: { mode: 'ANY' },
      });
    });

    it('sets toolConfig for specific tool by name', () => {
      const result = buildGooglePayload([], { toolChoice: { type: 'tool', toolName: 'my_tool' } });
      expect(result.toolConfig).toEqual({
        functionCallingConfig: { mode: 'ANY', allowedFunctionNames: ['my_tool'] },
      });
    });

    it('ignores unknown toolChoice string', () => {
      const result = buildGooglePayload([], { toolChoice: 'unknown_mode' });
      expect(result.toolConfig).toBeUndefined();
    });

    it('ignores empty toolChoice object', () => {
      const result = buildGooglePayload([], { toolChoice: { type: '' } });
      expect(result.toolConfig).toBeUndefined();
    });

    it('ignores toolChoice with function type but no name', () => {
      const result = buildGooglePayload([], { toolChoice: { type: 'function' } });
      expect(result.toolConfig).toBeUndefined();
    });
  });

  describe('generationConfig', () => {
    it('sets generationConfig when stream is not false', () => {
      const result = buildGooglePayload([]);
      expect(result.generationConfig).toEqual({});
    });

    it('omits generationConfig when stream is false', () => {
      const result = buildGooglePayload([], { stream: false });
      expect(result.generationConfig).toBeUndefined();
    });
  });

  describe('mixed conversation flow', () => {
    it('handles full user → assistant → tool → assistant flow', () => {
      const result = buildGooglePayload([
        { role: 'user', content: 'What is the weather?' },
        {
          role: 'assistant',
          content: 'Let me check.',
          tool_calls: [{ id: 'call_1', function: { name: 'weather', arguments: '{}' } }],
        },
        {
          role: 'tool',
          tool_call_id: 'call_1',
          name: 'weather',
          content: 'Sunny, 75°F',
        },
        { role: 'assistant', content: 'It is sunny and 75°F.' },
      ]);
      expect(result.contents).toHaveLength(4);
      expect(result.contents[0].role).toBe('user');
      expect(result.contents[1].role).toBe('model');
      expect(result.contents[1].parts[1].functionCall.name).toBe('weather');
      expect(result.contents[2].role).toBe('user');
      expect(result.contents[3].role).toBe('model');
    });
  });

  describe('content part types', () => {
    it('skips null parts in content array', () => {
      const result = buildGooglePayload([
        { role: 'user', content: [null, { type: 'text', text: 'valid' }] },
      ]);
      expect(result.contents[0].parts[0].text).toBe('valid');
    });

    it('skips parts with no recognized type', () => {
      const result = buildGooglePayload([
        {
          role: 'user',
          content: [
            { type: 'unknown', data: 'x' },
            { type: 'text', text: 'ok' },
          ],
        },
      ]);
      expect(result.contents[0].parts[0].text).toBe('ok');
    });

    it('handles file part type', () => {
      const result = buildGooglePayload([
        {
          role: 'user',
          content: [{ type: 'file', file: { file_data: 'data:text/plain;base64,SGVsbG8=' } }],
        },
      ]);
      expect(result.contents[0].parts[0]).toEqual({
        inlineData: { mimeType: 'text/plain', data: 'SGVsbG8=' },
      });
    });
  });

  describe('normalizeToolParameters option', () => {
    it('uses custom normalizer when provided', () => {
      const customNormalize = (input) => ({ type: 'custom', value: input });
      const tools = [
        {
          type: 'function',
          function: { name: 'test', description: 'desc', parameters: { foo: 'bar' } },
        },
      ];
      const result = buildGooglePayload([], { tools, normalizeToolParameters: customNormalize });
      expect(result.tools[0].functionDeclarations[0].parameters).toEqual({
        type: 'custom',
        value: { foo: 'bar' },
      });
    });
  });
});
