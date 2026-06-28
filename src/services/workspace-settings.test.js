import { describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  deriveWorkspaceCapabilityFlags: vi.fn(() => ({
    canManageConnections: false,
    canManageToolServers: false,
    canManageModels: false,
  })),
  normalizeConnectionModelSelectionMode: vi.fn((v) => v || ''),
  getConfigValue: vi.fn(),
  resolvePermissions: vi.fn(),
  getUserRoles: vi.fn(),
  loadPrimaryRole: vi.fn(),
  getAllOpenAIConnectionConfigs: vi.fn(),
  loadUserOpenAIConnectionConfigs: vi.fn(),
  loadToolServers: vi.fn(),
}));

vi.mock('../../public/js/shared/utils/workspace-permissions.js', () => ({
  deriveWorkspaceCapabilityFlags: (...args) => mocks.deriveWorkspaceCapabilityFlags(...args),
}));

vi.mock('../../public/js/shared/utils/connection-model-selection.js', () => ({
  normalizeConnectionModelSelectionMode: (...args) =>
    mocks.normalizeConnectionModelSelectionMode(...args),
}));

vi.mock('../utils/app-config.js', () => ({
  getConfigValue: (...args) => mocks.getConfigValue(...args),
}));

vi.mock('../utils/authorize.js', () => ({
  resolvePermissions: (...args) => mocks.resolvePermissions(...args),
  getUserRoles: (...args) => mocks.getUserRoles(...args),
}));

vi.mock('../utils/user-role.js', () => ({
  loadPrimaryRole: (...args) => mocks.loadPrimaryRole(...args),
}));

vi.mock('../llm/connections.js', () => ({
  getAllOpenAIConnectionConfigs: (...args) => mocks.getAllOpenAIConnectionConfigs(...args),
  loadUserOpenAIConnectionConfigs: (...args) => mocks.loadUserOpenAIConnectionConfigs(...args),
}));

vi.mock('../admin/tool-servers.js', () => ({
  loadToolServers: (...args) => mocks.loadToolServers(...args),
}));

import {
  resolveWorkspaceCapabilities,
  toPersonalConnectionSummary,
  toAccessibleConnectionSummary,
  toPersonalToolServerSummary,
  toAccessibleToolServerSummary,
  buildWorkspaceSettingsPayload,
  loadWorkspaceConnectionsPayload,
  loadWorkspaceToolServersPayload,
  loadWorkspaceSettingsPayload,
} from './workspace-settings.js';

describe('resolveWorkspaceCapabilities', () => {
  it('returns account route capabilities by default', () => {
    const caps = resolveWorkspaceCapabilities();
    expect(caps.route).toBe('account');
    expect(caps.primaryRole).toBe('member');
    expect(caps.permissions).toEqual([]);
    expect(caps.canManageConnections).toBe(false);
    expect(caps.canManageToolServers).toBe(false);
    expect(caps.canManageModels).toBe(false);
    expect(caps.canManageAcls).toBe(false);
  });

  it('sets admin route when route is "admin"', () => {
    const caps = resolveWorkspaceCapabilities({
      route: 'admin',
      permissions: ['admin.rbac.admin'],
    });
    expect(caps.route).toBe('admin');
    expect(caps.canManageAcls).toBe(true);
  });

  it('sets canManageAcls to false on non-admin route even with permission', () => {
    const caps = resolveWorkspaceCapabilities({
      route: 'account',
      permissions: ['admin.rbac.admin'],
    });
    expect(caps.canManageAcls).toBe(false);
  });

  it('uses provided primaryRole', () => {
    const caps = resolveWorkspaceCapabilities({ primaryRole: 'Admin' });
    expect(caps.primaryRole).toBe('admin');
  });

  it('passes permissions to deriveWorkspaceCapabilityFlags', () => {
    const perms = ['user.settings.connections.write'];
    resolveWorkspaceCapabilities({ permissions: perms });
    expect(mocks.deriveWorkspaceCapabilityFlags).toHaveBeenCalledWith('account', perms);
  });

  it('handles case-insensitive admin route', () => {
    const caps = resolveWorkspaceCapabilities({ route: 'Admin' });
    expect(caps.route).toBe('admin');
  });

  it('defaults empty primaryRole to member', () => {
    const caps = resolveWorkspaceCapabilities({ primaryRole: '' });
    expect(caps.primaryRole).toBe('member');
  });
});

