import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  db: {
    first: vi.fn(),
    run: vi.fn(),
    all: vi.fn(),
    batch: vi.fn(),
    prepare: vi.fn(),
  },
  authorize: vi.fn(),
  logAuditEvent: vi.fn(),
  resolvePermissions: vi.fn(),
  getUserRoles: vi.fn(),
  getConfigValue: vi.fn(),
  hashPassword: vi.fn(),
  isLastOwnerOfRole: vi.fn(),
  discoverConnectionModels: vi.fn(),
  getAllOpenAIConnectionConfigs: vi.fn(),
  loadUserOpenAIConnectionConfigs: vi.fn(),
  getUserOpenAIConnectionConfig: vi.fn(),
  createUserOpenAIConnection: vi.fn(),
  updateUserOpenAIConnection: vi.fn(),
  deleteUserOpenAIConnection: vi.fn(),
  loadUserToolServers: vi.fn(),
  loadToolServers: vi.fn(),
  createUserToolServer: vi.fn(),
  updateUserToolServer: vi.fn(),
  deleteUserToolServer: vi.fn(),
  testToolServerConnection: vi.fn(),
  isSafeOutboundUrl: vi.fn(() => ({ safe: true })),
}));

vi.mock('../db.js', () => ({
  createDB: () => mocks.db,
}));

vi.mock('../utils/authorize.js', () => ({
  authorize: (...args) => mocks.authorize(...args),
  logAuditEvent: (...args) => mocks.logAuditEvent(...args),
  isLastOwnerOfRole: (...args) => mocks.isLastOwnerOfRole(...args),
  resolvePermissions: (...args) => mocks.resolvePermissions(...args),
  getUserRoles: (...args) => mocks.getUserRoles(...args),
}));

vi.mock('../utils/app-config.js', () => ({
  getConfigValue: (...args) => mocks.getConfigValue(...args),
}));

vi.mock('../shared/auth.js', () => ({
  hashPassword: (...args) => mocks.hashPassword(...args),
}));

vi.mock('../llm/connections.js', () => ({
  buildConnectionHeaders: (connection) => connection.headers || {},
  discoverConnectionModels: (...args) => mocks.discoverConnectionModels(...args),
  getUserOpenAIConnectionConfig: (...args) => mocks.getUserOpenAIConnectionConfig(...args),
  getConnectionDefaultBaseUrl: (providerType) => {
    switch (
      String(providerType || '')
        .trim()
        .toLowerCase()
    ) {
      case 'google':
      case 'gemini-compatible':
        return 'https://generativelanguage.googleapis.com/v1beta';
      case 'anthropic':
      case 'claude-compatible':
        return 'https://api.anthropic.com/v1';
      default:
        return 'https://api.openai.com/v1';
    }
  },
  isConnectionUrlRequired: (providerType) =>
    ['openai-compatible', 'gemini-compatible', 'claude-compatible'].includes(
      String(providerType || '')
        .trim()
        .toLowerCase()
    ),
  getAllOpenAIConnectionConfigs: (...args) => mocks.getAllOpenAIConnectionConfigs(...args),
  loadUserOpenAIConnectionConfigs: (...args) => mocks.loadUserOpenAIConnectionConfigs(...args),
  createUserOpenAIConnection: (...args) => mocks.createUserOpenAIConnection(...args),
  updateUserOpenAIConnection: (...args) => mocks.updateUserOpenAIConnection(...args),
  deleteUserOpenAIConnection: (...args) => mocks.deleteUserOpenAIConnection(...args),
}));

vi.mock('../admin/tool-servers.js', () => ({
  createUserToolServer: (...args) => mocks.createUserToolServer(...args),
  deleteUserToolServer: (...args) => mocks.deleteUserToolServer(...args),
  loadToolServers: (...args) => mocks.loadToolServers?.(...args),
  loadUserToolServers: (...args) => mocks.loadUserToolServers(...args),
  testToolServerConnection: (...args) => mocks.testToolServerConnection(...args),
  updateUserToolServer: (...args) => mocks.updateUserToolServer(...args),
}));
vi.mock('../utils/validation.js', () => ({
  isSafeOutboundUrl: (...args) => mocks.isSafeOutboundUrl(...args),
}));

