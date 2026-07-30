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
import {
  applyToolVisibility,
  parseHeadersForRequest,
  normalizeAuthType,
} from './tool-servers-utils.js';
import { loadUserToolServers } from './tool-servers-user.js';
import {
  testMcpConnection,
  mapMcpTools,
  loadUserGroupIdsFromDb,
} from '../shared/tool-servers-shared.js';

import { applyAuthHeaders } from '../shared/apply-auth-headers.js';

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

async function loadConfigServers(db) {
  const raw = await getConfigValue(db, 'tool_servers', '[]');
  const parsed = JSON.parse(raw);
  return Array.isArray(parsed) ? parsed : [];
}

function normalizeUserRole(role) {
  return (
    String(role || 'member')
      .trim()
      .toLowerCase() || 'member'
  );
}

async function resolveUserContext(db, userId, userRole) {
  const userOverrides = await loadUserResourceOverrides(db, userId);
  let userGroupIds;
  try {
    userGroupIds = await loadUserGroupIdsFromDb(db, userId);
  } catch {
    userGroupIds = new Set();
  }
  let aclIndex = new Map();
  try {
    const aclRules = await loadToolServerAclRules(db);
    aclIndex = buildToolServerAclIndex(aclRules);
  } catch (err) {
    logger.warn('Failed to load tool server ACL rules', { error: err?.message || err });
  }
  const primaryRole = (await loadPrimaryRole(db, userId)) || normalizeUserRole(userRole);
  return { userOverrides, userGroupIds, aclIndex, primaryRole };
}

function enrichServer(
  server,
  { user, userGroupIds, aclIndex, hiddenServerIds, hiddenToolIdsByServer }
) {
  const access = evaluateToolServerAclAccess(server, {
    user,
    userGroupIds,
    rules: aclIndex.get(server.id) || [],
  });
  const serverId = String(server.id || '').trim();
  const hiddenForUser = server.source !== 'user' && hiddenServerIds.has(serverId);
  const hiddenTools = new Set(hiddenToolIdsByServer?.[serverId]?.hidden_ids || []);
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
}

function isServerVisible(server, includeHiddenForUser) {
  return includeHiddenForUser || server.source === 'user' || server.allowed;
}

function isServerNotHidden(server, includeHiddenForUser) {
  return includeHiddenForUser || server.source === 'user' || server.visible_for_user;
}

function filterVisibleServers(servers, context) {
  const { includeHiddenForUser } = context;
  return servers
    .map((server) => enrichServer(server, context))
    .filter((server) => isServerVisible(server, includeHiddenForUser))
    .filter((server) => isServerNotHidden(server, includeHiddenForUser));
}

async function loadUserToolServersSafely(db, userId) {
  try {
    return await loadUserToolServers(db, userId);
  } catch {
    return [];
  }
}

export async function loadToolServers(db, options = {}) {
  const includeHiddenForUser = options.includeHiddenForUser === true;
  try {
    const configServers = await loadConfigServers(db);
    const userId = String(options.userId || '').trim();
    if (!userId) return configServers;
    const userServers = await loadUserToolServers(db, userId);
    if (!db || typeof db.first !== 'function' || typeof db.all !== 'function') {
      return [...configServers, ...userServers];
    }
    const { userOverrides, userGroupIds, aclIndex, primaryRole } = await resolveUserContext(
      db,
      userId,
      options.userRole
    );
    const hiddenServerIds = new Set(userOverrides.tool_servers?.hidden_ids || []);
    const hiddenToolIdsByServer = userOverrides.tool_servers?.tools || {};
    const user = { sub: userId, primary_role: primaryRole };
    const combined = [...configServers, ...userServers];
    const filtered = filterVisibleServers(combined, {
      user,
      userGroupIds,
      aclIndex,
      hiddenServerIds,
      hiddenToolIdsByServer,
      includeHiddenForUser,
    });
    return filtered.map(({ allowed: _allowed, ...server }) => server);
  } catch (err) {
    logger.warn('Failed to load tool servers', { error: err?.message || err });
    const userId = String(options.userId || '').trim();
    return userId ? loadUserToolServersSafely(db, userId) : [];
  }
}

export async function saveToolServers(db, servers) {
  await setConfigValue(db, 'tool_servers', JSON.stringify(servers));
}

function resolveToolServerUrl(server) {
  const url = String(server?.url || '').trim();
  if (!url) throw new Error('url is required');
  return url;
}

export async function testToolServerConnection(server, options = {}) {
  const url = resolveToolServerUrl(server);
  const headers = options.headers || parseHeadersForRequest(server.headers);
  applyAuthHeaders(headers, server);

  const { sessionId, tools: rawTools } = await testMcpConnection(url, headers);
  const tools = mapMcpTools(rawTools);
  return { tools, sessionId };
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