describe('toPersonalConnectionSummary', () => {
  it('maps a full connection object', () => {
    const conn = {
      id: 'c1',
      name: 'MyConn',
      providerType: 'openai',
      providerFamily: 'openai',
      baseUrl: 'https://api.openai.com',
      authType: 'bearer',
      enabled: true,
      key: 'sk-xxx',
      headers: { 'X-Custom': 'val' },
      manualModels: ['gpt-4'],
      manualModelsMode: 'some',
    };
    const summary = toPersonalConnectionSummary(conn);
    expect(summary.id).toBe('c1');
    expect(summary.name).toBe('MyConn');
    expect(summary.access_label).toBe('Personal');
    expect(summary.access_variant).toBe('personal');
    expect(summary.enabled).toBe(true);
    expect(summary.has_key).toBe(true);
    expect(summary.manual_models).toEqual(['gpt-4']);
  });

  it('defaults enabled to true when not explicitly false', () => {
    expect(toPersonalConnectionSummary({ id: 'x' }).enabled).toBe(true);
    expect(toPersonalConnectionSummary({ id: 'x', enabled: false }).enabled).toBe(false);
  });

  it('handles snake_case field names', () => {
    const conn = {
      id: 'c2',
      provider_type: 'anthropic',
      provider_family: 'claude',
      url: 'https://api.anthropic.com',
      auth_type: 'basic',
      manual_models: [],
      manual_models_mode: 'all',
    };
    const summary = toPersonalConnectionSummary(conn);
    expect(summary.provider_type).toBe('anthropic');
    expect(summary.provider_family).toBe('claude');
    expect(summary.base_url).toBe('https://api.anthropic.com');
    expect(summary.auth_type).toBe('basic');
    expect(summary.manual_models).toEqual([]);
  });

  it('normalizes manualModelsMode via shared util', () => {
    mocks.normalizeConnectionModelSelectionMode.mockReturnValueOnce('all');
    const summary = toPersonalConnectionSummary({ id: 'x', manualModelsMode: 'ALL' });
    expect(summary.manual_models_mode).toBe('all');
  });
});

describe('toAccessibleConnectionSummary', () => {
  it('maps connection with admin variant', () => {
    const summary = toAccessibleConnectionSummary(
      { id: 'c1', name: 'Shared', baseUrl: 'https://api.openai.com', providerFamily: 'openai' },
      'admin'
    );
    expect(summary.access_label).toBe('Admin');
    expect(summary.access_variant).toBe('admin');
  });

  it('maps connection with shared variant', () => {
    const summary = toAccessibleConnectionSummary(
      { id: 'c1', name: 'Shared', url: 'https://api.openai.com' },
      'shared'
    );
    expect(summary.access_label).toBe('Shared');
    expect(summary.access_variant).toBe('shared');
  });

  it('defaults visible_for_user to true', () => {
    const summary = toAccessibleConnectionSummary({ id: 'c1' });
    expect(summary.visible_for_user).toBe(true);
    expect(summary.hidden_for_user).toBe(false);
  });

  it('respects hidden_for_user flag', () => {
    const summary = toAccessibleConnectionSummary({ id: 'c1', hidden_for_user: true });
    // hidden_for_user is set, but visible_for_user defaults to true unless explicitly set to false
    expect(summary.hidden_for_user).toBe(true);
  });

  it('sets visible_for_user to false when explicitly set', () => {
    const summary = toAccessibleConnectionSummary({ id: 'c1', visible_for_user: false });
    expect(summary.visible_for_user).toBe(false);
  });
});

