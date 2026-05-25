import { deriveWorkspaceCapabilityFlags as deriveWorkspaceCapabilityFlagsFromPermissions } from '../../public/js/shared/utils/workspace-permissions.js';
import { getConfigValue } from '../utils/app-config.js';
import { resolvePermissions, getUserRoles } from '../utils/authorize.js';
import { loadPrimaryRole } from '../utils/user-role.js';
import {
  getAllOpenAIConnectionConfigs,
  loadUserOpenAIConnectionConfigs,
} from '../llm/connections.js';
import { loadToolServers } from '../admin/tool-servers.js';
import { normalizeConnectionModelSelectionMode } from '../../public/js/shared/utils/connection-model-selection.js';

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

export function resolveWorkspaceCapabilities({
  route = 'account',
  permissions = [],
  primaryRole = 'member',
} = {}) {
  const permissionSet = new Set(Array.isArray(permissions) ? permissions : []);
  const isAdminRoute = String(route || '').toLowerCase() === 'admin';
  const derivedFlags = deriveWorkspaceCapabilityFlagsFromPermissions(route, permissions);

  return {
    route: isAdminRoute ? 'admin' : 'account',
    primaryRole: String(primaryRole || 'member').toLowerCase() || 'member',
    permissions: Array.from(permissionSet),
    canManageConnections: derivedFlags.canManageConnections,
    canManageToolServers: derivedFlags.canManageToolServers,
    canManageModels: derivedFlags.canManageModels,
    canManageAcls: isAdminRoute && permissionSet.has('admin.rbac.admin'),
  };
}

export function toPersonalConnectionSummary(connection) {
  return {
    id: connection.id,
    name: connection.name || connection.id,
    typeLabel: 'Connection',
    access_label: 'Personal',
    access_variant: 'personal',
    provider_type: connection.providerType || connection.provider_type || '',
    provider_family: connection.providerFamily || connection.provider_family || '',
    base_url: connection.baseUrl || connection.url || '',
    auth_type: connection.authType || connection.auth_type || '',
    enabled: connection.enabled !== false,
    has_key: Boolean(connection.key),
    headers: connection.headers || {},
    manual_models: Array.isArray(connection.manualModels || connection.manual_models)
      ? [...(connection.manualModels || connection.manual_models)]
      : [],
    manual_models_mode:
      normalizeConnectionModelSelectionMode(
        connection.manualModelsMode || connection.manual_models_mode
      ) || 'all',
    note: connection.baseUrl || connection.url || '',
  };
}

export function toAccessibleConnectionSummary(connection, accessVariant = 'admin') {
  return {
    id: connection.id,
    name: connection.name || connection.id,
    typeLabel: 'Connection',
    note:
      connection.baseUrl ||
      connection.url ||
      connection.providerFamily ||
      connection.providerType ||
      '',
    access_label: accessVariant === 'shared' ? 'Shared' : 'Admin',
    access_variant: accessVariant,
    visible_for_user: connection.visible_for_user !== false,
    hidden_for_user: connection.hidden_for_user === true,
  };
}

function normalizeTool(tool) {
  return {
    name: String(tool?.name || '').trim(),
    title: String(tool?.title || '').trim(),
    description: String(tool?.description || '').trim(),
    enabled: tool?.enabled !== false,
    visible_for_user: tool?.visible_for_user !== false,
    hidden_for_user: tool?.hidden_for_user === true,
    parameters:
      tool?.parameters && typeof tool.parameters === 'object' && !Array.isArray(tool.parameters)
        ? tool.parameters
        : undefined,
  };
}

function normalizeTools(tools) {
  return Array.isArray(tools) ? tools.map(normalizeTool).filter((t) => t.name) : [];
}

export function toPersonalToolServerSummary(server) {
  return {
    id: server.id,
    name: server.name || server.id,
    typeLabel: 'MCP',
    access_label: 'Personal',
    access_variant: 'personal',
    url: server.url || '',
    headers: server.headers || '',
    enabled: server.enabled !== false,
    auth_type: server.auth_type || 'none',
    auth_bearer_token: server.auth_bearer_token || '',
    auth_basic_username: server.auth_basic_username || '',
    auth_basic_password: server.auth_basic_password || '',
    oauth_client_name: server.oauth_client_name || '',
    oauth_scope: server.oauth_scope || '',
    oauth_client_id: server.oauth_client_id || '',
    oauth_client_secret: server.oauth_client_secret || '',
    oauth_token_auth_method: server.oauth_token_auth_method || '',
    note: server.note || server.url || '',
    oauth_connected: Boolean(server.oauth_connected),
    oauth_connected_at: server.oauth_connected_at || null,
    tools: normalizeTools(server.tools),
  };
}

export function toAccessibleToolServerSummary(server) {
  const visibleTools = Array.isArray(server.tools)
    ? server.tools.filter((tool) => tool?.enabled !== false && tool?.visible_for_user !== false)
    : [];
  return {
    id: server.id,
    name: server.name || server.id,
    typeLabel: 'MCP',
    access_label: server.access_label || (server.source === 'user' ? 'Personal' : 'Admin'),
    access_variant: server.access_variant || (server.source === 'user' ? 'personal' : 'admin'),
    enabled: server.enabled !== false,
    note: visibleTools.length ? `${visibleTools.length} tools available` : server.url || '',
    tools: normalizeTools(server.tools),
  };
}

