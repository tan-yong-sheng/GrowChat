import { describe, expect, it } from 'vitest';
import { buildProviderRequest } from './provider-adapters.js';

describe('llm-provider-adapters', () => {
  const normalizeToolParameters = (input) => input;

  it('builds OpenAI-compatible chat completions requests', () => {
    const result = buildProviderRequest({
      providerFamily: 'openai',
      baseUrl: 'https://api.example.com/v1',
      modelId: 'gpt-4o',
      messages: [{ role: 'user', content: 'Hello' }],
      options: {},
      stream: true,
      normalizeToolParameters,
    });

    expect(result.url).toBe('https://api.example.com/v1/chat/completions');
    expect(result.payload).toMatchObject({
      model: 'gpt-4o',
      messages: [{ role: 'user', content: 'Hello' }],
      stream: true,
    });
  });

  it('forces tool_choice none for OpenAI-compatible requests when tools are explicitly disabled', () => {
    const result = buildProviderRequest({
      providerFamily: 'openai',
      baseUrl: 'https://api.example.com/v1',
      modelId: 'gpt-4o',
      messages: [{ role: 'user', content: 'Hello' }],
      options: {
        tools: [],
        toolChoice: 'none',
      },
      stream: true,
      normalizeToolParameters,
    });

    expect(result.payload.tool_choice).toBe('none');
    expect(result.payload.tools).toBeUndefined();
  });

  it('builds Gemini streamGenerateContent requests with thought signatures', () => {
    const result = buildProviderRequest({
      providerFamily: 'google',
      baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
      modelId: 'gemini-3.1-flash-lite-preview',
      messages: [
        {
          role: 'assistant',
          tool_calls: [
            {
              id: 'call-1',
              function: {
                name: 'weather',
                arguments: JSON.stringify({ location: 'Kuala Lumpur' }),
              },
              providerMetadata: { google: { thoughtSignature: 'sig-123' } },
            },
          ],
        },
      ],
      options: {
        tools: [
          {
            type: 'function',
            function: {
              name: 'weather',
              description: 'Get weather',
              parameters: {
                type: 'object',
                properties: { location: { type: 'string' } },
                required: ['location'],
                additionalProperties: false,
              },
            },
          },
        ],
        toolChoice: { type: 'required' },
      },
      stream: true,
      normalizeToolParameters,
    });

    expect(result.url).toBe(
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite-preview:streamGenerateContent?alt=sse'
    );
    expect(result.payload.tools).toEqual([
      {
        functionDeclarations: [
          {
            name: 'weather',
            description: 'Get weather',
            parameters: {
              type: 'object',
              properties: { location: { type: 'string' } },
              required: ['location'],
              additionalProperties: false,
            },
          },
        ],
      },
    ]);
    expect(result.payload.contents[0].parts[0]).toEqual({
      functionCall: {
        name: 'weather',
        args: { location: 'Kuala Lumpur' },
      },
      thoughtSignature: 'sig-123',
    });
  });

  it('builds Anthropic messages requests with tool schema conversion', () => {
    const result = buildProviderRequest({
      providerFamily: 'anthropic',
      baseUrl: 'https://api.anthropic.com/v1',
      modelId: 'claude-sonnet-4-5',
      messages: [{ role: 'user', content: 'Hello' }],
      options: {
        tools: [
          {
            type: 'function',
            function: {
              name: 'weather',
              description: 'Get weather',
              parameters: {
                type: 'object',
                properties: { location: { type: 'string' } },
                required: ['location'],
                additionalProperties: false,
              },
            },
          },
        ],
        toolChoice: { type: 'required' },
        maxTokens: 2048,
      },
      stream: true,
      normalizeToolParameters,
    });

    expect(result.url).toBe('https://api.anthropic.com/v1/messages');
    expect(result.headers['anthropic-version']).toBe('2023-06-01');
    expect(result.payload).toMatchObject({
      model: 'claude-sonnet-4-5',
      max_tokens: 2048,
      stream: true,
      messages: [{ role: 'user', content: [{ type: 'text', text: 'Hello' }] }],
    });
    expect(result.payload.tools).toEqual([
      {
        name: 'weather',
        description: 'Get weather',
        input_schema: {
          type: 'object',
          properties: { location: { type: 'string' } },
          required: ['location'],
          additionalProperties: false,
        },
      },
    ]);
    expect(result.payload.tool_choice).toEqual({ type: 'any' });
  });
});
