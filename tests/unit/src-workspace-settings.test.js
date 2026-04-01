import { describe, expect, it } from 'vitest';
import {
  buildWorkspaceSettingsPayload,
  resolveWorkspaceCapabilities,
} from '../../src/services/workspace-settings.js';

describe('workspace settings service', () => {
  it('resolves account and admin capabilities from permissions', () => {
    expect(resolveWorkspaceCapabilities({
      route: 'account',
      permissions: [
        'user.settings.connections.write',
        'user.settings.integrations.write',
        'user.settings.preferences.write',
        'user.settings.tool-servers.write',
      ],
      primaryRole: 'member',
    })).toMatchObject({
      route: 'account',
      canManageConnections: true,
      canManageToolServers: true,
      canManageModels: true,
      canManageAcls: false,
    });

    expect(resolveWorkspaceCapabilities({
      route: 'admin',
      permissions: [
        'admin.settings.connections.write',
        'admin.settings.integrations.write',
        'admin.settings.models.write',
        'admin.rbac.admin',
      ],
      primaryRole: 'admin',
    })).toMatchObject({
      route: 'admin',
      canManageConnections: true,
      canManageToolServers: true,
      canManageModels: true,
      canManageAcls: true,
    });
  });

  it('builds a shared workspace settings payload with capabilities', () => {
    const payload = buildWorkspaceSettingsPayload({
      row: {
        id: 'u1',
        email: 'sam@example.com',
        name: 'Sam',
        account_status: 'active',
        settings: '{"theme":"dark"}',
        preferences: '{"locale":"en"}',
        avatar: null,
        avatar_emoji: 'S',
        status: 'online',
      },
      defaultModelId: 'gpt-5-mini',
      primaryRole: 'member',
      permissions: [
        'user.settings.profile.write',
        'user.settings.preferences.write',
        'user.settings.connections.write',
        'user.settings.integrations.write',
        'user.settings.tool-servers.write',
      ],
      roles: [{ role_name: 'member' }],
      ownConnections: [{ id: 'conn-1', name: 'Personal', enabled: true }],
      allConnections: [{ id: 'shared-1', name: 'Shared', source: 'admin' }],
      toolServers: [{ id: 'mcp-1', name: 'MCP', url: 'https://mcp.example.com', enabled: true }],
      profileResponseFactory: (row, { defaultModelId }) => ({
        user: { id: row.id, email: row.email, name: row.name },
        app_config: { default_model_id: defaultModelId },
      }),
      route: 'account',
    });

    expect(payload.capabilities).toMatchObject({
      route: 'account',
      canManageConnections: true,
      canManageToolServers: true,
      canManageModels: true,
      canManageAcls: false,
    });
    expect(payload.settings.connections.my_connections).toHaveLength(1);
    expect(payload.settings.connections.connections).toHaveLength(1);
    expect(payload.settings.tool_servers.servers).toHaveLength(1);
    expect(payload.settings.general.settings).toEqual({ theme: 'dark' });
    expect(payload.settings.preferences).toEqual({ locale: 'en' });
  });
});
