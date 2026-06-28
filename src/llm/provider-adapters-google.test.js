import { describe, expect, it, vi } from 'vitest';
import { buildGooglePayload } from './provider-adapters-google.js';

describe('provider-adapters-google', () => {
  describe('buildGooglePayload', () => {
    it('builds basic payload from user and assistant messages', () => {
      const messages = [
        { role: 'user', content: 'Hello' },
        { role: 'assistant', content: 'Hi there' },
      ];
      const payload = buildGooglePayload(messages);
      expect(payload.contents).toEqual([
        { role: 'user', parts: [{ text: 'Hello' }] },
        { role: 'model', parts: [{ text: 'Hi there' }] },
      ]);
    });

    it('maps assistant role to model role', () => {
      const messages = [{ role: 'assistant', content: 'response' }];
      const payload = buildGooglePayload(messages);
      expect(payload.contents[0].role).toBe('model');
    });

    it('handles system messages as systemInstruction', () => {
      const messages = [
        { role: 'system', content: 'You are a helpful assistant.' },
        { role: 'user', content: 'Hi' },
      ];
      const payload = buildGooglePayload(messages);
      expect(payload.systemInstruction).toEqual({
        parts: [{ text: 'You are a helpful assistant.' }],
      });
    });

    it('joins multiple system messages', () => {
      const messages = [
        { role: 'system', content: 'Rule 1' },
        { role: 'system', content: 'Rule 2' },
        { role: 'user', content: 'Hi' },
      ];
      const payload = buildGooglePayload(messages);
      expect(payload.systemInstruction.parts[0].text).toBe('Rule 1\n\nRule 2');
    });

    it('skips empty system messages', () => {
      const messages = [
        { role: 'system', content: '' },
        { role: 'user', content: 'Hi' },
      ];
      const payload = buildGooglePayload(messages);
      expect(payload.systemInstruction).toBeUndefined();
    });

    it('handles tool_calls from assistant', () => {
      const messages = [
        {
          role: 'assistant',
          content: null,
          tool_calls: [
            {
              id: 'call_1',
              function: { name: 'get_weather', arguments: '{"city":"SF"}' },
            },
          ],
        },
      ];
      const payload = buildGooglePayload(messages);
      const part = payload.contents[0].parts[0];
      expect(part.functionCall).toBeDefined();
      expect(part.functionCall.name).toBe('get_weather');
      expect(part.functionCall.args).toEqual({ city: 'SF' });
    });

    it('parses string arguments to JSON', () => {
      const messages = [
        {
          role: 'assistant',
          tool_calls: [{ id: 'call_1', function: { name: 'search', arguments: '{"q":"test"}' } }],
        },
      ];
      const payload = buildGooglePayload(messages);
      expect(payload.contents[0].parts[0].functionCall.args).toEqual({ q: 'test' });
    });

    it('handles non-JSON arguments gracefully', () => {
      const messages = [
        {
          role: 'assistant',
          tool_calls: [{ id: 'call_1', function: { name: 'search', arguments: 'not-json' } }],
        },
      ];
      const payload = buildGooglePayload(messages);
      expect(payload.contents[0].parts[0].functionCall.args).toBe('not-json');
    });

    it('handles object arguments directly', () => {
      const messages = [
        {
          role: 'assistant',
          tool_calls: [{ id: 'call_1', function: { name: 'search', arguments: { q: 'test' } } }],
        },
      ];
      const payload = buildGooglePayload(messages);
      expect(payload.contents[0].parts[0].functionCall.args).toEqual({ q: 'test' });
    });

    it('includes thoughtSignature from providerMetadata', () => {
      const messages = [
        {
          role: 'assistant',
          tool_calls: [
            {
              id: 'call_1',
              function: { name: 'fn', arguments: '{}' },
              providerMetadata: { google: { thoughtSignature: 'sig1' } },
            },
          ],
        },
      ];
      const payload = buildGooglePayload(messages);
      expect(payload.contents[0].parts[0].thoughtSignature).toBe('sig1');
    });

    it('includes thoughtSignature from providerOptions', () => {
      const messages = [
        {
          role: 'assistant',
          tool_calls: [
            {
              id: 'call_1',
              function: { name: 'fn', arguments: '{}' },
              providerOptions: { google: { thoughtSignature: 'sig2' } },
            },
          ],
        },
      ];
      const payload = buildGooglePayload(messages);
      expect(payload.contents[0].parts[0].thoughtSignature).toBe('sig2');
    });

    it('handles tool response messages', () => {
      const messages = [
        {
          role: 'assistant',
          tool_calls: [{ id: 'call_1', function: { name: 'get_weather' } }],
        },
        { role: 'tool', tool_call_id: 'call_1', name: 'get_weather', content: 'Sunny, 72F' },
      ];
      const payload = buildGooglePayload(messages);
      const toolResponse = payload.contents[1];
      expect(toolResponse.role).toBe('user');
      expect(toolResponse.parts[0].functionResponse.name).toBe('get_weather');
      expect(toolResponse.parts[0].functionResponse.response.content).toBe('Sunny, 72F');
    });

    it('resolves tool name from toolCallNameMap when name missing', () => {
      const messages = [
        {
          role: 'assistant',
          tool_calls: [{ id: 'tc_42', function: { name: 'lookup' } }],
        },
        { role: 'tool', tool_call_id: 'tc_42', content: 'result' },
      ];
      const payload = buildGooglePayload(messages);
      const toolResponse = payload.contents[1];
      expect(toolResponse.parts[0].functionResponse.name).toBe('lookup');
    });

    it('falls back to "tool" as default name for tool messages', () => {
      const messages = [{ role: 'tool', content: 'result' }];
      const payload = buildGooglePayload(messages);
      expect(payload.contents[0].parts[0].functionResponse.name).toBe('tool');
    });

    it('builds tools from options.tools', () => {
      const messages = [{ role: 'user', content: 'hi' }];
      const options = {
        tools: [
          {
            type: 'function',
            function: {
              name: 'get_weather',
              description: 'Get weather',
              parameters: { type: 'object', properties: { city: { type: 'string' } } },
            },
          },
        ],
      };
      const payload = buildGooglePayload(messages, options);
      expect(payload.tools).toBeDefined();
      expect(payload.tools[0].functionDeclarations).toHaveLength(1);
      expect(payload.tools[0].functionDeclarations[0].name).toBe('get_weather');
    });

    it('skips tools that are not type function', () => {
      const messages = [{ role: 'user', content: 'hi' }];
      const options = {
        tools: [{ type: 'retrieval' }],
      };
      const payload = buildGooglePayload(messages, options);
      expect(payload.tools).toBeUndefined();
    });

    it('skips tools without function name', () => {
      const messages = [{ role: 'user', content: 'hi' }];
      const options = {
        tools: [{ type: 'function', function: { name: '', description: 'empty name' } }],
      };
      const payload = buildGooglePayload(messages, options);
      expect(payload.tools).toBeUndefined();
    });

    it('builds toolConfig for auto choice', () => {
      const messages = [{ role: 'user', content: 'hi' }];
      const payload = buildGooglePayload(messages, { toolChoice: 'auto' });
      expect(payload.toolConfig).toEqual({ functionCallingConfig: { mode: 'AUTO' } });
    });

    it('builds toolConfig for none choice', () => {
      const messages = [{ role: 'user', content: 'hi' }];
      const payload = buildGooglePayload(messages, { toolChoice: 'none' });
      expect(payload.toolConfig).toEqual({ functionCallingConfig: { mode: 'NONE' } });
    });

    it('builds toolConfig for required choice', () => {
      const messages = [{ role: 'user', content: 'hi' }];
      const payload = buildGooglePayload(messages, { toolChoice: 'required' });
      expect(payload.toolConfig).toEqual({ functionCallingConfig: { mode: 'ANY' } });
    });

    it('builds toolConfig for specific tool choice', () => {
      const messages = [{ role: 'user', content: 'hi' }];
      const payload = buildGooglePayload(messages, {
        toolChoice: { type: 'tool', toolName: 'get_weather' },
      });
      expect(payload.toolConfig).toEqual({
        functionCallingConfig: { mode: 'ANY', allowedFunctionNames: ['get_weather'] },
      });
    });

    it('omits toolConfig when no toolChoice', () => {
      const messages = [{ role: 'user', content: 'hi' }];
      const payload = buildGooglePayload(messages);
      expect(payload.toolConfig).toBeUndefined();
    });

    it('includes generationConfig when stream is not false', () => {
      const messages = [{ role: 'user', content: 'hi' }];
      const payload = buildGooglePayload(messages);
      expect(payload.generationConfig).toEqual({});
    });

    it('omits generationConfig when stream is false', () => {
      const messages = [{ role: 'user', content: 'hi' }];
      const payload = buildGooglePayload(messages, { stream: false });
      expect(payload.generationConfig).toBeUndefined();
    });

    it('handles image_url content with data URL', () => {
      const messages = [
        {
          role: 'user',
          content: [
            { type: 'text', text: 'Describe this image' },
            {
              type: 'image_url',
              image_url: { url: 'data:image/png;base64,abc123' },
            },
          ],
        },
      ];
      const payload = buildGooglePayload(messages);
      expect(payload.contents[0].parts).toEqual([
        { text: 'Describe this image' },
        { inlineData: { mimeType: 'image/png', data: 'abc123' } },
      ]);
    });

    it('handles image_url content with regular URL as fileData', () => {
      const messages = [
        {
          role: 'user',
          content: [
            {
              type: 'image_url',
              image_url: { url: 'https://example.com/image.png' },
            },
          ],
        },
      ];
      const payload = buildGooglePayload(messages);
      expect(payload.contents[0].parts).toEqual([
        { fileData: { fileUri: 'https://example.com/image.png', mimeType: 'image/*' } },
      ]);
    });

    it('handles file content type', () => {
      const messages = [
        {
          role: 'user',
          content: [
            {
              type: 'file',
              file: { file_data: 'data:application/pdf;base64,ZGF0YQ==' },
            },
          ],
        },
      ];
      const payload = buildGooglePayload(messages);
      expect(payload.contents[0].parts[0].inlineData.mimeType).toBe('application/pdf');
    });

    it('skips empty messages', () => {
      const messages = [
        { role: 'user', content: '' },
        { role: 'user', content: 'actual content' },
      ];
      const payload = buildGooglePayload(messages);
      expect(payload.contents).toHaveLength(1);
    });

    it('handles messages with unknown roles by including as user', () => {
      const messages = [{ role: 'function', content: 'result data' }];
      const payload = buildGooglePayload(messages);
      expect(payload.contents[0].role).toBe('user');
    });

    it('handles null messages', () => {
      const payload = buildGooglePayload(null);
      expect(payload.contents).toEqual([]);
    });

    it('uses custom normalizeToolParameters from options', () => {
      const customNormalize = vi.fn(() => ({ type: 'object' }));
      const messages = [{ role: 'user', content: 'hi' }];
      const options = {
        tools: [
          {
            type: 'function',
            function: { name: 'test', description: 'desc', parameters: { type: 'string' } },
          },
        ],
        normalizeToolParameters: customNormalize,
      };
      buildGooglePayload(messages, options);
      expect(customNormalize).toHaveBeenCalledWith({ type: 'string' });
    });

    it('handles assistant with both content and tool_calls', () => {
      const messages = [
        {
          role: 'assistant',
          content: 'Let me check',
          tool_calls: [{ id: 'call_1', function: { name: 'lookup', arguments: '{}' } }],
        },
      ];
      const payload = buildGooglePayload(messages);
      const parts = payload.contents[0].parts;
      expect(parts).toHaveLength(2);
      expect(parts[0].text).toBe('Let me check');
      expect(parts[1].functionCall.name).toBe('lookup');
    });

    it('handles content as array with mixed parts', () => {
      const messages = [
        {
          role: 'user',
          content: [
            { type: 'text', text: 'Hello' },
            { type: 'text', text: 'World' },
          ],
        },
      ];
      const payload = buildGooglePayload(messages);
      expect(payload.contents[0].parts).toEqual([{ text: 'Hello' }, { text: 'World' }]);
    });
  });
});
