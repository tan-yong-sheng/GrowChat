import { createDB } from '../db.js';
import { getConfigValue } from '../utils/app-config.js';
import { error, json } from '../utils/response.js';
import { resolvePermissions, getUserRoles } from '../utils/authorize.js';
import { loadPrimaryRole } from '../utils/user-role.js';
import { buildUserProfileResponse } from './user-profile.js';
import {
  getAllOpenAIConnectionConfigs,
  loadUserOpenAIConnectionConfigs,
} from '../llm/connections.js';
import {
  loadUserToolServers,
} from '../admin/tool-servers.js';

function parseJsonObject(raw) {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function toPersonalConnectionSummary(connection) {
  return {
    id: connection.id,
    name: connection.name || connection.id,
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
    note: connection.baseUrl || connection.url || '',
  };
}

function toAccessibleConnectionSummary(connection, accessVariant = 'admin') {
  return {
    id: connection.id,
    name: connection.name || connection.id,
    note: connection.baseUrl || connection.url || connection.providerFamily || connection.providerType || '',
    access_label: accessVariant === 'shared' ? 'Shared' : 'Admin',
    access_variant: accessVariant,
  };
}

function toPersonalToolServerSummary(server) {
  return {
    id: server.id,
    name: server.name || server.id,
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
  };
}

export async function userSettingsRouter(req, env, _ctx, user, path) {
  const isUserSettingsPath =
    path === '/api/users/me/settings' ||
    path === '/api/users/me/settings/';

  if (!isUserSettingsPath) return null;
  if (!user) return error(req, 'Unauthorized', 401);

  if (req.method !== 'GET') {
    return error(req, 'Method not allowed', 405);
  }

  const db = createDB(env.DB);
  const url = new URL(req.url);
  const include = new Set(String(url.searchParams.get('include') || '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean));

  try {
    const row = await db.first(
      'SELECT id, email, name, account_status, settings, avatar, avatar_emoji, status, preferences, created_at, updated_at, last_active_at FROM users WHERE id = ?',
      [user.sub]
    );
    if (!row) return error(req, 'User not found', 404);

    const primaryRole = (await loadPrimaryRole(db, user.sub)) || 'member';
    let defaultModelId = null;
    try {
      const rawDefault = await getConfigValue(db, 'default_model_id', null);
      defaultModelId = rawDefault ? String(rawDefault).trim() : null;
    } catch {
      defaultModelId = null;
    }

    const payload = buildUserProfileResponse(row, { defaultModelId, primaryRole });
    const permissions = await resolvePermissions(env, user);
    const roles = await getUserRoles(env, user.sub);

    const ownConnections = await loadUserOpenAIConnectionConfigs(db, user.sub, { includeDisabled: true });
    const allConnections = await getAllOpenAIConnectionConfigs(env, {
      userId: user.sub,
      userRole: primaryRole,
      includeDisabled: true,
    });
    const accessibleConnections = allConnections
      .filter((connection) => connection.source !== 'user')
      .map((connection) => toAccessibleConnectionSummary(connection, connection.access_variant || 'admin'));

    const personalConnections = ownConnections.map(toPersonalConnectionSummary);
    const personalServers = (await loadUserToolServers(db, user.sub)).map(toPersonalToolServerSummary);

    payload.permissions = permissions;
    payload.roles = roles;
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
        my_connections: personalConnections,
        connections: accessibleConnections,
      },
      integrations: {
        servers: personalServers,
      },
      tool_servers: {
        servers: personalServers,
      },
      models: {
        default_model_id: defaultModelId,
      },
    };

    if (!include.size || include.has('permissions') || include.has('roles') || include.has('all')) {
      // The response already includes both fields for the account page.
    }

    return json(req, payload);
  } catch (err) {
    console.error('Load user settings failed:', err);
    return error(req, 'Failed to load user settings', 500);
  }
}
