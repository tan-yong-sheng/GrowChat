export const WORKSPACE_PERMISSION_MATRIX = {
  account: {
    canManageConnections: [
      'user.settings.connections.write',
      'connection.manage',
      'connection.admin',
    ],
    canManageToolServers: [
      'user.settings.integrations.write',
      'user.settings.tool-servers.write',
      'tool-server.manage',
      'tool-server.admin',
      'integration.manage',
      'integration.admin',
    ],
    canManageModels: [
      'user.settings.preferences.write',
      'model.manage',
      'model.admin',
    ],
  },
  admin: {
    canManageConnections: [
      'admin.settings.connections.write',
      'connection.admin',
    ],
    canManageToolServers: [
      'admin.settings.integrations.write',
      'tool-server.admin',
      'integration.admin',
    ],
    canManageModels: [
      'admin.settings.models.write',
      'model.admin',
    ],
  },
};

export function hasAnyPermission(permissionSet, permissions = []) {
  return permissions.some((permission) => permissionSet.has(permission));
}

export function deriveWorkspaceCapabilityFlags(route, permissions = []) {
  const permissionSet = new Set(Array.isArray(permissions) ? permissions : []);
  const matrix = String(route || '').toLowerCase() === 'admin'
    ? WORKSPACE_PERMISSION_MATRIX.admin
    : WORKSPACE_PERMISSION_MATRIX.account;

  return {
    canManageConnections: hasAnyPermission(permissionSet, matrix.canManageConnections),
    canManageToolServers: hasAnyPermission(permissionSet, matrix.canManageToolServers),
    canManageModels: hasAnyPermission(permissionSet, matrix.canManageModels),
  };
}