describe('toPersonalToolServerSummary', () => {
  it('maps a tool server with all fields', () => {
    const server = {
      id: 's1',
      name: 'MyMCP',
      url: 'https://mcp.example.com',
      headers: '{"Auth":"Bearer x"}',
      enabled: true,
      auth_type: 'bearer',
      auth_bearer_token: 'tok123',
      tools: [{ name: 'tool1', enabled: true, visible_for_user: true, hidden_for_user: false }],
      oauth_connected: true,
      oauth_connected_at: 1234567890,
    };
    const summary = toPersonalToolServerSummary(server);
    expect(summary.id).toBe('s1');
    expect(summary.name).toBe('MyMCP');
    expect(summary.access_label).toBe('Personal');
    expect(summary.oauth_connected).toBe(true);
    expect(summary.tools).toHaveLength(1);
  });

  it('defaults enabled to true', () => {
    expect(toPersonalToolServerSummary({ id: 'x' }).enabled).toBe(true);
  });

  it('normalizes tools array, filtering out nameless tools', () => {
    const server = { id: 's', tools: [{ name: 'a' }, { name: '' }] };
    const summary = toPersonalToolServerSummary(server);
    expect(summary.tools).toHaveLength(1);
    expect(summary.tools[0].name).toBe('a');
  });

  it('handles empty tools array', () => {
    const summary = toPersonalToolServerSummary({ id: 's', tools: [] });
    expect(summary.tools).toEqual([]);
  });

  it('handles missing tools', () => {
    const summary = toPersonalToolServerSummary({ id: 's' });
    expect(summary.tools).toEqual([]);
  });
});

describe('toAccessibleToolServerSummary', () => {
  it('filters to visible, enabled tools in note', () => {
    const server = {
      id: 's1',
      name: 'AdminMCP',
      tools: [
        { name: 'a', enabled: true, visible_for_user: true },
        { name: 'b', enabled: false, visible_for_user: true },
        { name: 'c', enabled: true, visible_for_user: false },
      ],
    };
    const summary = toAccessibleToolServerSummary(server);
    expect(summary.note).toContain('1 tools available');
  });

  it('falls back to url when no visible tools', () => {
    const server = { id: 's1', url: 'https://mcp.example.com', tools: [] };
    const summary = toAccessibleToolServerSummary(server);
    expect(summary.note).toBe('https://mcp.example.com');
  });

  it('determines access_variant from source', () => {
    const userServer = { id: 's1', source: 'user' };
    const adminServer = { id: 's2', source: 'admin' };
    expect(toAccessibleToolServerSummary(userServer).access_variant).toBe('personal');
    expect(toAccessibleToolServerSummary(adminServer).access_variant).toBe('admin');
  });

  it('respects explicit access_label and access_variant', () => {
    const server = { id: 's1', access_label: 'Custom', access_variant: 'custom' };
    const summary = toAccessibleToolServerSummary(server);
    expect(summary.access_label).toBe('Custom');
    expect(summary.access_variant).toBe('custom');
  });
});

