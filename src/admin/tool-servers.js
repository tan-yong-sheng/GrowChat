import { getConfigValue, setConfigValue } from '../utils/app-config.js';
import {
  buildToolServerAclIndex,
  evaluateToolServerAclAccess,
  loadToolServerAclRules,
} from '../utils/tool-server-acl.js';
import { loadPrimaryRole } from '../utils/user-role.js';
import { MCP_PROTOCOL_VERSION, mcpNotify, mcpRequest } from '../mcp/client.js';
import { loadUserResourceOverrides } from '../../public/js/shared/utils/user-resource-overrides.js';

const ATTACHMENT_CAP_TYPES = ['image', 'pdf', 'text', 'audio', 'video', 'other'];

export function isValidHttpUrl(value) {
  if (!value) return false;
  return /^https?:\/\//i.test(value);
}

export function normalizeHeaders(input) {
  const trimmed = String(input || '').trim();
  if (!trimmed) return '';
  let parsed;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    throw new Error('Headers must be valid JSON');
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('Headers must be a JSON object');
  }
  const normalized = {};
  for (const [key, value] of Object.entries(parsed)) {
    const headerKey = String(key || '').trim();
    if (!headerKey) {
      throw new Error('Header names cannot be empty');
    }
    if (/[\r\n]/.test(headerKey)) {
      throw new Error('Header names cannot contain newline characters');
    }
    const headerValue = String(value ?? '').trim();
    if (/[\r\n]/.test(headerValue)) {
      throw new Error('Header values cannot contain newline characters');
    }
    normalized[headerKey] = headerValue;
  }
  return JSON.stringify(normalized);
}

export function parseHeadersForRequest(input) {
  if (input && typeof input === 'object' && !Array.isArray(input)) {
    return input;
  }
  const normalized = normalizeHeaders(input);
  if (!normalized) return {};
  return JSON.parse(normalized);
}

export function normalizeBaseUrl(url) {
  return String(url || '')
    .trim()
    .replace(/\/$/, '');
}

export function normalizeModelId(value) {
  const normalized = String(value || '').trim();
  if (!normalized) return null;
  if (normalized.length > 200 || /\s/.test(normalized)) {
    throw new Error('model_id is invalid');
  }
  return normalized;
}

export function normalizeAttachmentCaps(input, { allowNull = false } = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new Error('attachments must be an object');
  }
  const caps = {};
  for (const [key, value] of Object.entries(input)) {
    if (!ATTACHMENT_CAP_TYPES.includes(key)) {
      throw new Error(`Unknown attachment type: ${key}`);
    }
    if (value === null && allowNull) {
      caps[key] = null;
      continue;
    }
    if (typeof value !== 'boolean') {
      throw new Error(`Attachment type ${key} must be a boolean`);
    }
    caps[key] = value;
  }
  return caps;
}

export function base64UrlEncode(bytes) {
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

export function randomString(length = 43) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~';
  const array = new Uint8Array(length);
  crypto.getRandomValues(array);
  return Array.from(array, (x) => chars[x % chars.length]).join('');
}

export async function sha256Base64Url(input) {
  const data = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return base64UrlEncode(new Uint8Array(digest));
}

function normalizeTool(tool = {}) {
  return {
    name: String(tool.name || '').trim(),
    title: String(tool.title || '').trim(),
    description: String(tool.description || '').trim(),
    parameters:
      tool.parameters && typeof tool.parameters === 'object' && !Array.isArray(tool.parameters)
        ? tool.parameters
        : undefined,
    enabled: tool.enabled !== false,
  };
}

function applyToolVisibility(server, hiddenTools = new Set()) {
  const hiddenToolIds = new Set(
    Array.isArray(hiddenTools) ? hiddenTools : hiddenTools instanceof Set ? hiddenTools : []
  );
  const tools = Array.isArray(server?.tools) ? server.tools : [];
  return {
    ...server,
    tools: tools.map((tool) => {
      const name = String(tool?.name || '').trim();
      const hiddenForUser = hiddenToolIds.has(name);
      return {
        ...tool,
        visible_for_user: !hiddenForUser,
        hidden_for_user: hiddenForUser,
      };
    }),
  };
}