export function buildWorkspaceSettingsPayload({
  row,
  defaultModelId = null,
  primaryRole = 'member',
  permissions = [],
  roles = [],
  ownConnections = [],
  allConnections = [],
  toolServers = [],
  accessibleToolServers = [],
  profileResponseFactory,
  route = 'account',
  capabilities: capabilityOverrides = null,
} = {}) {
  if (typeof profileResponseFactory !== 'function') {
    throw new TypeError('profileResponseFactory is required');
  }

  const payload = profileResponseFactory(row, { defaultModelId, primaryRole });
  const accessibleConnections = (Array.isArray(allConnections) ? allConnections : [])
    .filter((connection) => connection.source !== 'user')
    .map((connection) =>
      toAccessibleConnectionSummary(connection, connection.access_variant || 'admin')
    );
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
  payload.settings = {
    general: {
      id: row.id,
      name: row.name,
      email: row.email,
      avatar: row.avatar || null,
      avatar_emoji: row.avatar_emoji || null,
      status: row.status || 'offline',
      account_status: row.account_status === 'pending' ? 'pending' : 'active',
      settings: parseJsonObject(row.settings),
    },
    preferences: parseJsonObject(row.preferences),
    connections: {
      my_connections: ownedConnections.map(toPersonalConnectionSummary),
      connections: accessibleConnections,
    },
    integrations: {
      servers: ownedServers.map(toPersonalToolServerSummary),
      accessible_servers: Array.isArray(accessibleToolServers)
        ? accessibleToolServers.map((server) => ({
            ...toAccessibleToolServerSummary(server),
            visible_for_user: server.visible_for_user !== false,
            hidden_for_user: server.hidden_for_user === true,
          }))
        : [],
    },
    tool_servers: {
      servers: ownedServers.map(toPersonalToolServerSummary),
      accessible_servers: Array.isArray(accessibleToolServers)
        ? accessibleToolServers.map((server) => ({
            ...toAccessibleToolServerSummary(server),
            visible_for_user: server.visible_for_user !== false,
            hidden_for_user: server.hidden_for_user === true,
          }))
        : [],
    },
    models: {
      default_model_id: defaultModelId,
    },
  };

  return payload;
}

export async function loadWorkspaceConnectionsPayload({
  db,
  env,
  userId,
  primaryRole = 'member',
  includeDisabled = true,
  includeHiddenForUser = false,
} = {}) {
  if (!db || !env || !userId) {
    throw new TypeError('db, env, and userId are required');
  }

  const ownConnections = await loadUserOpenAIConnectionConfigs(db, userId, { includeDisabled });
  const connections = await getAllOpenAIConnectionConfigs(env, {
    userId,
    userRole: String(primaryRole || 'member').trim(),
    includeDisabled,
    includeHiddenForUser,
  });

  return {
    connections: connections
      .filter((connection) => connection.source !== 'user' && connection.enabled !== false)
      .map((connection) => ({
        ...toAccessibleConnectionSummary(connection, connection.access_variant || 'admin'),
        visible_for_user: connection.visible_for_user !== false,
        hidden_for_user: connection.hidden_for_user === true,
      })),
    my_connections: ownConnections.map(toPersonalConnectionSummary),
  };
}

export async function loadWorkspaceToolServersPayload({ db, userId } = {}) {
  if (!db || !userId) {
    throw new TypeError('db and userId are required');
  }

  const servers = await loadToolServers(db, { userId, includeHiddenForUser: true });
  const personalServers = servers.filter((server) => server.source === 'user');
  const accessibleServers = servers.filter(
    (server) => server.source !== 'user' && server.enabled !== false
  );
  return {
    servers: personalServers.map(toPersonalToolServerSummary),
    accessible_servers: accessibleServers.map((server) => ({
      ...toAccessibleToolServerSummary(server),
      visible_for_user: server.visible_for_user !== false,
      hidden_for_user: server.hidden_for_user === true,
    })),
  };
}

export async function loadWorkspaceSettingsPayload({
  db,
  env,
  userId,
  route = 'account',
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
    (async () => {
      try {
        const rawDefault = await getConfigValue(db, 'default_model_id', null);
        return rawDefault ? String(rawDefault).trim() : null;
      } catch {
        return null;
      }
    })(),
  ]);
  const primaryRole = rawPrimaryRole || 'member';

  const [permissions, roles, ownConnections, allConnections, allToolServers] = await Promise.all([
    resolvePermissions(db, { sub: userId }),
    getUserRoles(db, userId),
    loadUserOpenAIConnectionConfigs(db, userId, { includeDisabled: true }),
    getAllOpenAIConnectionConfigs(env, {
      userId,
      userRole: primaryRole,
      includeDisabled: true,
      includeHiddenForUser: true,
    }),
    loadToolServers(db, { userId, includeHiddenForUser: true }),
  ]);
  const toolServers = allToolServers.filter((server) => server.source === 'user');
  const accessibleToolServers = allToolServers.filter((server) => server.source !== 'user');

  return buildWorkspaceSettingsPayload({
    row,
    defaultModelId,
    primaryRole,
    permissions,
    roles,
    ownConnections,
    allConnections: allConnections
      .filter((connection) => connection.source !== 'user' && connection.enabled !== false)
      .concat(allConnections.filter((connection) => connection.source === 'user')),
    toolServers,
    accessibleToolServers: accessibleToolServers.filter((server) => server.enabled !== false),
    profileResponseFactory,
    route,
  });
}