describe('buildWorkspaceSettingsPayload', () => {
  const baseRow = {
    id: 'u1',
    name: 'Test User',
    email: 'test@example.com',
    avatar: null,
    avatar_emoji: null,
    status: 'online',
    account_status: 'active',
    settings: '{}',
    preferences: '{}',
  };

  const profileResponseFactory = (row, opts) => ({
    id: row.id,
    name: row.name,
    email: row.email,
    default_model_id: opts.defaultModelId,
  });

  it('throws if profileResponseFactory is not a function', () => {
    expect(() => buildWorkspaceSettingsPayload({ row: baseRow })).toThrow(
      'profileResponseFactory is required'
    );
  });

  it('builds payload with all sections', () => {
    const payload = buildWorkspaceSettingsPayload({
      row: baseRow,
      defaultModelId: 'gpt-4',
      primaryRole: 'admin',
      permissions: ['admin.rbac.admin'],
      roles: ['admin'],
      ownConnections: [],
      allConnections: [],
      toolServers: [],
      accessibleToolServers: [],
      profileResponseFactory,
      route: 'admin',
    });

    expect(payload.id).toBe('u1');
    expect(payload.default_model_id).toBe('gpt-4');
    expect(payload.permissions).toEqual(['admin.rbac.admin']);
    expect(payload.roles).toEqual(['admin']);
    expect(payload.capabilities.route).toBe('admin');
    expect(payload.settings.general.id).toBe('u1');
    expect(payload.settings.general.account_status).toBe('active');
    expect(payload.settings.connections.my_connections).toEqual([]);
    expect(payload.settings.connections.connections).toEqual([]);
    expect(payload.settings.models.default_model_id).toBe('gpt-4');
  });

  it('maps account_status pending correctly', () => {
    const row = { ...baseRow, account_status: 'pending' };
    const payload = buildWorkspaceSettingsPayload({ row, profileResponseFactory });
    expect(payload.settings.general.account_status).toBe('pending');
  });

  it('treats non-pending account_status as active', () => {
    const row = { ...baseRow, account_status: 'suspended' };
    const payload = buildWorkspaceSettingsPayload({ row, profileResponseFactory });
    expect(payload.settings.general.account_status).toBe('active');
  });

  it('uses capabilityOverrides when provided', () => {
    const customCaps = { route: 'admin', canManageAcls: true };
    const payload = buildWorkspaceSettingsPayload({
      row: baseRow,
      profileResponseFactory,
      capabilities: customCaps,
    });
    expect(payload.capabilities).toBe(customCaps);
  });

  it('includes ownConnections in my_connections', () => {
    const ownConn = [{ id: 'c1', name: 'MyConn', baseUrl: 'https://api.openai.com' }];
    const payload = buildWorkspaceSettingsPayload({
      row: baseRow,
      ownConnections: ownConn,
      allConnections: [],
      profileResponseFactory,
    });
    expect(payload.settings.connections.my_connections).toHaveLength(1);
  });

  it('filters user-source connections from allConnections in accessible list', () => {
    const allConns = [
      { id: 'c1', source: 'admin', baseUrl: 'https://api.openai.com' },
      { id: 'c2', source: 'user', baseUrl: 'https://my.api.com' },
    ];
    const payload = buildWorkspaceSettingsPayload({
      row: baseRow,
      allConnections: allConns,
      ownConnections: [],
      profileResponseFactory,
    });
    const accessible = payload.settings.connections.connections;
    expect(accessible).toHaveLength(1);
    expect(accessible[0].id).toBe('c1');
  });

  it('includes accessible tool servers with visibility flags', () => {
    const accessible = [
      {
        id: 's1',
        name: 'AdminSrv',
        source: 'admin',
        enabled: true,
        visible_for_user: true,
        hidden_for_user: false,
      },
    ];
    const payload = buildWorkspaceSettingsPayload({
      row: baseRow,
      toolServers: [],
      accessibleToolServers: accessible,
      profileResponseFactory,
    });
    expect(payload.settings.integrations.accessible_servers).toHaveLength(1);
    expect(payload.settings.integrations.accessible_servers[0].visible_for_user).toBe(true);
  });

  it('parses JSON settings and preferences', () => {
    const row = { ...baseRow, settings: '{"theme":"dark"}', preferences: '{"lang":"en"}' };
    const payload = buildWorkspaceSettingsPayload({ row, profileResponseFactory });
    expect(payload.settings.general.settings).toEqual({ theme: 'dark' });
    expect(payload.settings.preferences).toEqual({ lang: 'en' });
  });

  it('handles invalid JSON in settings gracefully', () => {
    const row = { ...baseRow, settings: 'not-json', preferences: null };
    const payload = buildWorkspaceSettingsPayload({ row, profileResponseFactory });
    expect(payload.settings.general.settings).toEqual({});
    expect(payload.settings.preferences).toEqual({});
  });
});

