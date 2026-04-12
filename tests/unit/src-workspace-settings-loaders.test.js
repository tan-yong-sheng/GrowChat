import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getConfigValue: vi.fn(),
  resolvePermissions: vi.fn(),
  getUserRoles: vi.fn(),
  loadPrimaryRole: vi.fn(),
  loadUserOpenAIConnectionConfigs: vi.fn(),
  getAllOpenAIConnectionConfigs: vi.fn(),
  loadUserToolServers: vi.fn(),
  loadToolServers: vi.fn(),
}));

vi.mock('../../src/utils/app-config.js', () => ({
  getConfigValue: (...args) => mocks.getConfigValue(...args),
}));

vi.mock('../../src/utils/authorize.js', () => ({
  resolvePermissions: (...args) => mocks.resolvePermissions(...args),
  getUserRoles: (...args) => mocks.getUserRoles(...args),
}));

vi.mock('../../src/utils/user-role.js', () => ({
  loadPrimaryRole: (...args) => mocks.loadPrimaryRole(...args),
}));

vi.mock('../../src/llm/connections.js', () => ({
  loadUserOpenAIConnectionConfigs: (...args) => mocks.loadUserOpenAIConnectionConfigs(...args),
  getAllOpenAIConnectionConfigs: (...args) => mocks.getAllOpenAIConnectionConfigs(...args),
}));

vi.mock('../../src/admin/tool-servers.js', () => ({
  loadUserToolServers: (...args) => mocks.loadUserToolServers(...args),
  loadToolServers: (...args) => mocks.loadToolServers(...args),
}));

async function loadModule() {
  vi.resetModules();
  return import('../../src/services/workspace-settings.js');
}

