import { describe, expect, it, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  createDB: vi.fn(),
  authorize: vi.fn(),
  logAuditEvent: vi.fn(),
  getConfigBool: vi.fn(),
  getConfigValue: vi.fn(),
  setConfigValue: vi.fn(),
  buildEnvOpenAIConnections: vi.fn(),
  getEnvOpenAIOverrides: vi.fn(),
  mcpRequest: vi.fn(),
  mcpNotify: vi.fn(),
}));

vi.mock('../db.js', () => ({
  createDB: (...args) => mocks.createDB(...args),
}));

vi.mock('../utils/authorize.js', () => ({
  authorize: (...args) => mocks.authorize(...args),
  logAuditEvent: (...args) => mocks.logAuditEvent(...args),
}));

vi.mock('../utils/app-config.js', () => ({
  getConfigBool: (...args) => mocks.getConfigBool(...args),
  getConfigValue: (...args) => mocks.getConfigValue(...args),
  setConfigValue: (...args) => mocks.setConfigValue(...args),
}));

vi.mock('../llm/connections.js', () => ({
  buildConnectionHeaders: vi.fn(),
  buildEnvOpenAIConnections: (...args) => mocks.buildEnvOpenAIConnections(...args),
  discoverConnectionModels: vi.fn(),
  ensureConnectionId: (conn, index = 0) => conn?.id || `conn-${index}`,
  extractConnectionModelId: vi.fn(),
  getConnectionApiType: vi.fn((providerType) => {
    const raw = String(providerType || '').toLowerCase();
    if (raw === 'google' || raw === 'gemini-compatible') return 'stream-generate-content';
    if (raw === 'anthropic' || raw === 'claude-compatible') return 'messages';
    return 'chat-completions';
  }),
  getConnectionDefaultBaseUrl: vi.fn((providerType) => {
    const raw = String(providerType || '').toLowerCase();
    if (raw === 'google' || raw === 'gemini-compatible') return 'https://generativelanguage.googleapis.com/v1beta';
    if (raw === 'anthropic' || raw === 'claude-compatible') return 'https://api.anthropic.com/v1';
    return 'https://api.openai.com/v1';
  }),
  getEnvOpenAIOverrides: (...args) => mocks.getEnvOpenAIOverrides(...args),
  isConnectionUrlRequired: vi.fn(() => false),
  normalizeConnectionManualModels: (value) => value || [],
}));

vi.mock('../mcp/client.js', () => ({
  MCP_PROTOCOL_VERSION: '2024-11-05',
  mcpNotify: (...args) => mocks.mcpNotify(...args),
  mcpRequest: (...args) => mocks.mcpRequest(...args),
}));

import { adminRouter } from './admin.js';

function makeReq(path, method) {
  return new Request(`https://example.com${path}`, { method });
}