export function mergeToolSpecs(existingTools, incomingTools) {
  const previous = new Map(
    (Array.isArray(existingTools) ? existingTools : [])
      .map((tool) => normalizeTool(tool))
      .filter((tool) => tool.name)
      .map((tool) => [tool.name, tool])
  );

  const source = Array.isArray(incomingTools)
    ? incomingTools
    : Array.isArray(existingTools)
      ? existingTools
      : [];
  return source
    .map((tool) => {
      const normalized = normalizeTool(tool);
      if (!normalized.name) return null;
      const prior = previous.get(normalized.name);
      return {
        ...normalized,
        enabled: prior ? prior.enabled !== false : normalized.enabled !== false,
      };
    })
    .filter(Boolean);
}

export async function loadToolServers(db, options = {}) {
  const includeHiddenForUser = options.includeHiddenForUser === true;
  const raw = await getConfigValue(db, 'tool_servers', '[]');
  try {
    const parsed = JSON.parse(raw);
    const configServers = Array.isArray(parsed) ? parsed : [];
    const userId = String(options.userId || '').trim();
    if (!userId) return configServers;

    const userServers = await loadUserToolServers(db, userId);
    if (!db) return [...configServers, ...userServers];
    if (typeof db.first !== 'function' || typeof db.all !== 'function') {
      return [...configServers, ...userServers];
    }

    const userRole = (await loadPrimaryRole(db, userId)) || 'member';
    const userOverrides = await loadUserResourceOverrides(db, userId);
    const hiddenServerIds = new Set(userOverrides.tool_servers.hidden_ids || []);
    const hiddenToolIdsByServer = userOverrides.tool_servers.tools || {};

    let userGroupIds = new Set();
    try {
      const groupRows = await db.all('SELECT group_id FROM group_members WHERE user_id = ?', [
        userId,
      ]);
      userGroupIds = new Set(
        (Array.isArray(groupRows) ? groupRows : []).map((row) => row.group_id).filter(Boolean)
      );
    } catch {
      userGroupIds = new Set();
    }

    let aclIndex = new Map();
    try {
      const aclRules = await loadToolServerAclRules(db);
      aclIndex = buildToolServerAclIndex(aclRules);
    } catch (err) {
      console.warn('Failed to load tool server ACL rules:', err?.message || err);
      aclIndex = new Map();
    }

    const adminServers = configServers
      .map((server) => {
        const access = evaluateToolServerAclAccess(server, {
          user: { sub: userId, primary_role: userRole },
          userGroupIds,
          rules: aclIndex.get(server.id) || [],
        });
        const hiddenForUser = hiddenServerIds.has(String(server.id || '').trim());
        const hiddenTools = new Set(
          hiddenToolIdsByServer?.[String(server.id || '').trim()]?.hidden_ids || []
        );
        return {
          ...applyToolVisibility(
            {
              ...server,
              access_label: access.access_label,
              access_variant: access.access_variant,
              visible_for_user: !hiddenForUser,
              hidden_for_user: hiddenForUser,
            },
            hiddenTools
          ),
          access_allowed: access.allowed,
        };
      })
      .filter(
        (server) => includeHiddenForUser || (server.access_allowed && server.visible_for_user)
      )
      .map(({ _access_allowed, ...server }) => server);

    return [...adminServers, ...userServers];
  } catch {
    const userId = String(options.userId || '').trim();
    if (!userId) return [];
    return loadUserToolServers(db, userId);
  }
}

export async function saveToolServers(db, servers) {
  await setConfigValue(db, 'tool_servers', JSON.stringify(servers));
}

async function ensureUserToolServersTable(db) {
  await db.run(
    `CREATE TABLE IF NOT EXISTS user_tool_servers (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      server_json TEXT NOT NULL,
      created_at INTEGER NOT NULL DEFAULT (unixepoch()),
      updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
      UNIQUE(user_id, id)
    )`
  );
  await db.run(
    'CREATE INDEX IF NOT EXISTS idx_user_tool_servers_user_id ON user_tool_servers(user_id)'
  );
}