describe('workspace settings loaders', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getConfigValue.mockResolvedValue('gpt-5-mini');
    mocks.resolvePermissions.mockResolvedValue([
      'user.settings.connections.write',
      'user.settings.integrations.write',
      'user.settings.preferences.write',
      'user.settings.tool-servers.write',
    ]);
    mocks.getUserRoles.mockResolvedValue([{ role_name: 'member' }]);
    mocks.loadPrimaryRole.mockResolvedValue('member');
    mocks.loadUserOpenAIConnectionConfigs.mockResolvedValue([
      { id: 'conn-1', name: 'Personal', enabled: true },
    ]);
    mocks.getAllOpenAIConnectionConfigs.mockResolvedValue([
      { id: 'shared-1', name: 'Shared', source: 'admin', access_variant: 'shared' },
      { id: 'shared-hidden', name: 'Hidden Shared', source: 'admin', access_variant: 'shared', hidden_for_user: true, visible_for_user: false },
      { id: 'shared-disabled', name: 'Disabled Shared', source: 'admin', access_variant: 'shared', enabled: false },
      { id: 'conn-1', name: 'Personal', source: 'user' },
    ]);
    mocks.loadToolServers.mockResolvedValue([
      {
        id: 'mcp-1',
        name: 'MCP',
        url: 'https://mcp.example.com',
        enabled: true,
        source: 'user',
        tools: [{ name: 'exa_search', title: 'Exa Search', description: 'Search the web', parameters: { type: 'object' }, enabled: true }],
      },
      {
        id: 'mcp-2',
        name: 'Shared MCP',
        url: 'https://shared.example.com',
        enabled: true,
        source: 'config',
        access_label: 'Shared',
        access_variant: 'shared',
        tools: [{ name: 'shared_search', title: 'Shared Search', description: 'Search the workspace', parameters: { type: 'object' }, enabled: true }],
      },
      {
        id: 'mcp-disabled',
        name: 'Disabled Shared MCP',
        url: 'https://disabled.example.com',
        enabled: false,
        source: 'config',
        access_label: 'Shared',
        access_variant: 'shared',
        tools: [{ name: 'disabled_search', title: 'Disabled Search', description: 'Disabled tool', parameters: { type: 'object' }, enabled: true }],
      },
    ]);
  });

  it('loads shared connection summaries through the workspace service', async () => {
    const { loadWorkspaceConnectionsPayload } = await loadModule();
    const payload = await loadWorkspaceConnectionsPayload({
      db: {},
      env: {},
      userId: 'u1',
      primaryRole: 'member',
      includeDisabled: true,
      includeHiddenForUser: true,
    });

    expect(payload.connections).toEqual([
      expect.objectContaining({
        id: 'shared-1',
        access_label: 'Shared',
        access_variant: 'shared',
      }),
      expect.objectContaining({
        id: 'shared-hidden',
        access_label: 'Shared',
        access_variant: 'shared',
        hidden_for_user: true,
        visible_for_user: false,
      }),
    ]);
    expect(payload.connections.some((connection) => connection.id === 'shared-disabled')).toBe(false);
    expect(payload.my_connections).toEqual([
      expect.objectContaining({
        id: 'conn-1',
        access_label: 'Personal',
        access_variant: 'personal',
      }),
    ]);
    expect(mocks.getAllOpenAIConnectionConfigs).toHaveBeenCalledWith({}, expect.objectContaining({
      userId: 'u1',
      userRole: 'member',
      includeDisabled: true,
      includeHiddenForUser: true,
    }));
  });

  it('loads personal tool servers through the workspace service', async () => {
    const { loadWorkspaceToolServersPayload } = await loadModule();
    const payload = await loadWorkspaceToolServersPayload({
      db: {},
      userId: 'u1',
    });

    expect(payload.servers).toEqual([
      expect.objectContaining({
        id: 'mcp-1',
        access_label: 'Personal',
        access_variant: 'personal',
        tools: [
          expect.objectContaining({
            name: 'exa_search',
            title: 'Exa Search',
            parameters: { type: 'object' },
          }),
        ],
      }),
    ]);
    expect(payload.accessible_servers).toEqual([
      expect.objectContaining({
        id: 'mcp-2',
        access_label: 'Shared',
        access_variant: 'shared',
        tools: [
          expect.objectContaining({
            name: 'shared_search',
            title: 'Shared Search',
            parameters: { type: 'object' },
            visible_for_user: true,
            hidden_for_user: false,
          }),
        ],
      }),
    ]);
    expect(payload.accessible_servers.some((server) => server.id === 'mcp-disabled')).toBe(false);
    expect(mocks.loadToolServers).toHaveBeenCalledWith({}, { userId: 'u1', includeHiddenForUser: true });
  });

  it('loads a full workspace settings payload through the shared service', async () => {
    const { loadWorkspaceSettingsPayload } = await loadModule();
    const payload = await loadWorkspaceSettingsPayload({
      db: {
        first: vi.fn().mockResolvedValue({
          id: 'u1',
          email: 'sam@example.com',
          name: 'Sam',
          account_status: 'active',
          settings: '{"theme":"dark"}',
          preferences: '{"locale":"en"}',
          avatar: null,
          avatar_emoji: 'S',
          status: 'online',
        }),
      },
      env: {},
      userId: 'u1',
      route: 'account',
      profileResponseFactory: (row, { defaultModelId }) => ({
        user: { id: row.id, email: row.email, name: row.name },
        app_config: { default_model_id: defaultModelId },
      }),
    });

    expect(payload.capabilities).toMatchObject({
      route: 'account',
      canManageConnections: true,
      canManageToolServers: true,
      canManageModels: true,
      canManageAcls: false,
    });
    expect(payload.settings.general.settings).toEqual({ theme: 'dark' });
    expect(payload.settings.preferences).toEqual({ locale: 'en' });
    expect(payload.settings.connections.connections).toEqual([
      expect.objectContaining({
        id: 'shared-1',
        access_label: 'Shared',
        access_variant: 'shared',
      }),
      expect.objectContaining({
        id: 'shared-hidden',
        access_label: 'Shared',
        access_variant: 'shared',
        hidden_for_user: true,
        visible_for_user: false,
      }),
    ]);
    expect(payload.settings.tool_servers.servers).toHaveLength(1);
    expect(payload.settings.tool_servers.accessible_servers).toEqual([
      expect.objectContaining({
        id: 'mcp-2',
        access_label: 'Shared',
        access_variant: 'shared',
        tools: [
          expect.objectContaining({
            name: 'shared_search',
            title: 'Shared Search',
            visible_for_user: true,
            hidden_for_user: false,
          }),
        ],
      }),
    ]);
    expect(payload.settings.connections.connections.some((connection) => connection.id === 'shared-disabled')).toBe(false);
    expect(payload.settings.tool_servers.accessible_servers.some((server) => server.id === 'mcp-disabled')).toBe(false);
    expect(mocks.resolvePermissions).toHaveBeenCalledWith({}, { sub: 'u1' });
    expect(mocks.getUserRoles).toHaveBeenCalledWith({}, 'u1');
  });
});
