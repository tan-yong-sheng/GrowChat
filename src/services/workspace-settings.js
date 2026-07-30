import { deriveWorkspaceCapabilityFlags as deriveWorkspaceCapabilityFlagsFromPermissions } from '../../public/js/shared/utils/workspace-permissions.js';
import { getConfigValue } from '../utils/app-config.js';
import { resolvePermissions, getUserRoles } from '../utils/authorize.js';
import { loadPrimaryRole } from '../utils/user-role.js';
import {
  getAllOpenAIConnectionConfigs,
  loadUserOpenAIConnectionConfigs,
} from '../llm/connections.js';
import { loadToolServers } from '../admin/tool-servers.js';
import {
  toAccessibleConnectionSummary,
  toAccessibleToolServerSummary,
  toPersonalConnectionSummary,
  toPersonalToolServerSummary,
  buildOwnedToolServersPayload,
} from './workspace-settings-summaries.js';

export {
  toAccessibleConnectionSummary,
  toAccessibleToolServerSummary,
  toPersonalConnectionSummary,
  toPersonalToolServerSummary,
  buildOwnedToolServersPayload,
};

const ACCOUNT_ROUTE = 'account';
const ADMIN_ROUTE = 'admin';
const DEFAULT_ROLE = 'member';
const DEFAULT_STATUS = 'offline';
const ADMIN_ACCESS = 'admin';
const USER_SOURCE = 'user';

function parseJsonObject(raw) {
  if (!raw) return {};
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) return raw;
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function isAdminRoute(route) {
  return String(route || '').toLowerCase() === ADMIN_ROUTE;
}

export function resolveWorkspaceCapabilities({
  route = ACCOUNT_ROUTE,
  permissions = [],
  primaryRole = DEFAULT_ROLE,
} = {}) {
  const permissionSet = new Set(Array.isArray(permissions) ? permissions : []);
  const admin = isAdminRoute(route);
  const derivedFlags = deriveWorkspaceCapabilityFlagsFromPermissions(route, permissions);

  return {
    route: admin ? ADMIN_ROUTE : ACCOUNT_ROUTE,
    primaryRole: String(primaryRole || DEFAULT_ROLE).toLowerCase() || DEFAULT_ROLE,
    permissions: Array.from(permissionSet),
    canManageConnections: derivedFlags.canManageConnections,
    canManageToolServers: derivedFlags.canManageToolServers,
    canManageModels: derivedFlags.canManageModels,
    canManageAcls: admin && permissionSet.has('admin.rbac.admin'),
  };
}

function buildWorkspaceSettings({
  row,
  ownedConnections,
  accessibleConnections,
  ownedServers,
  accessibleToolServers,
  defaultModelId,
}) {
  return {
    general: {
      id: row.id,
      name: row.name,
      email: row.email,
      avatar: row.avatar || null,
      avatar_emoji: row.avatar_emoji || null,
      status: row.status || DEFAULT_STATUS,
      account_status: row.account_status === 'pending' ? 'pending' : 'active',
      settings: parseJsonObject(row.settings),
    },
    preferences: parseJsonObject(row.preferences),
    connections: {
      my_connections: ownedConnections.map(toPersonalConnectionSummary),
      connections: accessibleConnections,
    },
    integrations: buildOwnedToolServersPayload(ownedServers, accessibleToolServers),
    tool_servers: buildOwnedToolServersPayload(ownedServers, accessibleToolServers),
    models: {
      default_model_id: defaultModelId,
    },
  };
}

function buildAccessibleConnectionsList(allConnections) {
  return (Array.isArray(allConnections) ? allConnections : [])
    .filter((connection) => connection.source !== USER_SOURCE)
    .map((connection) =>
      toAccessibleConnectionSummary(connection, connection.access_variant || ADMIN_ACCESS)
    );
}

const PAYLOAD_OPTION_DEFAULTS = {
  defaultModelId: null,
  primaryRole: DEFAULT_ROLE,
  permissions: [],
  roles: [],
  ownConnections: [],
  allConnections: [],
  toolServers: [],
  accessibleToolServers: [],
  route: ACCOUNT_ROUTE,
};

function resolvePayloadOptions(options = {}) {
  const merged = { ...PAYLOAD_OPTION_DEFAULTS, ...options };
  const { capabilities: capabilityOverrides } = options;
  return {
    row: options.row,
    profileResponseFactory: options.profileResponseFactory,
    capabilityOverrides,
    ...merged,
  };
}

export function buildWorkspaceSettingsPayload(options) {
  const resolved = resolvePayloadOptions(options);
  const {
    row,
    defaultModelId,
    primaryRole,
    permissions,
    roles,
    ownConnections,
    allConnections,
    toolServers,
    accessibleToolServers,
    profileResponseFactory,
    route,
    capabilityOverrides,
  } = resolved;
  if (typeof profileResponseFactory !== 'function') {
    throw new TypeError('profileResponseFactory is required');
  }

  const payload = profileResponseFactory(row, { defaultModelId, primaryRole });
  const accessibleConnections = buildAccessibleConnectionsList(allConnections);
  const ownedConnections = Array.isArray(ownConnections) ? ownConnections : [];
  const ownedServers = Array.isArray(toolServers) ? toolServers : [];
  const capabilities =
    capabilityOverrides ||
    resolveWorkspaceCapabilities({
      route,
      permissions,
      primaryRole,
    });

  payload.permissions = permissions;
  payload.roles = roles;
  payload.capabilities = capabilities;
  payload.settings = buildWorkspaceSettings({
    row,
    ownedConnections,
    accessibleConnections,
    ownedServers,
    accessibleToolServers,
    defaultModelId,
  });

  return payload;
}

