import { normalizeConnectionModelSelectionMode } from '../../public/js/shared/utils/connection-model-selection.js';

const CONNECTION_TYPE_LABEL = 'Connection';
const TOOL_SERVER_TYPE_LABEL = 'MCP';
const PERSONAL_ACCESS = 'personal';
const ADMIN_ACCESS = 'admin';
const SHARED_ACCESS = 'shared';
const AUTH_NONE = 'none';
const MANUAL_MODELS_MODE_DEFAULT = 'all';

function firstString(obj, ...keys) {
  for (const key of keys) {
    const value = obj?.[key];
    if (value !== undefined && value !== null && String(value).length > 0) {
      return String(value);
    }
  }
  return '';
}

function firstDefined(obj, ...keys) {
  for (const key of keys) {
    if (obj?.[key] !== undefined) return obj[key];
  }
  return undefined;
}

function firstBool(obj, ...keys) {
  for (const key of keys) {
    const value = obj?.[key];
    if (value !== undefined && value !== null) return Boolean(value);
  }
  return true;
}

function cloneArray(value) {
  return Array.isArray(value) ? [...value] : [];
}

function buildPersonalConnectionEntry(connection) {
  const baseUrl = firstString(connection, 'baseUrl', 'url');
  return {
    id: connection.id,
    name: connection.name || connection.id,
    typeLabel: CONNECTION_TYPE_LABEL,
    access_label: 'Personal',
    access_variant: PERSONAL_ACCESS,
    provider_type: firstString(connection, 'providerType', 'provider_type'),
    provider_family: firstString(connection, 'providerFamily', 'provider_family'),
    base_url: baseUrl,
    auth_type: firstString(connection, 'authType', 'auth_type'),
    enabled: firstBool(connection, 'enabled'),
    has_key: Boolean(connection.key),
    headers: connection.headers || {},
    manual_models: cloneArray(firstDefined(connection, 'manualModels', 'manual_models')),
    manual_models_mode:
      normalizeConnectionModelSelectionMode(
        connection.manualModelsMode || connection.manual_models_mode
      ) || MANUAL_MODELS_MODE_DEFAULT,
    note: baseUrl,
  };
}

export function toPersonalConnectionSummary(connection) {
  return buildPersonalConnectionEntry(connection);
}

export function toAccessibleConnectionSummary(connection, accessVariant = ADMIN_ACCESS) {
  const variant = accessVariant || ADMIN_ACCESS;
  return {
    id: connection.id,
    name: connection.name || connection.id,
    typeLabel: CONNECTION_TYPE_LABEL,
    note: firstString(connection, 'baseUrl', 'url', 'providerFamily', 'providerType'),
    access_label: variant === SHARED_ACCESS ? 'Shared' : 'Admin',
    access_variant: variant,
    visible_for_user: firstBool(connection, 'visible_for_user'),
    hidden_for_user: connection?.hidden_for_user === true,
  };
}

function getToolString(tool, key) {
  return String((tool && tool[key]) || '').trim();
}

function getToolBoolean(tool, key, defaultValue = false) {
  return (tool && tool[key]) !== defaultValue;
}

function getToolObject(tool, key) {
  const value = tool && tool[key];
  return value && typeof value === 'object' && !Array.isArray(value) ? value : undefined;
}

function normalizeTool(tool) {
  return {
    name: getToolString(tool, 'name'),
    title: getToolString(tool, 'title'),
    description: getToolString(tool, 'description'),
    enabled: getToolBoolean(tool, 'enabled', false),
    visible_for_user: getToolBoolean(tool, 'visible_for_user', false),
    hidden_for_user: tool && tool.hidden_for_user === true,
    parameters: getToolObject(tool, 'parameters'),
  };
}

function normalizeTools(tools) {
  return Array.isArray(tools) ? tools.map(normalizeTool).filter((t) => t.name) : [];
}

function buildAuthFields(server) {
  return {
    auth_type: server.auth_type || AUTH_NONE,
    auth_bearer_token: server.auth_bearer_token || '',
    auth_basic_username: server.auth_basic_username || '',
    auth_basic_password: server.auth_basic_password || '',
  };
}

function buildOauthFields(server) {
  return {
    oauth_client_name: server.oauth_client_name || '',
    oauth_scope: server.oauth_scope || '',
    oauth_client_id: server.oauth_client_id || '',
    oauth_client_secret: server.oauth_client_secret || '',
    oauth_token_auth_method: server.oauth_token_auth_method || '',
    oauth_connected: Boolean(server.oauth_connected),
    oauth_connected_at: server.oauth_connected_at || null,
  };
}

function buildPersonalToolServerEntry(server) {
  const auth = buildAuthFields(server);
  const oauth = buildOauthFields(server);
  return {
    id: server.id,
    name: server.name || server.id,
    typeLabel: TOOL_SERVER_TYPE_LABEL,
    access_label: 'Personal',
    access_variant: PERSONAL_ACCESS,
    url: server.url || '',
    headers: server.headers || '',
    enabled: firstBool(server, 'enabled'),
    auth_type: auth.auth_type,
    auth_bearer_token: auth.auth_bearer_token,
    auth_basic_username: auth.auth_basic_username,
    auth_basic_password: auth.auth_basic_password,
    oauth_client_name: oauth.oauth_client_name,
    oauth_scope: oauth.oauth_scope,
    oauth_client_id: oauth.oauth_client_id,
    oauth_client_secret: oauth.oauth_client_secret,
    oauth_token_auth_method: oauth.oauth_token_auth_method,
    note: server.note || server.url || '',
    oauth_connected: oauth.oauth_connected,
    oauth_connected_at: oauth.oauth_connected_at,
    tools: normalizeTools(server.tools),
  };
}

export function toPersonalToolServerSummary(server) {
  return buildPersonalToolServerEntry(server);
}

function filterAccessibleTools(server) {
  return Array.isArray(server.tools)
    ? server.tools.filter((tool) => tool?.enabled !== false && tool?.visible_for_user !== false)
    : [];
}

function pickAccessLabel(server) {
  if (server.access_label) return server.access_label;
  return server.source === 'user' ? 'Personal' : 'Admin';
}

function pickAccessVariant(server) {
  if (server.access_variant) return server.access_variant;
  return server.source === 'user' ? PERSONAL_ACCESS : ADMIN_ACCESS;
}

function buildAccessibleToolServerNote(server, visibleTools) {
  if (visibleTools.length) return `${visibleTools.length} tools available`;
  return server.url || '';
}

export function toAccessibleToolServerSummary(server) {
  const visibleTools = filterAccessibleTools(server);
  return {
    id: server.id,
    name: server.name || server.id,
    typeLabel: TOOL_SERVER_TYPE_LABEL,
    access_label: pickAccessLabel(server),
    access_variant: pickAccessVariant(server),
    enabled: firstBool(server, 'enabled'),
    note: buildAccessibleToolServerNote(server, visibleTools),
    tools: normalizeTools(server.tools),
  };
}

export function buildOwnedToolServersPayload(ownedServers, accessibleToolServers) {
  const accessibleList = Array.isArray(accessibleToolServers) ? accessibleToolServers : [];
  return {
    servers: ownedServers.map(toPersonalToolServerSummary),
    accessible_servers: accessibleList.map((server) => ({
      ...toAccessibleToolServerSummary(server),
      visible_for_user: firstBool(server, 'visible_for_user'),
      hidden_for_user: server.hidden_for_user === true,
    })),
  };
}
