import { getConfigValue, setConfigValue } from '../utils/app-config.js';
import {
  buildToolServerAclIndex,
  evaluateToolServerAclAccess,
  loadToolServerAclRules,
} from '../utils/tool-server-acl.js';
import { loadPrimaryRole } from '../utils/user-role.js';
import { MCP_PROTOCOL_VERSION, mcpNotify, mcpRequest } from '../mcp/client.js';
import { loadUserResourceOverrides } from '../../public/js/shared/utils/user-resource-overrides.js';
import { createRootLogger } from '../utils/logger.js';
import { normalizeBaseUrl, applyToolVisibility } from './tool-servers-utils.js';
import { loadUserToolServers } from './tool-servers-user.js';

const logger = createRootLogger({});

// Re-export everything from sub-modules for backward compatibility
export {
  isValidHttpUrl,
  normalizeHeaders,
  parseHeadersForRequest,
  normalizeBaseUrl,
  normalizeModelId,
  normalizeAttachmentCaps,
  base64UrlEncode,
  randomString,
  sha256Base64Url,
  normalizeAuthType,
  normalizeTokenAuthMethod,
  mergeToolSpecs,
  mergeToolServer,
} from './tool-servers-utils.js';
export {
  loadUserToolServers,
  getUserToolServer,
  createUserToolServer,
  updateUserToolServer,
  deleteUserToolServer,
} from './tool-servers-user.js';

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
    const userOverrides = await loadUserResourceOverrides(db, userId);
    const hiddenServerIds = new Set(userOverrides.tool_servers?.hidden_ids || []);
    const hiddenToolIdsByServer = userOverrides.tool_servers?.tools || {};
    let userGroupIds;
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
    const aclRules = await loadToolServerAclRules(db);
    const aclIndex = buildToolServerAclIndex(aclRules);
    const userRole =
      String(options.userRole || 'member')
        .trim()
        .toLowerCase() || 'member';
    const primaryRole = (await loadPrimaryRole(db, userId)) || userRole;
    const combined = [...configServers, ...userServers];
    const filtered = combined
      .map((server) => {
        const access = evaluateToolServerAclAccess(server, {
          user: { sub: userId, primary_role: primaryRole },
          userGroupIds,
          rules: aclIndex.get(server.id) || [],
        });
        const hiddenForUser =
          server.source !== 'user' && hiddenServerIds.has(String(server.id || '').trim());
        const hiddenTools = new Set(
          hiddenToolIdsByServer?.[String(server.id || '').trim()]?.hidden_ids || []
        );
        return applyToolVisibility(
          {
            ...server,
            access_label: access.access_label,
            access_variant: access.access_variant,
            allowed: access.allowed,
            visible_for_user: !hiddenForUser,
            hidden_for_user: hiddenForUser,
          },
          hiddenTools
        );
      })
      .filter((server) => server.source === 'user' || server.allowed)
      .filter(
        (server) => includeHiddenForUser || server.source === 'user' || server.visible_for_user
      );
    return filtered;
  } catch (err) {
    logger.warn('Failed to load tool servers', { error: err?.message || err });
    return [];
  }
}

export async function saveToolServers(db, servers) {
  await setConfigValue(db, 'tool_servers', JSON.stringify(servers));
}

export async function testToolServerConnection(server, options = {}) {
  const fetchImpl = options.fetch || fetch;
  const url = normalizeBaseUrl(server.url);
  if (!url) {
    return { ok: false, error: 'No URL configured', tools: [] };
  }
  const headers = {};
  if (server.auth_type === 'bearer' && server.auth_bearer_token) {
    headers['Authorization'] = `Bearer ${server.auth_bearer_token}`;
  } else if (server.auth_type === 'basic' && server.auth_basic_username) {
    const credentials = btoa(`${server.auth_basic_username}:${server.auth_basic_password || ''}`);
    headers['Authorization'] = `Basic ${credentials}`;
  }
  const requestHeaders = {
    ...headers,
    'Content-Type': 'application/json',
    Accept: 'application/json, text/event-stream',
  };
  if (server.headers) {
    try {
      const parsed = JSON.parse(server.headers);
      Object.entries(parsed).forEach(([key, value]) => {
        requestHeaders[key] = String(value);
      });
    } catch {
      // ignore malformed headers
    }
  }
  try {
    const initRequest = {
      method: 'POST',
      headers: {
        ...requestHeaders,
        'MCP-Protocol-Version': MCP_PROTOCOL_VERSION,
      },
      body: JSON.stringify(
        mcpRequest('initialize', {
          protocolVersion: MCP_PROTOCOL_VERSION,
          capabilities: {},
          clientInfo: { name: 'GrowChat', version: '1.0.0' },
        })
      ),
    };
    const initRes = await fetchImpl(url, initRequest);
    if (!initRes.ok) {
      const errorBody = await initRes.text().catch(() => '');
      return { ok: false, error: `HTTP ${initRes.status}: ${errorBody.slice(0, 200)}`, tools: [] };
    }
    const sessionId = initRes.headers.get('mcp-session-id');
    const initializedNotification = {
      method: 'notifications/initialized',
    };
    await fetchImpl(url, {
      method: 'POST',
      headers: {
        ...requestHeaders,
        'MCP-Protocol-Version': MCP_PROTOCOL_VERSION,
        ...(sessionId ? { 'mcp-session-id': sessionId } : {}),
      },
      body: JSON.stringify(mcpNotify(initializedNotification)),
    });
    const toolsRequest = {
      method: 'tools/list',
      params: {},
    };
    const toolsRes = await fetchImpl(url, {
      method: 'POST',
      headers: {
        ...requestHeaders,
        'MCP-Protocol-Version': MCP_PROTOCOL_VERSION,
        ...(sessionId ? { 'mcp-session-id': sessionId } : {}),
      },
      body: JSON.stringify(mcpRequest(toolsRequest.method, toolsRequest.params)),
    });
    if (!toolsRes.ok) {
      return { ok: true, tools: [], warning: `Tools list failed: HTTP ${toolsRes.status}` };
    }
    const toolsBody = await toolsRes.json().catch(() => ({}));
    const discoveredTools = Array.isArray(toolsBody?.result?.tools)
      ? toolsBody.result.tools.map((tool) => ({
          name: String(tool.name || '').trim(),
          title: String(tool.title || tool.name || '').trim(),
          description: String(tool.description || '').trim(),
          parameters: tool.inputSchema || tool.parameters || undefined,
          enabled: true,
        }))
      : [];
    return { ok: true, tools: discoveredTools };
  } catch (err) {
    return { ok: false, error: err?.message || String(err), tools: [] };
  }
}

export function redactToolServer(server) {
  const { oauth_tokens, ...rest } = server || {};
  return {
    ...rest,
    oauth_connected: Boolean(oauth_tokens?.access_token),
    oauth_connected_at: oauth_tokens?.connected_at || server?.oauth_connected_at || null,
  };
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
