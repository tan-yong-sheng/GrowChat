import { MCP_PROTOCOL_VERSION, mcpNotify, mcpRequest } from '../mcp/client.js';

export { loadToolServers } from '../admin/tool-servers.js';
export { buildMcpHeaders, parseSseMessages } from '../mcp/client.js';
export { MCP_PROTOCOL_VERSION, mcpNotify, mcpRequest } from '../mcp/client.js';

export function normalizeHeadersInput(input) {
  if (!input) return {};
  if (input && typeof input === 'object' && !Array.isArray(input)) return input;
  try {
    const parsed = JSON.parse(String(input));
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed;
  } catch {
    // ignore invalid JSON
  }
  return {};
}

export function normalizeToolParameters(input) {
  if (input && typeof input === 'object' && !Array.isArray(input)) return input;
  return {};
}

export function buildMcpToolName(serverId, toolName) {
  const safe = String(toolName || '').replace(/[^a-zA-Z0-9_-]/g, '_');
  return `mcp__${serverId}__${safe}`;
}

function shouldSkipMcpServer(server) {
  if (server?.enabled === false) return true;
  if (!server?.id || !server?.url) return true;
  return false;
}

function shouldSkipMcpTool(tool) {
  return tool?.enabled === false || tool?.visible_for_user === false;
}

function firstPresentValue(obj, keys) {
  for (const key of keys) {
    const value = obj && obj[key];
    if (value) return value;
  }
  return undefined;
}

function buildMcpToolFunction(server, tool) {
  const toolName = String((tool && tool.name) || '').trim();
  if (!toolName) return null;
  const rawDescription = firstPresentValue(tool, ['description', 'title']);
  const description = rawDescription ? String(rawDescription).trim() : undefined;
  return {
    serverId: String(server.id),
    toolName,
    displayName: toolName,
    modelToolName: buildMcpToolName(server.id, toolName),
    description,
    parameters: normalizeToolParameters(tool && tool.parameters),
  };
}

function processMcpTool(tool, server, selectedTools, toolMap, tools) {
  if (shouldSkipMcpTool(tool)) return;
  const mapped = buildMcpToolFunction(server, tool);
  if (!mapped) return;
  if (selectedTools && !selectedTools.has(mapped.modelToolName)) return;
  toolMap.set(mapped.modelToolName, {
    serverId: mapped.serverId,
    toolName: mapped.toolName,
    displayName: mapped.displayName,
  });
  tools.push({
    type: 'function',
    function: {
      name: mapped.modelToolName,
      description: mapped.description,
      parameters: mapped.parameters,
    },
  });
}

function processMcpServer(server, selectedTools, toolMap, tools, serversById) {
  if (shouldSkipMcpServer(server)) return;
  serversById.set(String(server.id), server);
  const toolSpecs = Array.isArray(server.tools) ? server.tools : [];
  toolSpecs.forEach((tool) => processMcpTool(tool, server, selectedTools, toolMap, tools));
}

export function buildMcpTools(servers = [], { selectedToolNames = null } = {}) {
  const tools = [];
  const toolMap = new Map();
  const serversById = new Map();
  const selectedTools = Array.isArray(selectedToolNames)
    ? new Set(selectedToolNames.map((name) => String(name || '').trim()).filter(Boolean))
    : null;
  servers.forEach((server) => processMcpServer(server, selectedTools, toolMap, tools, serversById));
  return { tools, toolMap, serversById };
}

function applyBearerAuth(headers, server) {
  const token = String(server?.auth_bearer_token || '').trim();
  if (token) headers.Authorization = headers.Authorization || `Bearer ${token}`;
}

function applyBasicAuth(headers, server) {
  const user = String(server?.auth_basic_username || '').trim();
  const pass = String(server?.auth_basic_password || '');
  if (user) headers.Authorization = headers.Authorization || `Basic ${btoa(`${user}:${pass}`)}`;
}

function applyOAuthAuth(headers, server) {
  const token = String(server?.oauth_tokens?.access_token || '').trim();
  if (token) headers.Authorization = headers.Authorization || `Bearer ${token}`;
}

export function buildMcpAuthHeaders(server) {
  const headers = { ...normalizeHeadersInput(server?.headers) };
  const authType = String(server?.auth_type || 'none').toLowerCase();
  if (authType === 'bearer') applyBearerAuth(headers, server);
  else if (authType === 'basic') applyBasicAuth(headers, server);
  else if (authType === 'oauth') applyOAuthAuth(headers, server);
  return headers;
}

export function parseToolArguments(raw) {
  if (!raw) return {};
  if (typeof raw === 'object') return raw;
  try {
    return JSON.parse(String(raw));
  } catch {
    throw new Error('Tool arguments must be valid JSON');
  }
}

export async function executeMcpToolCall({ server, toolName, args }) {
  const headers = buildMcpAuthHeaders(server);
  let sessionId;
  const init = await mcpRequest({
    url: server.url,
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
    url: server.url,
    headers,
    sessionId,
    method: 'notifications/initialized',
  });
  sessionId = notified.sessionId;

  const result = await mcpRequest({
    url: server.url,
    headers,
    sessionId,
    id: 2,
    method: 'tools/call',
    params: {
      name: toolName,
      arguments: args,
    },
  });

  return result?.result;
}

export function stringifyToolPayload(payload) {
  if (payload == null) return '';
  if (typeof payload === 'string') return payload;
  try {
    return JSON.stringify(payload, null, 2);
  } catch {
    return String(payload);
  }
}
