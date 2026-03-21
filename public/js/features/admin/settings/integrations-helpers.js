export function normalizeTool(server = {}) {
  return {
    name: String(server.name || '').trim(),
    title: String(server.title || '').trim(),
    description: String(server.description || '').trim(),
    parameters:
      server.parameters && typeof server.parameters === 'object' && !Array.isArray(server.parameters)
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

export function normalizeToolServer(server = {}) {
  return {
    id: server.id || '',
    name: server.name || '',
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
    tools: normalizeToolList(server.tools).map((tool) => ({ ...tool, _expanded: false })),
  };
}

export function buildIntegrationsSnapshot(toolServers = []) {
  return JSON.stringify(
    (Array.isArray(toolServers) ? toolServers : [])
      .map((server) => {
        const normalized = normalizeToolServer(server);
        return {
          ...normalized,
          tools: [...normalized.tools]
            .sort((a, b) => String(a.name).localeCompare(String(b.name))),
        };
      })
      .sort((a, b) => String(a.id).localeCompare(String(b.id)))
  );
}

export function sanitizeIntegrationsServers(toolServers = []) {
  return (Array.isArray(toolServers) ? toolServers : [])
    .map((server) => ({
      id: server.id || '',
      name: String(server.name || '').trim(),
      url: String(server.url || '').trim(),
      headers: String(server.headers || '').trim(),
      enabled: server.enabled !== false,
      auth_type: server.auth_type || 'none',
      auth_bearer_token: String(server.auth_bearer_token || '').trim(),
      auth_basic_username: String(server.auth_basic_username || '').trim(),
      auth_basic_password: String(server.auth_basic_password || '').trim(),
      oauth_client_name: String(server.oauth_client_name || '').trim(),
      oauth_scope: String(server.oauth_scope || '').trim(),
      oauth_client_id: String(server.oauth_client_id || '').trim(),
      oauth_client_secret: String(server.oauth_client_secret || '').trim(),
      oauth_token_auth_method: String(server.oauth_token_auth_method || '').trim(),
      tools: normalizeToolList(server.tools),
    }))
    .filter((server) => server.url);
}

export function mapSavedToolServers(payloadServers, fallbackServers = []) {
  const source = Array.isArray(payloadServers) && payloadServers.length > 0
    ? payloadServers
    : fallbackServers;
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
