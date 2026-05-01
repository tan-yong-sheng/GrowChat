import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildMcpHeaders, mcpNotify, mcpRequest, parseSseMessages } from './client.js';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('mcp-client', () => {
  it('builds MCP headers and parses SSE payloads', () => {
    const headers = buildMcpHeaders({ Authorization: 'Bearer x' }, 'sess-1');
    expect(headers.Authorization).toBe('Bearer x');
    expect(headers['mcp-session-id']).toBe('sess-1');
    expect(headers['mcp-protocol-version']).toBeTruthy();
    expect(parseSseMessages('data: {"id":1}\n\n')).toEqual([{ id: 1 }]);
  });

  it('parses JSON MCP responses', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ id: 1, result: { ok: true } }), {
          status: 200,
          headers: {
            'content-type': 'application/json',
            'mcp-session-id': 'sess-2',
          },
        })
      )
    );

    const result = await mcpRequest({
      url: 'https://example.invalid',
      headers: { Authorization: 'Bearer x' },
      sessionId: 'sess-1',
      id: 1,
      method: 'tools/list',
    });

    expect(result).toEqual({ result: { ok: true }, sessionId: 'sess-2' });
  });

  it('accepts notification responses with no content', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(null, {
          status: 204,
          headers: {
            'mcp-session-id': 'sess-3',
          },
        })
      )
    );

    const result = await mcpNotify({
      url: 'https://example.invalid',
      headers: {},
      sessionId: 'sess-1',
      method: 'notifications/initialized',
    });

    expect(result).toEqual({ sessionId: 'sess-3' });
  });
});