function buildFilteredAccessibleConnections(allConnections) {
  return allConnections
    .filter((connection) => connection.source !== USER_SOURCE && connection.enabled !== false)
    .map((connection) => ({
      ...toAccessibleConnectionSummary(connection, connection.access_variant || ADMIN_ACCESS),
      visible_for_user: connection.visible_for_user !== false,
      hidden_for_user: connection.hidden_for_user === true,
    }));
}

export async function loadWorkspaceConnectionsPayload({
  db,
  env,
  userId,
  primaryRole = DEFAULT_ROLE,
  includeDisabled = true,
  includeHiddenForUser = false,
} = {}) {
  if (!db || !env || !userId) {
    throw new TypeError('db, env, and userId are required');
  }

  const ownConnections = await loadUserOpenAIConnectionConfigs({
    db,
    userId,
    options: { includeDisabled },
  });
  const connections = await getAllOpenAIConnectionConfigs(env, {
    userId,
    userRole: String(primaryRole || DEFAULT_ROLE).trim(),
    includeDisabled,
    includeHiddenForUser,
  });

  return {
    connections: buildFilteredAccessibleConnections(connections),
    my_connections: ownConnections.map(toPersonalConnectionSummary),
  };
}

function partitionToolServersBySource(servers) {
  return {
    userServers: servers.filter((server) => server.source === USER_SOURCE),
    accessibleServers: servers.filter(
      (server) => server.source !== USER_SOURCE && server.enabled !== false
    ),
  };
}

export async function loadWorkspaceToolServersPayload({ db, userId } = {}) {
  if (!db || !userId) {
    throw new TypeError('db and userId are required');
  }

  const servers = await loadToolServers(db, { userId, includeHiddenForUser: true });
  const { userServers, accessibleServers } = partitionToolServersBySource(servers);
  return {
    servers: userServers.map(toPersonalToolServerSummary),
    accessible_servers: accessibleServers.map((server) => ({
      ...toAccessibleToolServerSummary(server),
      visible_for_user: server.visible_for_user !== false,
      hidden_for_user: server.hidden_for_user === true,
    })),
  };
}

async function loadDefaultModelId(db) {
  try {
    const rawDefault = await getConfigValue(db, 'default_model_id', null);
    return rawDefault ? String(rawDefault).trim() : null;
  } catch {
    return null;
  }
}

function splitToolServers(allToolServers) {
  return {
    toolServers: allToolServers.filter((server) => server.source === USER_SOURCE),
    accessibleToolServers: allToolServers
      .filter((server) => server.source !== USER_SOURCE)
      .filter((server) => server.enabled !== false),
  };
}

function partitionConnectionsBySource(allConnections) {
  return {
    accessibleConnections: allConnections.filter(
      (connection) => connection.source !== USER_SOURCE && connection.enabled !== false
    ),
    ownedConnections: allConnections.filter((connection) => connection.source === USER_SOURCE),
  };
}

export async function loadWorkspaceSettingsPayload({
  db,
  env,
  userId,
  route = ACCOUNT_ROUTE,
  profileResponseFactory,
} = {}) {
  if (!db || !env || !userId) {
    throw new TypeError('db, env, and userId are required');
  }
  if (typeof profileResponseFactory !== 'function') {
    throw new TypeError('profileResponseFactory is required');
  }

  const row = await db.first(
    'SELECT id, email, name, account_status, settings, avatar, avatar_emoji, status, preferences, created_at, updated_at, last_active_at FROM users WHERE id = ?',
    [userId]
  );
  if (!row) return null;

  const [rawPrimaryRole, defaultModelId] = await Promise.all([
    loadPrimaryRole(db, userId),
    loadDefaultModelId(db),
  ]);
  const primaryRole = rawPrimaryRole || DEFAULT_ROLE;

  const [permissions, roles, allConnections, allToolServers] = await Promise.all([
    resolvePermissions(db, { sub: userId }),
    getUserRoles(db, userId),
    getAllOpenAIConnectionConfigs(env, {
      userId,
      userRole: primaryRole,
      includeDisabled: true,
      includeHiddenForUser: true,
    }),
    loadToolServers(db, { userId, includeHiddenForUser: true }),
  ]);
  const { toolServers, accessibleToolServers } = splitToolServers(allToolServers);
  const combinedConnections = partitionConnectionsBySource(allConnections);
  const combinedAllConnections = combinedConnections.accessibleConnections.concat(
    combinedConnections.ownedConnections
  );

  return buildWorkspaceSettingsPayload({
    row,
    defaultModelId,
    primaryRole,
    permissions,
    roles,
    ownConnections: combinedConnections.ownedConnections,
    allConnections: combinedAllConnections,
    toolServers,
    accessibleToolServers,
    profileResponseFactory,
    route,
  });
}
