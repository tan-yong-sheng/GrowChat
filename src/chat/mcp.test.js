import { describe, expect, it } from 'vitest';
import {
  buildMcpHeaders,
  buildMcpToolName,
  buildMcpTools,
  normalizeHeadersInput,
  normalizeToolParameters,
  parseSseMessages,
  parseToolArguments,
  stringifyToolPayload,
} from './mcp.js';

describe('chat MCP helpers', () => {
  it('normalizes headers input', () => {
    expect(normalizeHeadersInput({ a: '1' })).toEqual({ a: '1' });
    expect(normalizeHeadersInput('{"a":"1"}')).toEqual({ a: '1' });
    expect(normalizeHeadersInput('bad')).toEqual({});
  });

  it('builds MCP headers', () => {
    const headers = buildMcpHeaders({ Authorization: 'Bearer x' }, 'sess-1');
    expect(headers.Authorization).toBe('Bearer x');
    expect(headers['mcp-session-id']).toBe('sess-1');
    expect(headers['mcp-protocol-version']).toBeTruthy();
  });

  it('builds tool names and tool specs', () => {
    expect(buildMcpToolName('server-1', 'Weather Lookup')).toBe('mcp__server-1__Weather_Lookup');
    const { tools, toolMap, serversById } = buildMcpTools([
      {
        id: 'server-1',
        url: 'https://example.invalid',
        tools: [{ name: 'Weather Lookup', description: 'desc', parameters: { type: 'object' } }],
      },
      { id: 'disabled', enabled: false, url: 'https://example.invalid', tools: [{ name: 'x' }] },
    ]);
    expect(tools).toHaveLength(1);
    expect(toolMap.has('mcp__server-1__Weather_Lookup')).toBe(true);
    expect(serversById.has('server-1')).toBe(true);
  });

  it('filters MCP tools by selected model tool names', () => {
    const { tools, toolMap } = buildMcpTools(
      [
        {
          id: 'server-1',
          url: 'https://example.invalid',
          tools: [
            { name: 'Weather Lookup', description: 'desc', parameters: { type: 'object' } },
            { name: 'News Lookup', description: 'desc', parameters: { type: 'object' } },
          ],
        },
      ],
      {
        selectedToolNames: ['mcp__server-1__News_Lookup'],
      }
    );

    expect(tools).toHaveLength(1);
    expect(toolMap.has('mcp__server-1__News_Lookup')).toBe(true);
    expect(toolMap.has('mcp__server-1__Weather_Lookup')).toBe(false);
  });

  it('returns no tools when the selected tool list is explicitly empty', () => {
    const { tools, toolMap } = buildMcpTools(
      [
        {
          id: 'server-1',
          url: 'https://example.invalid',
          tools: [{ name: 'Weather Lookup', description: 'desc', parameters: { type: 'object' } }],
        },
      ],
      {
        selectedToolNames: [],
      }
    );

    expect(tools).toHaveLength(0);
    expect(toolMap.has('mcp__server-1__Weather_Lookup')).toBe(false);
  });

  it('parses SSE messages and tool arguments', () => {
    const messages = parseSseMessages('data: {"id":1}\n\ndata: {"id":2}\n\n');
    expect(messages).toEqual([{ id: 1 }, { id: 2 }]);
    expect(parseToolArguments('{"x":1}')).toEqual({ x: 1 });
    expect(() => parseToolArguments('{')).toThrow('valid JSON');
  });

  it('stringifies tool payloads and returns object parameters as-is', () => {
    expect(stringifyToolPayload({ a: 1 })).toContain('"a": 1');
    expect(stringifyToolPayload(null)).toBe('');
    expect(normalizeToolParameters({ type: 'object' })).toEqual({ type: 'object' });
  });
});