describe('loadWorkspaceConnectionsPayload', () => {
  it('throws if db is missing', async () => {
    await expect(loadWorkspaceConnectionsPayload({ env: {}, userId: 'u1' })).rejects.toThrow(
      'db, env, and userId are required'
    );
  });

  it('throws if env is missing', async () => {
    await expect(loadWorkspaceConnectionsPayload({ db: {}, userId: 'u1' })).rejects.toThrow(
      'db, env, and userId are required'
    );
  });

  it('throws if userId is missing', async () => {
    await expect(loadWorkspaceConnectionsPayload({ db: {}, env: {} })).rejects.toThrow(
      'db, env, and userId are required'
    );
  });

  it('loads and maps connections', async () => {
    mocks.loadUserOpenAIConnectionConfigs.mockResolvedValueOnce([
      {
        id: 'c1',
        name: 'MyConn',
        baseUrl: 'https://api.openai.com',
        enabled: true,
        source: 'user',
      },
    ]);
    mocks.getAllOpenAIConnectionConfigs.mockResolvedValueOnce([
      {
        id: 'c2',
        name: 'Shared',
        baseUrl: 'https://shared.com',
        enabled: true,
        source: 'admin',
        visible_for_user: true,
        hidden_for_user: false,
      },
    ]);

    const result = await loadWorkspaceConnectionsPayload({
      db: {},
      env: {},
      userId: 'u1',
      primaryRole: 'member',
    });

    expect(result.my_connections).toHaveLength(1);
    expect(result.connections).toHaveLength(1);
    expect(result.connections[0].visible_for_user).toBe(true);
  });

  it('filters out disabled connections from accessible list', async () => {
    mocks.loadUserOpenAIConnectionConfigs.mockResolvedValueOnce([]);
    mocks.getAllOpenAIConnectionConfigs.mockResolvedValueOnce([
      { id: 'c1', source: 'admin', enabled: false },
      {
        id: 'c2',
        source: 'admin',
        enabled: true,
        baseUrl: 'https://api.com',
        visible_for_user: true,
        hidden_for_user: false,
      },
    ]);

    const result = await loadWorkspaceConnectionsPayload({
      db: {},
      env: {},
      userId: 'u1',
    });

    expect(result.connections).toHaveLength(1);
    expect(result.connections[0].id).toBe('c2');
  });
});

describe('loadWorkspaceToolServersPayload', () => {
  it('throws if db is missing', async () => {
    await expect(loadWorkspaceToolServersPayload({ userId: 'u1' })).rejects.toThrow(
      'db and userId are required'
    );
  });

  it('throws if userId is missing', async () => {
    await expect(loadWorkspaceToolServersPayload({ db: {} })).rejects.toThrow(
      'db and userId are required'
    );
  });

  it('loads and separates personal vs accessible servers', async () => {
    mocks.loadToolServers.mockResolvedValueOnce([
      {
        id: 's1',
        name: 'Personal',
        source: 'user',
        enabled: true,
        url: 'https://mcp.example.com',
        visible_for_user: true,
        hidden_for_user: false,
      },
      {
        id: 's2',
        name: 'Admin',
        source: 'admin',
        enabled: true,
        url: 'https://admin-mcp.com',
        visible_for_user: true,
        hidden_for_user: false,
      },
      {
        id: 's3',
        name: 'Disabled',
        source: 'admin',
        enabled: false,
        url: 'https://disabled.com',
        visible_for_user: true,
        hidden_for_user: false,
      },
    ]);

    const result = await loadWorkspaceToolServersPayload({ db: {}, userId: 'u1' });

    expect(result.servers).toHaveLength(1);
    expect(result.servers[0].id).toBe('s1');
    expect(result.accessible_servers).toHaveLength(1);
    expect(result.accessible_servers[0].id).toBe('s2');
  });
});