function parseToolServerJson(raw) {
  if (!raw) return null;
  if (typeof raw === 'object' && !Array.isArray(raw)) return raw;
  try {
    const parsed = JSON.parse(String(raw));
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function normalizeUserToolServerRecord(raw, userId = '') {
  const parsed = parseToolServerJson(raw);
  if (!parsed) return null;
  const merged = mergeToolServer(null, parsed);
  if (!merged.url) return null;
  return {
    ...merged,
    source: 'user',
    owner_user_id: userId || raw?.user_id || null,
    personal: true,
  };
}

export async function loadUserToolServers(db, userId) {
  if (!db || !userId) return [];
  await ensureUserToolServersTable(db);
  const rows = await db.all(
    `SELECT id, user_id, server_json, created_at, updated_at
     FROM user_tool_servers
     WHERE user_id = ?
     ORDER BY updated_at DESC, created_at DESC`,
    [userId]
  );
  return (Array.isArray(rows) ? rows : [])
    .map((row) =>
      normalizeUserToolServerRecord(
        {
          ...(parseToolServerJson(row.server_json) || {}),
          id: row.id,
          user_id: row.user_id,
        },
        row.user_id
      )
    )
    .filter(Boolean);
}

export async function getUserToolServer(db, userId, serverId) {
  if (!db || !userId || !serverId) return null;
  await ensureUserToolServersTable(db);
  const row = await db.first(
    `SELECT id, user_id, server_json, created_at, updated_at
     FROM user_tool_servers
     WHERE user_id = ? AND id = ?`,
    [userId, serverId]
  );
  if (!row) return null;
  return normalizeUserToolServerRecord(
    {
      ...(parseToolServerJson(row.server_json) || {}),
      id: row.id,
      user_id: row.user_id,
    },
    row.user_id
  );
}

export async function createUserToolServer(db, userId, server = {}) {
  if (!db || !userId) throw new Error('User id is required');
  await ensureUserToolServersTable(db);
  const merged = mergeToolServer(null, server);
  if (!merged.name || !merged.url) {
    throw new Error('name and url are required');
  }
  if (!isValidHttpUrl(merged.url)) {
    throw new Error('url must start with http:// or https://');
  }
  const id = merged.id || crypto.randomUUID();
  const record = {
    ...merged,
    id,
    source: 'user',
    owner_user_id: userId,
    personal: true,
  };
  await db.run(
    `INSERT INTO user_tool_servers (id, user_id, server_json, created_at, updated_at)
     VALUES (?, ?, ?, unixepoch(), unixepoch())`,
    [id, userId, JSON.stringify(record)]
  );
  return getUserToolServer(db, userId, id);
}

export async function updateUserToolServer(db, userId, serverId, server = {}) {
  if (!db || !userId || !serverId) throw new Error('Server id is required');
  await ensureUserToolServersTable(db);
  const existing = await getUserToolServer(db, userId, serverId);
  if (!existing) return null;
  const merged = mergeToolServer(existing, server);
  if (!merged.name || !merged.url) {
    throw new Error('name and url are required');
  }
  if (!isValidHttpUrl(merged.url)) {
    throw new Error('url must start with http:// or https://');
  }
  const record = {
    ...merged,
    id: serverId,
    source: 'user',
    owner_user_id: userId,
    personal: true,
  };
  await db.run(
    `UPDATE user_tool_servers
     SET server_json = ?, updated_at = unixepoch()
     WHERE user_id = ? AND id = ?`,
    [JSON.stringify(record), userId, serverId]
  );
  return getUserToolServer(db, userId, serverId);
}

export async function deleteUserToolServer(db, userId, serverId) {
  if (!db || !userId || !serverId) throw new Error('Server id is required');
  await ensureUserToolServersTable(db);
  const existing = await getUserToolServer(db, userId, serverId);
  if (!existing) return false;
  await db.run('DELETE FROM user_tool_servers WHERE user_id = ? AND id = ?', [userId, serverId]);
  return true;
}

export async function testToolServerConnection(server, options = {}) {
  const url = String(server?.url || '').trim();
  if (!url) throw new Error('url is required');
  const headers = options.headers || parseHeadersForRequest(server.headers);
  const authType = normalizeAuthType(server.auth_type);
  if (authType === 'bearer') {
    const token = String(server.auth_bearer_token || '').trim();
    if (token && !headers.Authorization) headers.Authorization = `Bearer ${token}`;
  }
  if (authType === 'basic') {
    const user = String(server.auth_basic_username || '').trim();
    const pass = String(server.auth_basic_password || '');
    if (user && !headers.Authorization) headers.Authorization = `Basic ${btoa(`${user}:${pass}`)}`;
  }

  let sessionId;
  const init = await mcpRequest({
    url,
    headers,
    sessionId,
    id: 0,
    method: 'initialize',
    params: {
      protocolVersion: MCP_PROTOCOL_VERSION,
      capabilities: {},
      clientInfo: { name: 'GrowChat', version: '1.0.0' },
    },
  });
  sessionId = init.sessionId;

  const notified = await mcpNotify({
    url,
    headers,
    sessionId,
    method: 'notifications/initialized',
  });
  sessionId = notified.sessionId;

  const toolsResult = await mcpRequest({
    url,
    headers,
    sessionId,
    id: 2,
    method: 'tools/list',
  });

  const tools = Array.isArray(toolsResult.result?.tools) ? toolsResult.result.tools : [];
  return {
    tools: tools
      .map((tool) => ({
        name: String(tool?.name || '').trim(),
        title: String(tool?.title || '').trim(),
        description: String(tool?.description || '').trim(),
        parameters:
          tool?.inputSchema && typeof tool.inputSchema === 'object'
            ? tool.inputSchema
            : tool?.parameters && typeof tool.parameters === 'object'
              ? tool.parameters
              : {},
      }))
      .filter((tool) => tool.name),
    sessionId,
  };
}

export function normalizeAuthType(value) {
  const normalized = String(value || '').toLowerCase();
  if (['none', 'bearer', 'basic', 'oauth'].includes(normalized)) return normalized;
  return 'none';
}

export function normalizeTokenAuthMethod(value) {
  const normalized = String(value || '').toLowerCase();
  if (['client_secret_basic', 'client_secret_post', 'none'].includes(normalized)) {
    return normalized;
  }
  return undefined;
}

export function redactToolServer(server) {
  const { oauth_tokens, ...rest } = server || {};
  return {
    ...rest,
    oauth_connected: Boolean(oauth_tokens?.access_token),
    oauth_connected_at: oauth_tokens?.connected_at || server?.oauth_connected_at || null,
  };
}

export function mergeToolServer(existing, incoming) {
  const authType = normalizeAuthType(incoming.auth_type);
  const normalizeTools = (value) => {
    if (!Array.isArray(value)) return existing?.tools || [];
    return value
      .map((tool) => ({
        name: String(tool?.name || '').trim(),
        title: String(tool?.title || '').trim(),
        description: String(tool?.description || '').trim(),
        parameters:
          tool?.parameters && typeof tool.parameters === 'object'
            ? tool.parameters
            : tool?.inputSchema && typeof tool.inputSchema === 'object'
              ? tool.inputSchema
              : undefined,
        enabled: tool?.enabled !== false,
      }))
      .filter((tool) => tool.name);
  };
  const merged = {
    ...(existing || {}),
    id: incoming.id || existing?.id || crypto.randomUUID(),
    name: String(incoming.name || existing?.name || 'Tool Server').slice(0, 120),
    url: String(incoming.url || existing?.url || '').trim(),
    headers: String(incoming.headers || existing?.headers || '').trim(),
    enabled: incoming.enabled !== false,
    auth_type: authType,
    auth_bearer_token: String(
      incoming.auth_bearer_token || existing?.auth_bearer_token || ''
    ).trim(),
    auth_basic_username: String(
      incoming.auth_basic_username || existing?.auth_basic_username || ''
    ).trim(),
    auth_basic_password: String(
      incoming.auth_basic_password || existing?.auth_basic_password || ''
    ).trim(),
    oauth_client_name: String(
      incoming.oauth_client_name || existing?.oauth_client_name || ''
    ).trim(),
    oauth_scope: String(incoming.oauth_scope || existing?.oauth_scope || '').trim(),
    oauth_client_id: String(incoming.oauth_client_id || existing?.oauth_client_id || '').trim(),
    oauth_client_secret: String(
      incoming.oauth_client_secret || existing?.oauth_client_secret || ''
    ).trim(),
    oauth_token_auth_method:
      normalizeTokenAuthMethod(
        incoming.oauth_token_auth_method || existing?.oauth_token_auth_method
      ) || '',
    oauth_authorization_server: String(
      incoming.oauth_authorization_server || existing?.oauth_authorization_server || ''
    ).trim(),
    oauth_token_endpoint: String(
      incoming.oauth_token_endpoint || existing?.oauth_token_endpoint || ''
    ).trim(),
    oauth_registration_endpoint: String(
      incoming.oauth_registration_endpoint || existing?.oauth_registration_endpoint || ''
    ).trim(),
    tools:
      incoming.tools === undefined
        ? mergeToolSpecs(existing?.tools, existing?.tools)
        : normalizeTools(incoming.tools),
    tools_error: incoming.tools_error || existing?.tools_error || '',
    tools_verified_at: incoming.tools_verified_at || existing?.tools_verified_at || null,
  };

  if (authType !== 'oauth') {
    delete merged.oauth_tokens;
    delete merged.oauth_state;
    delete merged.oauth_code_verifier;
    delete merged.oauth_connected_at;
  } else {
    if (existing?.oauth_tokens && !incoming.oauth_tokens) {
      merged.oauth_tokens = existing.oauth_tokens;
    }
    if (existing?.oauth_connected_at && !incoming.oauth_connected_at) {
      merged.oauth_connected_at = existing.oauth_connected_at;
    }
  }

  return merged;
}

export async function discoverAuthorizationMetadata(authorizationServerUrl) {
  const url = new URL(authorizationServerUrl);
  const hasPath = url.pathname && url.pathname !== '/';
  const path = hasPath ? url.pathname.replace(/\/$/, '') : '';
  const candidates = [];

  if (!hasPath) {
    candidates.push(new URL('/.well-known/oauth-authorization-server', url.origin));
    candidates.push(new URL('/.well-known/openid-configuration', url.origin));
  } else {
    candidates.push(new URL(`/.well-known/oauth-authorization-server${path}`, url.origin));
    candidates.push(new URL('/.well-known/oauth-authorization-server', url.origin));
    candidates.push(new URL(`/.well-known/openid-configuration${path}`, url.origin));
    candidates.push(new URL(`${path}/.well-known/openid-configuration`, url.origin));
  }

  for (const candidate of candidates) {
    try {
      const res = await fetch(candidate, {
        headers: { 'MCP-Protocol-Version': MCP_PROTOCOL_VERSION },
      });
      if (!res.ok) continue;
      return await res.json();
    } catch {
      continue;
    }
  }

  return null;
}

export function buildAuthorizationUrl({
  authorizationEndpoint,
  clientId,
  redirectUri,
  scope,
  state,
  codeChallenge,
}) {
  const url = new URL(authorizationEndpoint);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('client_id', clientId);
  url.searchParams.set('redirect_uri', redirectUri);
  url.searchParams.set('code_challenge', codeChallenge);
  url.searchParams.set('code_challenge_method', 'S256');
  if (scope) url.searchParams.set('scope', scope);
  if (state) url.searchParams.set('state', state);
  return url;
}

export function selectTokenAuthMethod(supported, hasSecret) {
  if (Array.isArray(supported)) {
    if (hasSecret && supported.includes('client_secret_basic')) return 'client_secret_basic';
    if (hasSecret && supported.includes('client_secret_post')) return 'client_secret_post';
    if (supported.includes('none')) return 'none';
  }
  return hasSecret ? 'client_secret_post' : 'none';
}