describe('adminRouter openai connections', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.createDB.mockReturnValue({});
    mocks.authorize.mockResolvedValue({ allow: true });
    mocks.logAuditEvent.mockResolvedValue(undefined);
    mocks.getConfigBool.mockResolvedValue(true);
    mocks.setConfigValue.mockResolvedValue(undefined);
    mocks.getEnvOpenAIOverrides.mockResolvedValue(new Map());
    mocks.buildEnvOpenAIConnections.mockReturnValue([
      {
        id: 'env-openai-0',
        name: 'Env OpenAI',
        url: 'https://api.openai.com/v1',
        keyMasked: '••••1234',
        hasKey: true,
        headers: '',
        providerType: 'openai',
        providerFamily: 'openai',
        providerId: 'openai/env-openai-0',
        authType: 'bearer',
        apiType: 'chat-completions',
        readOnly: true,
        source: 'env',
        enabled: true,
      },
    ]);
    mocks.getConfigValue.mockImplementation(async (_db, key, fallback) => {
      if (key === 'openai_connections') {
        return JSON.stringify([
          {
            id: 'config-gemini',
            name: 'Gemini Test',
            url: 'https://example.com/v1beta',
            key: 'secret',
            providerType: 'gemini-compatible',
            manualModels: [{ modelId: 'gemini-2.5-pro', name: 'Gemini Pro' }],
          },
        ]);
      }
      if (key === 'openai_enabled') return 'true';
      if (key === 'openai_env_overrides') return '{}';
      return fallback;
    });
  });

  it('returns persisted and env-backed connections', async () => {
    const res = await adminRouter(
      makeReq('/api/admin/openai/connections', 'GET'),
      { DB: {} },
      {},
      { sub: 'admin-1' },
      '/api/admin/openai/connections'
    );
    const payload = await res.json();

    expect(res.status).toBe(200);
    expect(payload.connections.some((conn) => conn.id === 'env-openai-0' && conn.readOnly)).toBe(true);
    expect(payload.connections.some((conn) => conn.id === 'config-gemini' && conn.source === 'config')).toBe(true);
    expect(mocks.getConfigValue).toHaveBeenCalledWith(expect.anything(), 'openai_connections', '[]');
    expect(mocks.getConfigValue).toHaveBeenCalledWith(expect.anything(), 'openai_enabled', 'true');
  });

  it('updates admin config settings', async () => {
    const res = await adminRouter(
      new Request('https://example.com/api/admin/config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          public_registration: false,
          default_model_id: 'gpt-5-mini',
        }),
      }),
      { DB: {} },
      {},
      { sub: 'admin-1' },
      '/api/admin/config'
    );
    const payload = await res.json();

    expect(res.status).toBe(200);
    expect(payload).toEqual({
      public_registration: false,
      default_model_id: 'gpt-5-mini',
    });
    expect(mocks.setConfigValue).toHaveBeenCalledWith(expect.anything(), 'public_registration', 'false');
    expect(mocks.setConfigValue).toHaveBeenCalledWith(expect.anything(), 'default_model_id', 'gpt-5-mini');
    expect(mocks.logAuditEvent).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      action: 'admin_config_updated',
      resource_id: 'config',
    }));
  });

  it('updates openai connections', async () => {
    const res = await adminRouter(
      new Request('https://example.com/api/admin/openai/connections', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          enabled: true,
          connections: [
            {
              id: 'conn-1',
              name: 'OpenAI',
              url: 'https://api.example.com/v1',
              key: 'secret',
              providerType: 'openai',
              manualModels: [],
            },
          ],
          env_overrides: {},
        }),
      }),
      { DB: {} },
      {},
      { sub: 'admin-1' },
      '/api/admin/openai/connections'
    );
    const payload = await res.json();

    expect(res.status).toBe(200);
    expect(payload).toEqual({ ok: true });
    expect(mocks.setConfigValue).toHaveBeenCalledWith(expect.anything(), 'openai_connections', expect.any(String));
    expect(mocks.setConfigValue).toHaveBeenCalledWith(expect.anything(), 'openai_enabled', 'true');
    expect(mocks.setConfigValue).toHaveBeenCalledWith(expect.anything(), 'openai_env_overrides', '{}');
    expect(mocks.logAuditEvent).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      action: 'openai_connections_updated',
      resource_id: 'openai-connections',
    }));
  });

  it('verifies a tool server and persists discovered tools', async () => {
    mocks.getConfigValue.mockImplementation(async (_db, key, fallback) => {
      if (key === 'tool_servers') {
        return JSON.stringify([
          {
            id: 'server-1',
            name: 'MCP Server',
            url: 'https://mcp.example.com',
            auth_type: 'none',
          },
        ]);
      }
      return fallback;
    });
    mocks.mcpRequest
      .mockResolvedValueOnce({ sessionId: 'session-1' })
      .mockResolvedValueOnce({ result: { tools: [{ name: 'tool-a', title: 'Tool A', description: 'Desc A', inputSchema: { type: 'object' } }] } });
    mocks.mcpNotify.mockResolvedValueOnce({ sessionId: 'session-1' });

    const res = await adminRouter(
      new Request('https://example.com/api/admin/tool-servers/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: 'server-1',
          url: 'https://mcp.example.com',
          auth_type: 'none',
        }),
      }),
      { DB: {} },
      {},
      { sub: 'admin-1' },
      '/api/admin/tool-servers/test'
    );
    const payload = await res.json();

    expect(res.status).toBe(200);
    expect(payload).toMatchObject({
      ok: true,
      message: 'Connection successful',
      tools: [{ name: 'tool-a', title: 'Tool A', description: 'Desc A', parameters: { type: 'object' } }],
    });
    expect(mocks.mcpRequest).toHaveBeenNthCalledWith(1, expect.objectContaining({
      url: 'https://mcp.example.com',
      method: 'initialize',
      id: 0,
    }));
    expect(mocks.mcpNotify).toHaveBeenCalledWith(expect.objectContaining({
      url: 'https://mcp.example.com',
      method: 'notifications/initialized',
    }));
    expect(mocks.mcpRequest).toHaveBeenNthCalledWith(2, expect.objectContaining({
      method: 'tools/list',
      id: 2,
    }));
    expect(mocks.setConfigValue).toHaveBeenCalledWith(expect.anything(), 'tool_servers', expect.stringContaining('tools_verified_at'));
  });

  it('preserves existing tool enabled flags when verifying a tool server', async () => {
    mocks.getConfigValue.mockImplementation(async (_db, key, fallback) => {
      if (key === 'tool_servers') {
        return JSON.stringify([
          {
            id: 'server-1',
            name: 'MCP Server',
            url: 'https://mcp.example.com',
            auth_type: 'none',
            tools: [
              { name: 'tool-a', enabled: false },
              { name: 'tool-b', enabled: true },
            ],
          },
        ]);
      }
      return fallback;
    });
    mocks.mcpRequest
      .mockResolvedValueOnce({ sessionId: 'session-1' })
      .mockResolvedValueOnce({ result: { tools: [
        { name: 'tool-a', title: 'Tool A', description: 'Desc A', inputSchema: { type: 'object' } },
        { name: 'tool-b', title: 'Tool B', description: 'Desc B', inputSchema: { type: 'object' } },
      ] } });
    mocks.mcpNotify.mockResolvedValueOnce({ sessionId: 'session-1' });

    const res = await adminRouter(
      new Request('https://example.com/api/admin/tool-servers/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: 'server-1',
          url: 'https://mcp.example.com',
          auth_type: 'none',
        }),
      }),
      { DB: {} },
      {},
      { sub: 'admin-1' },
      '/api/admin/tool-servers/test'
    );
    const payload = await res.json();

    expect(res.status).toBe(200);
    expect(payload.tools).toEqual([
      { name: 'tool-a', title: 'Tool A', description: 'Desc A', parameters: { type: 'object' }, enabled: false },
      { name: 'tool-b', title: 'Tool B', description: 'Desc B', parameters: { type: 'object' }, enabled: true },
    ]);
    const savedCall = mocks.setConfigValue.mock.calls.find(([, key]) => key === 'tool_servers');
    expect(savedCall).toBeTruthy();
    const savedServers = JSON.parse(savedCall[2]);
    expect(savedServers[0].tools).toEqual([
      { name: 'tool-a', title: 'Tool A', description: 'Desc A', parameters: { type: 'object' }, enabled: false },
      { name: 'tool-b', title: 'Tool B', description: 'Desc B', parameters: { type: 'object' }, enabled: true },
    ]);
  });
});