describe('loadWorkspaceSettingsPayload', () => {
  it('throws if db is missing', async () => {
    await expect(
      loadWorkspaceSettingsPayload({ env: {}, userId: 'u1', profileResponseFactory: vi.fn() })
    ).rejects.toThrow('db, env, and userId are required');
  });

  it('throws if profileResponseFactory is not a function', async () => {
    await expect(loadWorkspaceSettingsPayload({ db: {}, env: {}, userId: 'u1' })).rejects.toThrow(
      'profileResponseFactory is required'
    );
  });

  it('returns null when user not found', async () => {
    const db = { first: vi.fn().mockResolvedValue(null) };
    const result = await loadWorkspaceSettingsPayload({
      db,
      env: {},
      userId: 'u1',
      profileResponseFactory: vi.fn(),
    });
    expect(result).toBeNull();
  });

  it('builds full payload for existing user', async () => {
    const row = {
      id: 'u1',
      email: 'test@example.com',
      name: 'Test',
      account_status: 'active',
      settings: '{}',
      avatar: null,
      avatar_emoji: null,
      status: 'online',
      preferences: '{}',
      created_at: 1000,
      updated_at: 2000,
      last_active_at: 3000,
    };
    const db = { first: vi.fn().mockResolvedValue(row) };
    mocks.loadPrimaryRole.mockResolvedValueOnce('admin');
    mocks.getConfigValue.mockResolvedValueOnce('gpt-4');
    mocks.resolvePermissions.mockResolvedValueOnce(['admin.rbac.admin']);
    mocks.getUserRoles.mockResolvedValueOnce(['admin']);
    mocks.loadUserOpenAIConnectionConfigs.mockResolvedValueOnce([]);
    mocks.getAllOpenAIConnectionConfigs.mockResolvedValueOnce([]);
    mocks.loadToolServers.mockResolvedValueOnce([]);

    const factory = vi.fn((r, opts) => ({
      id: r.id,
      name: r.name,
      default_model_id: opts.defaultModelId,
    }));

    const result = await loadWorkspaceSettingsPayload({
      db,
      env: {},
      userId: 'u1',
      profileResponseFactory: factory,
      route: 'admin',
    });

    expect(result).toBeDefined();
    expect(result.id).toBe('u1');
    expect(result.capabilities.route).toBe('admin');
    expect(result.settings.models.default_model_id).toBe('gpt-4');
  });

  it('falls back to member role when loadPrimaryRole returns null', async () => {
    const row = {
      id: 'u1',
      email: 't@t.com',
      name: 'T',
      account_status: 'active',
      settings: '{}',
      avatar: null,
      avatar_emoji: null,
      status: 'online',
      preferences: '{}',
    };
    const db = { first: vi.fn().mockResolvedValue(row) };
    mocks.loadPrimaryRole.mockResolvedValueOnce(null);
    mocks.getConfigValue.mockResolvedValueOnce(null);
    mocks.resolvePermissions.mockResolvedValueOnce([]);
    mocks.getUserRoles.mockResolvedValueOnce([]);
    mocks.loadUserOpenAIConnectionConfigs.mockResolvedValueOnce([]);
    mocks.getAllOpenAIConnectionConfigs.mockResolvedValueOnce([]);
    mocks.loadToolServers.mockResolvedValueOnce([]);

    const factory = vi.fn((r, opts) => ({ id: r.id, default_model_id: opts.defaultModelId }));
    const result = await loadWorkspaceSettingsPayload({
      db,
      env: {},
      userId: 'u1',
      profileResponseFactory: factory,
    });

    expect(result.capabilities.primaryRole).toBe('member');
  });

  it('handles getConfigValue error gracefully', async () => {
    const row = {
      id: 'u1',
      email: 't@t.com',
      name: 'T',
      account_status: 'active',
      settings: '{}',
      avatar: null,
      avatar_emoji: null,
      status: 'online',
      preferences: '{}',
    };
    const db = { first: vi.fn().mockResolvedValue(row) };
    mocks.loadPrimaryRole.mockResolvedValueOnce('member');
    mocks.getConfigValue.mockRejectedValueOnce(new Error('config error'));
    mocks.resolvePermissions.mockResolvedValueOnce([]);
    mocks.getUserRoles.mockResolvedValueOnce([]);
    mocks.loadUserOpenAIConnectionConfigs.mockResolvedValueOnce([]);
    mocks.getAllOpenAIConnectionConfigs.mockResolvedValueOnce([]);
    mocks.loadToolServers.mockResolvedValueOnce([]);

    const factory = vi.fn((r, opts) => ({ id: r.id, default_model_id: opts.defaultModelId }));
    const result = await loadWorkspaceSettingsPayload({
      db,
      env: {},
      userId: 'u1',
      profileResponseFactory: factory,
    });

    expect(result.settings.models.default_model_id).toBeNull();
  });
});
