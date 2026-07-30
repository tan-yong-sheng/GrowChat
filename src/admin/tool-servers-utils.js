import { pickToolBaseFields } from '../shared/tool-servers-shared.js';

const ATTACHMENT_CAP_TYPES = ['image', 'pdf', 'text', 'audio', 'video', 'other'];

export function isValidHttpUrl(value) {
  if (!value) return false;
  try {
    const url = new URL(String(value).trim());
    return (url.protocol === 'http:' || url.protocol === 'https:') && url.hostname.length > 0;
  } catch {
    return false;
  }
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

export function normalizeTool(tool = {}) {
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

export function applyToolVisibility(server, hiddenTools = new Set()) {
  const hiddenToolIds = new Set(
    Array.isArray(hiddenTools) ? hiddenTools : hiddenTools instanceof Set ? hiddenTools : []
  );
  const tools = Array.isArray(server?.tools) ? server.tools : [];
  return {
    ...server,
    tools: tools.map((tool) => {
      const name = String(tool?.name || '').trim();
      const hiddenForUser = hiddenToolIds.has(name);
      return { ...tool, visible_for_user: !hiddenForUser, hidden_for_user: hiddenForUser };
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

const pickString = (incoming, existing, key, { defaultValue = '', max } = {}) => {
  const raw = incoming?.[key] || existing?.[key] || defaultValue;
  const trimmed = String(raw).trim();
  return typeof max === 'number' ? trimmed.slice(0, max) : trimmed;
};

const pickBool = (incoming, existing, key, defaultValue = true) => {
  if (incoming?.[key] !== undefined) return incoming[key];
  if (existing?.[key] !== undefined) return existing[key];
  return defaultValue;
};

const pickHeaders = (incoming, existing) => {
  const value = incoming?.headers !== undefined ? incoming.headers : existing?.headers;
  if (typeof value === 'string') return value.trim();
  return value ?? '';
};

const pickAuthType = (incoming, existing) => {
  if (incoming?.auth_type !== undefined) return normalizeAuthType(incoming.auth_type);
  return existing?.auth_type || 'none';
};

const pickTokenAuthMethod = (incoming, existing) =>
  normalizeTokenAuthMethod(
    incoming?.oauth_token_auth_method || existing?.oauth_token_auth_method
  ) || '';

const pickToolParameters = (tool) => {
  if (tool?.parameters && typeof tool.parameters === 'object') return tool.parameters;
  if (tool?.inputSchema && typeof tool.inputSchema === 'object') return tool.inputSchema;
  return undefined;
};

const normalizeToolEntry = (tool) => ({
  ...pickToolBaseFields(tool),
  parameters: pickToolParameters(tool),
  enabled: tool?.enabled !== false,
});

const normalizeIncomingTools = (value, existing) => {
  if (!Array.isArray(value)) return existing?.tools || [];
  return value.map(normalizeToolEntry).filter((tool) => tool.name);
};

const pickResolvedTools = (incoming, existing) =>
  incoming?.tools === undefined
    ? mergeToolSpecs(existing?.tools, existing?.tools)
    : normalizeIncomingTools(incoming.tools, existing);

const pickId = (incoming, existing) => incoming?.id || existing?.id || crypto.randomUUID();

const pickName = (incoming, existing) =>
  pickString(incoming, existing, 'name', { defaultValue: 'Tool Server', max: 120 });

const preserveOauthState = (merged, incoming, existing) => {
  for (const key of ['oauth_tokens', 'oauth_state', 'oauth_code_verifier', 'oauth_connected_at']) {
    if (existing?.[key] && !incoming?.[key]) merged[key] = existing[key];
  }
};

const stripOauthState = (merged) => {
  delete merged.oauth_tokens;
  delete merged.oauth_state;
  delete merged.oauth_code_verifier;
  delete merged.oauth_connected_at;
};

export function mergeToolServer(existing, incoming) {
  const merged = {
    ...(existing || {}),
    id: pickId(incoming, existing),
    name: pickName(incoming, existing),
    url: pickString(incoming, existing, 'url'),
    headers: pickHeaders(incoming, existing),
    enabled: pickBool(incoming, existing, 'enabled'),
    auth_type: pickAuthType(incoming, existing),
    auth_bearer_token: pickString(incoming, existing, 'auth_bearer_token'),
    auth_basic_username: pickString(incoming, existing, 'auth_basic_username'),
    auth_basic_password: pickString(incoming, existing, 'auth_basic_password'),
    oauth_client_name: pickString(incoming, existing, 'oauth_client_name'),
    oauth_scope: pickString(incoming, existing, 'oauth_scope'),
    oauth_client_id: pickString(incoming, existing, 'oauth_client_id'),
    oauth_client_secret: pickString(incoming, existing, 'oauth_client_secret'),
    oauth_token_auth_method: pickTokenAuthMethod(incoming, existing),
    oauth_authorization_server: pickString(incoming, existing, 'oauth_authorization_server'),
    oauth_token_endpoint: pickString(incoming, existing, 'oauth_token_endpoint'),
    oauth_registration_endpoint: pickString(incoming, existing, 'oauth_registration_endpoint'),
    tools: pickResolvedTools(incoming, existing),
    tools_error: incoming?.tools_error || existing?.tools_error || '',
    tools_verified_at: incoming?.tools_verified_at || existing?.tools_verified_at || null,
  };
  if (merged.auth_type !== 'oauth') {
    stripOauthState(merged);
  } else {
    preserveOauthState(merged, incoming, existing);
  }
  return merged;
}
