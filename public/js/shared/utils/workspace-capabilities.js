import {
  deriveWorkspaceCapabilityFlags,
} from './workspace-permissions.js';

const DEFAULT_ACCOUNT_CAPABILITIES = {
  route: 'account',
  primaryRole: 'member',
  permissions: [],
  canManageConnections: true,
  canManageToolServers: true,
  canManageModels: true,
  canManageAcls: false,
};

const DEFAULT_ADMIN_CAPABILITIES = {
  route: 'admin',
  primaryRole: 'admin',
  permissions: [],
  canManageConnections: true,
  canManageToolServers: true,
  canManageModels: true,
  canManageAcls: true,
};

function toBoolean(value, fallback = false) {
  if (typeof value === 'boolean') return value;
  if (value === null || value === undefined) return fallback;
  return Boolean(value);
}

function normalizePermissions(permissions) {
  return Array.from(new Set(
    Array.isArray(permissions)
      ? permissions.map((permission) => String(permission || '').trim()).filter(Boolean)
      : [],
  ));
}

export function normalizeWorkspaceCapabilities(capabilities = {}, { route = 'account' } = {}) {
  const isAdminRoute = String(route || '').toLowerCase() === 'admin';
  const defaults = isAdminRoute ? DEFAULT_ADMIN_CAPABILITIES : DEFAULT_ACCOUNT_CAPABILITIES;
  const source = capabilities && typeof capabilities === 'object' && !Array.isArray(capabilities) ? capabilities : {};
  const permissions = normalizePermissions(source.permissions || defaults.permissions);
  const derivedFlags = deriveWorkspaceCapabilityFlags(route, permissions);
  const hasExplicitConnectionCapability = Object.prototype.hasOwnProperty.call(source, 'canManageConnections');
  const hasExplicitToolServerCapability = Object.prototype.hasOwnProperty.call(source, 'canManageToolServers');
  const hasExplicitModelCapability = Object.prototype.hasOwnProperty.call(source, 'canManageModels');
  const hasExplicitAclCapability = Object.prototype.hasOwnProperty.call(source, 'canManageAcls');

  return {
    ...defaults,
    ...source,
    route: isAdminRoute ? 'admin' : 'account',
    primaryRole: String(source.primaryRole || defaults.primaryRole || 'member').toLowerCase() || defaults.primaryRole,
    permissions,
    canManageConnections: hasExplicitConnectionCapability
      ? toBoolean(source.canManageConnections, derivedFlags.canManageConnections)
      : derivedFlags.canManageConnections,
    canManageToolServers: hasExplicitToolServerCapability
      ? toBoolean(source.canManageToolServers, derivedFlags.canManageToolServers)
      : derivedFlags.canManageToolServers,
    canManageModels: hasExplicitModelCapability
      ? toBoolean(source.canManageModels, derivedFlags.canManageModels)
      : derivedFlags.canManageModels,
    canManageAcls: hasExplicitAclCapability
      ? toBoolean(source.canManageAcls, defaults.canManageAcls)
      : defaults.canManageAcls,
  };
}
