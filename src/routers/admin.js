/**
 * Admin Panel Router
 *
 * Statistics, analytics, and vector management endpoints
 * All endpoints require admin authorization
 */

import { createDB } from '../db.js';
import { error, json } from '../utils/response.js';
import { authorize, logAuditEvent } from '../utils/authorize.js';
import { getConfigBool, getConfigValue, setConfigValue } from '../utils/app-config.js';
import { buildEnvOpenAIConnections, ensureConnectionId, getEnvOpenAIOverrides } from '../utils/openai-connections.js';

const MODEL_ATTACHMENT_CAPS_KEY = 'model_attachment_caps_v1';
const ATTACHMENT_CAP_TYPES = ['image', 'pdf', 'text', 'audio', 'video', 'other'];

function isValidHttpUrl(value) {
  if (!value) return false;
  return /^https?:\/\//i.test(value);
}

function normalizeHeaders(input) {
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

function parseHeadersForRequest(input) {
  if (input && typeof input === 'object' && !Array.isArray(input)) {
    return input;
  }
  const normalized = normalizeHeaders(input);
  if (!normalized) return {};
  return JSON.parse(normalized);
}

function normalizeBaseUrl(url) {
  return String(url || '').trim().replace(/\/$/, '');
}

function normalizeModelId(value) {
  const normalized = String(value || '').trim();
  if (!normalized) return null;
  if (normalized.length > 200 || /\s/.test(normalized)) {
    throw new Error('model_id is invalid');
  }
  return normalized;
}

function normalizeAttachmentCaps(input, { allowNull = false } = {}) {
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

const MCP_PROTOCOL_VERSION = '2025-11-25';

function base64UrlEncode(bytes) {
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function randomString(length = 43) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~';
  const array = new Uint8Array(length);
  crypto.getRandomValues(array);
  return Array.from(array, (x) => chars[x % chars.length]).join('');
}

async function sha256Base64Url(input) {
  const data = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return base64UrlEncode(new Uint8Array(digest));
}

async function loadToolServers(db) {
  let servers = [];
  const raw = await getConfigValue(db, 'tool_servers', '[]');
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) servers = parsed;
  } catch {
    servers = [];
  }
  return servers;
}

async function saveToolServers(db, servers) {
  await setConfigValue(db, 'tool_servers', JSON.stringify(servers));
}

function normalizeAuthType(value) {
  const normalized = String(value || '').toLowerCase();
  if (['none', 'bearer', 'basic', 'oauth'].includes(normalized)) return normalized;
  return 'none';
}

function normalizeTokenAuthMethod(value) {
  const normalized = String(value || '').toLowerCase();
  if (['client_secret_basic', 'client_secret_post', 'none'].includes(normalized)) {
    return normalized;
  }
  return undefined;
}

function redactToolServer(server) {
  const { oauth_tokens, oauth_state, oauth_code_verifier, ...rest } = server || {};
  return {
    ...rest,
    oauth_connected: Boolean(oauth_tokens?.access_token),
    oauth_connected_at: oauth_tokens?.connected_at || server?.oauth_connected_at || null,
  };
}

