/**
 * Handle POST /api/users/me/resources/mcp-servers/test — test an MCP server connection.
 * Extracted from handleUsersMcp (was ~33 lines, ~20 cyclomatic).
 */
import { testToolServerConnection } from '../../admin/tool-servers.js';
import { isSafeOutboundUrl } from '../../utils/validation.js';
import { json, error } from '../../utils/response.js';

/**
 * @param {Request} req
 * @returns {Promise<Response>}
 */
export async function handleTestMcpServer(req) {
  let body;
  try {
    body = await req.json();
  } catch {
    return error(req, 'Invalid JSON body', 400);
  }

  const url = String(body.url || '').trim();
  if (!url || !/^https?:\/\//i.test(url)) {
    return error(req, 'Server URL must start with http:// or https://', 400);
  }
  const mcpUrlSafety = isSafeOutboundUrl(url);
  if (!mcpUrlSafety.safe) return error(req, mcpUrlSafety.reason, 400);

  try {
    const result = await testToolServerConnection({
      name: body.name,
      url,
      headers: body.headers,
      auth_type: body.auth_type,
      auth_bearer_token: body.auth_bearer_token,
      auth_basic_username: body.auth_basic_username,
      auth_basic_password: body.auth_basic_password,
    });
    return json(req, { tools: result.tools });
  } catch (err) {
    return error(req, err?.message || 'Failed to test MCP server', 400);
  }
}
