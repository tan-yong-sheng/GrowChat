import { describe, expect, it } from 'vitest';
import { normalizeWorkspaceCapabilities } from '../../public/js/shared/utils/workspace-capabilities.js';

describe('normalizeWorkspaceCapabilities', () => {
  it('derives account capabilities from account permissions with ACL disabled', () => {
    expect(normalizeWorkspaceCapabilities({
      permissions: [
        'user.settings.profile.write',
        'user.settings.preferences.write',
        'user.settings.connections.write',
        'user.settings.integrations.write',
        'user.settings.tool-servers.write',
      ],
    }, { route: 'account' })).toMatchObject({
      route: 'account',
      primaryRole: 'member',
      canManageConnections: true,
      canManageToolServers: true,
      canManageModels: true,
      canManageAcls: false,
    });
  });

  it('derives admin capabilities from admin permissions with ACL enabled', () => {
    expect(normalizeWorkspaceCapabilities({
      permissions: [
        'admin.settings.connections.write',
        'admin.settings.integrations.write',
        'admin.settings.models.write',
        'admin.rbac.admin',
      ],
    }, { route: 'admin' })).toMatchObject({
      route: 'admin',
      primaryRole: 'admin',
      canManageConnections: true,
      canManageToolServers: true,
      canManageModels: true,
      canManageAcls: true,
    });
  });

  it('preserves explicit capability overrides', () => {
    expect(normalizeWorkspaceCapabilities({
      primaryRole: 'owner',
      permissions: ['user.settings.connections.write', 'user.settings.connections.write'],
      canManageConnections: false,
      canManageToolServers: false,
      canManageModels: false,
      canManageAcls: false,
    }, { route: 'account' })).toMatchObject({
      primaryRole: 'owner',
      permissions: ['user.settings.connections.write'],
      canManageConnections: false,
      canManageToolServers: false,
      canManageModels: false,
      canManageAcls: false,
    });
  });
});
