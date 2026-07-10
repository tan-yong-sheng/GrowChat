/**
 * Shared MCP tool server connection test utilities.
 * Used by both src/admin/tool-servers.js and src/routers/admin/admin-tool-servers-crud.js.
 */
import { MCP_PROTOCOL_VERSION, mcpNotify, mcpRequest } from '../mcp/client.js';

/**
 * Run the MCP server connection test sequence:
 * initialize → notifications/initialized → tools/list.
 *
 * @param {string} url - MCP server URL
 * @param {object} headers - Request headers
 * @returns {{ sessionId: string, tools: object[] }}
 */
export async function testMcpConnection(url, headers) {
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
  return { sessionId, tools };
}

function getToolParameters(tool) {
  if (tool?.inputSchema && typeof tool.inputSchema === 'object') return tool.inputSchema;
  if (tool?.parameters && typeof tool.parameters === 'object') return tool.parameters;
  return {};
}

/**
 * Map MCP tool objects to standard {name, title, description, parameters} format.
 */
/**
 * Load user group IDs from the database for ACL filtering.
 * Shared by src/admin/tool-servers.js and src/llm/connections.js.
 *
 * @param {import('../src/db.js').D1Database} db
 * @param {string} userId
 * @returns {Promise<Set<string>>}
 */
export async function loadUserGroupIdsFromDb(db, userId) {
  if (!db || !userId) return new Set();
  try {
    const rows = await db.all('SELECT group_id FROM group_members WHERE user_id = ?', [userId]);
    return new Set((Array.isArray(rows) ? rows : []).map((r) => r.group_id).filter(Boolean));
  } catch {
    return new Set();
  }
}

/**
 * Map MCP tool objects to standard {name, title, description, parameters} format.
 */
export function mapMcpTools(tools) {
  return (tools || [])
    .map((tool) => ({
      name: String(tool?.name || '').trim(),
      title: String(tool?.title || '').trim(),
      description: String(tool?.description || '').trim(),
      parameters: getToolParameters(tool),
    }))
    .filter((tool) => tool.name);
}
