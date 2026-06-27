export function normalizeTool(server = {}) {
  return {
    name: String(server.name || '').trim(),
    title: String(server.title || '').trim(),
    description: String(server.description || '').trim(),
    parameters:
      server.parameters &&
      typeof server.parameters === 'object' &&
      !Array.isArray(server.parameters)
        ? server.parameters
        : undefined,
    enabled: server.enabled !== false,
  };
}

export function normalizeToolList(tools = []) {
  return (Array.isArray(tools) ? tools : [])
    .map((tool) => normalizeTool(tool))
    .filter((tool) => tool.name);
}

function buildAuthFields(server = {}) {
  const s = server || {};
  const defaults = {
    auth_type: 'none',
    auth_bearer_token: '',
    auth_basic_username: '',
    auth_basic_password: '',
    oauth_client_name: '',
    oauth_scope: '',
    oauth_client_id: '',
    oauth_client_secret: '',
    oauth_token_auth_method: '',
  };
  // Coerce every auth field to a trimmed string. Without this, nullish or
  // whitespace-padded values would survive into saved records and corrupt
  // downstream auth (DB expects non-null strings; trailing space breaks
  // bearer/OAuth matching). Matches sanitizeIntegrationsServers() history.
  const out = {};
  for (const key of Object.keys(defaults)) {
    const value = s[key] !== undefined ? s[key] : defaults[key];
    out[key] = String(value ?? '').trim();
  }
  if (!out.auth_type) out.auth_type = 'none';
  return out;
}

export function normalizeToolServer(server = {}) {
  const base = {
    id: server.id || '',
    name: server.name || '',
    url: server.url || '',
    headers: server.headers || '',
    enabled: server.enabled !== false,
    tools: normalizeToolList(server.tools).map((tool) => ({ ...tool, _expanded: false })),
  };
  return { ...base, ...buildAuthFields(server) };
}

export function buildIntegrationsSnapshot(toolServers = []) {
  return JSON.stringify(
    (Array.isArray(toolServers) ? toolServers : [])
      .map((server) => {
        const normalized = normalizeToolServer(server);
        return {
          ...normalized,
          tools: [...normalized.tools].sort((a, b) => String(a.name).localeCompare(String(b.name))),
        };
      })
      .sort((a, b) => String(a.id).localeCompare(String(b.id)))
  );
}

function sanitizeSingleServer(server) {
  const auth = buildAuthFields(server);
  return {
    id: server.id || '',
    name: String(server.name || '').trim(),
    url: String(server.url || '').trim(),
    headers: String(server.headers || '').trim(),
    enabled: server.enabled !== false,
    tools: normalizeToolList(server.tools),
    ...auth,
  };
}

export function sanitizeIntegrationsServers(toolServers = []) {
  return (Array.isArray(toolServers) ? toolServers : [])
    .map((server) => sanitizeSingleServer(server))
    .filter((server) => server.url);
}

export function mapSavedToolServers(payloadServers, fallbackServers = []) {
  const source =
    Array.isArray(payloadServers) && payloadServers.length > 0 ? payloadServers : fallbackServers;
  return source.map((server) => ({
    ...server,
    toolsExpanded: false,
    toolsError: server.tools_error || '',
    tools: normalizeToolList(server.tools).map((tool) => ({ ...tool, _expanded: false })),
  }));
}

export function shouldShowAuthField(authType, fieldType) {
  return authType === fieldType;
}
