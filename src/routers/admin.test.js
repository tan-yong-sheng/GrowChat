import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ATTACHMENT_CAP_TYPES, MODEL_ATTACHMENT_CAPS_KEY } from '../chat/attachments.js';

const mocks = vi.hoisted(() => ({
  createDB: vi.fn(),
  authorize: vi.fn(),
  logAuditEvent: vi.fn(),
  getConfigBool: vi.fn(),
  getConfigValue: vi.fn(),
  getAllOpenAIConnectionConfigs: vi.fn(),
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
  getAllOpenAIConnectionConfigs: (...args) => mocks.getAllOpenAIConnectionConfigs(...args),
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
    mocks.getAllOpenAIConnectionConfigs.mockResolvedValue([
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

  it('returns connection access groups for a connection', async () => {
    const all = vi.fn(async (sql) => {
      if (String(sql).includes('FROM groups')) {
        return [
          { id: 'g1', name: 'Core', description: 'Core team', is_system: 0, created_at: 1, updated_at: 1 },
          { id: 'g2', name: 'Ops', description: 'Ops team', is_system: 0, created_at: 1, updated_at: 1 },
        ];
      }
      if (String(sql).includes('FROM connection_acl_rules')) {
        return [
          {
            id: 'rule-1',
            connection_id: 'conn-1',
            principal_type: 'group',
            principal_id: 'g2',
            effect: 'allow',
            action: 'use',
            created_at: 1,
            updated_at: 1,
          },
        ];
      }
      return [];
    });
    mocks.createDB.mockReturnValue({ all, run: vi.fn() });

    const res = await adminRouter(
      makeReq('/api/admin/openai/connections/conn-1/access', 'GET'),
      { DB: {} },
      {},
      { sub: 'admin-1' },
      '/api/admin/openai/connections/conn-1/access'
    );
    const payload = await res.json();

    expect(res.status).toBe(200);
    expect(payload.connection_id).toBe('conn-1');
    expect(payload.rules).toEqual([
      expect.objectContaining({
        principal_type: 'group',
        principal_id: 'g2',
        effect: 'allow',
        action: 'use',
      }),
    ]);
    expect(payload.groups).toHaveLength(2);
  });

  it('updates connection access groups for a connection', async () => {
    mocks.getAllOpenAIConnectionConfigs.mockResolvedValue([
      {
        id: 'conn-1',
        name: 'Connection One',
        enabled: true,
        source: 'config',
      },
    ]);
    const run = vi.fn().mockResolvedValue(undefined);
    const all = vi.fn(async (sql) => {
      if (String(sql).includes('FROM groups')) {
        return [
          { id: 'g1', name: 'Core', description: 'Core team', is_system: 0, created_at: 1, updated_at: 1 },
          { id: 'g2', name: 'Ops', description: 'Ops team', is_system: 0, created_at: 1, updated_at: 1 },
          { id: 'g3', name: 'QA', description: 'QA team', is_system: 0, created_at: 1, updated_at: 1 },
        ];
      }
      if (String(sql).includes('FROM connection_acl_rules')) {
        return [
          {
            id: 'rule-1',
            connection_id: 'conn-1',
            principal_type: 'group',
            principal_id: 'g1',
            effect: 'allow',
            action: 'use',
            created_at: 1,
            updated_at: 1,
          },
          {
            id: 'rule-2',
            connection_id: 'conn-1',
            principal_type: 'group',
            principal_id: 'g3',
            effect: 'deny',
            action: 'use',
            created_at: 1,
            updated_at: 1,
          },
        ];
      }
      return [];
    });
    mocks.createDB.mockReturnValue({ all, run });

    const res = await adminRouter(
      new Request('https://example.com/api/admin/openai/connections/conn-1/access', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rules: [
            { principal_type: 'group', principal_id: 'g1', effect: 'allow', action: 'use' },
            { principal_type: 'group', principal_id: 'g3', effect: 'deny', action: 'use' },
          ],
        }),
      }),
      { DB: {} },
      {},
      { sub: 'admin-1' },
      '/api/admin/openai/connections/conn-1/access'
    );
    const payload = await res.json();

    expect(res.status).toBe(200);
    expect(payload.rules).toEqual([
      expect.objectContaining({
        principal_type: 'group',
        principal_id: 'g1',
        effect: 'allow',
        action: 'use',
      }),
      expect.objectContaining({
        principal_type: 'group',
        principal_id: 'g3',
        effect: 'deny',
        action: 'use',
      }),
    ]);
    expect(run).toHaveBeenCalledWith(expect.stringContaining('DELETE FROM connection_acl_rules'), ['conn-1']);
    expect(run).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO connection_acl_rules'), expect.any(Array));
  });

  it('rejects connection access updates for disabled connections', async () => {
    mocks.getAllOpenAIConnectionConfigs.mockResolvedValue([
      {
        id: 'conn-disabled',
        name: 'Disabled Connection',
        enabled: false,
        source: 'config',
      },
    ]);
    const res = await adminRouter(
      new Request('https://example.com/api/admin/openai/connections/conn-disabled/access', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rules: [{ principal_type: 'group', principal_id: 'g1', effect: 'allow', action: 'use' }],
        }),
      }),
      { DB: {} },
      {},
      { sub: 'admin-1' },
      '/api/admin/openai/connections/conn-disabled/access'
    );

    expect(res.status).toBe(409);
  });

  it('returns MCP server access groups for a server', async () => {
    const all = vi.fn(async (sql) => {
      if (String(sql).includes('FROM groups')) {
        return [
          { id: 'g1', name: 'Core', description: 'Core team', is_system: 0, created_at: 1, updated_at: 1 },
          { id: 'g2', name: 'Ops', description: 'Ops team', is_system: 0, created_at: 1, updated_at: 1 },
        ];
      }
      if (String(sql).includes('FROM tool_server_acl_rules')) {
        return [
          {
            id: 'rule-1',
            tool_server_id: 'mcp-1',
            principal_type: 'group',
            principal_id: 'g2',
            effect: 'allow',
            action: 'use',
            created_at: 1,
            updated_at: 1,
          },
        ];
      }
      return [];
    });
    mocks.createDB.mockReturnValue({ all, run: vi.fn() });
    mocks.getConfigValue.mockImplementation(async (_db, key, fallback) => {
      if (key === 'tool_servers') {
        return JSON.stringify([
          {
            id: 'mcp-1',
            name: 'Server One',
            url: 'https://example.com',
            enabled: true,
          },
        ]);
      }
      return fallback;
    });

    const res = await adminRouter(
      makeReq('/api/admin/tool-servers/mcp-1/access', 'GET'),
      { DB: {} },
      {},
      { sub: 'admin-1' },
      '/api/admin/tool-servers/mcp-1/access'
    );
    const payload = await res.json();

    expect(res.status).toBe(200);
    expect(payload.tool_server_id).toBe('mcp-1');
    expect(payload.rules).toEqual([
      expect.objectContaining({
        principal_type: 'group',
        principal_id: 'g2',
        effect: 'allow',
        action: 'use',
      }),
    ]);
    expect(payload.groups).toHaveLength(2);
  });

  it('rejects MCP server access updates for disabled servers', async () => {
    mocks.getConfigValue.mockImplementation(async (_db, key, fallback) => {
      if (key === 'tool_servers') {
        return JSON.stringify([
          {
            id: 'mcp-disabled',
            name: 'Disabled MCP',
            url: 'https://example.com',
            enabled: false,
          },
        ]);
      }
      return fallback;
    });

    const res = await adminRouter(
      new Request('https://example.com/api/admin/tool-servers/mcp-disabled/access', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rules: [{ principal_type: 'group', principal_id: 'g1', effect: 'allow', action: 'use' }],
        }),
      }),
      { DB: {} },
      {},
      { sub: 'admin-1' },
      '/api/admin/tool-servers/mcp-disabled/access'
    );

    expect(res.status).toBe(409);
  });

  it('updates MCP server access groups for a server', async () => {
    const run = vi.fn().mockResolvedValue(undefined);
    const all = vi.fn(async (sql) => {
      if (String(sql).includes('FROM groups')) {
        return [
          { id: 'g1', name: 'Core', description: 'Core team', is_system: 0, created_at: 1, updated_at: 1 },
          { id: 'g2', name: 'Ops', description: 'Ops team', is_system: 0, created_at: 1, updated_at: 1 },
          { id: 'g3', name: 'QA', description: 'QA team', is_system: 0, created_at: 1, updated_at: 1 },
        ];
      }
      if (String(sql).includes('FROM tool_server_acl_rules')) {
        return [
          {
            id: 'rule-1',
            tool_server_id: 'mcp-1',
            principal_type: 'group',
            principal_id: 'g1',
            effect: 'allow',
            action: 'use',
            created_at: 1,
            updated_at: 1,
          },
          {
            id: 'rule-2',
            tool_server_id: 'mcp-1',
            principal_type: 'group',
            principal_id: 'g3',
            effect: 'deny',
            action: 'use',
            created_at: 1,
            updated_at: 1,
          },
        ];
      }
      return [];
    });
    mocks.createDB.mockReturnValue({ all, run });
    mocks.getConfigValue.mockImplementation(async (_db, key, fallback) => {
      if (key === 'tool_servers') {
        return JSON.stringify([
          {
            id: 'mcp-1',
            name: 'Server One',
            url: 'https://example.com',
            enabled: true,
          },
        ]);
      }
      return fallback;
    });

    const res = await adminRouter(
      new Request('https://example.com/api/admin/tool-servers/mcp-1/access', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rules: [
            { principal_type: 'group', principal_id: 'g1', effect: 'allow', action: 'use' },
            { principal_type: 'group', principal_id: 'g3', effect: 'deny', action: 'use' },
          ],
        }),
      }),
      { DB: {} },
      {},
      { sub: 'admin-1' },
      '/api/admin/tool-servers/mcp-1/access'
    );
    const payload = await res.json();

    expect(res.status).toBe(200);
    expect(payload.rules).toEqual([
      expect.objectContaining({
        principal_type: 'group',
        principal_id: 'g1',
        effect: 'allow',
        action: 'use',
      }),
      expect.objectContaining({
        principal_type: 'group',
        principal_id: 'g3',
        effect: 'deny',
        action: 'use',
      }),
    ]);
    expect(run).toHaveBeenCalled();
  });

  it('updates admin config settings', async () => {
    const res = await adminRouter(
      new Request('https://example.com/api/admin/config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          public_registration: false,
          public_registration_status: 'active',
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
      public_registration_status: 'active',
      default_model_id: 'gpt-5-mini',
    });
    expect(mocks.setConfigValue).toHaveBeenCalledWith(expect.anything(), 'public_registration', 'false');
    expect(mocks.setConfigValue).toHaveBeenCalledWith(expect.anything(), 'public_registration_status', 'active');
    expect(mocks.setConfigValue).toHaveBeenCalledWith(expect.anything(), 'default_model_id', 'gpt-5-mini');
    expect(mocks.logAuditEvent).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      action: 'admin_config_updated',
      resource_id: 'config',
    }));
  });

  it('returns pending registration status when the config value is unset', async () => {
    const res = await adminRouter(
      makeReq('/api/admin/config', 'GET'),
      { DB: {} },
      {},
      { sub: 'admin-1' },
      '/api/admin/config'
    );
    const payload = await res.json();

    expect(res.status).toBe(200);
    expect(payload).toEqual({
      public_registration: true,
      public_registration_status: 'pending',
      default_model_id: null,
    });
  });

  it('reads and updates model attachment caps', async () => {
    mocks.getConfigValue.mockImplementation(async (_db, key, fallback) => {
      if (key === MODEL_ATTACHMENT_CAPS_KEY) {
        return JSON.stringify({
          'qwen3.5-plus': {
            attachments: { image: true, pdf: false },
            updated_at: 123,
          },
        });
      }
      return fallback;
    });

    const getRes = await adminRouter(
      makeReq('/api/admin/model-attachment-caps', 'GET'),
      { DB: {} },
      {},
      { sub: 'admin-1' },
      '/api/admin/model-attachment-caps'
    );
    const getPayload = await getRes.json();

    expect(getRes.status).toBe(200);
    expect(getPayload).toEqual({
      caps: {
        'qwen3.5-plus': {
          attachments: { image: true, pdf: false },
          updated_at: 123,
        },
      },
      supported_types: ATTACHMENT_CAP_TYPES,
    });

    const putRes = await adminRouter(
      new Request('https://example.com/api/admin/model-attachment-caps', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          updates: [
            {
              model_id: 'qwen3.5-plus',
              attachments: { image: true, pdf: true },
            },
          ],
        }),
      }),
      { DB: {} },
      {},
      { sub: 'admin-1' },
      '/api/admin/model-attachment-caps'
    );
    const putPayload = await putRes.json();

    expect(putRes.status).toBe(200);
    expect(putPayload.caps['qwen3.5-plus'].attachments).toEqual({ image: true, pdf: true });
    expect(mocks.setConfigValue).toHaveBeenCalledWith(
      expect.anything(),
      MODEL_ATTACHMENT_CAPS_KEY,
      expect.stringContaining('"qwen3.5-plus"')
    );
    expect(mocks.logAuditEvent).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      action: 'attachment_caps_updated',
      resource_id: 'model-attachment-caps',
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