function mergeToolServer(existing, incoming) {
  const authType = normalizeAuthType(incoming.auth_type);
  const normalizeTools = (value) => {
    if (!Array.isArray(value)) return existing?.tools || [];
    return value
      .map((tool) => ({
        name: String(tool?.name || '').trim(),
        title: String(tool?.title || '').trim(),
        description: String(tool?.description || '').trim(),
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
    auth_bearer_token: String(incoming.auth_bearer_token || existing?.auth_bearer_token || '').trim(),
    auth_basic_username: String(incoming.auth_basic_username || existing?.auth_basic_username || '').trim(),
    auth_basic_password: String(incoming.auth_basic_password || existing?.auth_basic_password || '').trim(),
    oauth_client_name: String(incoming.oauth_client_name || existing?.oauth_client_name || '').trim(),
    oauth_scope: String(incoming.oauth_scope || existing?.oauth_scope || '').trim(),
    oauth_client_id: String(incoming.oauth_client_id || existing?.oauth_client_id || '').trim(),
    oauth_client_secret: String(incoming.oauth_client_secret || existing?.oauth_client_secret || '').trim(),
    oauth_token_auth_method: normalizeTokenAuthMethod(incoming.oauth_token_auth_method || existing?.oauth_token_auth_method) || '',
    oauth_authorization_server: String(incoming.oauth_authorization_server || existing?.oauth_authorization_server || '').trim(),
    oauth_token_endpoint: String(incoming.oauth_token_endpoint || existing?.oauth_token_endpoint || '').trim(),
    oauth_registration_endpoint: String(incoming.oauth_registration_endpoint || existing?.oauth_registration_endpoint || '').trim(),
    tools: normalizeTools(incoming.tools),
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

function buildMcpHeaders(base, sessionId) {
  const headers = {
    ...base,
    'mcp-protocol-version': MCP_PROTOCOL_VERSION,
    Accept: 'application/json, text/event-stream',
    'Content-Type': 'application/json',
  };
  if (sessionId) headers['mcp-session-id'] = sessionId;
  return headers;
}

function parseSseMessages(body) {
  const blocks = body.split('\n\n');
  const messages = [];
  for (const block of blocks) {
    const lines = block.split('\n').map((line) => line.trim()).filter(Boolean);
    let data = '';
    for (const line of lines) {
      if (line.startsWith('data:')) {
        data += line.slice(5).trim();
      }
    }
    if (!data) continue;
    try {
      messages.push(JSON.parse(data));
    } catch {
      // ignore parse errors
    }
  }
  return messages;
}

async function mcpRequest({ url, headers, sessionId, id, method, params }) {
  const response = await fetch(url, {
    method: 'POST',
    headers: buildMcpHeaders(headers, sessionId),
    body: JSON.stringify({
      jsonrpc: '2.0',
      id,
      method,
      ...(params ? { params } : {}),
    }),
  });

  const nextSessionId = response.headers.get('mcp-session-id') || sessionId;

  if (response.status === 202) {
    return { result: null, sessionId: nextSessionId };
  }

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`MCP request failed (${response.status}): ${text || response.statusText}`);
  }

  const contentType = response.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    const payload = await response.json();
    const message = Array.isArray(payload)
      ? payload.find((item) => String(item?.id) === String(id)) || payload[0]
      : payload;
    if (message?.error) {
      throw new Error(message.error.message || 'MCP error');
    }
    return { result: message?.result, sessionId: nextSessionId };
  }

  if (contentType.includes('text/event-stream')) {
    const text = await response.text();
    const messages = parseSseMessages(text);
    const message = messages.find((item) => String(item?.id) === String(id)) || messages[0];
    if (message?.error) {
      throw new Error(message.error.message || 'MCP error');
    }
    return { result: message?.result, sessionId: nextSessionId };
  }

  throw new Error(`Unexpected MCP response content type: ${contentType}`);
}

async function mcpNotify({ url, headers, sessionId, method, params }) {
  const response = await fetch(url, {
    method: 'POST',
    headers: buildMcpHeaders(headers, sessionId),
    body: JSON.stringify({
      jsonrpc: '2.0',
      method,
      ...(params ? { params } : {}),
    }),
  });
  const nextSessionId = response.headers.get('mcp-session-id') || sessionId;
  if (response.status === 202 || response.status === 204) {
    return { sessionId: nextSessionId };
  }
  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`MCP notification failed (${response.status}): ${text || response.statusText}`);
  }
  return { sessionId: nextSessionId };
}

async function discoverAuthorizationMetadata(authorizationServerUrl) {
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
      const res = await fetch(candidate, { headers: { 'MCP-Protocol-Version': MCP_PROTOCOL_VERSION } });
      if (!res.ok) continue;
      return await res.json();
    } catch {
      continue;
    }
  }

  return null;
}

