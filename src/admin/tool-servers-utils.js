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