describe('adminRouter tool server oauth', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.createDB.mockReturnValue({});
    mocks.authorize.mockResolvedValue({ allow: true });
    mocks.logAuditEvent.mockResolvedValue(undefined);
    mocks.getConfigBool.mockResolvedValue(true);
    mocks.setConfigValue.mockResolvedValue(undefined);
    mocks.getConfigValue.mockImplementation(async (_db, key, fallback) => {
      if (key === 'tool_servers') return '[]';
      return fallback;
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('creates a draft server when starting oauth for a new tool server', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('not found', { status: 404 })));

    const res = await adminRouter(
      new Request('https://example.com/api/admin/tool-servers/oauth/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: 'draft-server-1',
          name: 'Bindings MCP',
          url: 'https://bindings.mcp.cloudflare.com/mcp',
          auth_type: 'oauth',
          oauth_client_name: 'GrowChat MCP Client',
          oauth_scope: '',
          oauth_client_id: 'client-123',
          oauth_client_secret: '',
          oauth_token_auth_method: '',
        }),
      }),
      { DB: {} },
      {},
      { sub: 'admin-1' },
      '/api/admin/tool-servers/oauth/start'
    );
    const payload = await res.json();

    expect(res.status).toBe(200);
    expect(payload.authorization_url).toContain('client_id=client-123');
    const savedCall = mocks.setConfigValue.mock.calls.find(([, key]) => key === 'tool_servers');
    expect(savedCall).toBeTruthy();
    const savedServers = JSON.parse(savedCall[2]);
    expect(savedServers).toHaveLength(1);
    expect(savedServers[0]).toMatchObject({
      id: 'draft-server-1',
      name: 'Bindings MCP',
      url: 'https://bindings.mcp.cloudflare.com/mcp',
      auth_type: 'oauth',
      oauth_client_name: 'GrowChat MCP Client',
      oauth_client_id: 'client-123',
    });
    expect(savedServers[0].oauth_state).toEqual(expect.any(String));
    expect(savedServers[0].oauth_code_verifier).toEqual(expect.any(String));
  });
});
