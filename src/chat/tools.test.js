import { describe, expect, it } from 'vitest';
import {
  applyToolCallDelta,
  buildUnknownToolPrompt,
  normalizeToolCalls,
} from './tools.js';

describe('chat tool helpers', () => {
  it('applies tool call deltas by index and merges metadata', () => {
    const target = [];
    applyToolCallDelta(target, [
      {
        index: 0,
        id: 't1',
        function: { name: 'get', arguments: '{"a":' },
        providerMetadata: { google: { thoughtSignature: 'x' } },
      },
      {
        index: 0,
        function: { name: 'Weather', arguments: '1}' },
        providerMetadata: { vertex: { foo: 'bar' } },
      },
    ]);

    expect(target[0]).toMatchObject({
      id: 't1',
      name: 'getWeather',
      arguments: '{"a":1}',
      providerMetadata: {
        google: { thoughtSignature: 'x' },
        vertex: { foo: 'bar' },
      },
    });
  });

  it('normalizes known and unknown tool calls', () => {
    const toolMap = new Map([
      ['mcp__server__lookup', { serverId: 'server', toolName: 'lookup', displayName: 'Lookup' }],
    ]);

    const { validCalls, unknownCalls } = normalizeToolCalls([
      { id: '1', name: 'mcp__server__lookup', arguments: '{"q":"x"}' },
      { id: '2', name: 'mcp__server__missing', arguments: '{}' },
    ], toolMap);

    expect(validCalls).toHaveLength(1);
    expect(validCalls[0]).toMatchObject({
      toolCallId: '1',
      modelToolName: 'mcp__server__lookup',
      serverId: 'server',
      toolName: 'lookup',
      displayName: 'Lookup',
    });
    expect(unknownCalls).toEqual([
      { toolCallId: '2', name: 'mcp__server__missing', arguments: '{}' },
    ]);
  });

  it('builds an unknown tool prompt with tool preview', () => {
    const prompt = buildUnknownToolPrompt(
      [{ name: 'missing' }],
      new Map([
        ['tool_a', {}],
        ['tool_b', {}],
      ])
    );

    expect(prompt).toContain('missing');
    expect(prompt).toContain('tool_a, tool_b');
  });
});