import { usersRouter } from './users.js';

function makeReq(path, method, body, headers = {}) {
  const init = { method, headers: { ...headers } };
  if (body !== undefined) {
    init.body = typeof body === 'string' ? body : JSON.stringify(body);
    init.headers['Content-Type'] = 'application/json';
  }
  return new Request(`https://example.com${path}`, init);
}

describe('usersRouter', () => {
  const user = { sub: 'u1', role: 'member', email: 'user@example.com' };
  const env = { DB: {} };

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.db.first.mockResolvedValue(null);
    mocks.db.run.mockResolvedValue({ success: true });
    mocks.db.all.mockResolvedValue([]);
    mocks.db.batch.mockResolvedValue([]);
    mocks.db.prepare.mockReturnValue({
      bind: () => ({
        first: vi.fn(),
        run: vi.fn(),
        all: vi.fn().mockResolvedValue({ results: [] }),
      }),
    });
    mocks.authorize.mockResolvedValue({ allow: true });
    mocks.logAuditEvent.mockResolvedValue(undefined);
    mocks.resolvePermissions.mockResolvedValue(['chat.read']);
    mocks.getUserRoles.mockResolvedValue([{ role_name: 'member' }]);
    mocks.getConfigValue.mockResolvedValue('gpt-5-mini');
    mocks.hashPassword.mockResolvedValue('hashed');
    mocks.isLastOwnerOfRole.mockResolvedValue(false);
    mocks.discoverConnectionModels.mockResolvedValue({ items: [] });
    mocks.getAllOpenAIConnectionConfigs.mockResolvedValue([]);
    mocks.loadUserOpenAIConnectionConfigs.mockResolvedValue([]);
    mocks.getUserOpenAIConnectionConfig.mockResolvedValue(null);
    mocks.createUserOpenAIConnection.mockResolvedValue(null);
    mocks.updateUserOpenAIConnection.mockResolvedValue(null);
    mocks.deleteUserOpenAIConnection.mockResolvedValue(false);
    mocks.loadToolServers.mockResolvedValue([]);
    mocks.createUserToolServer.mockResolvedValue(null);
    mocks.updateUserToolServer.mockResolvedValue(null);
    mocks.deleteUserToolServer.mockResolvedValue(false);
    mocks.testToolServerConnection.mockResolvedValue({ tools: [] });
  });

  it('returns the current user profile with app config', async () => {
    mocks.db.first.mockResolvedValueOnce({
      id: 'u1',
      email: 'user@example.com',
      name: 'User',
      role: 'member',
      account_status: 'active',
      settings: '{"theme":"dark"}',
      avatar: 'https://example.com/avatar.png',
      avatar_emoji: '🙂',
      status: 'online',
      preferences: '{"compact":true}',
      created_at: 10,
      updated_at: 20,
      last_active_at: null,
    });

    const res = await usersRouter(makeReq('/api/users/me', 'GET'), env, {}, user, '/api/users/me');

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({
      user: {
        id: 'u1',
        email: 'user@example.com',
        name: 'User',
        primary_role: 'member',
        account_status: 'active',
        settings: { theme: 'dark' },
        avatar: 'https://example.com/avatar.png',
        avatar_emoji: '🙂',
        status: 'online',
        preferences: { compact: true },
        created_at: 10,
        last_active_at: null,
        updated_at: 20,
      },
      app_config: {
        default_model_id: 'gpt-5-mini',
      },
    });
  });

  it('includes permissions and roles when requested', async () => {
    mocks.db.first.mockResolvedValueOnce({
      id: 'u1',
      email: 'user@example.com',
      name: 'User',
      role: 'member',
      account_status: 'active',
      settings: '{}',
      preferences: '{}',
      created_at: 10,
      updated_at: 20,
      last_active_at: 30,
    });

    const res = await usersRouter(
      makeReq('/api/users/me?include=permissions,roles', 'GET'),
      env,
      {},
      user,
      '/api/users/me'
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.permissions).toEqual(['chat.read']);
    expect(body.roles).toEqual([{ role_name: 'member' }]);
    // Verify functions were called with a DB-like object (wrapped DB instance)
    expect(mocks.resolvePermissions).toHaveBeenCalledWith(
      expect.objectContaining({ prepare: expect.any(Function) }),
      user
    );
    expect(mocks.getUserRoles).toHaveBeenCalledWith(
      expect.objectContaining({ prepare: expect.any(Function) }),
      user.sub
    );
  });

  it('updates the current user profile with PUT /api/users/me', async () => {
    mocks.db.first.mockResolvedValueOnce({
      id: 'u1',
      email: 'user@example.com',
      name: 'Updated User',
      role: 'member',
      account_status: 'active',
      settings: '{"theme":"light"}',
      avatar: 'https://example.com/new-avatar.png',
      avatar_emoji: '🚀',
      status: 'away',
      preferences: '{"compact":false}',
      created_at: 10,
      updated_at: 21,
    });

    const res = await usersRouter(
      makeReq('/api/users/me', 'PUT', {
        name: ' Updated User ',
        avatar: 'https://example.com/new-avatar.png',
        avatar_emoji: '🚀',
        status: 'away',
        settings: { theme: 'light' },
        preferences: { compact: false },
      }),
      env,
      {},
      user,
      '/api/users/me'
    );

    expect(res.status).toBe(200);
    expect(mocks.db.run).toHaveBeenCalledWith(
      'UPDATE users SET name = ?, avatar = ?, avatar_emoji = ?, status = ?, settings = ?, preferences = ?, updated_at = unixepoch() WHERE id = ?',
      [
        'Updated User',
        'https://example.com/new-avatar.png',
        '🚀',
        'away',
        JSON.stringify({ theme: 'light' }),
        JSON.stringify({ compact: false }),
        'u1',
      ]
    );
    await expect(res.json()).resolves.toMatchObject({
      user: {
        name: 'Updated User',
        avatar: 'https://example.com/new-avatar.png',
        avatar_emoji: '🚀',
        status: 'away',
        account_status: 'active',
        settings: { theme: 'light' },
        preferences: { compact: false },
      },
    });
  });

  it('updates the current user profile with POST /api/users/me/update', async () => {
    mocks.db.first.mockResolvedValueOnce({
      id: 'u1',
      email: 'user@example.com',
      name: 'Updated User',
      role: 'member',
      account_status: 'active',
      settings: '{}',
      avatar: null,
      avatar_emoji: '🙂',
      status: 'offline',
      preferences: '{"compact":true}',
      created_at: 10,
      updated_at: 21,
    });

    const res = await usersRouter(
      makeReq('/api/users/me/update', 'POST', {
        name: 'Updated User',
        avatar: null,
        avatar_emoji: '🙂',
        status: 'offline',
        preferences: { compact: true },
      }),
      env,
      {},
      user,
      '/api/users/me/update'
    );

    expect(res.status).toBe(200);
    expect(mocks.db.run).toHaveBeenCalledWith(
      'UPDATE users SET name = ?, avatar = ?, avatar_emoji = ?, status = ?, preferences = ?, updated_at = unixepoch() WHERE id = ?',
      ['Updated User', null, '🙂', 'offline', JSON.stringify({ compact: true }), 'u1']
    );
    await expect(res.json()).resolves.toMatchObject({
      user: {
        name: 'Updated User',
        avatar: null,
        avatar_emoji: '🙂',
        status: 'offline',
        account_status: 'active',
        preferences: { compact: true },
      },
    });
  });

  it('returns accessible connections for the current user', async () => {
    mocks.getAllOpenAIConnectionConfigs.mockResolvedValue([
      {
        id: 'conn-shared',
        name: 'Shared Connection',
        baseUrl: 'https://example.com/v1',
        providerFamily: 'openai',
        providerType: 'openai-compatible',
        source: 'config',
        access_label: 'Shared',
        access_variant: 'shared',
      },
      {
        id: 'conn-hidden',
        name: 'Hidden Connection',
        baseUrl: 'https://hidden.example.com/v1',
        providerFamily: 'openai',
        providerType: 'openai-compatible',
        source: 'config',
        access_label: 'Shared',
        access_variant: 'shared',
        hidden_for_user: true,
        visible_for_user: false,
      },
      {
        id: 'conn-admin',
        name: 'Admin Connection',
        baseUrl: 'https://admin.example.com/v1',
        providerFamily: 'openai',
        providerType: 'openai-compatible',
        source: 'config',
        access_label: 'Admin',
        access_variant: 'admin',
      },
      {
        id: 'conn-shared-2',
        name: 'Shared Connection 2',
        baseUrl: 'https://shared.example.com/v1',
        providerFamily: 'openai',
        providerType: 'openai-compatible',
        source: 'config',
        access_label: 'Shared',
        access_variant: 'shared',
      },
    ]);
    mocks.loadUserOpenAIConnectionConfigs.mockResolvedValue([
      {
        id: 'conn-personal',
        name: 'Personal Connection',
        baseUrl: 'https://personal.example.com/v1',
        providerFamily: 'openai',
        providerType: 'openai-compatible',
        enabled: true,
        source: 'user',
        access_label: 'Personal',
        access_variant: 'personal',
      },
    ]);

    const res = await usersRouter(
      makeReq('/api/users/me/resources/connections', 'GET'),
      env,
      {},
      user,
      '/api/users/me/resources/connections'
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.connections).toEqual([
      expect.objectContaining({
        id: 'conn-shared',
        access_label: 'Shared',
        access_variant: 'shared',
      }),
      expect.objectContaining({
        id: 'conn-hidden',
        access_label: 'Shared',
        access_variant: 'shared',
        hidden_for_user: true,
        visible_for_user: false,
      }),
      expect.objectContaining({
        id: 'conn-admin',
        access_label: 'Admin',
        access_variant: 'admin',
      }),
      expect.objectContaining({
        id: 'conn-shared-2',
        access_label: 'Shared',
        access_variant: 'shared',
      }),
    ]);
    expect(body.my_connections).toEqual([
      expect.objectContaining({
        id: 'conn-personal',
        access_label: 'Personal',
        access_variant: 'personal',
      }),
    ]);
  });

  it('creates a personal connection for the current user', async () => {
    mocks.createUserOpenAIConnection.mockResolvedValueOnce({
      id: 'conn-personal',
      name: 'My Connection',
      baseUrl: 'https://personal.example.com/v1',
      providerType: 'openai-compatible',
      providerFamily: 'openai',
      enabled: true,
    });

    const res = await usersRouter(
      makeReq('/api/users/me/resources/connections', 'POST', {
        name: 'My Connection',
        base_url: 'https://personal.example.com/v1',
        provider_type: 'openai-compatible',
        key: 'secret',
      }),
      env,
      {},
      user,
      '/api/users/me/resources/connections'
    );

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.connection).toMatchObject({
      id: 'conn-personal',
      access_label: 'Personal',
      access_variant: 'personal',
    });
    expect(mocks.createUserOpenAIConnection).toHaveBeenCalledWith(
      expect.anything(),
      'u1',
      expect.objectContaining({ name: 'My Connection' })
    );
  });

  it('deletes a personal connection for the current user', async () => {
    mocks.deleteUserOpenAIConnection.mockResolvedValueOnce(true);

    const res = await usersRouter(
      makeReq('/api/users/me/resources/connections/conn-personal', 'DELETE'),
      env,
      {},
      user,
      '/api/users/me/resources/connections/conn-personal'
    );

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ success: true });
    expect(mocks.deleteUserOpenAIConnection).toHaveBeenCalledWith(
      expect.anything(),
      'u1',
      'conn-personal'
    );
  });

  it('tests a personal connection endpoint', async () => {
    mocks.discoverConnectionModels.mockResolvedValueOnce({
      items: [{ id: 'tool-a', name: 'tool-a' }],
    });

    const res = await usersRouter(
      makeReq('/api/users/me/resources/connections/test', 'POST', {
        name: 'My Connection',
        base_url: 'https://personal.example.com/v1',
        provider_type: 'openai-compatible',
        key: 'secret',
      }),
      env,
      {},
      user,
      '/api/users/me/resources/connections/test'
    );

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({
      message: 'Connection successful',
      models: [{ id: 'tool-a', name: 'tool-a' }],
    });
    expect(mocks.discoverConnectionModels).toHaveBeenCalledWith(
      expect.objectContaining({
        providerType: 'openai-compatible',
        baseUrl: 'https://personal.example.com/v1',
        key: 'secret',
      }),
      expect.any(Object)
    );
  });

  it('reuses the stored key when testing an existing personal connection', async () => {
    mocks.getUserOpenAIConnectionConfig.mockResolvedValueOnce({
      id: 'conn-personal',
      userId: 'u1',
      name: 'Saved Connection',
      providerType: 'openai-compatible',
      providerFamily: 'openai',
      baseUrl: 'https://personal.example.com/v1',
      key: 'saved-secret',
      headers: { 'X-Test': '1' },
      authType: 'bearer',
      enabled: true,
      manualModels: [],
    });
    mocks.discoverConnectionModels.mockResolvedValueOnce({
      items: [{ id: 'tool-a', name: 'tool-a' }],
    });

    const res = await usersRouter(
      makeReq('/api/users/me/resources/connections/test', 'POST', {
        id: 'conn-personal',
        name: 'Saved Connection',
        base_url: '',
        provider_type: 'openai-compatible',
        key: '',
      }),
      env,
      {},
      user,
      '/api/users/me/resources/connections/test'
    );

    expect(res.status).toBe(200);
    expect(mocks.getUserOpenAIConnectionConfig).toHaveBeenCalledWith(
      expect.anything(),
      'u1',
      'conn-personal'
    );
    expect(mocks.discoverConnectionModels).toHaveBeenCalledWith(
      expect.objectContaining({
        providerType: 'openai-compatible',
        baseUrl: 'https://personal.example.com/v1',
        key: 'saved-secret',
      }),
      expect.any(Object)
    );
  });

  it('does not leak upstream error details when personal connection test fails', async () => {
    mocks.discoverConnectionModels.mockResolvedValueOnce({
      items: [],
      error: {
        status: 401,
        url: 'https://api.openai.com/v1/models',
        message: 'Incorrect API key provided: sk-test-************cdef.',
      },
    });
    const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const res = await usersRouter(
      makeReq('/api/users/me/resources/connections/test', 'POST', {
        name: 'Leaky Connection',
        base_url: 'https://api.openai.com/v1',
        provider_type: 'openai-compatible',
        key: 'sk-test-bad',
      }),
      env,
      {},
      user,
      '/api/users/me/resources/connections/test'
    );
    const payload = await res.json();
    expect(res.status).toBe(502);
    expect(payload.details.message).toBe('Authentication failed \u2014 check your API key');
    expect(payload.details.message).not.toContain('sk-test');
    expect(payload.details.message).not.toContain('Incorrect API key');
    // Structured logger emits JSON string via console.warn
    const warnCalls = consoleSpy.mock.calls.map(call => call[0]);
    const matchedCall = warnCalls.find(call => {
      try {
        const parsed = JSON.parse(call);
        return parsed.message === 'Connection test failed';
      } catch { return false; }
    });
    expect(matchedCall).toBeTruthy();
    const parsed = JSON.parse(matchedCall);
    expect(parsed.upstreamMessage).toContain('Incorrect API key');
    consoleSpy.mockRestore();
  });

  it('returns personal MCP servers for the current user', async () => {
    mocks.loadToolServers.mockResolvedValueOnce([
      {
        id: 'mcp-personal',
        name: 'My MCP',
        url: 'https://mcp.example.com',
        enabled: true,
        source: 'user',
      },
    ]);

    const res = await usersRouter(
      makeReq('/api/users/me/resources/mcp-servers', 'GET'),
      env,
      {},
      user,
      '/api/users/me/resources/mcp-servers'
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.servers).toEqual([
      expect.objectContaining({
        id: 'mcp-personal',
        access_label: 'Personal',
        access_variant: 'personal',
      }),
    ]);
  });

  it('returns personal MCP servers with discovered tools', async () => {
    mocks.loadToolServers.mockResolvedValueOnce([
      {
        id: 'mcp-personal',
        name: 'Personal MCP',
        url: 'https://mcp.example.com',
        enabled: true,
        source: 'user',
        tools: [
          {
            name: 'exa_search',
            title: 'Exa Search',
            description: 'Search the web',
            parameters: { type: 'object' },
            enabled: true,
          },
        ],
      },
    ]);

    const res = await usersRouter(
      makeReq('/api/users/me/resources/mcp-servers', 'GET'),
      env,
      {},
      user,
      '/api/users/me/resources/mcp-servers'
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.servers).toEqual([
      expect.objectContaining({
        id: 'mcp-personal',
        access_label: 'Personal',
        access_variant: 'personal',
        tools: [
          expect.objectContaining({
            name: 'exa_search',
            title: 'Exa Search',
            description: 'Search the web',
            parameters: { type: 'object' },
            enabled: true,
          }),
        ],
      }),
    ]);
  });

  it('creates a personal MCP server for the current user', async () => {
    mocks.createUserToolServer.mockResolvedValueOnce({
      id: 'mcp-personal',
      name: 'My MCP',
      url: 'https://mcp.example.com',
      enabled: true,
    });

    const res = await usersRouter(
      makeReq('/api/users/me/resources/mcp-servers', 'POST', {
        name: 'My MCP',
        url: 'https://mcp.example.com',
        auth_type: 'bearer',
        auth_bearer_token: 'secret',
      }),
      env,
      {},
      user,
      '/api/users/me/resources/mcp-servers'
    );

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.server).toMatchObject({
      id: 'mcp-personal',
      access_label: 'Personal',
      access_variant: 'personal',
    });
    expect(mocks.createUserToolServer).toHaveBeenCalledWith(
      expect.anything(),
      'u1',
      expect.objectContaining({ name: 'My MCP' })
    );
  });

  it('tests a personal MCP server endpoint', async () => {
    mocks.testToolServerConnection.mockResolvedValueOnce({
      tools: [{ name: 'tool-a' }, { name: 'tool-b' }],
    });

    const res = await usersRouter(
      makeReq('/api/users/me/resources/mcp-servers/test', 'POST', {
        name: 'My MCP',
        url: 'https://mcp.example.com',
        auth_type: 'basic',
        auth_basic_username: 'user',
        auth_basic_password: 'pass',
      }),
      env,
      {},
      user,
      '/api/users/me/resources/mcp-servers/test'
    );

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({
      tools: [{ name: 'tool-a' }, { name: 'tool-b' }],
    });
    expect(mocks.testToolServerConnection).toHaveBeenCalledWith(
      expect.objectContaining({ url: 'https://mcp.example.com' })
    );
  });

  it('updates a personal MCP server for the current user', async () => {
    mocks.updateUserToolServer.mockResolvedValueOnce({
      id: 'mcp-personal',
      name: 'Updated MCP',
      url: 'https://mcp.example.com',
      enabled: true,
    });

    const res = await usersRouter(
      makeReq('/api/users/me/resources/mcp-servers/mcp-personal', 'PUT', {
        name: 'Updated MCP',
        url: 'https://mcp.example.com',
        auth_type: 'none',
      }),
      env,
      {},
      user,
      '/api/users/me/resources/mcp-servers/mcp-personal'
    );

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({
      server: {
        id: 'mcp-personal',
        access_label: 'Personal',
        access_variant: 'personal',
      },
    });
  });

  it('deletes a personal MCP server for the current user', async () => {
    mocks.deleteUserToolServer.mockResolvedValueOnce(true);

    const res = await usersRouter(
      makeReq('/api/users/me/resources/mcp-servers/mcp-personal', 'DELETE'),
      env,
      {},
      user,
      '/api/users/me/resources/mcp-servers/mcp-personal'
    );

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ success: true });
    expect(mocks.deleteUserToolServer).toHaveBeenCalledWith(
      expect.anything(),
      'u1',
      'mcp-personal'
    );
  });

  it('rejects invalid status values on profile update', async () => {
    const res = await usersRouter(
      makeReq('/api/users/me', 'PUT', { status: 'busy' }),
      env,
      {},
      user,
      '/api/users/me'
    );

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toMatchObject({
      error: 'Status must be one of: online, away, offline',
    });
    expect(mocks.db.run).not.toHaveBeenCalled();
  });

  it('rejects invalid preferences payloads on POST /api/users/me/update', async () => {
    const res = await usersRouter(
      makeReq('/api/users/me/update', 'POST', { preferences: [] }),
      env,
      {},
      user,
      '/api/users/me/update'
    );

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toMatchObject({
      error: 'preferences must be an object',
    });
    expect(mocks.db.run).not.toHaveBeenCalled();
  });

  it('returns a read-only ACL inspector payload for a user', async () => {
    mocks.db.first.mockImplementation(async (sql) => {
      const query = String(sql || '');
      if (query.includes('SELECT preferences FROM users WHERE id = ?')) {
        return {
          preferences: JSON.stringify({
            resource_overrides: {
              connections: {
                hidden_ids: ['conn-1'],
              },
            },
          }),
        };
      }
      if (query.includes('SELECT id, email, name, account_status FROM users WHERE id = ?')) {
        return {
          id: 'u2',
          email: 'ada@example.com',
          name: 'Ada Lovelace',
          role: 'admin',
          account_status: 'active',
        };
      }
      return null;
    });
    mocks.db.all
      .mockResolvedValueOnce([{ id: 'g1', name: 'test1', description: 'Team 1', is_system: 0 }])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        {
          id: 'r1',
          model_id: 'model-1',
          principal_type: 'group',
          principal_id: 'g1',
          effect: 'deny',
          action: 'use',
          created_at: 1,
          updated_at: 1,
        },
      ])
      .mockResolvedValueOnce([
        {
          id: 'r2',
          connection_id: 'conn-1',
          principal_type: 'user',
          principal_id: 'u2',
          effect: 'allow',
          action: 'use',
          created_at: 1,
          updated_at: 1,
        },
      ])
      .mockResolvedValueOnce([
        {
          id: 'r3',
          tool_server_id: 'mcp-1',
          principal_type: 'group',
          principal_id: 'g1',
          effect: 'allow',
          action: 'manage',
          created_at: 1,
          updated_at: 1,
        },
      ]);
    mocks.resolvePermissions.mockResolvedValueOnce(['admin.user.read', 'admin.audit.read']);

    const res = await usersRouter(
      makeReq('/api/admin/users/u2/access', 'GET'),
      env,
      {},
      { sub: 'u1', role: 'admin', email: 'admin@example.com' },
      '/api/admin/users/u2/access'
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.user).toMatchObject({
      id: 'u2',
      email: 'ada@example.com',
      primary_role: 'member',
    });
    expect(body.groups).toEqual([{ id: 'g1', name: 'test1' }]);
    expect(body.role_permissions).toEqual(['admin.user.read', 'admin.audit.read']);
    expect(body.access.models).toEqual([
      expect.objectContaining({
        family: 'model',
        resource_id: 'model-1',
        principal_label: 'Group: test1',
        effect: 'deny',
        access_state: 'revoked',
      }),
    ]);
    expect(body.access.connections).toEqual([
      expect.objectContaining({
        family: 'connection',
        resource_id: 'conn-1',
        principal_label: 'Direct user',
        effect: 'allow',
        hidden_for_user: true,
        visible_for_user: false,
        access_state: 'hidden_for_user',
      }),
    ]);
    expect(body.access.mcp_servers).toEqual([
      expect.objectContaining({
        family: 'mcp_server',
        resource_id: 'mcp-1',
        principal_label: 'Group: test1',
        action: 'manage',
        access_state: 'shared',
      }),
    ]);
  });

  it('creates users with custom roles', async () => {
    mocks.db.first.mockImplementation(async (sql) => {
      const query = String(sql || '');
      if (query.includes('SELECT name FROM roles WHERE LOWER(name) = LOWER(?)')) {
        return { name: 'Support' };
      }
      if (query.includes('SELECT id FROM users WHERE email = ?')) {
        return null;
      }
      if (
        query.includes(
          'SELECT id, email, name, account_status, settings, created_at, updated_at, last_active_at FROM users WHERE id = ?'
        )
      ) {
        return {
          id: 'u2',
          email: 'support@example.com',
          name: 'Support Agent',
          account_status: 'active',
          settings: '{}',
          created_at: 10,
          updated_at: 10,
          last_active_at: 10,
        };
      }
      return null;
    });

    const res = await usersRouter(
      makeReq('/api/admin/users', 'POST', {
        email: 'support@example.com',
        name: 'Support Agent',
        password: 'Password123',
        primary_role: 'Support',
      }),
      env,
      {},
      { sub: 'u1', role: 'admin', email: 'admin@example.com' },
      '/api/admin/users'
    );

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.user).toMatchObject({
      email: 'support@example.com',
      name: 'Support Agent',
      primary_role: 'Support',
    });
    expect(
      mocks.db.run.mock.calls.some(
        ([sql, params]) =>
          String(sql).includes('INSERT OR IGNORE INTO user_roles') && params?.[2] === 'Support'
      )
    ).toBe(true);
  });

  it('updates users with custom roles', async () => {
    mocks.db.first.mockImplementation(async (sql) => {
      const query = String(sql || '');
      if (query.includes('SELECT id, account_status, email, name FROM users WHERE id = ?')) {
        return {
          id: 'u2',
          account_status: 'active',
          email: 'user@example.com',
          name: 'User',
        };
      }
      if (query.includes('SELECT name FROM roles WHERE LOWER(name) = LOWER(?)')) {
        return { name: 'Support' };
      }
      if (query.includes('SELECT COALESCE((')) {
        return { role: 'member' };
      }
      if (
        query.includes(
          'SELECT id, email, name, account_status, settings, created_at, updated_at FROM users WHERE id = ?'
        )
      ) {
        return {
          id: 'u2',
          email: 'user@example.com',
          name: 'User',
          account_status: 'active',
          settings: '{}',
          created_at: 10,
          updated_at: 11,
        };
      }
      return null;
    });

    const res = await usersRouter(
      makeReq('/api/admin/users/u2', 'PUT', {
        primary_role: 'Support',
      }),
      env,
      {},
      { sub: 'u1', role: 'admin', email: 'admin@example.com' },
      '/api/admin/users/u2'
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.user).toMatchObject({
      id: 'u2',
      primary_role: 'Support',
    });
    expect(
      mocks.db.run.mock.calls.some(
        ([sql, params]) =>
          String(sql).includes('INSERT OR IGNORE INTO user_roles') && params?.[2] === 'Support'
      )
    ).toBe(true);
  });

  it('deletes a user record instead of deactivating it', async () => {
    mocks.db.first.mockResolvedValueOnce({
      id: 'u2',
      role: 'member',
      account_status: 'active',
    });

    const res = await usersRouter(
      makeReq('/api/admin/users/u2', 'DELETE'),
      env,
      {},
      { sub: 'u1', role: 'admin', email: 'admin@example.com' },
      '/api/admin/users/u2'
    );

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({
      success: true,
      message: 'User deleted successfully',
    });
    expect(mocks.db.run).toHaveBeenCalledWith('DELETE FROM users WHERE id = ?', ['u2']);
    expect(mocks.logAuditEvent).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        action: 'user_deleted',
        resource_type: 'user',
        resource_id: 'u2',
      })
    );
  });

  it('rejects deleting your own account', async () => {
    const res = await usersRouter(
      makeReq('/api/admin/users/u1', 'DELETE'),
      env,
      {},
      { sub: 'u1', role: 'admin', email: 'admin@example.com' },
      '/api/admin/users/u1'
    );

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toMatchObject({
      error: 'Cannot delete your own account',
    });
    expect(mocks.db.run).not.toHaveBeenCalled();
  });
});
