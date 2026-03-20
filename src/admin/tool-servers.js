import { getConfigValue, setConfigValue } from '../utils/app-config.js';
import { MCP_PROTOCOL_VERSION } from '../mcp/client.js';

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
  return String(url || '').trim().replace(/\/$/, '');
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

export async function loadToolServers(db) {
  const raw = await getConfigValue(db, 'tool_servers', '[]');
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export async function saveToolServers(db, servers) {
  await setConfigValue(db, 'tool_servers', JSON.stringify(servers));
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
  const { oauth_tokens, oauth_state, oauth_code_verifier, ...rest } = server || {};
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
            : (tool?.inputSchema && typeof tool.inputSchema === 'object' ? tool.inputSchema : undefined),
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
      const res = await fetch(candidate, { headers: { 'MCP-Protocol-Version': MCP_PROTOCOL_VERSION } });
      if (!res.ok) continue;
      return await res.json();
    } catch {
      continue;
    }
  }

  return null;
}

export function buildAuthorizationUrl({ authorizationEndpoint, clientId, redirectUri, scope, state, codeChallenge }) {
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