function buildAuthorizationUrl({ authorizationEndpoint, clientId, redirectUri, scope, state, codeChallenge }) {
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

function selectTokenAuthMethod(supported, hasSecret) {
  if (Array.isArray(supported)) {
    if (hasSecret && supported.includes('client_secret_basic')) return 'client_secret_basic';
    if (hasSecret && supported.includes('client_secret_post')) return 'client_secret_post';
    if (supported.includes('none')) return 'none';
  }
  return hasSecret ? 'client_secret_post' : 'none';
}

/**
 * Admin Router Handler
 * Routes:
 *   GET /api/admin/stats                - System statistics
 *   GET /api/admin/faqs/status          - FAQ embedding status
 *   GET /api/admin/documents/status     - Document extraction/embedding status
 *   POST /api/admin/faqs/reindex        - Regenerate FAQ embeddings
 *   POST /api/admin/documents/reindex   - Regenerate document chunk embeddings
 */
export async function adminRouter(req, env, ctx, user, path) {
  if (!path.startsWith('/api/admin/')) return null;

  let requiredPermission = 'admin.user.read';
  if (path === '/api/admin/faqs/reindex' || path === '/api/admin/documents/reindex') {
    requiredPermission = 'kb.reindex';
  }
  if (path === '/api/admin/config' && req.method === 'PUT') {
    requiredPermission = 'admin.user.write';
  }
  if (path === '/api/admin/model-attachment-caps') {
    requiredPermission = 'admin.rbac.admin';
  }
  if (path === '/api/admin/openai/connections' || path === '/api/admin/openai/connections/test' || path === '/api/admin/openai/env') {
    requiredPermission = 'admin.rbac.admin';
  }
  if (
    path === '/api/admin/tool-servers' ||
    path === '/api/admin/tool-servers/test' ||
    path === '/api/admin/tool-servers/oauth/start' ||
    path === '/api/admin/tool-servers/oauth/callback'
  ) {
    requiredPermission = 'admin.rbac.admin';
  }
  const skipAuth = path === '/api/admin/tool-servers/oauth/callback';
  if (!skipAuth) {
    const authDecision = await authorize(env, user, { action: requiredPermission });
    if (!authDecision.allow) {
      return error(req, authDecision.reason || 'Forbidden', 403);
    }
  }

  const db = createDB(env.DB);

  // GET /api/admin/config - Fetch admin configuration
  if (req.method === 'GET' && path === '/api/admin/config') {
    try {
      const publicRegistration = await getConfigBool(db, 'public_registration', true);
      const defaultModelIdRaw = await getConfigValue(db, 'default_model_id', null);
      const defaultModelId = defaultModelIdRaw ? String(defaultModelIdRaw).trim() : null;
      return json(req, {
        public_registration: publicRegistration,
        default_model_id: defaultModelId || null
      });
    } catch (err) {
      console.error('Admin config fetch failed:', err);
      return error(req, 'Failed to fetch admin config', 500);
    }
  }

  // PUT /api/admin/config - Update admin configuration
  if (req.method === 'PUT' && path === '/api/admin/config') {
    let body;
    try {
      body = await req.json();
    } catch {
      return error(req, 'Invalid JSON body', 400);
    }

    const hasPublicRegistration = body.public_registration !== undefined;
    const hasDefaultModel = body.default_model_id !== undefined;

    if (!hasPublicRegistration && !hasDefaultModel) {
      return error(req, 'No config changes provided', 400);
    }

    if (hasPublicRegistration && typeof body.public_registration !== 'boolean') {
      return error(req, 'public_registration must be a boolean', 400);
    }

    let normalizedDefaultModel = null;
    if (hasDefaultModel) {
      if (body.default_model_id === null || body.default_model_id === '') {
        normalizedDefaultModel = '';
      } else if (typeof body.default_model_id !== 'string') {
        return error(req, 'default_model_id must be a string or null', 400);
      } else {
        normalizedDefaultModel = String(body.default_model_id).trim();
        if (!normalizedDefaultModel) normalizedDefaultModel = '';
        if (normalizedDefaultModel.length > 200 || /\s/.test(normalizedDefaultModel)) {
          return error(req, 'default_model_id is invalid', 400);
        }
      }
    }

    try {
      if (hasPublicRegistration) {
        await setConfigValue(db, 'public_registration', body.public_registration ? 'true' : 'false');
      }
      if (hasDefaultModel) {
        await setConfigValue(db, 'default_model_id', normalizedDefaultModel);
      }
      await logAuditEvent(env, {
        actor_id: user.sub,
        action: 'admin_config_updated',
        resource_type: 'admin',
        resource_id: 'config'
      });
      return json(req, {
        public_registration: hasPublicRegistration ? body.public_registration : undefined,
        default_model_id: hasDefaultModel ? (normalizedDefaultModel || null) : undefined
      });
    } catch (err) {
      console.error('Admin config update failed:', err);
      return error(req, 'Failed to update admin config', 500);
    }
  }

  // GET /api/admin/model-attachment-caps - Fetch per-model attachment capabilities
  if (req.method === 'GET' && path === '/api/admin/model-attachment-caps') {
    try {
      const raw = await getConfigValue(db, MODEL_ATTACHMENT_CAPS_KEY, '{}');
      let caps = {};
      try {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
          caps = parsed;
        }
      } catch {
        caps = {};
      }
      return json(req, {
        caps,
        supported_types: ATTACHMENT_CAP_TYPES,
      });
    } catch (err) {
      console.error('Attachment caps fetch failed:', err);
      return error(req, 'Failed to fetch attachment caps', 500);
    }
  }

  // PUT /api/admin/model-attachment-caps - Update per-model attachment capabilities
  if (req.method === 'PUT' && path === '/api/admin/model-attachment-caps') {
    let body;
    try {
      body = await req.json();
    } catch {
      return error(req, 'Invalid JSON body', 400);
    }

    const replaceCaps = body.caps && typeof body.caps === 'object' && !Array.isArray(body.caps);
    const updates = Array.isArray(body.updates) ? body.updates : [];
    const remove = Array.isArray(body.remove) ? body.remove : [];

    if (!replaceCaps && !updates.length && !remove.length) {
      return error(req, 'No attachment cap changes provided', 400);
    }

    try {
      if (replaceCaps) {
        const nextCaps = {};
        for (const [modelId, entry] of Object.entries(body.caps)) {
          const normalizedId = normalizeModelId(modelId);
          if (!normalizedId) continue;
          const attachmentsInput = entry?.attachments ?? entry;
          const attachments = normalizeAttachmentCaps(attachmentsInput);
          nextCaps[normalizedId] = {
            ...(entry && typeof entry === 'object' && !Array.isArray(entry) ? entry : {}),
            attachments,
            updated_at: Date.now(),
          };
        }
        await setConfigValue(db, MODEL_ATTACHMENT_CAPS_KEY, JSON.stringify(nextCaps));
        await logAuditEvent(env, {
          actor_id: user.sub,
          action: 'attachment_caps_replaced',
          resource_type: 'admin',
          resource_id: 'model-attachment-caps',
        });
        return json(req, { caps: nextCaps });
      }

      const raw = await getConfigValue(db, MODEL_ATTACHMENT_CAPS_KEY, '{}');
      let caps = {};
      try {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
          caps = parsed;
        }
      } catch {
        caps = {};
      }

      for (const update of updates) {
        const modelId = normalizeModelId(update?.model_id);
        if (!modelId) {
          throw new Error('model_id is required');
        }
        const patch = normalizeAttachmentCaps(update?.attachments, { allowNull: true });
        const current = caps[modelId] && typeof caps[modelId] === 'object' ? caps[modelId] : {};
        const nextAttachments = { ...(current.attachments || {}) };
        for (const [key, value] of Object.entries(patch)) {
          if (value === null) {
            delete nextAttachments[key];
          } else {
            nextAttachments[key] = value;
          }
        }
        caps[modelId] = {
          ...current,
          attachments: nextAttachments,
          updated_at: Date.now(),
        };
      }

      for (const id of remove) {
        const normalizedId = normalizeModelId(id);
        if (!normalizedId) continue;
        delete caps[normalizedId];
      }

      await setConfigValue(db, MODEL_ATTACHMENT_CAPS_KEY, JSON.stringify(caps));
      await logAuditEvent(env, {
        actor_id: user.sub,
        action: 'attachment_caps_updated',
        resource_type: 'admin',
        resource_id: 'model-attachment-caps',
      });

      return json(req, { caps });
    } catch (err) {
      return error(req, err?.message || 'Invalid attachment cap data', 400);
    }
  }

  // GET /api/admin/openai/connections - List OpenAI connections
  if (req.method === 'GET' && path === '/api/admin/openai/connections') {
    try {
      const envConnections = buildEnvOpenAIConnections(env);
      const envOverrides = await getEnvOpenAIOverrides(env);
      envConnections.forEach((conn) => {
        const override = envOverrides.get(conn.id);
        if (override === false) conn.enabled = false;
      });
      let manualConnections = [];
      const raw = await getConfigValue(db, 'openai_connections', '[]');
      try {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          manualConnections = parsed.map((conn, index) => ({
            ...conn,
            id: ensureConnectionId(conn, index),
            providerType: String(conn?.providerType || 'openai-compatible').toLowerCase(),
            readOnly: false,
            source: 'config',
            enabled: conn?.enabled !== false,
          }));
        }
      } catch {
        manualConnections = [];
      }
      const enabledRaw = await getConfigValue(db, 'openai_enabled', 'true');
      const enabled = String(enabledRaw).toLowerCase() !== 'false';

      return json(req, {
        enabled,
        connections: [...envConnections, ...manualConnections]
      });
    } catch (err) {
      console.error('OpenAI connections fetch failed:', err);
      return error(req, 'Failed to fetch connections', 500);
    }
  }

  // POST /api/admin/openai/connections/test - Test OpenAI connection
  if (req.method === 'POST' && path === '/api/admin/openai/connections/test') {
    let body;
    try {
      body = await req.json();
    } catch {
      return error(req, 'Invalid JSON body', 400);
    }

    const url = String(body.url || '').trim();
    if (!url || !isValidHttpUrl(url)) {
      return error(req, 'Connection URL must start with http:// or https://', 400);
    }

    const key = String(body.key || '').trim();
    let headers = {};
    try {
      headers = parseHeadersForRequest(body.headers);
    } catch (err) {
      return error(req, err.message || 'Headers must be valid JSON', 400);
    }

    if (key && !headers.Authorization) {
      headers.Authorization = `Bearer ${key}`;
    }

    const baseUrl = normalizeBaseUrl(url);
    try {
      const res = await fetch(`${baseUrl}/models`, { headers });
      if (!res.ok) {
        const bodyText = await res.text().catch(() => '');
        return error(
          req,
          `Connection failed (${res.status})`,
          502,
          { message: bodyText.slice(0, 200) }
        );
      }

      return json(req, { ok: true, message: 'Connection successful' });
    } catch (err) {
      return error(req, 'Connection failed', 502, { message: err?.message || String(err) });
    }
  }

  // GET /api/admin/openai/env - Inspect OpenAI env configuration (admin only)
  if (req.method === 'GET' && path === '/api/admin/openai/env') {
    const baseUrl = env.OPENAI_BASE_URL || '';
    const baseUrls = env.OPENAI_API_BASE_URLS || '';
    const hasKey = Boolean(env.OPENAI_API_KEY);
    const hasKeys = Boolean(env.OPENAI_API_KEYS);

    return json(req, {
      openai_base_url: baseUrl || null,
      openai_api_base_urls: baseUrls || null,
      openai_api_key_present: hasKey,
      openai_api_keys_present: hasKeys,
    });
  }

  // GET /api/admin/tool-servers - List tool servers
  if (req.method === 'GET' && path === '/api/admin/tool-servers') {
    try {
      const servers = await loadToolServers(db);
      return json(req, { servers: servers.map(redactToolServer) });
    } catch (err) {
      console.error('Tool servers fetch failed:', err);
      return error(req, 'Failed to fetch tool servers', 500);
    }
  }

  // POST /api/admin/tool-servers/test - Test MCP tool server connection + list tools
  if (req.method === 'POST' && path === '/api/admin/tool-servers/test') {
    let body;
    try {
      body = await req.json();
    } catch {
      return error(req, 'Invalid JSON body', 400);
    }

    const url = String(body.url || '').trim();
    if (!url || !isValidHttpUrl(url)) {
      return error(req, 'Server URL must start with http:// or https://', 400);
    }

    let headers = {};
    try {
      headers = parseHeadersForRequest(body.headers);
    } catch (err) {
      return error(req, err.message || 'Headers must be valid JSON', 400);
    }

    const authType = normalizeAuthType(body.auth_type);
    if (authType === 'bearer') {
      const token = String(body.auth_bearer_token || '').trim();
      if (token && !headers.Authorization) {
        headers.Authorization = `Bearer ${token}`;
      }
    }

    if (authType === 'basic') {
      const user = String(body.auth_basic_username || '').trim();
      const pass = String(body.auth_basic_password || '');
      if (user && !headers.Authorization) {
        headers.Authorization = `Basic ${btoa(`${user}:${pass}`)}`;
      }
    }

    if (authType === 'oauth') {
      const serverId = String(body.id || '').trim();
      if (!serverId) {
        return error(req, 'Server must be saved before OAuth verification', 400);
      }
      const servers = await loadToolServers(db);
      const server = servers.find((entry) => String(entry.id) === serverId);
      const accessToken = server?.oauth_tokens?.access_token;
      if (!accessToken) {
        return error(req, 'OAuth not connected yet. Click Connect OAuth first.', 400);
      }
      headers.Authorization = `Bearer ${accessToken}`;
    }

    try {
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

      const tools = Array.isArray(toolsResult.result?.tools)
        ? toolsResult.result.tools
        : [];
      const toolSummaries = tools
        .map((tool) => {
          const parameters = tool?.inputSchema && typeof tool.inputSchema === 'object'
            ? tool.inputSchema
            : (tool?.parameters && typeof tool.parameters === 'object' ? tool.parameters : {});
          return {
            name: String(tool?.name || '').trim(),
            title: String(tool?.title || '').trim(),
            description: String(tool?.description || '').trim(),
            parameters,
          };
        })
        .filter((tool) => tool.name);

      if (body.id) {
        const servers = await loadToolServers(db);
        const index = servers.findIndex((entry) => String(entry.id) === String(body.id));
        if (index !== -1) {
          servers[index] = {
            ...servers[index],
            tools: toolSummaries,
            tools_error: '',
            tools_verified_at: new Date().toISOString(),
          };
          await saveToolServers(db, servers);
        }
      }

      return json(req, {
        ok: true,
        message: 'Connection successful',
        tools: toolSummaries,
      });
    } catch (err) {
      if (body?.id) {
        try {
          const servers = await loadToolServers(db);
          const index = servers.findIndex((entry) => String(entry.id) === String(body.id));
          if (index !== -1) {
            servers[index] = {
              ...servers[index],
              tools: [],
              tools_error: err?.message || 'Connection failed',
              tools_verified_at: new Date().toISOString(),
            };
            await saveToolServers(db, servers);
          }
        } catch (persistErr) {
          console.warn('Failed to persist tool server error:', persistErr?.message || persistErr);
        }
      }
      return error(req, 'Connection failed', 502, { message: err?.message || String(err) });
    }
  }

  // POST /api/admin/tool-servers/oauth/start - Begin OAuth flow for MCP server
  if (req.method === 'POST' && path === '/api/admin/tool-servers/oauth/start') {
    let body;
    try {
      body = await req.json();
    } catch {
      return error(req, 'Invalid JSON body', 400);
    }

    const serverId = String(body.id || '').trim();
    if (!serverId) {
      return error(req, 'Server must be saved before OAuth connect', 400);
    }

    const servers = await loadToolServers(db);
    const serverIndex = servers.findIndex((entry) => String(entry.id) === serverId);
    if (serverIndex === -1) {
      return error(req, 'Server must be saved before OAuth connect', 400);
    }

    const server = servers[serverIndex];
    const serverUrl = String(body.url || server.url || '').trim();
    if (!serverUrl || !isValidHttpUrl(serverUrl)) {
      return error(req, 'Server URL must start with http:// or https://', 400);
    }

    const oauthClientName = String(body.oauth_client_name || server.oauth_client_name || 'GrowChat MCP Client').trim();
    const oauthScope = String(body.oauth_scope || server.oauth_scope || '').trim();
    const authServerUrl = String(body.oauth_authorization_server || server.oauth_authorization_server || serverUrl).trim();

    const redirectUri = new URL(req.url).origin + '/api/admin/tool-servers/oauth/callback';

    let metadata = null;
    try {
      metadata = await discoverAuthorizationMetadata(authServerUrl);
    } catch {
      metadata = null;
    }

    let clientId = String(body.oauth_client_id || server.oauth_client_id || '').trim();
    let clientSecret = String(body.oauth_client_secret || server.oauth_client_secret || '').trim();
    let registrationEndpoint = metadata?.registration_endpoint || server.oauth_registration_endpoint || '';

    if (!clientId) {
      if (!registrationEndpoint) {
        return error(req, 'Authorization server does not support dynamic client registration', 400);
      }
      try {
        const registrationPayload = {
          client_name: oauthClientName,
          redirect_uris: [redirectUri],
          grant_types: ['authorization_code', 'refresh_token'],
          response_types: ['code'],
        };
        const registrationRes = await fetch(registrationEndpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(registrationPayload),
        });
        if (!registrationRes.ok) {
          const text = await registrationRes.text().catch(() => '');
          return error(req, 'Client registration failed', 502, { message: text });
        }
        const registrationData = await registrationRes.json();
        clientId = String(registrationData.client_id || '').trim();
        clientSecret = String(registrationData.client_secret || '').trim();
      } catch (err) {
        return error(req, 'Client registration failed', 502, { message: err?.message || String(err) });
      }
    }

    if (!clientId) {
      return error(req, 'OAuth client ID is required', 400);
    }

    const tokenAuthMethod = normalizeTokenAuthMethod(
      body.oauth_token_auth_method || server.oauth_token_auth_method
    ) || selectTokenAuthMethod(metadata?.token_endpoint_auth_methods_supported || [], Boolean(clientSecret));

    const codeVerifier = randomString(64);
    const codeChallenge = await sha256Base64Url(codeVerifier);
    const state = randomString(32);
    const authorizationEndpoint = metadata?.authorization_endpoint || new URL('/authorize', authServerUrl).toString();
    const tokenEndpoint = metadata?.token_endpoint || new URL('/token', authServerUrl).toString();

    const authorizationUrl = buildAuthorizationUrl({
      authorizationEndpoint,
      clientId,
      redirectUri,
      scope: oauthScope,
      state,
      codeChallenge,
    });

    servers[serverIndex] = {
      ...server,
      auth_type: 'oauth',
      oauth_client_name: oauthClientName,
      oauth_scope: oauthScope,
      oauth_client_id: clientId,
      oauth_client_secret: clientSecret,
      oauth_authorization_server: authServerUrl,
      oauth_token_endpoint: tokenEndpoint,
      oauth_registration_endpoint: registrationEndpoint,
      oauth_token_auth_method: tokenAuthMethod,
      oauth_state: state,
      oauth_code_verifier: codeVerifier,
    };

    await saveToolServers(db, servers);

    return json(req, { ok: true, authorization_url: authorizationUrl.toString() });
  }

  // GET /api/admin/tool-servers/oauth/callback - OAuth redirect handler
  if (req.method === 'GET' && path === '/api/admin/tool-servers/oauth/callback') {
    const url = new URL(req.url);
    const code = url.searchParams.get('code');
    const state = url.searchParams.get('state');
    const errParam = url.searchParams.get('error');
    if (errParam) {
      return new Response(`Authorization failed: ${errParam}`, { status: 400 });
    }
    if (!code || !state) {
      return new Response('Missing authorization code or state', { status: 400 });
    }

    const servers = await loadToolServers(db);
    const serverIndex = servers.findIndex((entry) => entry?.oauth_state === state);
    if (serverIndex === -1) {
      return new Response('OAuth session not found or expired', { status: 400 });
    }

    const server = servers[serverIndex];
    const tokenEndpoint = server.oauth_token_endpoint || new URL('/token', server.oauth_authorization_server || server.url).toString();
    const clientId = server.oauth_client_id;
    const clientSecret = server.oauth_client_secret;
    const codeVerifier = server.oauth_code_verifier;
    const tokenAuthMethod = normalizeTokenAuthMethod(server.oauth_token_auth_method) || 'client_secret_post';

    const params = new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      code_verifier: codeVerifier,
      redirect_uri: new URL(req.url).origin + '/api/admin/tool-servers/oauth/callback',
      client_id: clientId,
    });

    const headers = new Headers({
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/json',
    });

    if (tokenAuthMethod === 'client_secret_basic' && clientSecret) {
      headers.set('Authorization', `Basic ${btoa(`${clientId}:${clientSecret}`)}`);
      params.delete('client_id');
    } else if (tokenAuthMethod === 'client_secret_post' && clientSecret) {
      params.set('client_secret', clientSecret);
    }

    try {
      const tokenRes = await fetch(tokenEndpoint, {
        method: 'POST',
        headers,
        body: params,
      });
      if (!tokenRes.ok) {
        const text = await tokenRes.text().catch(() => '');
        return new Response(`Token exchange failed: ${text}`, { status: 400 });
      }
      const tokenData = await tokenRes.json();

      servers[serverIndex] = {
        ...server,
        oauth_tokens: {
          ...tokenData,
          connected_at: new Date().toISOString(),
        },
        oauth_connected_at: new Date().toISOString(),
        oauth_state: null,
        oauth_code_verifier: null,
      };

      await saveToolServers(db, servers);

      return new Response(
        '<html><body><h2>OAuth connected.</h2><p>You can return to GrowChat and click Verify.</p></body></html>',
        { headers: { 'Content-Type': 'text/html' } }
      );
    } catch (err) {
      return new Response(`Token exchange failed: ${err?.message || String(err)}`, { status: 400 });
    }
  }

  // PUT /api/admin/tool-servers - Update tool servers
  if (req.method === 'PUT' && path === '/api/admin/tool-servers') {
    let body;
    try {
      body = await req.json();
    } catch {
      return error(req, 'Invalid JSON body', 400);
    }

    const servers = Array.isArray(body.servers) ? body.servers : [];
    const existing = await loadToolServers(db);
    const existingById = new Map(existing.map((entry) => [String(entry.id), entry]));
    const sanitized = servers
      .map((server) => {
        const merged = mergeToolServer(existingById.get(String(server.id)), server);
        return merged;
      })
      .filter((server) => server.url);

    try {
      await saveToolServers(db, sanitized);
      await logAuditEvent(env, {
        actor_id: user.sub,
        action: 'tool_servers_updated',
        resource_type: 'admin',
        resource_id: 'tool-servers',
      });
      return json(req, { ok: true, servers: sanitized.map(redactToolServer) });
    } catch (err) {
      console.error('Tool servers update failed:', err);
      return error(req, 'Failed to update tool servers', 500);
    }
  }

  // PUT /api/admin/openai/connections - Update OpenAI connections
  if (req.method === 'PUT' && path === '/api/admin/openai/connections') {
    let body;
    try {
      body = await req.json();
    } catch {
      return error(req, 'Invalid JSON body', 400);
    }

    const enabled = typeof body.enabled === 'boolean' ? body.enabled : true;
    const connections = Array.isArray(body.connections) ? body.connections : [];
    const envOverridesInput = body.env_overrides && typeof body.env_overrides === 'object'
      ? body.env_overrides
      : {};

    if (connections.length > 100) {
      return error(req, 'Too many connections (max 100)', 400);
    }

    let sanitized;
    try {
      sanitized = connections
        .filter((conn) => !conn?.readOnly && conn?.source !== 'env')
        .map((conn) => {
          const url = String(conn.url || '').trim();
          if (!url) return null;
          if (!isValidHttpUrl(url)) {
            throw new Error('Connection URL must start with http:// or https://');
          }
          const key = String(conn.key || '').trim();
          if (key.length > 4096) {
            throw new Error('API key is too long');
          }
          const headers = normalizeHeaders(conn.headers);
          if (headers.length > 4096) {
            throw new Error('Headers are too long');
          }
          const providerType = String(conn.providerType || 'openai').toLowerCase();
          if (!['openai', 'openai-compatible'].includes(providerType)) {
            throw new Error('Provider type must be openai or openai-compatible');
          }
          return {
            id: conn.id || crypto.randomUUID(),
            name: String(conn.name || 'OpenAI Compatible').slice(0, 120),
            url,
            key,
            headers,
            providerType,
            apiType: 'chat-completions',
            enabled: conn.enabled !== false,
          };
        })
        .filter(Boolean);
    } catch (err) {
      return error(req, err.message || 'Invalid connection data', 400);
    }

    try {
      await setConfigValue(db, 'openai_connections', JSON.stringify(sanitized));
      await setConfigValue(db, 'openai_enabled', enabled ? 'true' : 'false');
      const envOverrides = {};
      for (const [key, value] of Object.entries(envOverridesInput)) {
        if (!/^env-\d+$/.test(String(key))) continue;
        if (value === false) {
          envOverrides[String(key)] = false;
        }
      }
      await setConfigValue(db, 'openai_env_overrides', JSON.stringify(envOverrides));
      await logAuditEvent(env, {
        actor_id: user.sub,
        action: 'openai_connections_updated',
        resource_type: 'admin',
        resource_id: 'openai-connections',
      });
      return json(req, { ok: true });
    } catch (err) {
      console.error('OpenAI connections update failed:', err);
      return error(req, 'Failed to update connections', 500);
    }
  }

  // GET /api/admin/stats - System statistics
  if (req.method === 'GET' && path === '/api/admin/stats') {
    try {
      const [
        userCount,
        chatCount,
        messageCount,
        faqCount,
        documentCount,
        sessionCount,
      ] = await Promise.all([
        db.first('SELECT COUNT(*) as count FROM users'),
        db.first('SELECT COUNT(*) as count FROM chats'),
        db.first('SELECT COUNT(*) as count FROM messages'),
        db.first('SELECT COUNT(*) as count FROM faqs WHERE user_id = ?', [user.sub]),
        db.first('SELECT COUNT(*) as count FROM documents WHERE user_id = ?', [user.sub]),
        db.first('SELECT COUNT(*) as count FROM chat_sessions'),
      ]);

      // Log audit event
      await logAuditEvent(env, {
        actor_id: user.sub,
        action: 'stats_accessed',
        resource_type: 'admin',
        resource_id: 'stats'
      });

      return json(req, {
        stats: {
          total_users: userCount?.count || 0,
          total_chats: chatCount?.count || 0,
          total_messages: messageCount?.count || 0,
          user_faqs: faqCount?.count || 0,
          user_documents: documentCount?.count || 0,
          active_sessions: sessionCount?.count || 0,
          timestamp: new Date().toISOString(),
        },
      });
    } catch (err) {
      console.error('Stats query failed:', err);
      return error(req, 'Failed to fetch statistics', 500);
    }
  }

  // GET /api/admin/faqs/status - FAQ embedding status
  if (req.method === 'GET' && path === '/api/admin/faqs/status') {
    try {
      const [pending, done, failed] = await Promise.all([
        db.first(
          'SELECT COUNT(*) as count FROM faqs WHERE user_id = ? AND embedding_generated = 0',
          [user.sub]
        ),
        db.first(
          'SELECT COUNT(*) as count FROM faqs WHERE user_id = ? AND embedding_generated = 1',
          [user.sub]
        ),
        db.first(
          'SELECT COUNT(*) as count FROM faqs WHERE user_id = ? AND embedding_generated = -1',
          [user.sub]
        ),
      ]);

      return json(req, {
        embedding_status: {
          pending: pending?.count || 0,
          completed: done?.count || 0,
          failed: failed?.count || 0,
          total: (pending?.count || 0) + (done?.count || 0) + (failed?.count || 0),
        },
      });
    } catch (err) {
      console.error('FAQ status query failed:', err);
      return error(req, 'Failed to fetch FAQ status', 500);
    }
  }

  // GET /api/admin/documents/status - Document extraction/embedding status
  if (req.method === 'GET' && path === '/api/admin/documents/status') {
    try {
      const [
        extractionPending,
        extractionDone,
        extractionFailed,
        embeddingPending,
        embeddingDone,
        embeddingFailed,
      ] = await Promise.all([
        db.first(
          'SELECT COUNT(*) as count FROM documents WHERE user_id = ? AND extraction_status = 0',
          [user.sub]
        ),
        db.first(
          'SELECT COUNT(*) as count FROM documents WHERE user_id = ? AND extraction_status = 1',
          [user.sub]
        ),
        db.first(
          'SELECT COUNT(*) as count FROM documents WHERE user_id = ? AND extraction_status = -1',
          [user.sub]
        ),
        db.first(
          'SELECT COUNT(*) as count FROM documents WHERE user_id = ? AND embedding_generated = 0',
          [user.sub]
        ),
        db.first(
          'SELECT COUNT(*) as count FROM documents WHERE user_id = ? AND embedding_generated = 1',
          [user.sub]
        ),
        db.first(
          'SELECT COUNT(*) as count FROM documents WHERE user_id = ? AND embedding_generated = -1',
          [user.sub]
        ),
      ]);

      return json(req, {
        extraction_status: {
          pending: extractionPending?.count || 0,
          completed: extractionDone?.count || 0,
          failed: extractionFailed?.count || 0,
        },
        embedding_status: {
          pending: embeddingPending?.count || 0,
          completed: embeddingDone?.count || 0,
          failed: embeddingFailed?.count || 0,
        },
        total_documents: (extractionPending?.count || 0) +
          (extractionDone?.count || 0) +
          (extractionFailed?.count || 0),
      });
    } catch (err) {
      console.error('Document status query failed:', err);
      return error(req, 'Failed to fetch document status', 500);
    }
  }

  // POST /api/admin/faqs/reindex - Regenerate FAQ embeddings
  if (req.method === 'POST' && path === '/api/admin/faqs/reindex') {
    try {
      const faqsToReindex = await db.all(
        'SELECT id, question, answer, category, tags FROM faqs WHERE user_id = ?',
        [user.sub]
      );

      if (!faqsToReindex.length) {
        return json(req, { queued: 0, message: 'No FAQs to reindex' });
      }

      // Log audit event
      await logAuditEvent(env, {
        actor_id: user.sub,
        action: 'faq_reindex_started',
        resource_type: 'faqs',
        resource_id: null,
        metadata: { faq_count: faqsToReindex.length }
      });

      // Queue embedding regeneration
      ctx.waitUntil(
        (async () => {
          const { upsertFAQ } = await import('../services/embeddings.js');
          let succeeded = 0;
          let failed = 0;

          for (const faq of faqsToReindex) {
            try {
              const tags = faq.tags ? JSON.parse(faq.tags) : [];
              await upsertFAQ(env, db, faq.id, faq.question, faq.answer, {
                category: faq.category || undefined,
                tags,
              });
              succeeded++;
            } catch (err) {
              console.error(`Failed to reindex FAQ ${faq.id}:`, err);
              failed++;
            }
          }

          console.log(`FAQ reindexing complete: ${succeeded} succeeded, ${failed} failed`);

          // Log completion
          await logAuditEvent(env, {
            actor_id: user.sub,
            action: 'faq_reindex_completed',
            resource_type: 'faqs',
            resource_id: null,
            metadata: { succeeded, failed }
          });
        })()
      );

      return json(req, {
        queued: faqsToReindex.length,
        message: 'FAQ reindexing queued',
      });
    } catch (err) {
      console.error('FAQ reindex failed:', err);
      return error(req, 'Failed to queue FAQ reindexing', 500);
    }
  }

  // POST /api/admin/documents/reindex - Regenerate document chunk embeddings
  if (req.method === 'POST' && path === '/api/admin/documents/reindex') {
    try {
      const chunks = await db.all(
        `SELECT dc.id, dc.chunk_text as text, dc.document_id as documentId, dc.chunk_index as chunkIndex
         FROM document_chunks dc
         JOIN documents d ON dc.document_id = d.id
         WHERE d.user_id = ?`,
        [user.sub]
      );

      if (!chunks.length) {
        return json(req, { queued: 0, message: 'No document chunks to reindex' });
      }

      // Queue embedding regeneration
      ctx.waitUntil(
        (async () => {
          const { upsertDocumentChunks } = await import('../services/embeddings.js');

          try {
            const result = await upsertDocumentChunks(env, db, chunks);
            console.log(
              `Document reindexing complete: ${result.uploaded} succeeded, ${result.failed} failed`
            );
          } catch (err) {
            console.error('Document chunk reindex error:', err);
          }
        })()
      );

      return json(req, {
        queued: chunks.length,
        message: 'Document chunk reindexing queued',
      });
    } catch (err) {
      console.error('Document reindex failed:', err);
      return error(req, 'Failed to queue document reindexing', 500);
    }
  }

  return null;
}
